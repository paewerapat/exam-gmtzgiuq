import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProComparison } from './pro-comparison';

/**
 * Exam venue that Pro plans are sold for (NETSAT, A-Level, ...; task 17),
 * sql/20261113-01-pro-membership.sql. A subscription only covers its own
 * venue. `key` is used in the URL of the Upgrade page (?venue=<key>).
 */
@Entity('pro_venues')
@Index('UQ_pro_venues_key', ['key'], { unique: true })
export class ProVenue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  key: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Text under "เลือกสนามที่จะสมัคร" while this venue is selected
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // Off = hidden from the Upgrade page; subscriptions keep working
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Comparison table of the Upgrade page (see pro-comparison.ts); read it
  // with normalizeStoredComparison
  @Column({ type: 'json', nullable: true })
  comparison: ProComparison | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
