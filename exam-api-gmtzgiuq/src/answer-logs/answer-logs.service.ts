import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  ANSWER_MODES,
  AnswerMode,
  QuestionAnswer,
} from './question-answer.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import type { AccessViewer } from '../exam-access/exam-access';
import { getAnswerStatus } from './answer-grading';
import { ChallengeAccessService } from '../question-bank/challenge-access.service';
import { AnswerLogItemDto, MAX_SELECTED_LENGTH } from './dto/answer-log.dto';

/** Longest time stored for one answer (one day). */
export const MAX_TIME_SPENT_SEC = 86400;

/** The completed attempt whose answers are logged. */
export interface AttemptAnswers {
  attemptId: string;
  userId: string;
  examId: string | null | undefined;
  mode: string | null | undefined;
  // As sent to PATCH /attempts/:id/complete or POST /attempts
  answers: Record<string, unknown> | null | undefined;
  timePerQuestion: Record<string, unknown> | null | undefined;
}

type AnswerRow = Pick<
  QuestionAnswer,
  | 'questionId'
  | 'examId'
  | 'attemptId'
  | 'mode'
  | 'selected'
  | 'isCorrect'
  | 'timeSpentSec'
>;

type GradedQuestion = Pick<
  Question,
  'id' | 'examId' | 'status' | 'type' | 'correctAnswer' | 'choices'
> &
  Partial<Pick<Question, 'isChallenge'>>;

/** Tries of one insert when InnoDB picks it as a deadlock victim. */
export const MAX_INSERT_TRIES = 3;

/** innodb_lock_wait_timeout (seconds) while writing, as startInProgress. */
export const LOCK_WAIT_TIMEOUT_SEC = 5;

/** Seconds as a whole number in 0–86400 (anything else → 0). */
export function clampSeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_TIME_SPENT_SEC, Math.round(n));
}

/**
 * Per-question answer log (task 16): one row per answered question in
 * question_answers, graded by the server. Written when an attempt is
 * completed and by POST /answer-logs (practice without an attempt).
 */
@Injectable()
export class AnswerLogsService {
  private readonly logger = new Logger(AnswerLogsService.name);

  constructor(
    @InjectRepository(QuestionAnswer)
    private answersRepository: Repository<QuestionAnswer>,
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    private examAccessService: ExamAccessService,
    private challengeAccessService: ChallengeAccessService,
  ) {}

