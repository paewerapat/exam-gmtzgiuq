import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProPaymentMethod {
  CARD = 'card',
  PROMPTPAY = 'promptpay',
}

/**
 * pending → successful / failed / expired, decided only by the charge read
 * back from Opn (ProBillingService.syncCharge), never by a request body.
 * pending → canceled (task 19): replaced by a newer checkout of the same
 * user and plan; if Opn still reports it paid it becomes successful with
 * refundRequired (no rights, no discount use).
 */
export enum ProPaymentStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELED = 'canceled',
}

/**
 * One payment for a Pro plan (task 18): a checkout by card or PromptPay, or
 * a renewal charged by an Opn schedule (isRenewal). The amounts are worked
 * out on the server when the row is made and kept as charged. One row per
 * Opn charge (omiseChargeId UNIQUE): the same charge can never renew or
 * open rights twice. No FK (see the SQL header); plans/venues with payments
 * cannot be deleted (ProConfigService counts them under the venue lock).
 */
@Entity('pro_payments')
@Index('UQ_pro_payments_charge', ['omiseChargeId'], { unique: true })
@Index('IDX_pro_payments_user_created', ['userId', 'createdAt'])
@Index('IDX_pro_payments_status_created', ['status', 'createdAt'])
@Index('IDX_pro_payments_subscriptionId', ['subscriptionId'])
@Index('IDX_pro_payments_schedule', ['omiseScheduleId'])
export class ProPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  venueId: string;

  @Column({ type: 'varchar', length: 36 })
  planId: string;

  // The subscription this payment opened or renewed (null until successful)
  @Column({ type: 'varchar', length: 36, nullable: true })
  subscriptionId: string | null;

  // ProPaymentMethod
  @Column({ type: 'varchar', length: 20 })
  method: string;

  // ProPaymentStatus
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'boolean', default: false })
  isRenewal: boolean;

  // Satang: total = subtotal + vat - discount
  @Column({ type: 'int' })
  subtotalSatang: number;

  @Column({ type: 'int', default: 0 })
  vatSatang: number;

  // Task 19 (discount codes)
  @Column({ type: 'int', default: 0 })
  discountSatang: number;

  @Column({ type: 'int' })
  totalSatang: number;

  @Column({ type: 'varchar', length: 3, default: 'THB' })
  currency: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  omiseChargeId: string | null;

  // The schedule that charged this renewal / was made after this payment
  @Column({ type: 'varchar', length: 64, nullable: true })
  omiseScheduleId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  // Thai, shown to the user
  @Column({ type: 'varchar', length: 255, nullable: true })
  failureMessage: string | null;

  // PromptPay QR image (Opn download link)
  @Column({ type: 'varchar', length: 500, nullable: true })
  qrImageUrl: string | null;

  // When the charge expires at Opn (PromptPay QR)
  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  // The period this payment bought
  @Column({ type: 'datetime', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'datetime', nullable: true })
  periodEnd: Date | null;

  // Task 19 (discount codes)
  @Column({ type: 'varchar', length: 36, nullable: true })
  discountCodeId: string | null;

  // Money was taken but no rights were given (e.g. a renewal charged after
  // the subscription ended / was canceled): refund it in the Opn dashboard
  @Column({ type: 'boolean', default: false })
  refundRequired: boolean;

  // Last time GET /pro/payments/:id asked Opn (at most every 5 s)
  @Column({ type: 'datetime', nullable: true })
  lastCheckedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
