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

import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { User } from '../users/user.entity';
import { Question, QuestionCategory, QuestionStatus } from '../questions/question.entity';

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

  @Field(() => QuestionCategory)
  @Column({ type: 'enum', enum: QuestionCategory })
  category: QuestionCategory;

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

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
