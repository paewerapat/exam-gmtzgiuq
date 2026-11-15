import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Question, QuestionStatus } from '../questions/question.entity';
import { ProAccessService } from '../pro/pro-access.service';
import { isAdminViewer, type AccessViewer } from '../exam-access/exam-access';
import { PredictedSet } from './predicted-set.entity';
import {
  GUEST_RIGHTS,
  PredictedSetRule,
  PredictedViewerAccess,
  PredictedViewerRights,
  computePredictedAccess,
  normalizePreviewCount,
  predictedLockedException,
  playableCountSql,
  predictedSetNotFound,
  proIndexSql,
} from './predicted-access';

/** The Predicted set of one exam with what decides access. */
export interface PredictedSetRow extends PredictedSetRule {
  id: string;
  seriesId: string;
  examId: string;
  setNo: number;
  venueId: string;
  // Key of the venue while it is active (/upgrade?venue=), else null
  venueKey: string | null;
  seriesActive: boolean;
  examPublished: boolean;
}

/** Access of the viewer to the Predicted set of an exam. */
export interface ResolvedPredicted {
  set: PredictedSetRow;
  access: PredictedViewerAccess;
  // Questions the viewer gets in preview (null = no Preview)
  previewCount: number | null;
}

/**
 * Questions an attempt of a Predicted set may hold (task 22): mode
 * 'preview' = a Preview attempt (attempt.mode / question_answers.mode);
 * null = a full attempt (mode as requested). `questionIds` = the only ids
 * the attempt accepts, in order.
 */
export interface PredictedAttemptScope {
  mode: 'preview' | null;
  questionIds: string[];
}

/** Attempt fields read to work out its scope. */
export interface PredictedAttemptLike {
  examId: string | null | undefined;
  mode: string | null | undefined;
  questionIds: unknown;
}

interface SetRawRow {
  id: string;
  seriesId: string;
  examId: string;
  setNo: number | string;
  access: string;
  previewCount: number | string | null;
  proIndex: number | string | null;
  playableCount: number | string | null;
  venueId: string;
  venueKey: string | null;
  seriesActive: number | string | boolean;
  examStatus: string;
}

