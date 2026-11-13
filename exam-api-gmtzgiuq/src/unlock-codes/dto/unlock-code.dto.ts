import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { applyDecorators } from '@nestjs/common';
import { MAX_ACCESS_DAYS, MIN_ACCESS_DAYS } from '../../exams/exam-mock';
import { MAX_CODES_PER_BATCH } from '../unlock-code-format';

export const MAX_BATCH_NAME_LENGTH = 150;
export const MAX_BATCH_EXAMS = 200;

/**
 * POST /unlock-codes/redeem. Both fields are only whitelisted here and
 * checked in UnlockCodesService.redeem, so a bad body gets the contract's
 * error shape instead of the ValidationPipe's message array:
 * code missing/not a string/too long/bad format → 400 INVALID_FORMAT;
 * examId sent but not a uuid → 400 with a Thai message (string).
 * examId is optional (task 19): a Pro code needs none; an exam code
 * without it → NOT_FOR_THIS_EXAM.
 */
export class RedeemCodeDto {
  // Spaces/dashes/case are cleaned up by the service
  @Allow()
  code: unknown;

  @Allow()
  examId?: unknown;
}

const EXPIRES_MESSAGE =
  'วันหมดอายุของโค้ดต้องเป็นวันที่และเวลาพร้อม timezone (ISO 8601)';

/**
 * ISO 8601 with a timezone (`Z` or ±hh:mm) like releaseDate (task 10), so
 * the instant does not depend on the server timezone. null is allowed
 * (= no expiry); the service tells null from "not sent".
 */
function IsCodeExpiresAt() {
  return applyDecorators(
    IsOptional(),
    IsDateString({ strict: true }, { message: EXPIRES_MESSAGE }),
    Matches(/(?:[Zz]|[+-]\d{2}:\d{2})$/, { message: EXPIRES_MESSAGE }),
  );
}

function IsBatchName() {
  return applyDecorators(
    IsString({ message: 'ชื่อแคมเปญต้องเป็นข้อความ' }),
    Matches(/\S/, { message: 'กรุณาใส่ชื่อแคมเปญ' }),
    MaxLength(MAX_BATCH_NAME_LENGTH, {
      message: `ชื่อแคมเปญยาวได้ไม่เกิน ${MAX_BATCH_NAME_LENGTH} ตัวอักษร`,
    }),
  );
}

export const UNLOCK_BATCH_KINDS = ['exam', 'pro'] as const;
export type UnlockBatchKindInput = (typeof UNLOCK_BATCH_KINDS)[number];

/** POST /unlock-codes/admin/batches */
export class CreateUnlockBatchDto {
  @IsBatchName()
  name: string;

  // exam (default) = access to exams; pro = a Pro plan (task 19)
  @IsOptional()
  @IsIn(UNLOCK_BATCH_KINDS, { message: 'ประเภทแคมเปญต้องเป็น exam หรือ pro' })
  kind?: UnlockBatchKindInput;

  // Required for kind pro (a paid plan); not accepted for exam
  @ValidateIf((dto: CreateUnlockBatchDto) => dto.kind === 'pro')
  @IsUUID('all', { message: 'กรุณาเลือกแพ็กเกจ Pro' })
  proPlanId?: string;

  // Required (≥ 1) unless allMock or kind pro; Mock Exams that are not free
  @ValidateIf(
    (dto: CreateUnlockBatchDto) =>
      dto.allMock !== true && (dto.kind !== 'pro' || dto.examIds != null),
  )
  @IsArray({ message: 'กรุณาเลือกชุดข้อสอบอย่างน้อย 1 ชุด' })
  @ArrayMaxSize(MAX_BATCH_EXAMS, {
    message: `เลือกชุดข้อสอบได้ไม่เกิน ${MAX_BATCH_EXAMS} ชุด`,
  })
  @IsUUID('all', { each: true, message: 'รหัสชุดข้อสอบไม่ถูกต้อง' })
  examIds?: string[];

  @IsOptional()
  @IsBoolean({ message: 'ทุกชุด Mock ต้องเป็น true หรือ false' })
  allMock?: boolean;

  @IsInt({ message: 'จำนวนโค้ดต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: `จำนวนโค้ดต้องอยู่ระหว่าง 1–${MAX_CODES_PER_BATCH}` })
  @Max(MAX_CODES_PER_BATCH, {
    message: `จำนวนโค้ดต้องอยู่ระหว่าง 1–${MAX_CODES_PER_BATCH}`,
  })
  count: number;

  @IsInt({ message: 'อายุการเข้าถึงต้องเป็นจำนวนวันเต็ม' })
  @Min(MIN_ACCESS_DAYS, {
    message: 'อายุการเข้าถึงต้องอยู่ระหว่าง 1–3650 วัน',
  })
  @Max(MAX_ACCESS_DAYS, {
    message: 'อายุการเข้าถึงต้องอยู่ระหว่าง 1–3650 วัน',
  })
  accessDays: number;

  @IsCodeExpiresAt()
  codeExpiresAt?: string | null;
}

/** PATCH /unlock-codes/admin/batches/:id (exams and accessDays are fixed). */
export class UpdateUnlockBatchDto {
  @IsOptional()
  @IsBatchName()
  name?: string;

  @IsOptional()
  @IsBoolean({ message: 'สถานะเปิด/ปิดต้องเป็น true หรือ false' })
  isActive?: boolean;

  // null = remove the expiry
  @IsCodeExpiresAt()
  codeExpiresAt?: string | null;
}

/** PATCH /unlock-codes/admin/codes/:id */
export class UpdateUnlockCodeDto {
  @IsBoolean({ message: 'สถานะเปิด/ปิดต้องเป็น true หรือ false' })
  isActive: boolean;
}

export const CODE_STATUS_FILTERS = [
  'all',
  'used',
  'unused',
  'disabled',
] as const;
export type CodeStatusFilter = (typeof CODE_STATUS_FILTERS)[number];
