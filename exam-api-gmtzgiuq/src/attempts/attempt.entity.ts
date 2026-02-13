import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { User } from '../users/user.entity';
import { Exam } from '../exams/exam.entity';
import { QuestionCategory } from '../questions/question.entity';

@ObjectType()
@Entity('exam_attempts')
export class ExamAttempt {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => User)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Field(() => Exam)
  @ManyToOne(() => Exam, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column({ nullable: true })
  examId: string;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  examTitle: string;

  @Field(() => QuestionCategory)
  @Column({ type: 'enum', enum: QuestionCategory })
  category: QuestionCategory;

  @Field(() => Int)
  @Column({ type: 'int' })
  totalQuestions: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  correctAnswers: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  incorrectAnswers: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  unanswered: number;

  @Field(() => Float)
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  score: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  totalTime: number;

  @Column({ type: 'json', nullable: true })
  timePerQuestion: Record<string, number>;

  @Column({ type: 'json' })
  answers: Record<string, string>;

  @Column({ type: 'json' })
  questionIds: string[];

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: string;

  @Field()
  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
