import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  event: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ type: 'json', nullable: true })
  properties: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
