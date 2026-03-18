import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  QuestionCategory,
  QuestionDifficulty,
  QuestionType,
  QuestionStatus,
} from '../../questions/question.entity';
import { Exam } from '../exam.entity';

// Choice input for exam questions
@InputType()
export class ExamChoiceInput {
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

// Individual question within an exam
@InputType()
export class CreateExamQuestionInput {
  @Field()
  @IsString()
  question: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  questionImage?: string;

  @Field(() => [ExamChoiceInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamChoiceInput)
  choices: ExamChoiceInput[];

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  explanation?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  hint?: string;

  @Field(() => QuestionDifficulty, { nullable: true })
  @IsEnum(QuestionDifficulty)
  @IsOptional()
  difficulty?: QuestionDifficulty;

  @Field(() => QuestionType, { nullable: true })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @Field(() => Int, { nullable: true })
  @IsNumber()
  @IsOptional()
  orderIndex?: number;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  topicId?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  chapterId?: string;
}

// Create exam input
@InputType()
export class CreateExamInput {
  @Field()
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field(() => QuestionCategory)
  @IsEnum(QuestionCategory)
  category: QuestionCategory;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.topicId !== null)
  @IsString()
  topicId?: string | null;

  @Field(() => [CreateExamQuestionInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExamQuestionInput)
  questions: CreateExamQuestionInput[];
}

// Update exam input
@InputType()
export class UpdateExamInput {
  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  title?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field(() => QuestionCategory, { nullable: true })
  @IsEnum(QuestionCategory)
  @IsOptional()
  category?: QuestionCategory;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.topicId !== null)
  @IsString()
  topicId?: string | null;

  @Field(() => [CreateExamQuestionInput], { nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExamQuestionInput)
  @IsOptional()
  questions?: CreateExamQuestionInput[];
}

// Paginated response
@ObjectType()
export class PaginatedExams {
  @Field(() => [Exam])
  items: Exam[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  totalPages: number;
}

// Stats
@ObjectType()
export class ExamCategoryCount {
  @Field()
  category: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class ExamStats {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  published: number;

  @Field(() => Int)
  draft: number;

  @Field(() => [ExamCategoryCount])
  byCategory: ExamCategoryCount[];
}
