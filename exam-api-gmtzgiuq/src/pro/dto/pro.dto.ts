import { applyDecorators } from '@nestjs/common';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { PRO_CODE_PATTERN, checkComparison } from '../pro-comparison';
import type { ProComparison } from '../pro-comparison';
import { checkEntitlements } from '../pro-entitlements';
import { MAX_ACCESS_DAYS, MIN_ACCESS_DAYS } from '../../exams/exam-mock';

export const MAX_PRICE_SATANG = 10_000_000; // 100,000 baht
export const MAX_PERIOD_DAYS = 3650;
export const MAX_PLAN_RANK = 1000;
export const MAX_SORT_ORDER = 1_000_000;
export const MAX_NOTE_LENGTH = 255;

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

/** Text with at least one non-space character, at most `max` long. */
function RequiredText(label: string, max: number) {
  return applyDecorators(
    IsString({ message: `${label}ต้องเป็นข้อความ` }),
    Matches(/\S/, { message: `กรุณาใส่${label}` }),
    MaxLength(max, { message: `${label}ยาวได้ไม่เกิน ${max} ตัวอักษร` }),
  );
}

/** Optional text (null / blank = none), at most `max` long. */
function NullableText(label: string, max: number) {
  return applyDecorators(
    OptionalNullable(),
    IsString({ message: `${label}ต้องเป็นข้อความ` }),
    MaxLength(max, { message: `${label}ยาวได้ไม่เกิน ${max} ตัวอักษร` }),
  );
}

function IntBetween(label: string, min: number, max: number) {
  const message = `${label}ต้องเป็นจำนวนเต็ม ${min}–${max}`;
  return applyDecorators(
    IsInt({ message }),
    Min(min, { message }),
    Max(max, { message }),
  );
}

function Flag(label: string) {
  return IsBoolean({ message: `${label}ต้องเป็น true หรือ false` });
}

function ProCode(label: string) {
  return applyDecorators(
    IsString({ message: `${label}ต้องเป็นข้อความ` }),
    Matches(PRO_CODE_PATTERN, {
      message: `${label}ต้องเป็นตัวพิมพ์เล็ก a-z ตัวเลข - หรือ _ ยาวไม่เกิน 30 ตัว`,
    }),
  );
}

/**
 * A JSON field checked by `check` (Thai message of the first problem).
 * The object is kept as sent (whitelist does not touch it); the service
 * stores only the known keys.
 */
function JsonChecked(name: string, check: (value: unknown) => string | null) {
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) => check(value) === null,
      defaultMessage: (args) => check(args?.value) ?? `${name} ไม่ถูกต้อง`,
    },
  });
}

// ── page ────────────────────────────────────────────────────────────────

/** PUT /pro/admin/page — fields not sent stay as they are. */
export class UpdateProPageDto {
  @OptionalNotNull()
  @RequiredText('หัวข้อหน้า', 150)
  title?: string;

  @NullableText('คำอธิบายใต้หัวข้อ', 500)
  subtitle?: string | null;

  @NullableText('หัวข้อกล่องเลือกสนาม', 150)
  venuePickerTitle?: string | null;

  @NullableText('ข้อความท้ายหน้า', 500)
  footerNote?: string | null;

  // VAT 7% on top of the plan price for new payments (task 18)
  @OptionalNotNull()
  @Flag('การเปิด VAT ')
  vatEnabled?: boolean;
}

// ── venues ──────────────────────────────────────────────────────────────

/** POST /pro/admin/venues */
export class CreateProVenueDto {
  @ProCode('รหัสสนาม')
  key: string;

  @RequiredText('ชื่อสนาม', 100)
  name: string;

  @NullableText('คำอธิบายสนาม', 500)
  description?: string | null;

  @OptionalNotNull()
  @IntBetween('ลำดับ', -MAX_SORT_ORDER, MAX_SORT_ORDER)
  sortOrder?: number;

  @OptionalNotNull()
  @Flag('สถานะเปิดใช้งาน')
  isActive?: boolean;
}

/** PUT /pro/admin/venues/:id — fields not sent stay as they are. */
export class UpdateProVenueDto {
  @OptionalNotNull()
  @ProCode('รหัสสนาม')
  key?: string;

  @OptionalNotNull()
  @RequiredText('ชื่อสนาม', 100)
  name?: string;

  @NullableText('คำอธิบายสนาม', 500)
  description?: string | null;

