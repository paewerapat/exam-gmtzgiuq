import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProPlan } from './pro-plan.entity';
import { ProVenue } from './pro-venue.entity';

/**
 * Stored status of a subscription. A row that is `active` but whose
 * currentPeriodEnd has passed counts as expired (no cron needed); task 18
 * adds pending/canceled for renewals.
 */
export enum ProSubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/** How the subscription was made (task 18 adds card/promptpay/code). */
export enum ProSubscriptionSource {
  ADMIN = 'admin',
}

/**
 * Pro rights of one user for one venue (task 17). At most one `active` row
 * per user and venue (ProSubscriptionsService checks it in a transaction
 * that locks the user's row). No FK to users (see the SQL header); the FKs
 * to venue/plan stop deleting a venue/plan that has subscriptions.
 */
@Entity('pro_subscriptions')
@Index('IDX_pro_subscriptions_user_venue_status', [
  'userId',
  'venueId',
  'status',
])
@Index('IDX_pro_subscriptions_status_end', ['status', 'currentPeriodEnd'])
@Index('IDX_pro_subscriptions_venueId', ['venueId'])
@Index('IDX_pro_subscriptions_planId', ['planId'])
export class ProSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  venueId: string;

  @ManyToOne(() => ProVenue, { onDelete: 'NO ACTION' })
  @JoinColumn({
    name: 'venueId',
    foreignKeyConstraintName: 'FK_pro_subscriptions_venue',
  })
  venue?: ProVenue;

  @Column({ type: 'varchar', length: 36 })
  planId: string;

  @ManyToOne(() => ProPlan, { onDelete: 'NO ACTION' })
  @JoinColumn({
    name: 'planId',
    foreignKeyConstraintName: 'FK_pro_subscriptions_plan',
  })
  plan?: ProPlan;

  // ProSubscriptionStatus (varchar so task 18 can add values without DDL)
  @Column({ type: 'varchar', length: 20 })
  status: string;

  // ProSubscriptionSource
  @Column({ type: 'varchar', length: 20 })
  source: string;

  @Column({ type: 'datetime' })
  currentPeriodStart: Date;

  @Column({ type: 'datetime' })
  currentPeriodEnd: Date;

  @Column({ type: 'boolean', default: false })
  autoRenew: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  grantedById: string | null;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  revokedById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
