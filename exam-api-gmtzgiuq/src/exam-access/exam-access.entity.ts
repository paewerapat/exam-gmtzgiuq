import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** How a user got access to a locked Mock Exam (task 15). */
export enum ExamAccessSource {
  CODE = 'code',
  // Task 3 (purchase) and grants by an admin; no code path creates these yet
  PURCHASE = 'purchase',
  ADMIN = 'admin',
}

/**
 * Right of one user to take a locked Mock Exam (accessType code/purchase),
 * sql/20261110-01-unlock-codes.sql. Either one exam (`examId`) or every
 * non-free Mock Exam (`allMock`, also ones created later). No FK to
 * users/exams (see the SQL header); rows of a deleted exam are just unused.
 */
@Entity('exam_access')
@Index('IDX_exam_access_user_exam', ['userId', 'examId'])
export class ExamAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  // null when allMock is set
  @Column({ type: 'varchar', length: 36, nullable: true })
  examId: string | null;

  @Column({ type: 'boolean', default: false })
  allMock: boolean;

  @Column({ type: 'enum', enum: ExamAccessSource })
  source: ExamAccessSource;

  // What granted it: the unlock code id for source = code (an order id for
  // purchase in task 3)
  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceId: string | null;

  // null = never expires
  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
