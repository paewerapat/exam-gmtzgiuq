import { applyDecorators } from '@nestjs/common';
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
  ArrayMaxSize,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  QuestionCategory,
  QuestionDifficulty,
  QuestionType,
  QuestionStatus,
} from '../../questions/question.entity';
import { Exam } from '../exam.entity';
import {
  IsImageUrlList,
  IsOptionalImageUrl,
  IsQuestionImageUrls,
} from '../../questions/dto/image-url.validators';
import {
  MAX_PASSAGE_BODY_LENGTH,
  MAX_PASSAGE_TITLE_LENGTH,
  MAX_PASSAGES_PER_EXAM,
  PASSAGE_ID_PATTERN,
} from '../exam-passage';

const PASSAGE_ID_MESSAGE =
  'id บทอ่านต้องเป็นตัวอักษรอังกฤษ ตัวเลข - หรือ _ ยาว 1–64 ตัวอักษร';

// Shared reading passage (task 08). Unique ids, "body or images" and the
// questions' passageId references are checked in the service
// (preparePassages) because they span several fields.
@InputType()
export class ExamPassageInput {
  @Field()
  @IsString({ message: PASSAGE_ID_MESSAGE })
  @Matches(PASSAGE_ID_PATTERN, { message: PASSAGE_ID_MESSAGE })
  id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString({ message: 'ชื่อบทอ่านต้องเป็นข้อความ' })
  @MaxLength(MAX_PASSAGE_TITLE_LENGTH, {
    message: `ชื่อบทอ่านยาวได้ไม่เกิน ${MAX_PASSAGE_TITLE_LENGTH} ตัวอักษร`,
  })
  title?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString({ message: 'เนื้อหาบทอ่านต้องเป็นข้อความ' })
  @MaxLength(MAX_PASSAGE_BODY_LENGTH, {
    message: 'เนื้อหาบทอ่านยาวได้ไม่เกิน 100,000 ตัวอักษร',
  })
  body?: string | null;

  @Field(() => [String], { nullable: true })
  @IsImageUrlList('รูปบทอ่าน', 'บทอ่าน')
  images?: string[] | null;

  // Show line numbers next to the body (task 09); not sent = false
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'การแสดงเลขบรรทัดต้องเป็น true หรือ false' })
  lineNumbers?: boolean | null;
}

/** `passages` field of POST and PUT. */
function IsPassageList() {
  return applyDecorators(
    IsOptional(),
    IsArray({ message: 'บทอ่านร่วมต้องเป็นรายการ' }),
    ArrayMaxSize(MAX_PASSAGES_PER_EXAM, {
      message: `ใส่บทอ่านร่วมได้ไม่เกิน ${MAX_PASSAGES_PER_EXAM} ชุดต่อข้อสอบ`,
    }),
    ValidateNested({ each: true }),
    Type(() => ExamPassageInput),
  );
}

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

  // Image shown with the choice; text may be empty when an image is set
  @Field(() => String, { nullable: true })
  @IsOptionalImageUrl('รูปตัวเลือก')
  image?: string | null;
}

// Individual question within an exam
@InputType()
export class CreateExamQuestionInput {
  @Field()
  @IsString()
  question: string;

  // Legacy single image; used as [questionImage] when questionImages is not sent
  @Field({ nullable: true })
  @IsOptionalImageUrl('รูปโจทย์')
  questionImage?: string;

  // All question images in display order (max 6); questionImage = [0]
  @Field(() => [String], { nullable: true })
  @IsQuestionImageUrls()
  questionImages?: string[] | null;

  @Field(() => [ExamChoiceInput], { nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamChoiceInput)
  @IsOptional()
  choices?: ExamChoiceInput[];

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  correctAnswer?: string;

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

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  chapter?: string;

  // id of a passage in the same request's passages (null = no passage)
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString({ message: PASSAGE_ID_MESSAGE })
  @Matches(PASSAGE_ID_PATTERN, { message: PASSAGE_ID_MESSAGE })
  passageId?: string | null;
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

  @Field()
  @IsString()
  category: string;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  bannerImage?: string;

  @Field(() => Int, { nullable: true })
  @IsNumber()
  @IsOptional()
  durationMinutes?: number | null;

  @Field(() => [ExamPassageInput], { nullable: true })
  @IsPassageList()
  passages?: ExamPassageInput[];

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

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  category?: string;

  @Field(() => QuestionStatus, { nullable: true })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  bannerImage?: string;

  @Field(() => Int, { nullable: true })
  @IsNumber()
  @IsOptional()
  durationMinutes?: number | null;

  // Sent = replaces every passage. Not sent while questions are sent = []
  // (questions are recreated, so their passageId must refer to this request)
  @Field(() => [ExamPassageInput], { nullable: true })
  @IsPassageList()
  passages?: ExamPassageInput[];

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
