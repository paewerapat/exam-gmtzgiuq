import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Card token made by Omise.js / OmiseCard in the browser (never card data).
 * The only rule on cardToken (one Thai message; also limits the length).
 */
export const CARD_TOKEN_PATTERN = /^tokn_(test_)?[0-9a-z]{1,80}$/;

export const PAYMENT_METHODS = ['card', 'promptpay'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUS_FILTERS = [
  'pending',
  'successful',
  'failed',
  'expired',
  'canceled',
] as const;

const CARD_TOKEN_MESSAGE = 'ข้อมูลบัตรไม่ถูกต้อง กรุณากรอกบัตรใหม่อีกครั้ง';

const DISCOUNT_CODE_MESSAGE = 'โค้ดส่วนลดต้องเป็นข้อความไม่เกิน 100 ตัวอักษร';

/** GET /pro/checkout/quote?planId=&code= */
export class CheckoutQuoteQueryDto {
  @IsUUID('all', { message: 'รหัสแพ็กเกจไม่ถูกต้อง' })
  planId: string;

  // Discount code (task 19): checked by the service; a code that cannot be
  // used gives discountError, not an error of the quote
  @IsOptional()
  @IsString({ message: DISCOUNT_CODE_MESSAGE })
  @MaxLength(100, { message: DISCOUNT_CODE_MESSAGE })
  code?: string;
}

/**
 * POST /pro/checkout — the amount is never taken from the client (fields
 * not listed here are dropped by the ValidationPipe whitelist).
 */
export class CheckoutDto {
  @IsUUID('all', { message: 'รหัสแพ็กเกจไม่ถูกต้อง' })
  planId: string;

  @IsIn(PAYMENT_METHODS, {
    message: 'วิธีชำระเงินต้องเป็น card หรือ promptpay',
  })
  method: PaymentMethodInput;

  // Required for card only
  @ValidateIf((o: CheckoutDto) => o.method === 'card')
  @Matches(CARD_TOKEN_PATTERN, { message: CARD_TOKEN_MESSAGE })
  cardToken?: string;

  // Discount code (task 19), checked again under the user's lock; empty =
  // none. Wrong codes → 400 DISCOUNT_* (counted like unlock code guesses)
  @IsOptional()
  @IsString({ message: DISCOUNT_CODE_MESSAGE })
  @MaxLength(100, { message: DISCOUNT_CODE_MESSAGE })
  discountCode?: string;
}

/** POST /pro/subscriptions/:id/change-card */
export class ChangeCardDto {
  @Matches(CARD_TOKEN_PATTERN, { message: CARD_TOKEN_MESSAGE })
  cardToken: string;
}

/**
 * POST /pro/payments/omise/webhook — only the event id is read; the rest of
 * Opn's body is dropped (the event is read again from Opn).
 */
export class OmiseWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;
}
