import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_IMAGE_URL_LENGTH, MAX_QUESTION_IMAGES } from '../question-images';

/** Optional list of question image URLs (≤ 6, each a non-empty string ≤ 255). */
export function IsQuestionImageUrls() {
  return IsImageUrlList('รูปโจทย์', 'ข้อ');
}

/**
 * Optional list of image URLs (≤ 6, each a non-empty string ≤ 255).
 * `label` names the images and `per` the owner in the Thai messages,
 * e.g. ('รูปโจทย์', 'ข้อ') → "ใส่รูปโจทย์ได้ไม่เกิน 6 รูปต่อข้อ".
 */
export function IsImageUrlList(label: string, per: string) {
  return applyDecorators(
    IsOptional(),
    IsArray({ message: `${label}ต้องเป็นรายการ URL` }),
    ArrayMaxSize(MAX_QUESTION_IMAGES, {
      message: `ใส่${label}ได้ไม่เกิน ${MAX_QUESTION_IMAGES} รูปต่อ${per}`,
    }),
    IsString({ each: true, message: `URL ${label}ต้องเป็นข้อความ` }),
    IsNotEmpty({ each: true, message: `URL ${label}ต้องไม่ว่าง` }),
    MaxLength(MAX_IMAGE_URL_LENGTH, {
      each: true,
      message: `URL ${label}ยาวได้ไม่เกิน ${MAX_IMAGE_URL_LENGTH} ตัวอักษร`,
    }),
  );
}

/** Optional single image URL (string ≤ 255, null allowed). */
export function IsOptionalImageUrl(label: string) {
  return applyDecorators(
    IsOptional(),
    IsString({ message: `URL ${label}ต้องเป็นข้อความ` }),
    MaxLength(MAX_IMAGE_URL_LENGTH, {
      message: `URL ${label}ยาวได้ไม่เกิน ${MAX_IMAGE_URL_LENGTH} ตัวอักษร`,
    }),
  );
}
