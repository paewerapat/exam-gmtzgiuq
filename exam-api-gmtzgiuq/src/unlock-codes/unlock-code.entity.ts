import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UnlockCodeBatch } from './unlock-code-batch.entity';

/**
 * One unlock code. `code` is stored normalized (upper case, no spaces or
 * dashes). Redeemed = usedAt set; the unique (batchId, usedByUserId) index
 * lets an account redeem at most one code per campaign (NULLs do not clash).
 */
@Entity('unlock_codes')
@Index('UQ_unlock_codes_code', ['code'], { unique: true })
@Index('UQ_unlock_codes_batch_user', ['batchId', 'usedByUserId'], {
  unique: true,
})
@Index('IDX_unlock_codes_batch_usedAt', ['batchId', 'usedAt'])
export class UnlockCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  batchId: string;

  @ManyToOne(() => UnlockCodeBatch, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'batchId',
    foreignKeyConstraintName: 'FK_unlock_codes_batch',
  })
  batch?: UnlockCodeBatch;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  // Off = cannot be redeemed (a leaked code); a grant already made stays
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // No FK to users (see the SQL header)
  @Column({ type: 'varchar', length: 36, nullable: true })
  usedByUserId: string | null;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
