import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Chapter } from './chapter.entity';

@Entity('topics')
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Chapter, (chapter) => chapter.topics, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chapterId' })
  chapter: Chapter;

  @Column()
  chapterId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Grade of the topic in the Question Bank, e.g. "ม.4" (task 20); null =
  // the "อื่น ๆ" group
  @Column({ type: 'varchar', length: 30, nullable: true })
  gradeLabel: string | null;

  // Term 1 or 2 (null = not set)
  @Column({ type: 'tinyint', nullable: true })
  term: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
