import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import {
  ObjectType,
  Field,
  ID,
  HideField,
  registerEnumType,
} from '@nestjs/graphql';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

registerEnumType(UserRole, {
  name: 'UserRole',
});

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
  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar?: string;

  @Field()
  @Column({ default: false })
  isEmailVerified: boolean;

  @HideField()
  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken?: string;

  @HideField()
  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires?: Date;

  @HideField()
  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken?: string;

  @HideField()
  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires?: Date;

  @Field()
  @Column({ default: 'local' })
  provider: string; // 'local', 'google'

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  providerId?: string;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => UserRole)
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
