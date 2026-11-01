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

// Columns that must never leave the API in a REST/JSON response (SEC-2).
export const USER_PRIVATE_FIELDS = [
  'password',
  'emailVerificationToken',
  'emailVerificationExpires',
  'resetPasswordToken',
  'resetPasswordExpires',
  'providerId',
] as const;

export type UserPrivateField = (typeof USER_PRIVATE_FIELDS)[number];
export type PublicUser = Omit<User, UserPrivateField | 'toJSON'>;

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
  emailVerificationToken?: string | null;

  @HideField()
  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires?: Date | null;

  @HideField()
  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken?: string | null;

  @HideField()
  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires?: Date | null;

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

  // JSON.stringify (Express res.json) calls this for every User instance,
  // including nested ones such as exam.author or attempt.user, so secrets are
  // stripped from all REST responses. The entity itself keeps the values
  // (validatePassword reads user.password) and GraphQL resolves fields
  // directly, where @HideField already hides them.
  toJSON(): PublicUser {
    const privateFields: readonly string[] = USER_PRIVATE_FIELDS;
    return Object.fromEntries(
      Object.entries(this).filter(([key]) => !privateFields.includes(key)),
    ) as PublicUser;
  }
}
