import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
import { ProPlan } from '../pro/pro-plan.entity';
import { ProException } from '../pro/pro-errors';
import {
  CodeGrantResult,
  ProSubscriptionsService,
} from '../pro/pro-subscriptions.service';
import { UnlockBatchKind, UnlockCodeBatch } from './unlock-code-batch.entity';
import { UnlockCodeBatchExam } from './unlock-code-batch-exam.entity';
import { UnlockCode } from './unlock-code.entity';
import {
  CODE_STATUS_FILTERS,
  CodeStatusFilter,
  CreateUnlockBatchDto,
  RedeemCodeDto,
  UpdateUnlockBatchDto,
} from './dto/unlock-code.dto';
import {
  CSV_BOM,
  EXAM_CODE_ONLY_MESSAGE,
  RedeemErrorCode,
  RedeemException,
  csvLine,
  escapeLike,
  normalizeCode,
  normalizeCodeSearch,
  randomCodes,
  toThaiDateTime,
} from './unlock-code-format';
import { RedeemThrottleService } from './redeem-throttle.service';

export {
  PENDING_ATTEMPT,
  REDEEM_FAILURE_WINDOW_MS,
  REDEEM_MAX_FAILURES,
} from './redeem-throttle.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const INSERT_CHUNK = 1000;
const GENERATE_ATTEMPTS = 3;

/**
 * Errors of a code that exists and is valid but cannot be used by this
 * account / for its plan: not counted toward the redeem limit (task 19).
 */
const NOT_A_GUESS: readonly RedeemErrorCode[] = [
  'ALREADY_HIGHER_PLAN',
  'PLAN_UNAVAILABLE',
];

/** Redeem of an exam campaign (task 15). */
export interface ExamRedeemResult {
  kind: 'exam';
  unlockedExamIds: string[];
  expiresAt: string;
}

/** Redeem of a Pro campaign (task 19). */
export interface ProRedeemResult {
  kind: 'pro';
  venue: { id: string; key: string; name: string };
  plan: { id: string; code: string; name: string };
  currentPeriodEnd: string;
  // the running row of the same plan got the days (else a new row)
  extended: boolean;
  // the row renews by card and its next charge could not be moved to the
  // new end (still on the old date); normally false
  autoRenewDatesDiffer: boolean;
  // the exam of the page, when the plan now unlocks it (mockPurchase)
  unlockedExamIds: string[];
  // = currentPeriodEnd (same field name as an exam redeem)
  expiresAt: string;
}

export type RedeemResult = ExamRedeemResult | ProRedeemResult;

export interface UnlockBatchView {
  id: string;
  name: string;
  // exam / pro (task 19)
  kind: string;
  proPlan: {
    id: string;
    code: string;
    name: string;
    venue: { id: string; key: string; name: string } | null;
  } | null;
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

const bool = (value: unknown) => value === true || Number(value) === 1;

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

  constructor(
    @InjectRepository(UnlockCodeBatch)
    private batchesRepository: Repository<UnlockCodeBatch>,
    @InjectRepository(UnlockCodeBatchExam)
    private batchExamsRepository: Repository<UnlockCodeBatchExam>,
    @InjectRepository(UnlockCode)
    private codesRepository: Repository<UnlockCode>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    private dataSource: DataSource,
    private examAccessService: ExamAccessService,
    private throttle: RedeemThrottleService,
    private proSubscriptionsService: ProSubscriptionsService,
  ) {}

  // ── REDEEM ──────────────────────────────────────────────────────────

