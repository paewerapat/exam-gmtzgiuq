import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MAX_ANSWER_LOG_ITEMS = 200;
export const MAX_SELECTED_LENGTH = 500;

/** Modes a client may send; exam/preview/pro come from the server only. */
export const CLIENT_ANSWER_MODES = ['practice'] as const;

export class AnswerLogItemDto {
  @IsUUID('all', { message: 'รหัสข้อ (questionId) ไม่ถูกต้อง' })
  questionId: string;

  // Same format as attempt.answers[qid]: choice ids joined by "," or text
  @IsString({ message: 'คำตอบต้องเป็นข้อความ' })
  @Length(1, MAX_SELECTED_LENGTH, {
    message: `คำตอบต้องยาว 1–${MAX_SELECTED_LENGTH} ตัวอักษร`,
  })
  selected: string;

  // Clamped to 0–86400 by the service
  @IsInt({ message: 'เวลาที่ใช้ต้องเป็นจำนวนวินาทีเต็ม' })
  @Min(0, { message: 'เวลาที่ใช้ต้องไม่ติดลบ' })
  timeSpentSec: number;

  @IsIn(CLIENT_ANSWER_MODES, { message: 'mode ต้องเป็น practice' })
  mode: (typeof CLIENT_ANSWER_MODES)[number];
}

/** Body of POST /answer-logs (web: lib/api/answer-logs.ts postAnswerLogs). */
export class CreateAnswerLogsDto {
  @IsArray({ message: 'items ต้องเป็นรายการ' })
  @ArrayMinSize(1, { message: 'ต้องมีคำตอบอย่างน้อย 1 ข้อ' })
  @ArrayMaxSize(MAX_ANSWER_LOG_ITEMS, {
    message: `ส่งได้ไม่เกิน ${MAX_ANSWER_LOG_ITEMS} ข้อต่อครั้ง`,
  })
  @ValidateNested({ each: true })
  @Type(() => AnswerLogItemDto)
  items: AnswerLogItemDto[];
}
