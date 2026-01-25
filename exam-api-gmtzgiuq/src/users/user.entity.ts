import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectType, Field, ID, HideField } from '@nestjs/graphql';

@ObjectType()
@Entity('users')
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @HideField()
  @Column({ nullable: true })
  password: string | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  firstName: string | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastName: string | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  avatar: string | null;

  @Field()
  @Column({ default: false })
  isEmailVerified: boolean;

  @HideField()
  @Column({ nullable: true })
  emailVerificationToken: string | null;

  @HideField()
  @Column({ nullable: true, type: 'timestamp' })
  emailVerificationExpires: Date | null;

  @HideField()
  @Column({ nullable: true })
  resetPasswordToken: string | null;

  @HideField()
  @Column({ nullable: true, type: 'timestamp' })
  resetPasswordExpires: Date | null;

  @Field()
  @Column({ default: 'local' })
  provider: string; // 'local', 'google'

  @Field({ nullable: true })
  @Column({ nullable: true })
  providerId: string | null;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
