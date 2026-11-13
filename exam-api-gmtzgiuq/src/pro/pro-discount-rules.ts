/** Pure rules of the Pro discount codes (task 19). */
import type { ProErrorCode } from './pro-errors';
import {
  MIN_CHARGE_SATANG,
  PaymentAmounts,
  computeAmounts,
} from './pro-payment-format';

/** A stored code: upper case A–Z 0–9 - _ (3–40). */
export const DISCOUNT_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

/** As typed by the admin (any case; stored upper case). */
export const DISCOUNT_CODE_INPUT_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

/** Longest input looked at (spaces included). */
const MAX_TYPED_LENGTH = 100;

/**
 * A reserved use whose pending payment has no expiry (a card waiting for
 * 3-D Secure) stops counting after this long, so an abandoned checkout does
 * not hold the code forever.
 */
export const RESERVATION_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Errors of a discount code at the checkout (they count toward the redeem
 * limit of task 15, as code guesses).
 */
export const DISCOUNT_ERROR_CODES: readonly ProErrorCode[] = [
  'DISCOUNT_NOT_FOUND',
  'DISCOUNT_INACTIVE',
  'DISCOUNT_EXPIRED',
  'DISCOUNT_NOT_STARTED',
  'DISCOUNT_NOT_APPLICABLE',
  'DISCOUNT_USED_UP',
  'DISCOUNT_ALREADY_USED',
  'DISCOUNT_TOO_LARGE',
  'AMOUNT_TOO_LOW',
];

/** AMOUNT_TOO_LOW caused by the discount (same errorCode, own text). */
export const DISCOUNT_AMOUNT_TOO_LOW_MESSAGE =
  'ยอดหลังหักส่วนลดต่ำกว่า 20 บาท (ขั้นต่ำของการชำระเงิน) จึงใช้โค้ดนี้กับแพ็กเกจนี้ไม่ได้';

export interface DiscountRule {
  discountType: string;
  discountValue: number;
  venueId: string | null;
  planId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean | number | string;
}

export interface DiscountedAmounts extends PaymentAmounts {
  discountSatang: number;
}

/**
 * What the user typed → the stored form (spaces removed, upper case), or
 * null when it cannot be a code.
 */
export function normalizeDiscountCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_TYPED_LENGTH) {
    return null;
  }
  const code = value.replace(/\s/g, '').toUpperCase();
  return DISCOUNT_CODE_PATTERN.test(code) ? code : null;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

/** Off / not started / ended (endsAt itself still counts as valid). */
export function discountStateError(
  code: Pick<DiscountRule, 'isActive' | 'startsAt' | 'endsAt'>,
  now: Date,
): ProErrorCode | null {
  if (!bool(code.isActive)) return 'DISCOUNT_INACTIVE';
  if (code.startsAt && code.startsAt.getTime() > now.getTime()) {
    return 'DISCOUNT_NOT_STARTED';
  }
  if (code.endsAt && code.endsAt.getTime() < now.getTime()) {
    return 'DISCOUNT_EXPIRED';
  }
  return null;
}

/** The code is for another venue / plan. */
export function discountScopeError(
  code: Pick<DiscountRule, 'venueId' | 'planId'>,
  plan: { id: string; venueId: string },
): ProErrorCode | null {
  if (code.venueId && code.venueId !== plan.venueId) {
    return 'DISCOUNT_NOT_APPLICABLE';
  }
  if (code.planId && code.planId !== plan.id) return 'DISCOUNT_NOT_APPLICABLE';
  return null;
}

/**
 * Discount on the price before VAT: percent → round(price × value / 100);
 * amount → min(value, price).
 */
export function computeDiscountSatang(
  discountType: string,
  discountValue: number,
  priceSatang: number,
): number {
  const price = Math.max(0, Math.round(priceSatang));
  const value = Math.max(0, Math.round(Number(discountValue) || 0));
  if (discountType === 'percent') {
    return Math.min(price, Math.round((price * Math.min(value, 100)) / 100));
  }
  return Math.min(value, price);
}

/**
 * subtotal = price, discount, VAT on (price − discount) when on, total =
 * price − discount + VAT. Errors: the whole price off → DISCOUNT_TOO_LARGE;
 * total under Opn's 20 baht → AMOUNT_TOO_LOW.
 */
export function discountedAmounts(
  priceSatang: number,
  vatEnabled: boolean,
  discountSatang: number,
): DiscountedAmounts | { error: ProErrorCode } {
  const full = computeAmounts(priceSatang, false).subtotalSatang;
  const discount = Math.max(0, Math.min(Math.round(discountSatang), full));
  if (discount > 0 && discount >= full) return { error: 'DISCOUNT_TOO_LARGE' };
  const after = computeAmounts(full - discount, vatEnabled);
  if (after.totalSatang < MIN_CHARGE_SATANG) return { error: 'AMOUNT_TOO_LOW' };
  return {
    subtotalSatang: full,
    discountSatang: discount,
    vatSatang: after.vatSatang,
    totalSatang: after.totalSatang,
  };
}

/**
 * What a renewal of this payment charges: a discount is for the first
 * payment only, so a discounted payment renews at the full price + VAT of
 * the full price (VAT on when the payment had VAT); otherwise its total.
 */
export function renewalTotalOf(payment: {
  subtotalSatang: number;
  vatSatang: number;
  discountSatang?: number | null;
  totalSatang: number;
}): number {
  if (!payment.discountSatang || payment.discountSatang <= 0) {
    return payment.totalSatang;
  }
  return computeAmounts(payment.subtotalSatang, payment.vatSatang > 0)
    .totalSatang;
}

/**
 * A reserved use still holds the code: its payment is pending and has not
 * expired (no expiry: made in the last RESERVATION_HOLD_MS).
 */
export function isLiveReservation(
  payment:
    | { status: string; expiresAt: Date | null; createdAt: Date }
    | null
    | undefined,
  now: Date,
): boolean {
  if (!payment || payment.status !== 'pending') return false;
  if (payment.expiresAt) return payment.expiresAt.getTime() > now.getTime();
  return (
    new Date(payment.createdAt).getTime() > now.getTime() - RESERVATION_HOLD_MS
  );
}
