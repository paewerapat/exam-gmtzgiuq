import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import type { MockExamAccess, MockExamAccessVia } from '../exams/exam-mock';
import { ExamAccessType } from '../exams/exam-mock';
import { ProAccessService } from '../pro/pro-access.service';
import { ExamAccess, ExamAccessSource } from './exam-access.entity';
import {
  AccessViewer,
  LockableExam,
  examLockedException,
  isAdminViewer,
  isLockedExam,
} from './exam-access';

const FREE: MockExamAccess = { status: 'free', expiresAt: null, via: null };
const LOCKED: MockExamAccess = {
  status: 'locked',
  expiresAt: null,
  via: null,
};

/** Tie-break between grants with the same end (deterministic `via`). */
const SOURCE_ORDER: ExamAccessSource[] = [
  ExamAccessSource.ADMIN,
  ExamAccessSource.PURCHASE,
  ExamAccessSource.CODE,
];

type GrantRow = Pick<ExamAccess, 'expiresAt' | 'source'>;

/** Input of ExamAccessService.grant (one grant per exam, or all Mock). */
export interface GrantAccessInput {
  userId: string;
  examIds: string[];
  allMock: boolean;
  source: ExamAccessSource;
  sourceId: string | null;
  expiresAt: Date | null;
}

/**
 * Who may take a locked Mock Exam (task 15). Used by the exam, attempt and
 * question endpoints and by unlock codes.
 *
 * A Mock Exam with accessType = purchase is also unlocked by Pro (task 17):
 * the entitlements of the user in the venue of the exam's category have
 * mockPurchase (ProAccessService). An exam whose category has no venue
 * stays locked unless there is a grant (exam_access, code/purchase/admin).
 *
 * Admins can always take every exam. A guest never can.
 */
@Injectable()
export class ExamAccessService {
  constructor(
    @InjectRepository(ExamAccess)
    private accessRepository: Repository<ExamAccess>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    private proAccessService: ProAccessService,
  ) {}

  /** Access of the viewer to one exam (see getAccessMany). */
  async getAccess(
    viewer: AccessViewer | null | undefined,
    exam: LockableExam,
    now: Date = new Date(),
  ): Promise<MockExamAccess> {
    const map = await this.getAccessMany(viewer, [exam], now);
    return map.get(exam.id) ?? LOCKED;
  }

  /**
   * Access of the viewer to each exam, by exam id, with one query for the
   * whole list: `free` (not locked), `locked`, `unlocked` (an admin, or a
   * grant that has not expired; expiresAt = the latest end, null = none) or
   * `expired` (grants only in the past; expiresAt = the latest end).
   * Purchase exams: a Pro plan with mockPurchase in the exam's venue also
   * unlocks (its end counts like a grant's); one more query batch.
   */
  async getAccessMany(
    viewer: AccessViewer | null | undefined,
    exams: LockableExam[],
    now: Date = new Date(),
  ): Promise<Map<string, MockExamAccess>> {
    const result = new Map<string, MockExamAccess>();
    const locked = exams.filter((exam) => isLockedExam(exam));
    for (const exam of exams) {
      if (!isLockedExam(exam)) result.set(exam.id, FREE);
    }
    if (locked.length === 0) return result;

    if (!viewer?.id) {
      for (const exam of locked) result.set(exam.id, LOCKED);
      return result;
    }
    if (isAdminViewer(viewer)) {
      for (const exam of locked) {
        result.set(exam.id, {
          status: 'unlocked',
          expiresAt: null,
          via: 'admin',
        });
      }
      return result;
    }

    const grants = await this.accessRepository.find({
      select: {
        id: true,
        examId: true,
        allMock: true,
        expiresAt: true,
        source: true,
      },
      where: [
        { userId: viewer.id, examId: In(locked.map((e) => e.id)) },
        { userId: viewer.id, allMock: true },
      ],
    });

    const purchase = locked.filter(
      (exam) => exam.accessType === ExamAccessType.PURCHASE,
    );
    const pro =
      purchase.length > 0
        ? await this.proAccessService.getMockPurchaseAccess(
            viewer.id,
            purchase,
            now,
          )
        : new Map<string, Date | null>();

    for (const exam of locked) {
      const mine = grants.filter((g) => g.allMock || g.examId === exam.id);
      const access = summarize(mine, now);
      result.set(
        exam.id,
        pro.has(exam.id) ? withPro(access, pro.get(exam.id) ?? null) : access,
      );
    }
    return result;
  }

