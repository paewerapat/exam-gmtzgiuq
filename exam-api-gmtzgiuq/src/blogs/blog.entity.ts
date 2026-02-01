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

export enum BlogStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

registerEnumType(BlogStatus, {
  name: 'BlogStatus',
});

@ObjectType()
@Entity('blogs')
export class Blog {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column({ unique: true })
  slug: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  excerpt: string;

  @Field()
  @Column({ type: 'longtext' })
  content: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  featuredImage: string;

  @Field(() => BlogStatus)
  @Column({ type: 'enum', enum: BlogStatus, default: BlogStatus.DRAFT })
  status: BlogStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  metaTitle: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  metaDescription: string;

  @Field(() => User)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @Field()
  @Column({ default: 0 })
  viewCount: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;
}
