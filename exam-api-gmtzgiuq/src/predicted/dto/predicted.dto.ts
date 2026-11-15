import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PREDICTED_SET_ACCESS,
  type PredictedSetAccess,
} from '../predicted-set.entity';

export const MAX_SERIES_TITLE_LENGTH = 150;
export const MAX_SERIES_DESCRIPTION_LENGTH = 500;
export const MAX_SETS_PER_SERIES = 50;
export const MAX_SET_NO = 1000;
export const MAX_PREVIEW_COUNT = 1000;
export const MAX_SERIES_SORT_ORDER = 1_000_000;
/** Dot colour of a series card: #rgb or #rrggbb (varchar(7)). */
export const SERIES_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

function IntBetween(label: string, min: number, max: number) {
  const message = `${label}ต้องเป็นจำนวนเต็ม ${min}–${max}`;
  return applyDecorators(
    IsInt({ message }),
    Min(min, { message }),
    Max(max, { message }),
  );
}

/**
 * Problem of a series title as one Thai message (nit: a missing title used
 * to get three — not text, blank, too long): missing / null / blank →
 * "กรุณาใส่ชื่อซีรีส์"; not text; longer than MAX_SERIES_TITLE_LENGTH
 * characters. Returns null when the title is fine.
 */
export function seriesTitleProblem(value: unknown): string | null {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && !/\S/.test(value))
  ) {
    return 'กรุณาใส่ชื่อซีรีส์';
  }
  if (typeof value !== 'string') return 'ชื่อซีรีส์ต้องเป็นข้อความ';
  if ([...value].length > MAX_SERIES_TITLE_LENGTH) {
    return `ชื่อซีรีส์ยาวได้ไม่เกิน ${MAX_SERIES_TITLE_LENGTH} ตัวอักษร`;
  }
  return null;
}

/** Series title: one message for the first problem (seriesTitleProblem). */
function SeriesTitle() {
  return ValidateBy({
    name: 'seriesTitle',
    validator: {
      validate: (value: unknown) => seriesTitleProblem(value) === null,
      defaultMessage: (args) =>
        seriesTitleProblem(args?.value) ?? 'ชื่อซีรีส์ไม่ถูกต้อง',
    },
  });
}

/** One set of PUT/POST series `sets` (the whole list replaces the old one). */
export class PredictedSetInputDto {
  @IsUUID('all', { message: 'รหัสชุดข้อสอบ (examId) ไม่ถูกต้อง' })
  examId: string;

  @IntBetween('ลำดับชุด (setNo) ', 1, MAX_SET_NO)
  setNo: number;

  @IsIn(PREDICTED_SET_ACCESS, {
    message: 'สิทธิ์ของชุด (access) ต้องเป็น free หรือ pro',
  })
  access: PredictedSetAccess;

  // null / 0 / not sent = no Preview; must be below the set's questions
  @OptionalNullable()
  @IntBetween('จำนวนข้อ Preview ', 0, MAX_PREVIEW_COUNT)
  previewCount?: number | null;
}

/** Fields shared by POST and PUT. */
class PredictedSeriesFieldsDto {
  @OptionalNullable()
  @IsUUID('all', { message: 'รหัสวิชา (subjectId) ไม่ถูกต้อง' })
  subjectId?: string | null;

  @OptionalNullable()
  @IsString({ message: 'คำอธิบายต้องเป็นข้อความ' })
  @MaxLength(MAX_SERIES_DESCRIPTION_LENGTH, {
    message: `คำอธิบายยาวได้ไม่เกิน ${MAX_SERIES_DESCRIPTION_LENGTH} ตัวอักษร`,
  })
  description?: string | null;

  @OptionalNullable()
  @IsString({ message: 'สีต้องเป็นรหัสสี เช่น #6366f1' })
  @Matches(SERIES_COLOR_PATTERN, {
    message: 'สีต้องเป็นรหัสสี hex เช่น #6366f1',
  })
  color?: string | null;

  @OptionalNotNull()
  @IntBetween('ลำดับการแสดง ', 0, MAX_SERIES_SORT_ORDER)
  sortOrder?: number;

  @OptionalNotNull()
  @IsBoolean({ message: 'การเปิดใช้งานต้องเป็น true หรือ false' })
  isActive?: boolean;

  // Sent = replaces every set of the series (in one transaction)
  @OptionalNotNull()
  @IsArray({ message: 'รายการชุด (sets) ต้องเป็นรายการ' })
  @ArrayMaxSize(MAX_SETS_PER_SERIES, {
    message: `ซีรีส์หนึ่งมีได้ไม่เกิน ${MAX_SETS_PER_SERIES} ชุด`,
  })
  @ValidateNested({ each: true })
  @Type(() => PredictedSetInputDto)
  sets?: PredictedSetInputDto[];
}

/** POST /admin/predicted/series */
export class CreatePredictedSeriesDto extends PredictedSeriesFieldsDto {
  @IsUUID('all', { message: 'กรุณาเลือกสนามสอบ' })
  venueId: string;

  @SeriesTitle()
  title: string;
}

/** PUT /admin/predicted/series/:id — fields not sent stay as they are. */
export class UpdatePredictedSeriesDto extends PredictedSeriesFieldsDto {
  @OptionalNotNull()
  @IsUUID('all', { message: 'กรุณาเลือกสนามสอบ' })
  venueId?: string;

  @OptionalNotNull()
  @SeriesTitle()
  title?: string;
}