  /** 403 EXAM_LOCKED unless the viewer may take this exam. */
  async assertCanAccess(
    viewer: AccessViewer | null | undefined,
    exam: LockableExam,
  ): Promise<void> {
    if (!isLockedExam(exam)) return;
    const access = await this.getAccess(viewer, exam);
    if (access.status !== 'unlocked') throw examLockedException();
  }

  /**
   * Same as assertCanAccess for an exam id. An exam that does not exist (or
   * no id, e.g. the exam of an old attempt was deleted) passes: callers that
   * need the exam report 404 themselves.
   */
  async assertCanAccessExamId(
    viewer: AccessViewer | null | undefined,
    examId: string | null | undefined,
  ): Promise<void> {
    if (!examId) return;
    const exam = await this.examsRepository.findOne({
      select: { id: true, isMock: true, accessType: true, category: true },
      where: { id: examId },
      loadEagerRelations: false,
    });
    if (!exam) return;
    await this.assertCanAccess(viewer, exam);
  }

  /**
   * Store access for a user inside the caller's transaction: one row per
   * exam, or a single all-Mock row (covers Mock Exams created later too).
   */
  async grant(manager: EntityManager, input: GrantAccessInput): Promise<void> {
    const base = {
      userId: input.userId,
      source: input.source,
      sourceId: input.sourceId,
      expiresAt: input.expiresAt,
    };
    const rows = input.allMock
      ? [{ ...base, examId: null, allMock: true }]
      : [...new Set(input.examIds)].map((examId) => ({
          ...base,
          examId,
          allMock: false,
        }));
    if (rows.length === 0) return;
    await manager.insert(ExamAccess, rows);
  }
}

/** Status of one locked exam from the viewer's grants for it. */
function summarize(grants: GrantRow[], now: Date): MockExamAccess {
  if (grants.length === 0) return LOCKED;

  const active = grants.filter(
    (g) => g.expiresAt === null || g.expiresAt.getTime() > now.getTime(),
  );
  const winner = latestGrant(active.length > 0 ? active : grants);
  return {
    status: active.length > 0 ? 'unlocked' : 'expired',
    expiresAt: winner.expiresAt ? winner.expiresAt.toISOString() : null,
    via: toVia(winner.source),
  };
}

/**
 * Add a Pro right (end `until`, null = none) to the access from grants:
 * always unlocked; the later end wins (no end beats any date) and gives
 * `via`; on a tie the grant is kept.
 */
function withPro(access: MockExamAccess, until: Date | null): MockExamAccess {
  const pro: MockExamAccess = {
    status: 'unlocked',
    expiresAt: until ? until.toISOString() : null,
    via: 'pro',
  };
  if (access.status !== 'unlocked') return pro;
  if (access.expiresAt === null) return access;
  if (until === null) return pro;
  return new Date(access.expiresAt).getTime() >= until.getTime() ? access : pro;
}

/** The grant whose end is latest (no end first), ties by SOURCE_ORDER. */
function latestGrant(grants: GrantRow[]): GrantRow {
  const endOf = (g: GrantRow) =>
    g.expiresAt === null ? Number.POSITIVE_INFINITY : g.expiresAt.getTime();
  const rankOf = (g: GrantRow) => {
    const i = SOURCE_ORDER.indexOf(g.source);
    return i === -1 ? SOURCE_ORDER.length : i;
  };
  return grants.reduce((best, g) =>
    endOf(g) > endOf(best) ||
    (endOf(g) === endOf(best) && rankOf(g) < rankOf(best))
      ? g
      : best,
  );
}

function toVia(source: ExamAccessSource | string | null | undefined) {
  return (SOURCE_ORDER as string[]).includes(source as string)
    ? (source as MockExamAccessVia)
    : null;
}
