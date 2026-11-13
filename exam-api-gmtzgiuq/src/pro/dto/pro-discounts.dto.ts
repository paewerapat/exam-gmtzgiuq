import { applyDecorators } from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DISCOUNT_CODE_INPUT_PATTERN } from '../pro-discount-rules';
import { MAX_PRICE_SATANG } from './pro.dto';

export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type DiscountTypeInput = (typeof DISCOUNT_TYPES)[number];

export const MAX_DISCOUNT_REDEMPTIONS = 1_000_000;
export const MAX_PER_USER_LIMIT = 1000;

/** Field may be left out but, when sent, must not be null. */
function OptionalNotNull() {
  return ValidateIf((_object: object, value: unknown) => value !== undefined);
}

/** Field may be left out or null (null clears it). */
function OptionalNullable() {
  return ValidateIf(
    (_object: object, value: unknown) => value !== undefined && value !== null,
  );
}

const DATE_MESSAGE = 'ต้องเป็นวันที่และเวลาพร้อม timezone (ISO 8601)';

/** ISO 8601 with a timezone (like the unlock codes); null = no limit. */
function NullableInstant(label: string) {
  return applyDecorators(
    OptionalNullable(),
    IsDateString({ strict: true }, { message: `${label}${DATE_MESSAGE}` }),
    Matches(/(?:[Zz]|[+-]\d{2}:\d{2})$/, {
      message: `${label}${DATE_MESSAGE}`,
    }),
  );
}

function DiscountCodeText() {
  return applyDecorators(
    IsString({ message: 'โค้ดส่วนลดต้องเป็นข้อความ' }),
    Matches(DISCOUNT_CODE_INPUT_PATTERN, {
      message:
        'โค้ดส่วนลดต้องเป็นตัวอักษรอังกฤษ ตัวเลข - หรือ _ ยาว 3–40 ตัว (เก็บเป็นตัวพิมพ์ใหญ่)',
    }),
  );
}

function DiscountTypeField() {
  return IsIn(DISCOUNT_TYPES, {
    message: 'ประเภทส่วนลดต้องเป็น percent หรือ amount',
  });
}

/** percent 1–100 / amount in satang ≥ 100 (checked again by the service) */
function DiscountValueField() {
  const message = 'มูลค่าส่วนลดต้องเป็นจำนวนเต็มบวก';
  return applyDecorators(
    IsInt({ message }),
    Min(1, { message }),
    Max(MAX_PRICE_SATANG, { message: 'มูลค่าส่วนลดมากเกินไป' }),
  );
}

function Description() {
  return applyDecorators(
    OptionalNullable(),
    IsString({ message: 'คำอธิบายต้องเป็นข้อความ' }),
    MaxLength(255, { message: 'คำอธิบายยาวได้ไม่เกิน 255 ตัวอักษร' }),
  );
}

function NullableId(label: string) {
  return applyDecorators(
    OptionalNullable(),
    IsUUID('all', { message: `รหัส${label}ไม่ถูกต้อง` }),
  );
}

function MaxRedemptionsField() {
  const message = `จำนวนครั้งที่ใช้ได้ทั้งหมดต้องเป็นจำนวนเต็ม 1–${MAX_DISCOUNT_REDEMPTIONS}`;
  return applyDecorators(
    OptionalNullable(),
    IsInt({ message }),
    Min(1, { message }),
    Max(MAX_DISCOUNT_REDEMPTIONS, { message }),
  );
}

function PerUserLimitField() {
  const message = `จำนวนครั้งต่อบัญชีต้องเป็นจำนวนเต็ม 1–${MAX_PER_USER_LIMIT}`;
  return applyDecorators(
    OptionalNotNull(),
    IsInt({ message }),
    Min(1, { message }),
    Max(MAX_PER_USER_LIMIT, { message }),
  );
}

function ActiveFlag() {
  return applyDecorators(
    OptionalNotNull(),
    IsBoolean({ message: 'สถานะเปิดใช้งานต้องเป็น true หรือ false' }),
  );
}

/**
 * POST /pro/admin/discount-codes. venueId / planId null = every venue /
 * plan (planId alone sets the venue to the plan's); startsAt / endsAt /
 * maxRedemptions null = no limit.
 */
export class CreateDiscountCodeDto {
  @DiscountCodeText()
  code: string;

  @Description()
  description?: string | null;

  @DiscountTypeField()
  discountType: DiscountTypeInput;

  @DiscountValueField()
  discountValue: number;

  @NullableId('สนาม')
  venueId?: string | null;

  @NullableId('แพ็กเกจ')
  planId?: string | null;

  @NullableInstant('เวลาเริ่ม')
  startsAt?: string | null;

  @NullableInstant('เวลาสิ้นสุด')
  endsAt?: string | null;

  @MaxRedemptionsField()
  maxRedemptions?: number | null;

  @PerUserLimitField()
  perUserLimit?: number;

  @ActiveFlag()
  isActive?: boolean;
}

/**
 * PUT /pro/admin/discount-codes/:id — fields not sent stay as they are.
 * code / discountType / discountValue cannot change once the code has a
 * use (409 DISCOUNT_IN_USE); isActive turns it on/off.
 */
export class UpdateDiscountCodeDto {
  @OptionalNotNull()
  @DiscountCodeText()
  code?: string;

  @Description()
  description?: string | null;

  @OptionalNotNull()
  @DiscountTypeField()
  discountType?: DiscountTypeInput;

  @OptionalNotNull()
  @DiscountValueField()
  discountValue?: number;

  @NullableId('สนาม')
  venueId?: string | null;

  @NullableId('แพ็กเกจ')
  planId?: string | null;

  @NullableInstant('เวลาเริ่ม')
  startsAt?: string | null;

  @NullableInstant('เวลาสิ้นสุด')
  endsAt?: string | null;

  @MaxRedemptionsField()
  maxRedemptions?: number | null;

  @PerUserLimitField()
  perUserLimit?: number;

  @ActiveFlag()
  isActive?: boolean;
}
