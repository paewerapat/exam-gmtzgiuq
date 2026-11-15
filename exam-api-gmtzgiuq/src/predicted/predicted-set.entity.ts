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
import { Exam } from '../exams/exam.entity';
import { PredictedSeries } from './predicted-series.entity';

export const PREDICTED_SET_ACCESS = ['free', 'pro'] as const;
export type PredictedSetAccess = (typeof PREDICTED_SET_ACCESS)[number];

/**
 * One exam set of a Predicted series (task 22, sql/20261118-01-predicted.sql):
 * "ชุดที่ setNo". An exam is in at most one series (UNIQUE examId); such an
 * exam is a "Predicted set": hidden from every other exam / question list
 * and opened only with the access PredictedAccessService works out.
 * previewCount null (or 0) = no Preview.
 */
@Entity('predicted_sets')
@Index('UQ_predicted_sets_examId', ['examId'], { unique: true })
@Index('UQ_predicted_sets_series_setNo', ['seriesId', 'setNo'], {
  unique: true,
})
export class PredictedSet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PredictedSeries, (series) => series.sets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'seriesId',
    foreignKeyConstraintName: 'FK_predicted_sets_series',
  })
  series?: PredictedSeries;

  @Column({ type: 'varchar', length: 36 })
  seriesId: string;

  // Deleting the exam takes it out of its series
  @ManyToOne(() => Exam, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'examId',
    foreignKeyConstraintName: 'FK_predicted_sets_exam',
  })
  exam?: Exam;

  @Column({ type: 'varchar', length: 36 })
  examId: string;

  // 1..N within the series
  @Column({ type: 'int' })
  setNo: number;

  @Column({ type: 'enum', enum: PREDICTED_SET_ACCESS, default: 'pro' })
  access: PredictedSetAccess;

  @Column({ type: 'int', nullable: true })
  previewCount: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