  /**
   * Redeem a code for the logged-in user. Exam campaign (task 15): typed
   * on the page of `examId`; the code is marked used by this account and
   * access to every exam of its campaign (or every non-free Mock Exam) is
   * granted for accessDays. Pro campaign (task 19): examId is not needed;
   * the plan of the campaign is given for accessDays (grantFromCode).
   *
   * Every attempt goes through the brute-force limit of RedeemThrottleService
   * (10 failures / 15 min / account, shared with the discount codes of the
   * Pro checkout): a RedeemException counts as a failure, success and
   * unexpected errors (500) do not.
   */
  async redeem(
    user: AccessViewer,
    input: RedeemCodeDto,
    now: Date = new Date(),
  ): Promise<RedeemResult> {
    const attemptId = await this.throttle.begin(user.id, now);
    try {
      const result = await this.redeemOrThrow(
        user,
        { code: input?.code, examId: input?.examId },
        now,
      );
      await this.throttle.settle(attemptId, null);
      return result;
    } catch (err) {
      // Wrong code etc. count; an unexpected error (500) does not, nor a
      // valid Pro code refused for the account / its plan (not a guess)
      await this.throttle.settle(
        attemptId,
        err instanceof RedeemException && !NOT_A_GUESS.includes(err.errorCode)
          ? err.errorCode
          : null,
      );
      throw err;
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
    // counted toward the limit. No examId (/upgrade) is fine for Pro codes.
    const rawExamId = input.examId;
    let examId: string | null = null;
    if (rawExamId !== undefined && rawExamId !== null && rawExamId !== '') {
      if (typeof rawExamId !== 'string' || !isUUID(rawExamId)) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'ไม่พบชุดข้อสอบนี้ (examId ไม่ถูกต้อง)',
          error: 'Bad Request',
        });
      }
      examId = rawExamId;
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

    if (batch.kind === String(UnlockBatchKind.PRO)) {
      return this.redeemPro(user, row.id, batch, examId, now);
    }
    // An exam code typed where there is no exam (the Upgrade page)
    if (examId === null) {
      throw new RedeemException('NOT_FOR_THIS_EXAM', EXAM_CODE_ONLY_MESSAGE);
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
      kind: 'exam',
      unlockedExamIds: await this.unlockedExamIds(batch.allMock, batchExamIds),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * A code of a Pro campaign (task 19): one code per campaign per account,
   * then the plan through ProSubscriptionsService.grantFromCode (extend the
   * same plan / replace a lower one / 409 ALREADY_HIGHER_PLAN), which marks
   * the code used in its own transaction under the user's lock. examId (the
   * Mock page it was typed on, optional) is only used for unlockedExamIds.
   */
  private async redeemPro(
    user: AccessViewer,
    codeId: string,
    batch: UnlockCodeBatch,
    examId: string | null,
    now: Date,
  ): Promise<ProRedeemResult> {
    if (!batch.proPlanId) throw new RedeemException('PLAN_UNAVAILABLE');
    const usedOther = await this.codesRepository.exists({
      where: { batchId: batch.id, usedByUserId: user.id },
    });
    if (usedOther) throw new RedeemException('BATCH_ALREADY_USED');

    const usedAt = floorToSecond(now);
    let granted: CodeGrantResult;
    try {
      granted = await this.proSubscriptionsService.grantFromCode(
        {
          userId: user.id,
          planId: batch.proPlanId,
          days: batch.accessDays,
          note: batch.name,
        },
        (manager) => this.consumeLocked(manager, user.id, codeId, usedAt, now),
        now,
      );
    } catch (err) {
      if (err instanceof ProException) {
        if (err.errorCode === 'ALREADY_HIGHER_PLAN') {
          throw new RedeemException('ALREADY_HIGHER_PLAN');
        }
        if (
          err.errorCode === 'PLAN_NOT_FOUND' ||
          err.errorCode === 'FREE_PLAN_GRANT'
        ) {
          this.logger.warn(
            `Pro unlock campaign ${batch.id}: its plan is missing or free`,
          );
          throw new RedeemException('PLAN_UNAVAILABLE');
        }
      }
      throw err;
    }

    return {
      kind: 'pro',
      venue: granted.venue,
      plan: granted.plan,
      currentPeriodEnd: granted.currentPeriodEnd.toISOString(),
      extended: granted.extended,
      autoRenewDatesDiffer: granted.autoRenewDatesDiffer,
      unlockedExamIds: await this.examNowUnlocked(user, examId, now),
      expiresAt: granted.currentPeriodEnd.toISOString(),
    };
  }