  /**
   * Log the answers of a just-completed attempt: every answered question of
   * the attempt's exam, in exam order (answer keys that are not questions
   * of the exam are ignored), mode = attempt.mode.
   * Never throws: a failure is logged and the submit carries on, so the user
   * never loses an exam result because of the log. Returns the rows written.
   */
  async logAttempt(attempt: AttemptAnswers): Promise<number> {
    try {
      if (!attempt.examId || !attempt.userId) return 0;
      const answers = attempt.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return 0;
      }

      // The exam's own questions (bounded by the exam), not an IN list built
      // from the client's answer keys; other keys are simply never read
      const questions = await this.questionsRepository.find({
        select: {
          id: true,
          examId: true,
          status: true,
          type: true,
          correctAnswer: true,
          choices: true,
        },
        where: { examId: attempt.examId },
        order: { orderIndex: 'ASC' },
        loadEagerRelations: false,
      });
      const mode = toAnswerMode(attempt.mode);
      const times = attempt.timePerQuestion ?? {};

      const rows: AnswerRow[] = [];
      for (const question of questions) {
        if (!Object.prototype.hasOwnProperty.call(answers, question.id)) {
          continue;
        }
        const selected = answers[question.id];
        if (
          typeof selected !== 'string' ||
          selected.length > MAX_SELECTED_LENGTH
        ) {
          continue;
        }
        const row = gradeRow(question, selected, {
          examId: attempt.examId,
          attemptId: attempt.attemptId,
          mode,
          timeSpentSec: clampSeconds(times[question.id]),
        });
        if (row) rows.push(row);
      }

      return await this.insertRows(attempt.userId, rows);
    } catch (error) {
      this.logger.error(
        `Could not log the answers of attempt ${attempt.attemptId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }

  /**
   * POST /answer-logs: answers of practice without an attempt (topic /
   * subject / chapter practice). Skipped without an error: questions that do
   * not exist, are not published (the exam's status for a question in an
   * exam, as the practice lists use; otherwise the question's own), or
   * belong to a locked Mock Exam the user may not take, or are Challenge
   * questions without the venue's `challenge` right (task 20; Question Bank
   * practice also logs here). examId, isCorrect and isFirstAttempt are
   * always worked out here.
   */
  async logPractice(
    user: AccessViewer,
    items: AnswerLogItemDto[],
  ): Promise<{ saved: number }> {
    const ids = unique(items.map((item) => item.questionId));
    if (ids.length === 0) return { saved: 0 };

    const questions = await this.questionsRepository.find({
      select: {
        id: true,
        examId: true,
        status: true,
        type: true,
        correctAnswer: true,
        choices: true,
        isChallenge: true,
      },
      where: { id: In(ids) },
      loadEagerRelations: false,
    });
    const allowed = await this.allowedForPractice(user, questions);

    const rows: AnswerRow[] = [];
    for (const item of items) {
      const question = allowed.get(item.questionId.toLowerCase());
      if (!question) continue;
      const row = gradeRow(question, item.selected, {
        examId: question.examId ?? null,
        attemptId: null,
        mode: 'practice',
        timeSpentSec: clampSeconds(item.timeSpentSec),
      });
      if (row) rows.push(row);
    }

    return { saved: await this.insertRows(user.id, rows) };
  }

  /** Published questions the user may practise, by lower-case id. */
  private async allowedForPractice(
    user: AccessViewer,
    questions: GradedQuestion[],
  ): Promise<Map<string, GradedQuestion>> {
    const examIds = unique(
      questions.map((q) => q.examId).filter((id): id is string => !!id),
    );
    const exams =
      examIds.length > 0
        ? await this.examsRepository.find({
            select: { id: true, status: true, isMock: true, accessType: true },
            where: { id: In(examIds) },
            loadEagerRelations: false,
          })
        : [];
    const examsById = new Map(exams.map((exam) => [exam.id, exam]));
    const access = await this.examAccessService.getAccessMany(user, exams);

    const allowed = new Map<string, GradedQuestion>();
    for (const question of questions) {
      if (question.examId) {
        const exam = examsById.get(question.examId);
        if (!exam || exam.status !== QuestionStatus.PUBLISHED) continue;
        const status = access.get(exam.id)?.status;
        if (status !== 'free' && status !== 'unlocked') continue;
      } else if (question.status !== QuestionStatus.PUBLISHED) {
        continue;
      }
      allowed.set(question.id.toLowerCase(), question);
    }

    // Challenge questions (task 20): only with the venue's challenge right
    const challengeIds = [...allowed.values()]
      .filter((q) => q.isChallenge === true || Number(q.isChallenge) === 1)
      .map((q) => q.id);
    if (challengeIds.length > 0) {
      const unlocked = await this.challengeAccessService.unlockedQuestionIds(
        user,
        challengeIds,
      );
      for (const id of challengeIds) {
        if (!unlocked.has(id.toLowerCase())) allowed.delete(id.toLowerCase());
      }
    }
    return allowed;
  }

  /**
   * Insert the rows with isFirstAttempt: true when the user has no earlier
   * row for the question (a question repeated in the same batch counts as
   * first once).
   *
   * Atomic per user: the "answered before?" read and the insert run in one
   * transaction that first locks the user's row (SELECT ... FOR UPDATE), so
   * concurrent writers for the same user (parallel POST /answer-logs, a
   * submit at the same time) run one after the other: exactly one first
   * attempt per (user, question). The default isolation (REPEATABLE READ)
   * is kept on purpose (READ COMMITTED + statement binlog fails every
   * INSERT with 1665); it is still correct because InnoDB creates the read
   * view at the first non-locking read (answeredBefore), which runs after
   * the lock is granted, so it sees what the previous writer committed.
   * A single lock per user, taken first, also keeps writers of different
   * users from blocking each other on gap locks. A deadlock victim (1213)
   * is retried.
   *
   * Lock waits are bounded (innodb_lock_wait_timeout = 5 s on this
   * connection, restored before it goes back to the pool) so a submit cannot
   * hang. If the user's lock is still not granted (1205), the answers are
   * written without it (isFirstAttempt may then be off for a question
   * answered at that same moment) rather than lost.
   */
  private async insertRows(userId: string, rows: AnswerRow[]) {
    if (rows.length === 0) return 0;

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.answersRepository.manager.transaction((em) =>
          this.insertForUser(em, userId, rows),
        );
      } catch (err) {
        if (!isDeadlock(err) || attempt >= MAX_INSERT_TRIES) throw err;
      }
    }
  }

  private async insertForUser(
    em: EntityManager,
    userId: string,
    rows: AnswerRow[],
  ): Promise<number> {
    const restoreLockTimeout = await shortLockTimeout(em);
    try {
      try {
        await em.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [
          userId,
        ]);
      } catch (err) {
        if (!isLockWaitTimeout(err)) throw err;
        this.logger.warn(
          `Lock on user ${userId} timed out; logging answers without it`,
        );
      }
      const repo = em.getRepository(QuestionAnswer);

      const seen = await this.answeredBefore(
        repo,
        userId,
        unique(rows.map((row) => row.questionId)),
      );
      const values = rows.map((row) => {
        const key = row.questionId.toLowerCase();
        const isFirstAttempt = !seen.has(key);
        seen.add(key);
        return { ...row, userId, isFirstAttempt };
      });

      await repo.insert(values);
      return values.length;
    } finally {
      await restoreLockTimeout();
    }
  }

  /** Lower-case ids of the questions the user already has a row for. */
  private async answeredBefore(
    repo: Repository<QuestionAnswer>,
    userId: string,
    questionIds: string[],
  ): Promise<Set<string>> {
    const found = await repo
      .createQueryBuilder('qa')
      .select('DISTINCT qa.questionId', 'questionId')
      .where('qa.userId = :userId', { userId })
      .andWhere('qa.questionId IN (:...questionIds)', { questionIds })
      .getRawMany<{ questionId: string }>();
    return new Set(found.map((row) => String(row.questionId).toLowerCase()));
  }
}

/**
 * The row for one answer, or null when it does not count as answered:
 * blank, or (same rule as the web) a choice answer with no choice left.
 */
function gradeRow(
  question: GradedQuestion,
  selected: string,
  fields: Pick<AnswerRow, 'examId' | 'attemptId' | 'mode' | 'timeSpentSec'>,
): AnswerRow | null {
  if (selected.trim() === '') return null;
  const status = getAnswerStatus(question, selected);
  if (status === 'unanswered') return null;
  return {
    questionId: question.id,
    selected,
    isCorrect: status === 'correct',
    ...fields,
  };
}

function toAnswerMode(mode: string | null | undefined): AnswerMode {
  return ANSWER_MODES.includes(mode as AnswerMode)
    ? (mode as AnswerMode)
    : 'practice';
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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

/** innodb_lock_wait_timeout ran out (1205). */
function isLockWaitTimeout(err: unknown): boolean {
  const e = err as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  return (
    e?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    e?.errno === 1205 ||
    e?.driverError?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    e?.driverError?.errno === 1205
  );
}

/**
 * Lowers innodb_lock_wait_timeout on the transaction's own connection (same
 * as AttemptsService.startInProgress) and returns a function that puts the
 * previous value back before the connection goes back to the pool.
 */
async function shortLockTimeout(
  em: EntityManager,
): Promise<() => Promise<void>> {
  try {
    const rows: unknown = await em.query(
      'SELECT @@SESSION.innodb_lock_wait_timeout AS t',
    );
    const previous = Number(
      Array.isArray(rows) ? (rows[0] as { t?: unknown })?.t : undefined,
    );
    await em.query(
      `SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SEC}`,
    );
    const restoreTo =
      Number.isInteger(previous) && previous > 0 ? previous : 50;
    return async () => {
      await em
        .query('SET SESSION innodb_lock_wait_timeout = ?', [restoreTo])
        .catch(() => {});
    };
  } catch {
    return () => Promise.resolve();
  }
}
