import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { User } from '../users/user.entity';

@ObjectType()
@Entity('feedback')
export class Feedback {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ nullable: true })
  userId: string | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  examId: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Field()
  @Column({ type: 'text' })
  message: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
