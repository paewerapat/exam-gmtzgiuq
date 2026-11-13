import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProDiscountType {
  PERCENT = 'percent',
  AMOUNT = 'amount',
}

/**
 * A discount code for the Pro checkout (task 19,
 * sql/20261115-01-pro-codes.sql), typed by the user (NEWYEAR20). Applies to
 * the first payment of a checkout only; renewals charge the full price.
 * `code` is stored in upper case. venueId / planId null = every venue /
 * every plan (no FK: a code scoped to a plan that was deleted never applies).
 * Uses are counted from pro_discount_redemptions (used + reserved while the
 * payment is pending); `redeemedCount` = successful payments, kept for the
 * admin list.
 */
@Entity('pro_discount_codes')
@Index('UQ_pro_discount_codes_code', ['code'], { unique: true })
export class ProDiscountCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // A–Z 0–9 - _ (3–40), upper case
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  // ProDiscountType
  @Column({ type: 'varchar', length: 10 })
  discountType: string;

  // percent: 1–100; amount: satang (≥ 100)
  @Column({ type: 'int' })
  discountValue: number;

  // null = every venue
  @Column({ type: 'varchar', length: 36, nullable: true })
  venueId: string | null;

  // null = every plan (of the venue)
  @Column({ type: 'varchar', length: 36, nullable: true })
  planId: string | null;

  // null = no start / no end
  @Column({ type: 'datetime', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endsAt: Date | null;

  // null = no limit
  @Column({ type: 'int', nullable: true })
  maxRedemptions: number | null;

  @Column({ type: 'int', default: 1 })
  perUserLimit: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Successful payments with this code
  @Column({ type: 'int', default: 0 })
  redeemedCount: number;

  // Admin who created it (no FK to users)
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
