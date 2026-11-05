import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { User } from '../users/user.entity';
import {
  Question,
  QuestionCategory,
  QuestionStatus,
} from '../questions/question.entity';
import { ExamPassage } from './exam-passage';
import {
  ExamAccessType,
  ExamDetailBlock,
  ExamLevel,
  priceTransformer,
} from './exam-mock';

@ObjectType()
@Entity('exams')
export class Exam {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Field(() => QuestionStatus)
  @Column({
    type: 'enum',
    enum: QuestionStatus,
    default: QuestionStatus.DRAFT,
  })
  status: QuestionStatus;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  questionCount: number;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  @Field(() => [Question])
  @OneToMany(() => Question, (question) => question.exam, { cascade: true })
  questions: Question[];

  @Field(() => User)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true, type: 'varchar', length: 36 })
  subjectId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerImage: string | null;

  // Shared reading passages; questions refer to them by passageId.
  // select: false keeps this (possibly large) JSON out of exam lists and the
  // exam eager-loaded by attempts; findOne/findPublishedOne load it explicitly.
  // Old rows have null (read as []).
  @Field(() => [ExamPassage], { nullable: true })
  @Column({ type: 'json', nullable: true, select: false })
  passages?: ExamPassage[] | null;

  // Release date (task 10): only orders exam lists (releaseDate DESC,
  // createdAt DESC), never hides an exam. Not sent on create = DB time
  // (same clock as createdAt); old rows were backfilled with createdAt
  // (sql/20261105-01-exam-release-date.sql).
  @Field()
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  releaseDate: Date;

  // Mock Exam (task 11, sql/20261105-02-mock-exam.sql). Mock exams are
  // listed only by GET /exams/mock*, never in the old exam lists.
  @Field()
  @Column({ type: 'boolean', default: false })
  isMock: boolean;

  // Only applies to mock exams (other exams are always free to take)
  @Field(() => ExamAccessType)
  @Column({
    type: 'enum',
    enum: ExamAccessType,
    default: ExamAccessType.FREE,
  })
  accessType: ExamAccessType;

  // Baht before VAT; required (> 0) when accessType = purchase.
  // Read as a number (mysql2 returns DECIMAL as a string).
  @Field(() => Float, { nullable: true })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: priceTransformer,
  })
  price: number | null;

  // Days of access after purchase (1–3650)
  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  accessDays: number | null;

  @Field(() => ExamLevel, { nullable: true })
  @Column({ type: 'enum', enum: ExamLevel, nullable: true })
  level: ExamLevel | null;

  // Description of the set (text and images in order) for the Mock Exam
  // detail page. select: false like passages; findOne and the mock detail
  // load it explicitly. null = no blocks (read as []).
  @Field(() => [ExamDetailBlock], { nullable: true })
  @Column({ type: 'json', nullable: true, select: false })
  detailBlocks?: ExamDetailBlock[] | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
