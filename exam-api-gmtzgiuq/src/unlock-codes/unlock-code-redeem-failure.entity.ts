import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A failed redeem (any error except TOO_MANY_ATTEMPTS), used to stop code
 * guessing: more than REDEEM_MAX_FAILURES in REDEEM_FAILURE_WINDOW_MS per
 * account → 429. Kept in the DB so the limit holds across API processes and
 * restarts; rows older than a day are deleted as new ones are written.
 */
@Entity('unlock_code_redeem_failures')
@Index('IDX_unlock_code_redeem_failures_user_time', ['userId', 'failedAt'])
export class UnlockCodeRedeemFailure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  errorCode: string;

  // Set by the API (same clock as the window check)
  @Column({ type: 'datetime' })
  failedAt: Date;
}
