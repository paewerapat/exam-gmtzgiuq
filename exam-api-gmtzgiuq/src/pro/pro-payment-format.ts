/** Pure helpers of the Pro payments (task 18). */

/** VAT rate added on top of the plan price when pro_page.vatEnabled. */
export const VAT_PERCENT = 7;

/** Opn's minimum charge for cards and PromptPay (20 baht). */
export const MIN_CHARGE_SATANG = 2000;

/** Years an Opn renewal schedule runs (end_date is required by Opn). */
export const SCHEDULE_YEARS = 5;

/** GET /pro/payments/:id asks Opn about a pending payment at most this often. */
export const SYNC_THROTTLE_MS = 5000;

/** A pending PromptPay QR is reused only while it is valid at least this long. */
export const QR_REUSE_MIN_MS = 60_000;

/**
 * A renewal charge is accepted up to this long after currentPeriodEnd (Opn
 * retries a failed scheduled charge daily); later = not renewed, refund.
 */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PaymentAmounts {
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
}

/** price, price × 7% rounded (when VAT is on), and their sum. */
export function computeAmounts(
  priceSatang: number,
  vatEnabled: boolean,
): PaymentAmounts {
  const subtotalSatang = Math.max(0, Math.round(priceSatang));
  const vatSatang = vatEnabled
    ? Math.round((subtotalSatang * VAT_PERCENT) / 100)
    : 0;
  return { subtotalSatang, vatSatang, totalSatang: subtotalSatang + vatSatang };
}

const CARD_FAILURES: Record<string, string> = {
  insufficient_fund: 'ยอดเงินหรือวงเงินในบัตรไม่พอ กรุณาใช้บัตรอื่น',
  stolen_or_lost_card:
    'บัตรนี้ถูกระงับการใช้งาน กรุณาติดต่อธนาคารหรือใช้บัตรอื่น',
  failed_processing:
    'ธนาคารไม่สามารถทำรายการได้ในขณะนี้ กรุณาลองใหม่หรือใช้บัตรอื่น',
  payment_rejected: 'ธนาคารปฏิเสธการชำระเงิน กรุณาติดต่อธนาคารหรือใช้บัตรอื่น',
  invalid_security_code: 'รหัส CVV ไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่',
  failed_fraud_check:
    'รายการถูกปฏิเสธโดยระบบตรวจสอบความปลอดภัย กรุณาติดต่อธนาคารหรือใช้บัตรอื่น',
};

export const DEFAULT_CARD_FAILURE =
  'ทำรายการไม่สำเร็จ กรุณาลองบัตรอื่นหรือติดต่อธนาคาร';
export const DEFAULT_PROMPTPAY_FAILURE =
  'ชำระด้วย PromptPay ไม่สำเร็จ กรุณาสร้าง QR ใหม่แล้วลองอีกครั้ง';
export const EXPIRED_MESSAGE = 'รายการหมดเวลาชำระแล้ว กรุณาทำรายการใหม่';
/** Opn could not be reached while making the charge. */
export const OMISE_DOWN_MESSAGE =
  'ระบบชำระเงินขัดข้องชั่วคราว รายการนี้ยังไม่ถูกเรียกเก็บเงิน กรุณาลองใหม่อีกครั้งในอีกสักครู่';
/** A pending payment replaced by a newer checkout of the plan (task 19). */
export const REPLACED_CODE = 'replaced';
export const REPLACED_MESSAGE = 'ถูกแทนที่ด้วยรายการชำระใหม่';
/** …that Opn still reports paid (refundRequired, no rights). */
export const REPLACED_PAID_NOTE =
  'รายการนี้ถูกแทนที่ด้วยรายการชำระใหม่แล้วแต่ยังมีการชำระเงินเข้ามา จึงไม่ได้ให้สิทธิ์เพิ่ม ทีมงานจะคืนเงินรายการนี้';
/** Money taken without rights (refundRequired): shown to the user/admin. */
export const REFUND_NOTE =
  'ระบบตัดเงินต่ออายุหลังจากสมาชิกสิ้นสุดหรือหยุดต่ออายุแล้ว จึงไม่ได้ต่ออายุให้ ทีมงานจะคืนเงินรายการนี้';

/**
 * Thai message for an Opn failure_code (never Opn's own English text).
 * PromptPay always gets the PromptPay message (the card codes are about
 * cards); expired gets the expiry message.
 */
export function thaiFailureMessage(
  code: string | null | undefined,
  method: string,
): string {
  if (code === 'expired' || code === 'payment_expired') return EXPIRED_MESSAGE;
  if (method === 'promptpay') return DEFAULT_PROMPTPAY_FAILURE;
  if (code && CARD_FAILURES[code]) return CARD_FAILURES[code];
  return DEFAULT_CARD_FAILURE;
}

export function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calendar date (YYYY-MM-DD) of `date` in Thai time (UTC+7, no DST). */
export function bangkokDate(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** YYYY-MM-DD plus whole years (29 Feb → 28 Feb when needed). */
export function addYearsToDate(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** ISO string from Opn → Date (whole seconds), or null. */
export function parseOmiseDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? floorToSecond(new Date(time)) : null;
}

/** Text cut to `max` characters (for varchar columns). */
export function clip(value: string | null | undefined, max: number) {
  if (typeof value !== 'string' || value === '') return null;
  return value.length > max ? value.slice(0, max) : value;
}
