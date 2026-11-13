import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const ORDER_MESSAGE = 'ลำดับต้องเป็นจำนวนเต็ม';

/** Field may be left out but, when sent, must not be null. */
function OptionalNotNull() {
  return ValidateIf((_object: object, value: unknown) => value !== undefined);
}

/** POST /categories/admin */
export class CreateCategoryDto {
  @IsString({ message: 'ชื่อหมวดหมู่ต้องเป็นข้อความ' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อหมวดหมู่' })
  @MaxLength(100, { message: 'ชื่อหมวดหมู่ยาวได้ไม่เกิน 100 ตัวอักษร' })
  name: string;

  @IsString({ message: 'slug ต้องเป็นข้อความ' })
  @Matches(/\S/, { message: 'กรุณาใส่ slug' })
  @MaxLength(100, { message: 'slug ยาวได้ไม่เกิน 100 ตัวอักษร' })
  slug: string;

  @OptionalNotNull()
  @IsInt({ message: ORDER_MESSAGE })
  @Min(-1_000_000, { message: ORDER_MESSAGE })
  @Max(1_000_000, { message: ORDER_MESSAGE })
  orderIndex?: number;

  // Pro venue of the category (task 17); null / not sent = none
  @ValidateIf(
    (_object: object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUUID('all', { message: 'รหัสสนามไม่ถูกต้อง' })
  venueId?: string | null;
}

/** PUT /categories/admin/:id — fields not sent stay as they are. */
export class UpdateCategoryDto {
  @OptionalNotNull()
  @IsString({ message: 'ชื่อหมวดหมู่ต้องเป็นข้อความ' })
  @Matches(/\S/, { message: 'กรุณาใส่ชื่อหมวดหมู่' })
  @MaxLength(100, { message: 'ชื่อหมวดหมู่ยาวได้ไม่เกิน 100 ตัวอักษร' })
  name?: string;

  @OptionalNotNull()
  @IsString({ message: 'slug ต้องเป็นข้อความ' })
  @Matches(/\S/, { message: 'กรุณาใส่ slug' })
  @MaxLength(100, { message: 'slug ยาวได้ไม่เกิน 100 ตัวอักษร' })
  slug?: string;

  @OptionalNotNull()
  @IsInt({ message: ORDER_MESSAGE })
  @Min(-1_000_000, { message: ORDER_MESSAGE })
  @Max(1_000_000, { message: ORDER_MESSAGE })
  orderIndex?: number;

  // Pro venue of the category (task 17); null = none
  @ValidateIf(
    (_object: object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUUID('all', { message: 'รหัสสนามไม่ถูกต้อง' })
  venueId?: string | null;
}
