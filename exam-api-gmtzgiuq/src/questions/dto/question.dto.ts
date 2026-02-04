import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  QuestionType,
  QuestionStatus,
} from '../question.entity';

@InputType()
export class ChoiceInput {
  @Field()
  @IsString()
  id: string;

  @Field()
  @IsString()
  text: string;

  @Field()
  @IsBoolean()
  isCorrect: boolean;
}

@InputType()
export class CreateQuestionInput {
  @Field()
  @IsString()
  question: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  questionImage?: string;

  @Field(() => [ChoiceInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceInput)
  choices: ChoiceInput[];

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  explanation?: string;

  @Field(() => QuestionCategory)
  @IsEnum(QuestionCategory)
  category: QuestionCategory;

  @Field(() => QuestionDifficulty, { nullable: true })
  @IsEnum(QuestionDifficulty)
  @IsOptional()
  difficulty?: QuestionDifficulty;

  @Field(() => QuestionType, { nullable: true })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => [String], { nullable: true })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

@InputType()
export class UpdateQuestionInput {
  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  question?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  questionImage?: string;

  @Field(() => [ChoiceInput], { nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceInput)
  @IsOptional()
  choices?: ChoiceInput[];

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  explanation?: string;

  @Field(() => QuestionCategory, { nullable: true })
  @IsEnum(QuestionCategory)
  @IsOptional()
  category?: QuestionCategory;

  @Field(() => QuestionDifficulty, { nullable: true })
  @IsEnum(QuestionDifficulty)
  @IsOptional()
  difficulty?: QuestionDifficulty;

  @Field(() => QuestionType, { nullable: true })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => [String], { nullable: true })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

@ObjectType()
export class PaginatedQuestions {
  @Field(() => [Question])
  items: Question[];

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
export class QuestionStats {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  published: number;

  @Field(() => Int)
  draft: number;

  @Field(() => [CategoryCount])
  byCategory: CategoryCount[];
}

@ObjectType()
export class CategoryCount {
  @Field()
  category: string;

  @Field(() => Int)
  count: number;
}
