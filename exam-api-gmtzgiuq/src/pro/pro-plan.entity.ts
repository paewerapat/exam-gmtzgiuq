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
import { ProVenue } from './pro-venue.entity';
import type { ProEntitlements } from './pro-entitlements';

/**
 * A Pro plan of one venue (Free / PRO / MAX ...; task 17). `rank` orders
 * the plans (0 = the free plan of the venue, higher = more). The price shown
 * is the price charged (task 18 reads the same row). `entitlements` are the
 * real rights, separate from the text shown on the Upgrade page.
 */
@Entity('pro_plans')
@Index('UQ_pro_plans_venue_code', ['venueId', 'code'], { unique: true })
export class ProPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  venueId: string;

  @ManyToOne(() => ProVenue, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'venueId',
    foreignKeyConstraintName: 'FK_pro_plans_venue',
  })
  venue?: ProVenue;

  // free / pro / max ...: unique within the venue, used by comparison cells
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', default: 0 })
  rank: number;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  tagline: string | null;

  // Satang (1/100 baht); 0 = free, cannot be bought
  @Column({ type: 'int', default: 0 })
  priceSatang: number;

  // e.g. "/ เดือน"
  @Column({ type: 'varchar', length: 30, nullable: true })
  priceUnit: string | null;

  // e.g. "ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้"
  @Column({ type: 'varchar', length: 150, nullable: true })
  priceNote: string | null;

  // Length of one paid period (task 18)
  @Column({ type: 'int', default: 30 })
  periodDays: number;

  @Column({ type: 'varchar', length: 50 })
  buttonText: string;

  // e.g. "แนะนำ" / "เร็วๆ นี้"
  @Column({ type: 'varchar', length: 30, nullable: true })
  badge: string | null;

  // The highlighted card
  @Column({ type: 'boolean', default: false })
  highlight: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // Off = hidden from the Upgrade page; subscriptions keep working
  @Column({ type: 'boolean', default: true })
  isVisible: boolean;

  // Off = buy button disabled (e.g. "เร็วๆ นี้"); never on for a free plan
  @Column({ type: 'boolean', default: false })
  isPurchasable: boolean;

  // Read it with normalizeStoredEntitlements
  @Column({ type: 'json' })
  entitlements: ProEntitlements;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
