import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Chapter } from './chapter.entity';

@Entity('subjects')
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: '#6366f1' })
  color: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  iconEmoji: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Pro venue (pro_venues.id) this subject belongs to in the Question Bank
  // (task 20, sql/20261116-01-question-bank.sql). null = not in the bank.
  // No FK: compared by parameter only, never JOINed.
  @Column({ type: 'varchar', length: 36, nullable: true })
  venueId: string | null;

  // Name on the Question Bank card (e.g. "ชีวะ"); null/empty = name
  @Column({ type: 'varchar', length: 60, nullable: true })
  bankLabel: string | null;

  @OneToMany(() => Chapter, (chapter) => chapter.subject, { cascade: true })
  chapters: Chapter[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
