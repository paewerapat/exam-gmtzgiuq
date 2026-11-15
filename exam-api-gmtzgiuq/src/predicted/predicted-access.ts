import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Access of a viewer to one Predicted set (task 22):
 * - full: every question
 * - preview: only the first previewCount questions (orderIndex, createdAt, id)
 * - locked: none
 */
export type PredictedViewerAccess = 'full' | 'preview' | 'locked';

/** A Predicted set with what decides access (one row per set). */
export interface PredictedSetRule {
  // PredictedSetAccess; any other value is treated as pro
  access: string;
  // null / 0 = no Preview
  previewCount: number | null;
  // Rank of the set among the series' published `pro` sets by setNo, from 1
  // (null for a free set)
  proIndex: number | null;
  // Questions the set really has for non-admins now (not Challenge, as
  // PredictedAccessService.questionIds); not sent = not checked. A Preview
  // that would hand out all of them (previewCount ≥ this) is no Preview:
  // locked (B2/Q3 — questions may be removed after the series was saved)
  playableCount?: number | null;
}

/** The viewer's rights in the series' venue (one lookup per venue). */
export interface PredictedViewerRights {
  // Logged in (guests have no plan, not even the free one)
  loggedIn: boolean;
  admin: boolean;
  // An active plan with rank > 0 in the venue (ProAccessService.hasPaidPlan)
  paid: boolean;
  // entitlements.predictedSets of the venue (free plan included): null =
  // every set
  predictedSets: number | null;
}

/** Guest rights: no plan at all. */
export const GUEST_RIGHTS: PredictedViewerRights = Object.freeze({
  loggedIn: false,
  admin: false,
  paid: false,
  predictedSets: 0,
});

/** previewCount as stored/used: a whole number > 0, else null. */
export function normalizePreviewCount(value: unknown): number | null {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The Preview a viewer without full access gets: previewCount, or null when
 * there is none or it is not below the set's real questions (when
 * playableCount is sent) — then the set is locked instead of being served whole.
 */
export function effectivePreviewCount(set: PredictedSetRule): number | null {
  const preview = normalizePreviewCount(set.previewCount);
  if (preview === null) return null;
  if (set.playableCount === undefined || set.playableCount === null) {
    return preview;
  }
  const playable = Number(set.playableCount);
  return Number.isFinite(playable) && preview < playable ? preview : null;
}

/**
 * The rule of the task file (กติกาสิทธิ์):
 * full = admin; or free without Preview; or free with Preview and a paid
 * plan in the venue; or pro and (predictedSets null or proIndex ≤
 * predictedSets) — guests never get full on a pro set. Otherwise preview
 * when the set has a Preview below its real questions
 * (effectivePreviewCount), else locked.
 */
export function computePredictedAccess(
  set: PredictedSetRule,
  rights: PredictedViewerRights,
): PredictedViewerAccess {
  const preview = normalizePreviewCount(set.previewCount);
  if (rights.admin) return 'full';
  const notFull = effectivePreviewCount(set) === null ? 'locked' : 'preview';

  if (set.access === 'free') {
    if (preview === null) return 'full';
    if (rights.loggedIn && rights.paid) return 'full';
    return notFull;
  }

  if (rights.loggedIn) {
    const allowed = rights.predictedSets;
    const index = Number(set.proIndex);
    if (
      allowed === null ||
      (Number.isInteger(index) && index >= 1 && index <= allowed)
    ) {
      return 'full';
    }
  }
  return notFull;
}

/** `predicted` of GET /exams/:id. */
export interface PredictedExamInfo {
  access: 'full' | 'preview';
  // null when the set has no Preview
  previewCount: number | null;
  // Questions of the whole set
  totalQuestions: number;
  seriesId: string;
  setNo: number;
  // Key of the series' venue while it is active (/upgrade?venue=<key>);
  // null when the venue is turned off
  venueKey: string | null;
}

export const PREDICTED_LOCKED_ERROR_CODE = 'PREDICTED_LOCKED';
export const PREDICTED_LOCKED_MESSAGE =
  'ชุดข้อสอบนี้สำหรับสมาชิก Pro กรุณา Upgrade เป็น Pro เพื่อ Unlock';

/**
 * 403 `{ statusCode, message, errorCode: 'PREDICTED_LOCKED', venueKey }`
 * (venueKey: the series' active venue for /upgrade?venue=, else null).
 */
export function predictedLockedException(
  venueKey: string | null = null,
): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    message: PREDICTED_LOCKED_MESSAGE,
    errorCode: PREDICTED_LOCKED_ERROR_CODE,
    venueKey,
  });
}

/** Series off or exam not published (non-admins): as if it did not exist. */
export function predictedSetNotFound(): NotFoundException {
  return new NotFoundException('ไม่พบชุดข้อสอบ');
}

/**
 * SQL condition: the exam whose id is `examIdSql` (a column of the caller's
 * query, never user input) is not a Predicted set. Used by every public exam
 * and question list (task 22). `alias` must be unique within the query.
 */
export function notPredictedExamSql(examIdSql: string, alias = 'pset'): string {
  return `NOT EXISTS (SELECT 1 FROM predicted_sets ${alias} WHERE ${alias}.examId = ${examIdSql})`;
}

/**
 * SQL expression: questions of the exam `examIdSql` (a column of the
 * caller's query, never user input) a non-admin gets — not Challenge, the
 * same rows as PredictedAccessService.questionIds (playableCount).
 */
export function playableCountSql(examIdSql: string): string {
  return (
    '(SELECT COUNT(*) FROM questions playable_q' +
    ` WHERE playable_q.examId = ${examIdSql}` +
    ' AND playable_q.isChallenge = 0)'
  );
}

/**
 * SQL expression: proIndex of the set row `setAlias` (predicted_sets) — its
 * rank among the published `pro` sets of its series by setNo (itself
 * included when it is a published pro set).
 */
export function proIndexSql(setAlias: string): string {
  return (
    '(SELECT COUNT(*) FROM predicted_sets pro_set' +
    ' INNER JOIN exams pro_exam ON pro_exam.id = pro_set.examId' +
    ` WHERE pro_set.seriesId = ${setAlias}.seriesId` +
    " AND pro_set.access = 'pro'" +
    " AND pro_exam.status = 'published'" +
    ` AND pro_set.setNo <= ${setAlias}.setNo)`
  );
}
