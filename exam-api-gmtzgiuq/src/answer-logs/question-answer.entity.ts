import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Where an answer was given (task 16). preview/pro are for tasks 8 and 3. */
export const ANSWER_MODES = ['practice', 'exam', 'preview', 'pro'] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

/**
 * One answer of one user to one question, written by the server when an
 * attempt is completed or by POST /answer-logs (task 16),
 * sql/20261112-01-question-answers.sql. Only answered questions get a row.
 *
 * No FK to users/questions/exams/exam_attempts: the history stays when a
 * question is removed from its exam (and no errno 150 when the collation of
 * the old tables differs, see the SQL header).
 */
@Entity('question_answers')
@Index('IDX_question_answers_user_question', ['userId', 'questionId'])
@Index('IDX_question_answers_questionId', ['questionId'])
@Index('IDX_question_answers_examId', ['examId'])
@Index('IDX_question_answers_attemptId', ['attemptId'])
export class QuestionAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  questionId: string;

  // Exam of the question when it was answered (null = not in an exam)
  @Column({ type: 'varchar', length: 36, nullable: true })
  examId: string | null;

  // Attempt it came from (null = practice without an attempt)
  @Column({ type: 'varchar', length: 36, nullable: true })
  attemptId: string | null;

  @Column({ type: 'varchar', length: 20 })
  mode: AnswerMode;

  // Same format as attempt.answers[qid]: choice ids joined by "," or the
  // short-answer text
  @Column({ type: 'varchar', length: 500, nullable: true })
  selected: string | null;

  // Checked by the server against the question at the time of answering
  @Column({ type: 'boolean' })
  isCorrect: boolean;

  @Column({ type: 'int', default: 0 })
  timeSpentSec: number;

  // No earlier row of this user for this question
  @Column({ type: 'boolean' })
  isFirstAttempt: boolean;

  @CreateDateColumn()
  answeredAt: Date;
}