function isTrue(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

function toSetRow(row: SetRawRow): PredictedSetRow {
  return {
    id: row.id,
    seriesId: row.seriesId,
    examId: row.examId,
    setNo: Number(row.setNo),
    access: row.access,
    previewCount: normalizePreviewCount(row.previewCount),
    proIndex:
      row.proIndex === null || row.proIndex === undefined
        ? null
        : Number(row.proIndex),
    playableCount: Number(row.playableCount ?? 0),
    venueId: row.venueId,
    venueKey: row.venueKey ?? null,
    seriesActive: isTrue(row.seriesActive),
    examPublished: row.examStatus === String(QuestionStatus.PUBLISHED),
  };
}

/**
 * Who may open a Predicted set and how much of it (task 22), for GET
 * /exams/:id, attempts, answer logs and GET /predicted. Rights come from
 * ProAccessService (pro_plans.entitlements.predictedSets, paid plan rank).
 */
@Injectable()
export class PredictedAccessService {
  constructor(
    @InjectRepository(PredictedSet)
    private setsRepository: Repository<PredictedSet>,
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    private proAccessService: ProAccessService,
  ) {}

  /**
   * The viewer's rights in a venue: one ProAccessService lookup (the active
   * plan with the highest rank, else the venue's free plan). `paid` is the
   * same as hasPaidPlan (the highest active plan has rank > 0) without a
   * second query. Guests and admins: no query.
   */
  async getRights(
    viewer: AccessViewer | null | undefined,
    venueId: string,
    now: Date = new Date(),
  ): Promise<PredictedViewerRights> {
    if (!viewer?.id) return GUEST_RIGHTS;
    if (isAdminViewer(viewer)) {
      return { loggedIn: true, admin: true, paid: true, predictedSets: null };
    }
    const venue = (
      await this.proAccessService.getEntitlementsMany(viewer.id, [venueId], now)
    ).get(venueId);
    return {
      loggedIn: true,
      admin: false,
      paid: !!venue?.subscriptionId && (venue.rank ?? 0) > 0,
      predictedSets: venue ? venue.entitlements.predictedSets : 0,
    };
  }

  /** The Predicted set of an exam, or null when the exam is not one. */
  async findSetForExam(examId: string): Promise<PredictedSetRow | null> {
    if (!examId) return null;
    const row = await this.setsRepository
      .createQueryBuilder('ps')
      .innerJoin('predicted_series', 'series', 'series.id = ps.seriesId')
      .innerJoin('exams', 'exam', 'exam.id = ps.examId')
      .leftJoin(
        'pro_venues',
        'venue',
        'venue.id = series.venueId AND venue.isActive = :venueActive',
        { venueActive: true },
      )
      .select('ps.id', 'id')
      .addSelect('ps.seriesId', 'seriesId')
      .addSelect('ps.examId', 'examId')
      .addSelect('ps.setNo', 'setNo')
      .addSelect('ps.access', 'access')
      .addSelect('ps.previewCount', 'previewCount')
      .addSelect(proIndexSql('ps'), 'proIndex')
      .addSelect(playableCountSql('ps.examId'), 'playableCount')
      .addSelect('series.venueId', 'venueId')
      .addSelect('venue.key', 'venueKey')
      .addSelect('series.isActive', 'seriesActive')
      .addSelect('exam.status', 'examStatus')
      .where('ps.examId = :examId', { examId })
      .getRawOne<SetRawRow>();
    return row ? toSetRow(row) : null;
  }

  /**
   * Access of the viewer to the exam as a Predicted set; null = not a
   * Predicted set. Series turned off or exam not published → 404 except
   * for admins. Rights are only looked up when they matter.
   * Checked on every read (B2/Q3): a Preview that is not below the set's
   * real questions now (questions removed after the series was saved) is
   * locked, never served whole — GET /exams/:id, start, legacy submit,
   * progress and complete all come through here.
   */
  async resolveExam(
    viewer: AccessViewer | null | undefined,
    examId: string,
    now: Date = new Date(),
  ): Promise<ResolvedPredicted | null> {
    const set = await this.findSetForExam(examId);
    if (!set) return null;
    const admin = isAdminViewer(viewer);
    if (!admin && (!set.seriesActive || !set.examPublished)) {
      throw predictedSetNotFound();
    }

    const needsRights =
      !!viewer?.id &&
      !admin &&
      !(set.access === 'free' && set.previewCount === null);
    const rights = needsRights
      ? await this.getRights(viewer, set.venueId, now)
      : viewer?.id
        ? { ...GUEST_RIGHTS, loggedIn: true, admin }
        : GUEST_RIGHTS;
    return {
      set,
      access: computePredictedAccess(set, rights),
      previewCount: set.previewCount,
    };
  }

  /** resolveExam, and 403 PREDICTED_LOCKED when locked. */
  async assertExam(
    viewer: AccessViewer | null | undefined,
    examId: string,
    now: Date = new Date(),
  ): Promise<ResolvedPredicted | null> {
    const resolved = await this.resolveExam(viewer, examId, now);
    if (resolved?.access === 'locked')
      throw predictedLockedException(resolved.set.venueKey);
    return resolved;
  }

  /**
   * Ids of the questions a viewer may answer in a Predicted set, in order
   * (orderIndex, createdAt, id), Challenge questions left out (as GET
   * /exams/:id for non-admins); `limit` = the first ones only (Preview).
   */
  async questionIds(examId: string, limit?: number | null): Promise<string[]> {
    const qb = this.questionsRepository
      .createQueryBuilder('q')
      .select('q.id', 'id')
      .where('q.examId = :examId', { examId })
      .andWhere('q.isChallenge = :isChallenge', { isChallenge: false })
      .orderBy('q.orderIndex', 'ASC')
      .addOrderBy('q.createdAt', 'ASC')
      .addOrderBy('q.id', 'ASC');
    if (typeof limit === 'number') qb.limit(limit);
    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /**
   * Starting an attempt (POST /attempts/start, legacy POST /attempts):
   * null = not a Predicted set; locked → 403 PREDICTED_LOCKED; preview →
   * mode 'preview' with the Preview questions only; full → every question
   * (mode as requested).
   */
  async attemptStartScope(
    viewer: AccessViewer | null | undefined,
    examId: string,
    now: Date = new Date(),
  ): Promise<PredictedAttemptScope | null> {
    const resolved = await this.assertExam(viewer, examId, now);
    if (!resolved) return null;
    if (resolved.access === 'preview') {
      return {
        mode: 'preview',
        questionIds: await this.questionIds(examId, resolved.previewCount),
      };
    }
    return { mode: null, questionIds: await this.questionIds(examId) };
  }

  /**
   * Autosave / submit of an attempt: null = not a Predicted set. A Preview
   * attempt keeps the questions it was started with (unless the set is now
   * locked → 403); a full attempt needs full access now (else 403
   * PREDICTED_LOCKED, as EXAM_LOCKED for a Mock Exam whose access ended).
   */
  async attemptScope(
    viewer: AccessViewer | null | undefined,
    attempt: PredictedAttemptLike,
    now: Date = new Date(),
  ): Promise<PredictedAttemptScope | null> {
    if (!attempt.examId) return null;
    const resolved = await this.assertExam(viewer, attempt.examId, now);
    if (!resolved) return null;
    if (attempt.mode === 'preview') {
      const stored = Array.isArray(attempt.questionIds)
        ? attempt.questionIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      return { mode: 'preview', questionIds: stored };
    }
    if (resolved.access !== 'full') {
      throw predictedLockedException(resolved.set.venueKey);
    }
    return {
      mode: null,
      questionIds: await this.questionIds(attempt.examId),
    };
  }

  /** The exams among `examIds` that are Predicted sets (lower-case ids). */
  async predictedExamIds(examIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(examIds.filter(Boolean))];
    if (ids.length === 0) return new Set();
    const rows = await this.setsRepository.find({
      select: { id: true, examId: true },
      where: { examId: In(ids) },
      loadEagerRelations: false,
    });
    return new Set(rows.map((row) => String(row.examId).toLowerCase()));
  }

  /**
   * previewCount of the exam's Predicted set; null = not a Predicted set or
   * no Preview (exam PUT keeps more questions than the Preview, B2/Q3).
   */
  async findPreviewCount(examId: string): Promise<number | null> {
    if (!examId) return null;
    const row = await this.setsRepository.findOne({
      select: { id: true, previewCount: true },
      where: { examId },
      loadEagerRelations: false,
    });
    return row ? normalizePreviewCount(row.previewCount) : null;
  }

  /** The exam is a Predicted set. */
  async isPredictedExam(examId: string): Promise<boolean> {
    if (!examId) return false;
    return this.setsRepository.exists({
      where: { examId },
      loadEagerRelations: false,
    });
  }
}

/**
 * Keep only the keys of `record` that are in `allowed` (case-insensitive,
 * as MySQL compares ids); anything that is not a plain object → {}.
 */
export function pickAllowedKeys<T>(
  record: Record<string, T> | null | undefined,
  allowed: string[],
): Record<string, T> {
  const result: Record<string, T> = {};
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return result;
  }
  const keys = new Set(allowed.map((id) => id.toLowerCase()));
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key.toLowerCase())) result[key] = value;
  }
  return result;
}
