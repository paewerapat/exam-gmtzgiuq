import { InputType, Field, ObjectType, Int, Float } from '@nestjs/graphql';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsInt,
  IsObject,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { QuestionCategory } from '../../questions/question.entity';
import { ExamAttempt } from '../attempt.entity';

@InputType()
export class SubmitAttemptInput {
  @Field()
  @IsUUID()
  examId: string;

  @Field()
  @IsString()
  examTitle: string;

  @Field()
  @IsEnum(QuestionCategory)
  category: QuestionCategory;

  @Field(() => Int)
  @IsInt()
  totalQuestions: number;

  @Field(() => Int)
  @IsInt()
  correctAnswers: number;

  @Field(() => Int)
  @IsInt()
  incorrectAnswers: number;

  @Field(() => Int)
  @IsInt()
  unanswered: number;

  @Field(() => Float)
  @IsNumber()
  score: number;

  @Field(() => Int)
  @IsInt()
  totalTime: number;

  @IsObject()
  timePerQuestion: Record<string, number>;

  @IsObject()
  answers: Record<string, string>;

  @IsArray()
  @IsString({ each: true })
  questionIds: string[];

  @Field()
  @IsDateString()
  startedAt: string;

  @Field({ nullable: true })
  @IsDateString()
  @IsOptional()
  completedAt?: string;
}

@ObjectType()
export class PaginatedAttempts {
  @Field(() => [ExamAttempt])
  items: ExamAttempt[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  totalPages: number;
}

@ObjectType()
export class AttemptCategoryStats {
  @Field()
  category: string;

  @Field(() => Int)
  attempts: number;

  @Field(() => Float)
  averageScore: number;
}

@ObjectType()
export class UserCategoryStats {
  @Field()
  category: string;

  @Field(() => Int)
  attempts: number;

  @Field(() => Float)
  averageScore: number;

  @Field(() => Float)
  bestScore: number;
}

@ObjectType()
export class UserAttemptStats {
  @Field(() => Int)
  totalAttempts: number;

  @Field(() => Float)
  averageScore: number;

  @Field(() => Float)
  bestScore: number;

  @Field(() => Int)
  totalTime: number;

  @Field(() => [UserCategoryStats])
  byCategory: UserCategoryStats[];
}

@ObjectType()
export class ExamAttemptStats {
  @Field(() => Int)
  totalAttempts: number;

  @Field(() => Float)
  averageScore: number;

  @Field(() => Float)
  highestScore: number;

  @Field(() => Float)
  lowestScore: number;

  @Field(() => Int)
  averageTime: number;

  @Field(() => Int)
  uniqueUsers: number;
}

@ObjectType()
export class AttemptStats {
  @Field(() => Int)
  totalAttempts: number;

  @Field(() => Float)
  averageScore: number;

  @Field(() => Int)
  uniqueUsers: number;

  @Field(() => [AttemptCategoryStats])
  byCategory: AttemptCategoryStats[];
}
