import type { Repository } from 'typeorm';
import type { ExamAttempt } from '../attempts/attempt.entity';
import {
  MockExamProgress,
  MockProgressRow,
  toMockExamProgress,
} from './exam-mock';

/**
 * `myProgress` (task 21): keeps only the latest in_progress/completed
 * attempt of the user per exam — no later one by createdAt, then updatedAt
 * (the order findLatestProgress reads in). Uses the `:...statuses`
 * parameter of that query.
 */
export const LATER_ATTEMPT_MISSING =
  'NOT EXISTS (SELECT 1 FROM exam_attempts later' +
  ' WHERE later.userId = attempt.userId' +
  ' AND later.examId = attempt.examId' +
  ' AND later.status IN (:...statuses)' +
  ' AND (later.createdAt > attempt.createdAt' +
  ' OR (later.createdAt = attempt.createdAt' +
  ' AND later.updatedAt > attempt.updatedAt)))';

/**
 * `myProgress` per exam (task 21; shared by the Mock Exam pages and GET
 * /predicted, task 22): the user's latest in_progress or completed attempt
 * of each exam by attempt date (createdAt, which a restart moves to the
 * time of that start; then updatedAt). Only those rows are read (NOT EXISTS
 * a later one of the same exam), so the JSON answers of older attempts are
 * never loaded; rows tied on both dates are reduced to the first one here.
 * No user (guest) or no exam: none, no query.
 */
export async function findLatestProgress(
  attemptsRepository: Repository<ExamAttempt>,
  userId: string | null | undefined,
  examIds: string[],
): Promise<Map<string, MockExamProgress>> {
  const result = new Map<string, MockExamProgress>();
  if (!userId || examIds.length === 0) return result;
  const statuses = ['in_progress', 'completed'];

  const rows = await attemptsRepository
    .createQueryBuilder('attempt')
    .select('attempt.id', 'id')
    .addSelect('attempt.examId', 'examId')
    .addSelect('attempt.status', 'status')
    .addSelect('attempt.mode', 'mode')
    .addSelect('attempt.answers', 'answers')
    .addSelect('attempt.questionIds', 'questionIds')
    .addSelect('attempt.totalQuestions', 'totalQuestions')
    .addSelect('attempt.score', 'score')
    .where('attempt.userId = :userId', { userId })
    .andWhere('attempt.examId IN (:...examIds)', { examIds })
    .andWhere('attempt.status IN (:...statuses)', { statuses })
    .andWhere(LATER_ATTEMPT_MISSING)
    .orderBy('attempt.createdAt', 'DESC')
    .addOrderBy('attempt.updatedAt', 'DESC')
    .getRawMany<MockProgressRow>();

  for (const row of rows) {
    if (!result.has(row.examId)) {
      result.set(row.examId, toMockExamProgress(row));
    }
  }
  return result;
}