  /** [examId] when the user can now take that locked exam, else []. */
  private async examNowUnlocked(
    user: AccessViewer,
    examId: string | null,
    now: Date,
  ): Promise<string[]> {
    if (!examId) return [];
    const exam = await this.examsRepository.findOne({
      select: { id: true, isMock: true, accessType: true, category: true },
      where: { id: examId },
      loadEagerRelations: false,
    });
    if (!exam || !isLockedExam(exam)) return [];
    const access = await this.examAccessService.getAccess(user, exam, now);
    return access.status === 'unlocked' ? [exam.id] : [];
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
    await this.dataSource.transaction(async (manager) => {
      await this.consumeLocked(manager, user.id, codeId, usedAt, now);
      await this.examAccessService.grant(manager, {
        userId: user.id,
        examIds: batchExamIds,
        allMock: batch.allMock,
        source: ExamAccessSource.CODE,
        sourceId: codeId,
        expiresAt,
      });
    });
  }

  /**
   * Mark the code used by `userId` inside the caller's transaction.
   * Conditional update = the atomic step: of two simultaneous redeems of
   * this code only one matches; the unique (batchId, usedByUserId) index
   * stops one account using two codes of a campaign at the same time. The
   * batch conditions are repeated so disabling/expiring it in between wins
   * too. Not matched → the RedeemException of the reason.
   */
  private async consumeLocked(
    manager: EntityManager,
    userId: string,
    codeId: string,
    usedAt: Date,
    now: Date,
  ): Promise<void> {
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
        [userId, usedAt, codeId, now],
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
        await this.whyNotRedeemed(manager, codeId, userId, now),
      );
    }
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
    const kind =
      input.kind === 'pro' ? UnlockBatchKind.PRO : UnlockBatchKind.EXAM;
    let proPlanId: string | null = null;
    if (kind === UnlockBatchKind.PRO) {
      // A Pro campaign gives a plan, never exams
      if (input.allMock === true || (input.examIds?.length ?? 0) > 0) {
        throw new BadRequestException(
          'แคมเปญให้แพ็กเกจ Pro ไม่ต้องเลือกชุดข้อสอบ',
        );
      }
      const plan = input.proPlanId
        ? await this.plansRepository.findOne({
            where: { id: input.proPlanId },
            relations: { venue: true },
          })
        : null;
      if (!plan) throw new ProException('PLAN_NOT_FOUND');
      if (plan.rank <= 0) throw new ProException('FREE_PLAN_GRANT');
      // Only a plan shown on the Upgrade page of an open venue (task 19 r2)
      if (!bool(plan.isVisible) || !plan.venue || !bool(plan.venue.isActive)) {
        throw new ProException('PLAN_NOT_OFFERED');
      }
      proPlanId = plan.id;
    } else if (input.proPlanId != null) {
      throw new BadRequestException(
        'แคมเปญ Unlock ชุดข้อสอบไม่ต้องเลือกแพ็กเกจ Pro',
      );
    }
    const allMock = kind === UnlockBatchKind.EXAM && input.allMock === true;
    const examIds =
      allMock || kind === UnlockBatchKind.PRO
        ? []
        : [...new Set(input.examIds ?? [])];

    if (kind === UnlockBatchKind.EXAM && !allMock) {
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
            kind,
            proPlanId,
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

    const planIds = [
      ...new Set(
        batches
          .map((b) => b.proPlanId)
          .filter((id): id is string => typeof id === 'string' && id !== ''),
      ),
    ];
    const [examRows, usedRows, plans] = await Promise.all([
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
      planIds.length > 0
        ? this.plansRepository.find({
            where: { id: In(planIds) },
            relations: { venue: true },
          })
        : Promise.resolve([] as ProPlan[]),
    ]);

    return batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      kind: batch.kind || UnlockBatchKind.EXAM,
      proPlan: toProPlanView(plans.find((p) => p.id === batch.proPlanId)),
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

function toProPlanView(plan: ProPlan | undefined): UnlockBatchView['proPlan'] {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    venue: plan.venue
      ? { id: plan.venue.id, key: plan.venue.key, name: plan.venue.name }
      : null,
  };
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
