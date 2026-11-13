import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** What the codes of a campaign give (task 19). */
export enum UnlockBatchKind {
  // access to exams (task 15)
  EXAM = 'exam',
  // a Pro plan for accessDays (proPlanId)
  PRO = 'pro',
}

/**
 * A campaign of unlock codes (task 15, sql/20261110-01-unlock-codes.sql).
 * The exams it unlocks (unlock_code_batch_exams, or every non-free Mock
 * Exam when `allMock`) and `accessDays` cannot change after creation.
 * kind `pro` (task 19, sql/20261115-01-pro-codes.sql): no exams; a code gives
 * the plan `proPlanId` for accessDays days instead. kind / plan are fixed.
 */
@Entity('unlock_code_batches')
export class UnlockCodeBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  // UnlockBatchKind (campaigns made before task 19 are 'exam')
  @Column({ type: 'varchar', length: 20, default: UnlockBatchKind.EXAM })
  kind: string;

  // kind pro: the plan given (no FK; a missing plan → PLAN_UNAVAILABLE)
  @Column({ type: 'varchar', length: 36, nullable: true })
  proPlanId: string | null;

  // Unlocks every non-free Mock Exam, including ones created later
  @Column({ type: 'boolean', default: false })
  allMock: boolean;

  // Days of access after a code is redeemed (1–3650)
  @Column({ type: 'int' })
  accessDays: number;

  // Last moment a code can be redeemed (null = no limit)
  @Column({ type: 'datetime', nullable: true })
  codeExpiresAt: Date | null;

  // Off = no new redeem (access already granted stays until it expires)
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Number of codes generated (codes are never deleted)
  @Column({ type: 'int', default: 0 })
  codeCount: number;

  // Admin who created it (no FK to users)
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
