import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { User } from '../users/user.entity';

export enum QuestionCategory {
  GENERAL_KNOWLEDGE = 'general_knowledge',
  KOR_POR = 'kor_por',
  TOEIC = 'toeic',
  GAT_PAT = 'gat_pat',
  O_NET = 'o_net',
  MATHEMATICS = 'mathematics',
  ENGLISH = 'english',
  SCIENCE = 'science',
  DRIVING_LICENSE = 'driving_license',
}

export enum QuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE = 'true_false',
}

export enum QuestionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

registerEnumType(QuestionCategory, { name: 'QuestionCategory' });
registerEnumType(QuestionDifficulty, { name: 'QuestionDifficulty' });
registerEnumType(QuestionType, { name: 'QuestionType' });
registerEnumType(QuestionStatus, { name: 'QuestionStatus' });

@ObjectType()
export class QuestionChoice {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  isCorrect: boolean;
}

@ObjectType()
@Entity('questions')
export class Question {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'longtext' })
  question: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  questionImage: string;

  @Field(() => [QuestionChoice])
  @Column({ type: 'json' })
  choices: QuestionChoice[];

  @Field({ nullable: true })
  @Column({ type: 'longtext', nullable: true })
  explanation: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  hint: string;

  @Field(() => QuestionCategory)
  @Column({ type: 'enum', enum: QuestionCategory })
  category: QuestionCategory;

  @Field(() => QuestionDifficulty)
  @Column({
    type: 'enum',
    enum: QuestionDifficulty,
    default: QuestionDifficulty.MEDIUM,
  })
  difficulty: QuestionDifficulty;

  @Field(() => QuestionType)
  @Column({
    type: 'enum',
    enum: QuestionType,
    default: QuestionType.MULTIPLE_CHOICE,
  })
  type: QuestionType;

  @Field(() => QuestionStatus)
  @Column({
    type: 'enum',
    enum: QuestionStatus,
    default: QuestionStatus.DRAFT,
  })
  status: QuestionStatus;

  @Field(() => [String], { nullable: true })
  @Column('simple-array', { nullable: true })
  tags: string[];

  @Field(() => User)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
