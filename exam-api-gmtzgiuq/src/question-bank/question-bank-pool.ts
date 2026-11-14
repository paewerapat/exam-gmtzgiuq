/**
 * Question pool of the Question Bank (task 20), as SQL fragments with `?`
 * placeholders. The pool of a venue / subject is every question that:
 * - belongs to an active topic of an active chapter of an active subject
 *   (`questions.topicId`), the subject being in the venue (subjects.venueId)
 * - is in a published exam that is not a Mock Exam (isMock = 0); bankOnly
 *   exams are included
 * - mode `challenge`: isChallenge = 1 only; mode `bank`: all of them
 *
 * Every fragment uses the aliases q (questions), e (exams), t (topics),
 * c (chapters), s (subjects).
 */

export const QB_MODES = ['bank', 'challenge'] as const;
export type QbMode = (typeof QB_MODES)[number];

export const QB_DIFFICULTIES = ['easy', 'medium', 'hard_challenge'] as const;
export type QbDifficulty = (typeof QB_DIFFICULTIES)[number];

export const QB_PROGRESS = ['all', 'undone', 'done', 'wrong'] as const;
export type QbProgress = (typeof QB_PROGRESS)[number];

/**
 * Difficulty bucket of a question: hard_challenge = difficulty hard or a
 * Challenge question (Beyond uses the same bucket for now), else easy /
 * medium (medium also for any unexpected value).
 */
export const BUCKET_SQL =
  "(CASE WHEN q.isChallenge = 1 OR q.difficulty = 'hard' THEN 'hard_challenge'" +
  " WHEN q.difficulty = 'easy' THEN 'easy' ELSE 'medium' END)";

/** JOINs from `questions q` to its exam, topic, chapter and subject. */
export const POOL_JOINS =
  'INNER JOIN exams e ON e.id = q.examId' +
  ' INNER JOIN topics t ON t.id = q.topicId' +
  ' INNER JOIN chapters c ON c.id = t.chapterId' +
  ' INNER JOIN subjects s ON s.id = c.subjectId';

/** The user has answered q (any mode). Param: userId. */
export const ANSWERED_SQL =
  'EXISTS (SELECT 1 FROM question_answers qa_any' +
  ' WHERE qa_any.userId = ? AND qa_any.questionId = q.id)';

/**
 * The user's latest answer to q is wrong (ties at the same time: any of
 * them wrong). Param: userId.
 */
export const LAST_WRONG_SQL =
  'EXISTS (SELECT 1 FROM question_answers qa_w' +
  ' WHERE qa_w.userId = ? AND qa_w.questionId = q.id AND qa_w.isCorrect = 0' +
  ' AND NOT EXISTS (SELECT 1 FROM question_answers qa_l' +
  ' WHERE qa_l.userId = qa_w.userId AND qa_l.questionId = qa_w.questionId' +
  ' AND qa_l.answeredAt > qa_w.answeredAt))';

export interface PoolScope {
  mode: QbMode;
  venueId?: string;
  subjectId?: string;
  // Already limited to the subject's topics; [] = no topic (empty pool)
  topicIds?: string[];
  // bank mode only; empty/undefined = every bucket
  difficulties?: QbDifficulty[];
  // needs userId unless 'all'
  progress?: QbProgress;
  userId?: string | null;
}

export interface PoolSql {
  // WHERE condition (without the WHERE keyword)
  where: string;
  params: unknown[];
}

/** WHERE condition of the pool of the scope (to use after POOL_JOINS). */
export function buildPoolWhere(scope: PoolScope): PoolSql {
  const conditions = [
    "e.status = 'published'",
    'e.isMock = 0',
    't.isActive = 1',
    'c.isActive = 1',
    's.isActive = 1',
  ];
  const params: unknown[] = [];

  if (scope.venueId !== undefined) {
    conditions.push('s.venueId = ?');
    params.push(scope.venueId);
  }
  if (scope.subjectId !== undefined) {
    conditions.push('s.id = ?');
    params.push(scope.subjectId);
  }
  if (scope.topicIds !== undefined) {
    if (scope.topicIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`t.id IN (${scope.topicIds.map(() => '?').join(',')})`);
      params.push(...scope.topicIds);
    }
  }
  if (scope.mode === 'challenge') {
    conditions.push('q.isChallenge = 1');
  } else if (scope.difficulties && scope.difficulties.length > 0) {
    const buckets = [...new Set(scope.difficulties)];
    conditions.push(`${BUCKET_SQL} IN (${buckets.map(() => '?').join(',')})`);
    params.push(...buckets);
  }

  const progress = scope.progress ?? 'all';
  if (progress !== 'all') {
    if (!scope.userId) {
      // Callers reject this before (QB_LOGIN_REQUIRED); never match anything
      conditions.push('1 = 0');
    } else if (progress === 'done') {
      conditions.push(ANSWERED_SQL);
      params.push(scope.userId);
    } else if (progress === 'undone') {
      conditions.push(`NOT ${ANSWERED_SQL}`);
      params.push(scope.userId);
    } else {
      conditions.push(LAST_WRONG_SQL);
      params.push(scope.userId);
    }
  }

  return { where: conditions.join(' AND '), params };
}