  @OptionalNotNull()
  @IntBetween('ลำดับ', -MAX_SORT_ORDER, MAX_SORT_ORDER)
  sortOrder?: number;

  @OptionalNotNull()
  @Flag('สถานะเปิดใช้งาน')
  isActive?: boolean;

  // null = no table
  @ValidateIf((_object: object, value: unknown) => value !== undefined)
  @JsonChecked('comparison', checkComparison)
  comparison?: ProComparison | null;
}

// ── plans ───────────────────────────────────────────────────────────────

/** Fields of a plan shared by POST and PUT (all optional here). */
class ProPlanFieldsDto {
  @NullableText('คำโปรย', 150)
  tagline?: string | null;

  @OptionalNotNull()
  @IntBetween('ราคา (สตางค์)', 0, MAX_PRICE_SATANG)
  priceSatang?: number;

  @NullableText('หน่วยราคา', 30)
  priceUnit?: string | null;

  @NullableText('หมายเหตุราคา', 150)
  priceNote?: string | null;

  @OptionalNotNull()
  @IntBetween('ระยะเวลาต่อรอบ (วัน)', 1, MAX_PERIOD_DAYS)
  periodDays?: number;

  @NullableText('ป้าย', 30)
  badge?: string | null;

  @OptionalNotNull()
  @Flag('การ์ดเด่น')
  highlight?: boolean;

  @OptionalNotNull()
  @IntBetween('ลำดับ', -MAX_SORT_ORDER, MAX_SORT_ORDER)
  sortOrder?: number;

  @OptionalNotNull()
  @Flag('การแสดงแพ็กเกจ')
  isVisible?: boolean;

  @OptionalNotNull()
  @Flag('การเปิดให้ซื้อ')
  isPurchasable?: boolean;
}

/** POST /pro/admin/plans */
export class CreateProPlanDto extends ProPlanFieldsDto {
  @IsUUID('all', { message: 'รหัสสนามไม่ถูกต้อง' })
  venueId: string;

  @ProCode('รหัสแพ็กเกจ')
  code: string;

  @IntBetween('ระดับแพ็กเกจ (rank)', 0, MAX_PLAN_RANK)
  rank: number;

  @RequiredText('ชื่อแพ็กเกจ', 50)
  name: string;

  @RequiredText('ข้อความปุ่ม', 50)
  buttonText: string;

  @JsonChecked('entitlements', checkEntitlements)
  entitlements: Record<string, unknown>;
}

/**
 * PUT /pro/admin/plans/:id — fields not sent stay as they are. The venue
 * of a plan cannot change (venueId is not accepted).
 */
export class UpdateProPlanDto extends ProPlanFieldsDto {
  @OptionalNotNull()
  @ProCode('รหัสแพ็กเกจ')
  code?: string;

  @OptionalNotNull()
  @IntBetween('ระดับแพ็กเกจ (rank)', 0, MAX_PLAN_RANK)
  rank?: number;

  @OptionalNotNull()
  @RequiredText('ชื่อแพ็กเกจ', 50)
  name?: string;

  @OptionalNotNull()
  @RequiredText('ข้อความปุ่ม', 50)
  buttonText?: string;

  @OptionalNotNull()
  @JsonChecked('entitlements', checkEntitlements)
  entitlements?: Record<string, unknown>;
}

// ── subscriptions ───────────────────────────────────────────────────────

/** POST /pro/admin/subscriptions — grant a plan to a user by hand. */
export class GrantProSubscriptionDto {
  @IsString({ message: 'กรุณาใส่อีเมลผู้ใช้' })
  @MaxLength(255, { message: 'อีเมลยาวเกินไป' })
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;

  @IsUUID('all', { message: 'รหัสแพ็กเกจไม่ถูกต้อง' })
  planId: string;

  @IntBetween('จำนวนวัน', MIN_ACCESS_DAYS, MAX_ACCESS_DAYS)
  days: number;

  @NullableText('หมายเหตุ', MAX_NOTE_LENGTH)
  note?: string | null;
}

/** POST /pro/admin/subscriptions/:id/revoke */
export class RevokeProSubscriptionDto {
  @NullableText('หมายเหตุ', MAX_NOTE_LENGTH)
  note?: string | null;
}

export const SUBSCRIPTION_STATUS_FILTERS = [
  'active',
  'expired',
  'revoked',
] as const;
export type SubscriptionStatusFilter =
  (typeof SUBSCRIPTION_STATUS_FILTERS)[number];
