import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
@Entity('categories')
export class Category {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Field(() => Int)
  @Column({ default: 0 })
  orderIndex: number;

  // Pro venue (pro_venues.id) the category belongs to, null = none
  // (task 17, sql/20261113-01-pro-membership.sql). No FK (see the SQL).
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 36, nullable: true })
  venueId: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
