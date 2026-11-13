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
import { ProDiscountCode } from './pro-discount-code.entity';

/**
 * reserved (made with the pending payment, in the same transaction) →
 * used (the payment's charge was successful) / released (failed, expired,
 * or replaced by a new checkout of the same plan).
 */
export enum ProDiscountRedemptionStatus {
  RESERVED = 'reserved',
  USED = 'used',
  RELEASED = 'released',
}

/**
 * One use of a discount code by one payment (task 19). A use counts toward
 * maxRedemptions / perUserLimit while used, or reserved with its payment
 * still pending. No FK to users / payments (see the SQL header).
 */
@Entity('pro_discount_redemptions')
@Index('UQ_pro_discount_redemptions_payment', ['paymentId'], { unique: true })
@Index('IDX_pro_discount_redemptions_code_status', ['codeId', 'status'])
@Index('IDX_pro_discount_redemptions_code_user', ['codeId', 'userId'])
export class ProDiscountRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  codeId: string;

  @ManyToOne(() => ProDiscountCode, { onDelete: 'NO ACTION' })
  @JoinColumn({
    name: 'codeId',
    foreignKeyConstraintName: 'FK_pro_discount_redemptions_code',
  })
  code?: ProDiscountCode;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  paymentId: string;

  // The discount given (satang)
  @Column({ type: 'int' })
  amountSatang: number;

  // ProDiscountRedemptionStatus
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
