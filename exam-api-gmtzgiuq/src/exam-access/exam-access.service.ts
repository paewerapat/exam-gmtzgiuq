import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import type { MockExamAccess } from '../exams/exam-mock';
import { ExamAccess, ExamAccessSource } from './exam-access.entity';
import {
  AccessViewer,
  LockableExam,
  examLockedException,
  isAdminViewer,
  isLockedExam,
} from './exam-access';

const FREE: MockExamAccess = { status: 'free', expiresAt: null };
const LOCKED: MockExamAccess = { status: 'locked', expiresAt: null };

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
 * question endpoints and by unlock codes; built so task 3 (purchase) only
 * has to call grant() with source = purchase.
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
        result.set(exam.id, { status: 'unlocked', expiresAt: null });
      }
      return result;
    }

    const grants = await this.accessRepository.find({
      select: { id: true, examId: true, allMock: true, expiresAt: true },
      where: [
        { userId: viewer.id, examId: In(locked.map((e) => e.id)) },
        { userId: viewer.id, allMock: true },
      ],
    });

    for (const exam of locked) {
      const mine = grants.filter((g) => g.allMock || g.examId === exam.id);
      result.set(exam.id, summarize(mine, now));
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
      select: { id: true, isMock: true, accessType: true },
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
function summarize(
  grants: Pick<ExamAccess, 'expiresAt'>[],
  now: Date,
): MockExamAccess {
  if (grants.length === 0) return LOCKED;

  const active = grants.filter(
    (g) => g.expiresAt === null || g.expiresAt.getTime() > now.getTime(),
  );
  if (active.length > 0) {
    if (active.some((g) => g.expiresAt === null)) {
      return { status: 'unlocked', expiresAt: null };
    }
    return { status: 'unlocked', expiresAt: latest(active) };
  }
  return { status: 'expired', expiresAt: latest(grants) };
}

function latest(grants: Pick<ExamAccess, 'expiresAt'>[]): string | null {
  let max: Date | null = null;
  for (const g of grants) {
    if (g.expiresAt && (!max || g.expiresAt > max)) max = g.expiresAt;
  }
  return max ? max.toISOString() : null;
}
