import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { UnlockCodeBatch } from './unlock-code-batch.entity';

/** Exam unlocked by a campaign (no FK to exams, see the SQL header). */
@Entity('unlock_code_batch_exams')
@Index('IDX_unlock_code_batch_exams_examId', ['examId'])
export class UnlockCodeBatchExam {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  batchId: string;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  examId: string;

  @ManyToOne(() => UnlockCodeBatch, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'batchId',
    foreignKeyConstraintName: 'FK_unlock_code_batch_exams_batch',
  })
  batch?: UnlockCodeBatch;
}
