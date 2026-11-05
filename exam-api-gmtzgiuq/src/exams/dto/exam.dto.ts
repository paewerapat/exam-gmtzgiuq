import { applyDecorators } from '@nestjs/common';
import { InputType, Field, ObjectType, Int, Float } from '@nestjs/graphql';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
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
import {
  DETAIL_BLOCK_TYPES,
  DETAIL_IMAGE_URL_PATTERN,
  ExamAccessType,
  type ExamDetailBlockType,
  ExamLevel,
  MAX_ACCESS_DAYS,
  MAX_DETAIL_BLOCKS,
  MAX_DETAIL_TEXT_LENGTH,
  MAX_DETAIL_URL_LENGTH,
  MAX_EXAM_PRICE,
  MIN_ACCESS_DAYS,
} from '../exam-mock';

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

const RELEASE_DATE_MESSAGE =
  'วันเผยแพร่ต้องเป็นวันที่และเวลาที่ถูกต้อง (ISO 8601)';

/**
 * Ends with a timezone: `Z` or `±hh:mm`. Without one, `new Date()` would read
 * the value in the server's timezone, so the same input could mean a
 * different instant depending on where the API runs.
 */
const RELEASE_DATE_TIMEZONE_PATTERN = /(?:[Zz]|[+-]\d{2}:\d{2})$/;

/**
 * `releaseDate` of POST and PUT (task 10): ISO 8601 date-time with a
 * timezone, e.g. "2026-11-05T03:00:00.000Z" or "2026-11-05T10:00:00+07:00"
 * ("2026-11-05T10:00" without an offset → 400). Not sent (or null) = DB time
 * on create, unchanged on update. The year range is checked in the service
 * (parseReleaseDate).
 */
function IsReleaseDate() {
  return applyDecorators(
    Field(() => String, { nullable: true }),
    IsOptional(),
    IsDateString({ strict: true }, { message: RELEASE_DATE_MESSAGE }),
    Matches(RELEASE_DATE_TIMEZONE_PATTERN, { message: RELEASE_DATE_MESSAGE }),
  );
}

// One block of the Mock Exam description (task 11): { type: 'text', text }
// or { type: 'image', url }. The service keeps only the field of the type.
@InputType()
export class ExamDetailBlockInput {
  @Field(() => String)
  @IsIn(DETAIL_BLOCK_TYPES, {
    message: 'ชนิดของคำอธิบายชุดข้อสอบต้องเป็น text หรือ image',
  })
  type: ExamDetailBlockType;

  @Field(() => String, { nullable: true })
  @ValidateIf((block: ExamDetailBlockInput) => block.type === 'text')
  @IsString({ message: 'ข้อความในคำอธิบายชุดข้อสอบต้องเป็นข้อความ' })
  @MaxLength(MAX_DETAIL_TEXT_LENGTH, {
    message: 'ข้อความในคำอธิบายชุดข้อสอบยาวได้ไม่เกิน 20,000 ตัวอักษร',
  })
  text?: string | null;

  @Field(() => String, { nullable: true })
  @ValidateIf((block: ExamDetailBlockInput) => block.type === 'image')
  @IsString({ message: 'URL รูปในคำอธิบายชุดข้อสอบต้องเป็นข้อความ' })
  @MaxLength(MAX_DETAIL_URL_LENGTH, {
    message: `URL รูปในคำอธิบายชุดข้อสอบยาวได้ไม่เกิน ${MAX_DETAIL_URL_LENGTH} ตัวอักษร`,
  })
  @Matches(DETAIL_IMAGE_URL_PATTERN, {
    message:
      'URL รูปในคำอธิบายชุดข้อสอบต้องขึ้นต้นด้วย /uploads/ หรือ http(s)://',
  })
  url?: string | null;
}

/**
 * Mock Exam fields of POST and PUT (task 11). All optional: not sent = false
 * / free / null on create, unchanged on update. "purchase needs a price
 * above 0" spans fields and is checked in the service (assertMockAccess).
 */
@InputType({ isAbstract: true })
export class MockExamFieldsInput {
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'การเป็นชุด Mock Exam ต้องเป็น true หรือ false' })
  isMock?: boolean | null;

  @Field(() => ExamAccessType, { nullable: true })
  @IsOptional()
  @IsEnum(ExamAccessType, {
    message: 'สถานะการเข้าถึงต้องเป็น free, code หรือ purchase',
  })
  accessType?: ExamAccessType | null;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'ราคาต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' },
  )
  @Min(0, { message: 'ราคาต้องไม่ติดลบ' })
  @Max(MAX_EXAM_PRICE, { message: 'ราคาต้องไม่เกิน 100,000 บาท' })
  price?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'อายุการเข้าถึงต้องเป็นจำนวนวันเต็ม' })
  @Min(MIN_ACCESS_DAYS, { message: 'อายุการเข้าถึงต้องอยู่ระหว่าง 1–3650 วัน' })
  @Max(MAX_ACCESS_DAYS, { message: 'อายุการเข้าถึงต้องอยู่ระหว่าง 1–3650 วัน' })
  accessDays?: number | null;

  @Field(() => ExamLevel, { nullable: true })
  @IsOptional()
  @IsEnum(ExamLevel, { message: 'ระดับต้องเป็น easy, medium หรือ hard' })
  level?: ExamLevel | null;

  // Sent = replaces every block (null or [] = no blocks)
  @Field(() => [ExamDetailBlockInput], { nullable: true })
  @IsOptional()
  @IsArray({ message: 'คำอธิบายชุดข้อสอบต้องเป็นรายการ' })
  @ArrayMaxSize(MAX_DETAIL_BLOCKS, {
    message: `คำอธิบายชุดข้อสอบมีได้ไม่เกิน ${MAX_DETAIL_BLOCKS} ส่วน`,
  })
  @ValidateNested({ each: true })
  @Type(() => ExamDetailBlockInput)
  detailBlocks?: ExamDetailBlockInput[] | null;
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
export class CreateExamInput extends MockExamFieldsInput {
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

  @IsReleaseDate()
  releaseDate?: string | null;

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
export class UpdateExamInput extends MockExamFieldsInput {
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

  @IsReleaseDate()
  releaseDate?: string | null;

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
