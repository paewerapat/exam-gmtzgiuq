import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProVenue } from '../pro/pro-venue.entity';
import { Subject } from '../curriculum/subject.entity';
import { PredictedSet } from './predicted-set.entity';

/**
 * Series of Predicted Exam sets (task 22, sql/20261118-01-predicted.sql),
 * e.g. "NETSAT MATH JAN PREDICTED": one card on /dashboard/predicted with
 * its sets 1..N. Belongs to one Pro venue (its rights decide access) and
 * optionally one subject (the subject chips). Hidden (404) while isActive
 * is off, except for admins.
 */
@Entity('predicted_series')
@Index('IDX_predicted_series_venue_active_sort', [
  'venueId',
  'isActive',
  'sortOrder',
])
@Index('IDX_predicted_series_subjectId', ['subjectId'])
export class PredictedSeries {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // A venue with series cannot be deleted (RESTRICT → 409 VENUE_IN_USE)
  @ManyToOne(() => ProVenue, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'venueId',
    foreignKeyConstraintName: 'FK_predicted_series_venue',
  })
  venue?: ProVenue;

  @Column({ type: 'varchar', length: 36 })
  venueId: string;

  @ManyToOne(() => Subject, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'subjectId',
    foreignKeyConstraintName: 'FK_predicted_series_subject',
  })
  subject?: Subject | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subjectId: string | null;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  // Dot on the card (#rgb or #rrggbb); null = the web's default
  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => PredictedSet, (set) => set.series)
  sets?: PredictedSet[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
