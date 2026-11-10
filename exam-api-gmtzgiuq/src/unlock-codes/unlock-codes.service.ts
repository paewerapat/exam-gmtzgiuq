import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import {
  DataSource,
  EntityManager,
  In,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import { Exam } from '../exams/exam.entity';
import { QuestionStatus } from '../questions/question.entity';
import { User } from '../users/user.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ExamAccessSource } from '../exam-access/exam-access.entity';
import {
  AccessViewer,
  LOCKED_ACCESS_TYPES,
  isLockedExam,
} from '../exam-access/exam-access';
import { UnlockCodeBatch } from './unlock-code-batch.entity';
import { UnlockCodeBatchExam } from './unlock-code-batch-exam.entity';
import { UnlockCode } from './unlock-code.entity';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import {
  CODE_STATUS_FILTERS,
  CodeStatusFilter,
  CreateUnlockBatchDto,
  RedeemCodeDto,
  UpdateUnlockBatchDto,
} from './dto/unlock-code.dto';
import {
  CSV_BOM,
  RedeemErrorCode,
  RedeemException,
  csvLine,
  escapeLike,
  normalizeCode,
  normalizeCodeSearch,
  randomCodes,
  toThaiDateTime,
} from './unlock-code-format';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Brute-force limit: this many failed redeems per account in the window. */
export const REDEEM_MAX_FAILURES = 10;
export const REDEEM_FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Attempt rows older than this are deleted (whole table, hourly). */
const REDEEM_FAILURE_KEEP_MS = DAY_MS;
const REDEEM_PRUNE_EVERY_MS = 60 * 60 * 1000;
/** errorCode of an attempt still being checked (counts toward the limit). */
export const PENDING_ATTEMPT = 'PENDING';

const INSERT_CHUNK = 1000;
const GENERATE_ATTEMPTS = 3;

export interface RedeemResult {
  unlockedExamIds: string[];
  expiresAt: string;
}

export interface UnlockBatchView {
  id: string;
  name: string;
  allMock: boolean;
  exams: { id: string; title: string }[];
  codeCount: number;
  usedCount: number;
  accessDays: number;
  codeExpiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface UnlockCodeView {
  id: string;
  code: string;
  isActive: boolean;
  usedAt: Date | null;
  usedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Raw row of the code list query (user fields only the safe ones). */
interface CodeRow {
  id: string;
  code: string;
  isActive: number | boolean | string;
  usedAt: Date | null;
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

function isDuplicateKey(err: unknown): boolean {
  const e = err as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  return (
    e?.code === 'ER_DUP_ENTRY' ||
    e?.errno === 1062 ||
    e?.driverError?.code === 'ER_DUP_ENTRY' ||
    e?.driverError?.errno === 1062
  );
}

/** InnoDB chose this transaction as a deadlock victim (rolled back). */
function isDeadlock(err: unknown): boolean {
  const e = err as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  return (
    e?.code === 'ER_LOCK_DEADLOCK' ||
    e?.errno === 1213 ||
    e?.driverError?.code === 'ER_LOCK_DEADLOCK' ||
    e?.driverError?.errno === 1213
  );
}

function clampPage(value: number, fallback = 1): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function clampLimit(value: number, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * ISO string from the DTO (already validated) → Date in whole seconds
 * (23:59:59.999 must not round up to the next day); year 1000–9999.
 */
function parseExpiry(value: string): Date {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999) {
    throw new BadRequestException('วันหมดอายุของโค้ดไม่ถูกต้อง');
  }
  return floorToSecond(date);
}

/**
 * Unlock codes (task 15): redeem by students, campaigns and codes for
 * admins. Access itself is stored and checked by ExamAccessService.
 */
@Injectable()
export class UnlockCodesService {
  private readonly logger = new Logger(UnlockCodesService.name);
  // Last whole-table prune of old attempt rows (per process; 0 = not yet)
  private lastPruneAt = 0;

  constructor(
    @InjectRepository(UnlockCodeBatch)
    private batchesRepository: Repository<UnlockCodeBatch>,
    @InjectRepository(UnlockCodeBatchExam)
    private batchExamsRepository: Repository<UnlockCodeBatchExam>,
    @InjectRepository(UnlockCode)
    private codesRepository: Repository<UnlockCode>,
    @InjectRepository(UnlockCodeRedeemFailure)
    private failuresRepository: Repository<UnlockCodeRedeemFailure>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    private dataSource: DataSource,
    private examAccessService: ExamAccessService,
  ) {}

  // ── REDEEM ──────────────────────────────────────────────────────────

  /**
   * Redeem a code on the page of `examId` for the logged-in user: the code
   * is marked used by this account and access to every exam of its
   * campaign (or every non-free Mock Exam) is granted for accessDays.
   *
   * Brute-force limit, atomic under concurrency: every attempt first
   * writes a PENDING row, then counts the account's rows in the last
   * 15 minutes (its own included). More than REDEEM_MAX_FAILURES → 429 (the
   * row is removed, so 429s do not extend the wait); otherwise the row
   * becomes the failure's errorCode, or is removed on success. Since each
   * request counts after its own insert, at most REDEEM_MAX_FAILURES
   * attempts per window get past the check however many run at once.
   */
  async redeem(
    user: AccessViewer,
    input: RedeemCodeDto,
    now: Date = new Date(),
  ): Promise<RedeemResult> {
    const attemptId = randomUUID();
    await this.failuresRepository.insert({
      id: attemptId,
      userId: user.id,
      errorCode: PENDING_ATTEMPT,
      failedAt: now,
    });
    await this.pruneOldFailures(now);

    const inWindow = await this.failuresRepository.count({
      where: {
        userId: user.id,
        failedAt: MoreThan(new Date(now.getTime() - REDEEM_FAILURE_WINDOW_MS)),
      },
    });
    if (inWindow > REDEEM_MAX_FAILURES) {
      await this.settleAttempt(attemptId, null);
      throw new RedeemException('TOO_MANY_ATTEMPTS');
    }

    try {
      const result = await this.redeemOrThrow(
        user,
        { code: input?.code, examId: input?.examId },
        now,
      );
      await this.settleAttempt(attemptId, null);
      return result;
    } catch (err) {
      // Wrong code etc. count; an unexpected error (500) does not
      await this.settleAttempt(
        attemptId,
        err instanceof RedeemException ? err.errorCode : null,
      );
      throw err;
    }
  }

  /**
   * The attempt row becomes a failure (errorCode) or is removed (null).
   * Never hides the redeem result: a failed write is only logged.
   */
  private async settleAttempt(id: string, errorCode: RedeemErrorCode | null) {
    try {
      if (errorCode) {
        await this.failuresRepository.update(id, { errorCode });
      } else {
        await this.failuresRepository.delete({ id });
      }
    } catch (err) {
      this.logger.error(
        `Could not update an unlock code redeem attempt: ${String(err)}`,
      );
    }
  }

  /**
   * At most once an hour per API process: delete attempt rows older than a
   * day of every account (the window is 15 minutes; the table stays small,
   * so a scan is cheap).
   */
  private async pruneOldFailures(now: Date) {
    if (now.getTime() - this.lastPruneAt < REDEEM_PRUNE_EVERY_MS) return;
    this.lastPruneAt = now.getTime();
    try {
      await this.failuresRepository.delete({
        failedAt: LessThan(new Date(now.getTime() - REDEEM_FAILURE_KEEP_MS)),
      });
    } catch (err) {
      this.logger.error(
        `Could not prune old unlock code redeem attempts: ${String(err)}`,
      );
    }
  }

  private async redeemOrThrow(
    user: AccessViewer,
    input: { code: unknown; examId: unknown },
    now: Date,
  ): Promise<RedeemResult> {
    const code = normalizeCode(input.code);
    if (!code) throw new RedeemException('INVALID_FORMAT');
    // Not a RedeemException: a bad examId (a web bug, not a guess) is not
    // counted toward the limit
    const examId = input.examId;
    if (typeof examId !== 'string' || !isUUID(examId)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'ไม่พบชุดข้อสอบนี้ (examId ไม่ถูกต้อง)',
        error: 'Bad Request',
      });
    }

    const row = await this.codesRepository.findOne({
      where: { code },
      loadEagerRelations: false,
    });
    if (!row) throw new RedeemException('NOT_FOUND');
    if (row.usedAt || row.usedByUserId) {
      throw new RedeemException(
        row.usedByUserId === user.id ? 'ALREADY_REDEEMED' : 'USED',
      );
    }

    const batch = await this.batchesRepository.findOne({
      where: { id: row.batchId },
    });
    if (!batch) throw new RedeemException('NOT_FOUND');
    if (!row.isActive || !batch.isActive) {
      throw new RedeemException('DISABLED');
    }
    if (batch.codeExpiresAt && batch.codeExpiresAt.getTime() < now.getTime()) {
      throw new RedeemException('EXPIRED');
    }

    // The code must unlock the exam of the page it is typed on
    const exam = await this.examsRepository.findOne({
      select: { id: true, isMock: true, accessType: true },
      where: { id: examId },
      loadEagerRelations: false,
    });
    const batchExamIds = batch.allMock
      ? []
      : (
          await this.batchExamsRepository.find({
            select: { examId: true },
            where: { batchId: batch.id },
          })
        ).map((link) => link.examId);
    const applies =
      !!exam &&
      (batch.allMock ? isLockedExam(exam) : batchExamIds.includes(examId));
    if (!applies) throw new RedeemException('NOT_FOR_THIS_EXAM');

    // One code per campaign per account (also enforced by the unique index)
    const usedOther = await this.codesRepository.exists({
      where: { batchId: batch.id, usedByUserId: user.id },
    });
    if (usedOther) throw new RedeemException('BATCH_ALREADY_USED');

    // Whole seconds: the datetime columns have no fraction (MySQL would
    // round), so the response matches what GET /exams/mock returns later
    const usedAt = floorToSecond(now);
    const expiresAt = new Date(usedAt.getTime() + batch.accessDays * DAY_MS);

    // Two codes of one campaign sent at once by one account can make InnoDB
    // pick a deadlock victim (1213) instead of reporting the duplicate key:
    // retry once (the retry then sees the other code used → duplicate key),
    // and if it deadlocks again report BATCH_ALREADY_USED when that is what
    // happened, rather than a 500.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.consumeAndGrant(
          user,
          row.id,
          batch,
          batchExamIds,
          usedAt,
          expiresAt,
          now,
        );
        break;
      } catch (err) {
        if (!isDeadlock(err)) throw err;
        if (attempt < 2) continue;
        const usedOtherNow = await this.codesRepository.exists({
          where: { batchId: batch.id, usedByUserId: user.id },
        });
        if (usedOtherNow) throw new RedeemException('BATCH_ALREADY_USED');
        throw err;
      }
    }

    return {
      unlockedExamIds: await this.unlockedExamIds(batch.allMock, batchExamIds),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** The transaction of redeem: mark the code used, then grant access. */
  private async consumeAndGrant(
    user: AccessViewer,
    codeId: string,
    batch: UnlockCodeBatch,
    batchExamIds: string[],
    usedAt: Date,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    const row = { id: codeId };
    await this.dataSource.transaction(async (manager) => {
      // Conditional update = the atomic step: of two simultaneous redeems of
      // this code only one matches; the unique (batchId, usedByUserId) index
      // stops one account using two codes of a campaign at the same time.
      // The batch conditions are repeated so disabling/expiring it in
      // between wins too.
      let affected = 0;
      try {
        const result: unknown = await manager.query(
          `UPDATE unlock_codes c
             JOIN unlock_code_batches b ON b.id = c.batchId
              SET c.usedByUserId = ?, c.usedAt = ?
            WHERE c.id = ?
              AND c.usedByUserId IS NULL
              AND c.usedAt IS NULL
              AND c.isActive = 1
              AND b.isActive = 1
              AND (b.codeExpiresAt IS NULL OR b.codeExpiresAt >= ?)`,
          [user.id, usedAt, row.id, now],
        );
        affected = Number(
          (result as { affectedRows?: number })?.affectedRows ?? 0,
        );
      } catch (err) {
        if (isDuplicateKey(err)) {
          throw new RedeemException('BATCH_ALREADY_USED');
        }
        throw err;
      }
      if (affected !== 1) {
        throw new RedeemException(
          await this.whyNotRedeemed(manager, row.id, user.id, now),
        );
      }

      await this.examAccessService.grant(manager, {
        userId: user.id,
        examIds: batchExamIds,
        allMock: batch.allMock,
        source: ExamAccessSource.CODE,
        sourceId: row.id,
        expiresAt,
      });
    });
  }

  /** Reason the conditional update matched nothing (changed meanwhile). */
  private async whyNotRedeemed(
    manager: EntityManager,
    codeId: string,
    userId: string,
    now: Date,
  ): Promise<RedeemErrorCode> {
    const code = await manager.findOne(UnlockCode, {
      where: { id: codeId },
      loadEagerRelations: false,
    });
    if (!code) return 'NOT_FOUND';
    if (code.usedAt || code.usedByUserId) {
      return code.usedByUserId === userId ? 'ALREADY_REDEEMED' : 'USED';
    }
    const batch = await manager.findOne(UnlockCodeBatch, {
      where: { id: code.batchId },
    });
    if (!code.isActive || !batch?.isActive) return 'DISABLED';
    if (batch.codeExpiresAt && batch.codeExpiresAt.getTime() < now.getTime()) {
      return 'EXPIRED';
    }
    return 'USED';
  }

  /** Exams the redeem unlocked, as shown to the web (existing exams only). */
  private async unlockedExamIds(
    allMock: boolean,
    batchExamIds: string[],
  ): Promise<string[]> {
    if (allMock) {
      const exams = await this.examsRepository.find({
        select: { id: true },
        where: {
          isMock: true,
          accessType: In([...LOCKED_ACCESS_TYPES]),
          status: QuestionStatus.PUBLISHED,
        },
        loadEagerRelations: false,
      });
      return exams.map((e) => e.id);
    }
    if (batchExamIds.length === 0) return [];
    const exams = await this.examsRepository.find({
      select: { id: true },
      where: { id: In(batchExamIds) },
      loadEagerRelations: false,
    });
    const existing = new Set(exams.map((e) => e.id));
    return batchExamIds.filter((id) => existing.has(id));
  }

  // ── ADMIN: CAMPAIGNS ───────────────────────────────────────────────

  async listBatches(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<Paginated<UnlockBatchView>> {
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit, 20, 100);

    const qb = this.batchesRepository
      .createQueryBuilder('batch')
      .orderBy('batch.createdAt', 'DESC')
      .addOrderBy('batch.id', 'ASC');
    const term = search?.trim();
    if (term) {
      qb.andWhere('batch.name LIKE :search', {
        search: `%${escapeLike(term)}%`,
      });
    }
    const [batches, total] = await qb
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items: await this.toBatchViews(batches),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getBatch(id: string): Promise<UnlockBatchView> {
    const batch = await this.findBatchOrFail(id);
    const [view] = await this.toBatchViews([batch]);
    return view;
  }

  /**
   * New campaign with `count` random codes (crypto, unique in the DB),
   * inserted in chunks in one transaction.
   */
  async createBatch(
    input: CreateUnlockBatchDto,
    admin: AccessViewer,
    now: Date = new Date(),
  ): Promise<UnlockBatchView> {
    const name = input.name.trim();
    const allMock = input.allMock === true;
    const examIds = allMock ? [] : [...new Set(input.examIds ?? [])];

    if (!allMock) {
      if (examIds.length === 0) {
        throw new BadRequestException('กรุณาเลือกชุดข้อสอบอย่างน้อย 1 ชุด');
      }
      const exams = await this.examsRepository.find({
        select: { id: true, isMock: true, accessType: true },
        where: { id: In(examIds) },
        loadEagerRelations: false,
      });
      if (
        exams.length !== examIds.length ||
        exams.some((exam) => !isLockedExam(exam))
      ) {
        throw new BadRequestException(
          'ชุดข้อสอบที่เลือกต้องเป็น Mock Exam ที่ไม่ฟรี (code หรือ purchase)',
        );
      }
    }

    let codeExpiresAt: Date | null = null;
    if (input.codeExpiresAt) {
      codeExpiresAt = parseExpiry(input.codeExpiresAt);
      if (codeExpiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException('วันหมดอายุของโค้ดต้องเป็นเวลาในอนาคต');
      }
    }

    for (let attempt = 1; ; attempt++) {
      const codes = await this.generateUniqueCodes(input.count);
      const batchId = randomUUID();
      try {
        await this.dataSource.transaction(async (manager) => {
          await manager.insert(UnlockCodeBatch, {
            id: batchId,
            name,
            allMock,
            accessDays: input.accessDays,
            codeExpiresAt,
            isActive: true,
            codeCount: codes.length,
            createdById: admin.id,
          });
          if (examIds.length > 0) {
            await manager.insert(
              UnlockCodeBatchExam,
              examIds.map((examId) => ({ batchId, examId })),
            );
          }
          for (let i = 0; i < codes.length; i += INSERT_CHUNK) {
            await manager
              .createQueryBuilder()
              .insert()
              .into(UnlockCode)
              .values(
                codes.slice(i, i + INSERT_CHUNK).map((code) => ({
                  id: randomUUID(),
                  batchId,
                  code,
                  isActive: true,
                  usedByUserId: null,
                  usedAt: null,
                })),
              )
              .updateEntity(false)
              .execute();
          }
        });
        return this.getBatch(batchId);
      } catch (err) {
        // A code taken by a campaign created at the same moment: retry
        if (isDuplicateKey(err) && attempt < GENERATE_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  /** `count` distinct codes that are not in unlock_codes yet. */
  private async generateUniqueCodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    for (let round = 0; codes.size < count; round++) {
      if (round >= 20) {
        throw new Error('Could not generate enough unique unlock codes');
      }
      const fresh = randomCodes(count - codes.size).filter(
        (c) => !codes.has(c),
      );
      const taken = new Set<string>();
      for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
        const chunk = fresh.slice(i, i + INSERT_CHUNK);
        const existing = await this.codesRepository.find({
          select: { code: true },
          where: { code: In(chunk) },
          loadEagerRelations: false,
        });
        for (const e of existing) taken.add(e.code);
      }
      for (const c of fresh) {
        if (!taken.has(c) && codes.size < count) codes.add(c);
      }
    }
    return [...codes];
  }

  async updateBatch(
    id: string,
    input: UpdateUnlockBatchDto,
  ): Promise<UnlockBatchView> {
    await this.findBatchOrFail(id);

    const changes: Partial<UnlockCodeBatch> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (typeof input.isActive === 'boolean') changes.isActive = input.isActive;
    if (input.codeExpiresAt !== undefined) {
      changes.codeExpiresAt = input.codeExpiresAt
        ? parseExpiry(input.codeExpiresAt)
        : null;
    }
    if (Object.keys(changes).length > 0) {
      await this.batchesRepository.update(id, changes);
    }
    return this.getBatch(id);
  }

  private async findBatchOrFail(id: string): Promise<UnlockCodeBatch> {
    const batch = await this.batchesRepository.findOne({ where: { id } });
    if (!batch) throw new NotFoundException('ไม่พบแคมเปญ');
    return batch;
  }

  /** Exams (id, title) and used counts of several campaigns, 2 queries. */
  private async toBatchViews(
    batches: UnlockCodeBatch[],
  ): Promise<UnlockBatchView[]> {
    if (batches.length === 0) return [];
    const ids = batches.map((b) => b.id);

    const [examRows, usedRows] = await Promise.all([
      this.batchExamsRepository
        .createQueryBuilder('link')
        .innerJoin(Exam, 'exam', 'exam.id = link.examId')
        .select('link.batchId', 'batchId')
        .addSelect('exam.id', 'id')
        .addSelect('exam.title', 'title')
        .where('link.batchId IN (:...ids)', { ids })
        .orderBy('exam.title', 'ASC')
        .getRawMany<{ batchId: string; id: string; title: string }>(),
      this.codesRepository
        .createQueryBuilder('code')
        .select('code.batchId', 'batchId')
        .addSelect('COUNT(*)', 'used')
        .where('code.batchId IN (:...ids)', { ids })
        .andWhere('code.usedAt IS NOT NULL')
        .groupBy('code.batchId')
        .getRawMany<{ batchId: string; used: number | string }>(),
    ]);

    return batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      allMock: Boolean(batch.allMock),
      exams: examRows
        .filter((row) => row.batchId === batch.id)
        .map((row) => ({ id: row.id, title: row.title })),
      codeCount: batch.codeCount,
      usedCount: Number(
        usedRows.find((row) => row.batchId === batch.id)?.used ?? 0,
      ),
      accessDays: batch.accessDays,
      codeExpiresAt: batch.codeExpiresAt ?? null,
      isActive: Boolean(batch.isActive),
      createdAt: batch.createdAt,
    }));
  }

  // ── ADMIN: CODES ────────────────────────────────────────────────────

  /**
   * Codes of a campaign. status: used = redeemed; unused = not redeemed and
   * on; disabled = turned off. `search` matches the code (spaces/dashes and
   * case ignored) or the email of the account that used it.
   */
  async listCodes(
    batchId: string,
    status: string = 'all',
    search?: string,
    page = 1,
    limit = 50,
  ): Promise<Paginated<UnlockCodeView>> {
    const filter = (status || 'all') as CodeStatusFilter;
    if (!CODE_STATUS_FILTERS.includes(filter)) {
      throw new BadRequestException(
        'status ต้องเป็น all, used, unused หรือ disabled',
      );
    }
    await this.findBatchOrFail(batchId);
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit, 50, 200);

    const qb = this.codeQuery(batchId);
    if (filter === 'used') qb.andWhere('code.usedAt IS NOT NULL');
    if (filter === 'unused') {
      qb.andWhere('code.usedAt IS NULL').andWhere('code.isActive = :on', {
        on: true,
      });
    }
    if (filter === 'disabled') {
      qb.andWhere('code.isActive = :off', { off: false });
    }
    const term = search?.trim();
    if (term) {
      const codeTerm = normalizeCodeSearch(term);
      qb.andWhere(
        codeTerm
          ? '(code.code LIKE :codeSearch OR user.email LIKE :emailSearch)'
          : 'user.email LIKE :emailSearch',
        {
          codeSearch: `%${escapeLike(codeTerm)}%`,
          emailSearch: `%${escapeLike(term)}%`,
        },
      );
    }

    const total = await qb.clone().getCount();
    if (filter === 'used') {
      qb.orderBy('code.usedAt', 'DESC').addOrderBy('code.code', 'ASC');
    } else {
      qb.orderBy('code.code', 'ASC');
    }
    const rows = await qb
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany<CodeRow>();

    return {
      items: rows.map(toCodeView),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async updateCode(id: string, isActive: boolean): Promise<UnlockCodeView> {
    const result = await this.codesRepository.update(id, { isActive });
    if (!result.affected) throw new NotFoundException('ไม่พบโค้ด');
    const row = await this.codeQuery()
      .where('code.id = :id', { id })
      .getRawOne<CodeRow>();
    if (!row) throw new NotFoundException('ไม่พบโค้ด');
    return toCodeView(row);
  }

  /**
   * Every code of a campaign as CSV (UTF-8 with BOM for Excel):
   * code,status,used_by_email,used_by_name,used_at (Thai time).
   */
  async exportCsv(batchId: string): Promise<{ name: string; csv: string }> {
    const batch = await this.findBatchOrFail(batchId);
    const rows = await this.codeQuery(batchId)
      .orderBy('code.code', 'ASC')
      .getRawMany<CodeRow>();

    const lines = [
      csvLine(['code', 'status', 'used_by_email', 'used_by_name', 'used_at']),
      ...rows.map((row) => {
        const view = toCodeView(row);
        const status = view.usedAt
          ? 'used'
          : view.isActive
            ? 'unused'
            : 'disabled';
        const name = [view.usedBy?.firstName, view.usedBy?.lastName]
          .filter(Boolean)
          .join(' ');
        return csvLine([
          view.code,
          status,
          view.usedBy?.email ?? '',
          name,
          toThaiDateTime(view.usedAt),
        ]);
      }),
    ];
    return { name: batch.name, csv: CSV_BOM + lines.join('\r\n') + '\r\n' };
  }

  /** Codes (of one campaign) with the safe fields of the user who used it. */
  private codeQuery(batchId?: string) {
    const qb = this.codesRepository
      .createQueryBuilder('code')
      .leftJoin(User, 'user', 'user.id = code.usedByUserId')
      .select('code.id', 'id')
      .addSelect('code.code', 'code')
      .addSelect('code.isActive', 'isActive')
      .addSelect('code.usedAt', 'usedAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.email', 'email')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName');
    if (batchId) qb.where('code.batchId = :batchId', { batchId });
    return qb;
  }
}

function toCodeView(row: CodeRow): UnlockCodeView {
  return {
    id: row.id,
    code: row.code,
    isActive: row.isActive === true || Number(row.isActive) === 1,
    usedAt: row.usedAt ?? null,
    usedBy: row.userId
      ? {
          id: row.userId,
          email: row.email ?? '',
          firstName: row.firstName ?? null,
          lastName: row.lastName ?? null,
        }
      : null,
  };
}
