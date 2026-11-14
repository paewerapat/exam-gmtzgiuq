import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Longest name on a Question Bank card / grade label (task 20). */
export const MAX_BANK_LABEL_LENGTH = 60;
export const MAX_GRADE_LABEL_LENGTH = 30;
export const TOPIC_TERMS = [1, 2] as const;

/** Trimmed text; '' (or only spaces) → null. Other values as they are. */
function emptyToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Fields a subject may have (POST/PUT /curriculum/admin/subjects). Until
 * task 20 the body was not validated (`any`); these are every column the
 * admin may set, so the whitelist keeps what the web sends today.
 */
export class SubjectFieldsDto {
  @IsOptional()
  @IsString({ message: 'คำอธิบายวิชาต้องเป็นข้อความ' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'สีของวิชาต้องเป็นข้อความ' })
  @MaxLength(20, { message: 'สีของวิชายาวได้ไม่เกิน 20 ตัวอักษร' })
  color?: string;

  @IsOptional()
  @IsString({ message: 'ไอคอนของวิชาต้องเป็นข้อความ' })
  @MaxLength(10, { message: 'ไอคอนของวิชายาวได้ไม่เกิน 10 ตัวอักษร' })
  iconEmoji?: string;

  @IsOptional()
  @IsInt({ message: 'ลำดับของวิชาต้องเป็นจำนวนเต็ม' })
  orderIndex?: number;

  @IsOptional()
  @IsBoolean({ message: 'สถานะเปิดใช้ต้องเป็น true หรือ false' })
  isActive?: boolean;

  // Pro venue (pro_venues.id) in the Question Bank; null or '' = none.
  // Must exist (checked in the service).
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'สนามสอบ (venueId) ไม่ถูกต้อง' })
  venueId?: string | null;

  // Name on the Question Bank card; null or '' = the subject name
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'ชื่อบนการ์ดต้องเป็นข้อความ' })
  @MaxLength(MAX_BANK_LABEL_LENGTH, {
    message: `ชื่อบนการ์ดยาวได้ไม่เกิน ${MAX_BANK_LABEL_LENGTH} ตัวอักษร`,
  })
  bankLabel?: string | null;
}

export class CreateSubjectDto extends SubjectFieldsDto {
  @IsString({ message: 'กรุณาใส่ชื่อวิชา' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อวิชา' })
  @MaxLength(255, { message: 'ชื่อวิชายาวได้ไม่เกิน 255 ตัวอักษร' })
  name: string;
}

export class UpdateSubjectDto extends SubjectFieldsDto {
  @IsOptional()
  @IsString({ message: 'กรุณาใส่ชื่อวิชา' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อวิชา' })
  @MaxLength(255, { message: 'ชื่อวิชายาวได้ไม่เกิน 255 ตัวอักษร' })
  name?: string;
}

/** Fields a topic may have (POST/PUT /curriculum/admin/topics). */
export class TopicFieldsDto {
  @IsOptional()
  @IsString({ message: 'คำอธิบายบทต้องเป็นข้อความ' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'ลำดับของบทต้องเป็นจำนวนเต็ม' })
  orderIndex?: number;

  @IsOptional()
  @IsBoolean({ message: 'สถานะเปิดใช้ต้องเป็น true หรือ false' })
  isActive?: boolean;

  // Grade, e.g. "ม.4"; null or '' = not set ("อื่น ๆ")
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'ชั้นของบทต้องเป็นข้อความ' })
  @MaxLength(MAX_GRADE_LABEL_LENGTH, {
    message: `ชั้นของบทยาวได้ไม่เกิน ${MAX_GRADE_LABEL_LENGTH} ตัวอักษร`,
  })
  gradeLabel?: string | null;

  // 1 or 2; null = not set
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(TOPIC_TERMS, { message: 'เทอมต้องเป็น 1, 2 หรือไม่ระบุ' })
  term?: number | null;
}

export class CreateTopicDto extends TopicFieldsDto {
  @IsUUID('all', { message: 'chapterId ไม่ถูกต้อง' })
  chapterId: string;

  @IsString({ message: 'กรุณาใส่ชื่อบท' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อบท' })
  @MaxLength(255, { message: 'ชื่อบทยาวได้ไม่เกิน 255 ตัวอักษร' })
  name: string;
}

export class UpdateTopicDto extends TopicFieldsDto {
  @IsOptional()
  @IsString({ message: 'กรุณาใส่ชื่อบท' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อบท' })
  @MaxLength(255, { message: 'ชื่อบทยาวได้ไม่เกิน 255 ตัวอักษร' })
  name?: string;
}
