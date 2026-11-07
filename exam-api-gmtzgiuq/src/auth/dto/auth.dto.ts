import { InputType, Field, ObjectType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { User } from '../../users/user.entity';

@InputType()
export class RegisterInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @MinLength(6)
  password: string;

  // Optional on the register form (BUG-16); users.firstName/lastName are varchar(100)
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  password: string;
}

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field(() => User)
  user: User;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  token: string;

  @Field()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

// REST bodies (POST /auth/...) — validated by the global ValidationPipe
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
