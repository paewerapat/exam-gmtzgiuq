// helper ของการชำระเงินสมาชิก Pro (task 18): ลิงก์ checkout/result, ป้ายสถานะ/วิธีชำระ, นับถอยหลัง, ข้อความ error
// เป็น pure function ทดสอบแยกได้

/** poll สถานะ payment ทุก 5 วินาที (server ถาม Opn ไม่เกิน 1 ครั้ง/5 วินาที) */
export const PAYMENT_POLL_MS = 5000;
/** หลัง QR หมดเวลายัง poll ต่ออีกนิด เผื่อจ่ายวินาทีสุดท้าย */
export const PAYMENT_EXPIRY_GRACE_MS = 10000;
/** บัตรที่กลับจาก 3DS แล้วยัง pending: poll สูงสุด 3 นาทีแล้วให้กดตรวจสอบเอง */
export const CARD_PENDING_POLL_LIMIT_MS = 3 * 60 * 1000;

export const MEMBERSHIP_PATH = '/dashboard/membership';

export function checkoutHref(planId: string): string {
  return `/upgrade/checkout?plan=${encodeURIComponent(planId)}`;
}

/** หน้าผล — ใส่ plan ไว้ด้วยเพื่อให้ "สร้าง QR ใหม่ / ลองใหม่" รู้แพ็กเกจ (กลับจาก 3DS จะมีแค่ payment) */
export function resultHref(paymentId: string, planId?: string | null): string {
  const query = new URLSearchParams({ payment: paymentId });
  if (planId) query.set('plan', planId);
  return `/upgrade/result?${query.toString()}`;
}

export function loginHref(redirect: string): string {
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'รอชำระ',
  successful: 'สำเร็จ',
  failed: 'ไม่สำเร็จ',
  expired: 'หมดอายุ',
  canceled: 'ยกเลิกแล้ว',
};

export const PAYMENT_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  successful: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  canceled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

/** ข้อความของรายการที่ถูกแทนที่ (API ส่ง failureMessage เดียวกันมา ใช้เมื่อไม่มี) */
export const PAYMENT_CANCELED_MESSAGE = 'ถูกแทนที่ด้วยรายการชำระใหม่';

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? (status || '-');
}

export function paymentStatusClass(status: string): string {
  return PAYMENT_STATUS_CLASSES[status] ?? PAYMENT_STATUS_CLASSES.expired;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'บัตรเครดิต/เดบิต',
  promptpay: 'PromptPay',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? (method || '-');
}

/** "Visa •••• 4242" / ไม่มีเลขท้าย → null */
export function formatCardLabel(brand: string | null | undefined, lastDigits: string | null | undefined): string | null {
  const last = typeof lastDigits === 'string' ? lastDigits.replace(/\D/g, '').slice(-4) : '';
  if (!last) return null;
  return `${brand?.trim() || 'บัตร'} •••• ${last}`;
}

/** มิลลิวินาทีที่เหลือถึง expiresAt (ไม่ถูกต้อง → null, หมดแล้ว → 0) */
export function msUntil(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - now);
}

/** 754000 → "12:34" / 3723000 → "1:02:03" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** URL ภายนอกที่ยอมพาไป/แสดง (authorizeUri ของ 3DS, รูป QR) ต้องเป็น https เท่านั้น */
export function isSafeHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** พาไปหน้ายืนยัน 3-D Secure ของธนาคาร (แยกเป็นฟังก์ชันให้ test mock ได้) — https เท่านั้น */
export function redirectToAuthorize(url: string): boolean {
  if (!isSafeHttpsUrl(url)) return false;
  window.location.assign(url);
  return true;
}

/** ข้อความไทยของ errorCode กลุ่มชำระเงิน — ใช้เมื่อ API ไม่ได้ส่งข้อความไทยมา */
export const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  PLAN_NOT_PURCHASABLE: 'แพ็กเกจนี้ยังไม่เปิดให้สมัคร',
  PAYMENT_NOT_FOUND: 'ไม่พบรายการชำระเงินนี้',
  CARD_DECLINED: 'ทำรายการไม่สำเร็จ กรุณาลองบัตรอื่นหรือติดต่อธนาคาร',
  OMISE_UNAVAILABLE: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
  NOT_RENEWABLE: 'แพ็กเกจนี้ไม่ได้ตั้งต่ออายุอัตโนมัติ',
  ALREADY_AUTO_RENEW: 'แพ็กเกจนี้ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว ไม่ต้องชำระซ้ำ',
};

export const NETWORK_ERROR_MESSAGE = 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';

const THAI = /[ก-๙]/;

/** error → ข้อความไทย: ข้อความไทยจาก API / ข้อความของ errorCode / เน็ตหลุด / fallback */
export function paymentErrorMessage(err: unknown, fallback: string): string {
  const e = err as { errorCode?: unknown; message?: unknown } | null;
  if (e && typeof e.message === 'string' && THAI.test(e.message)) return e.message;
  if (e && typeof e.errorCode === 'string' && PAYMENT_ERROR_MESSAGES[e.errorCode]) return PAYMENT_ERROR_MESSAGES[e.errorCode];
  // fetch ล้มเพราะเน็ต/เซิร์ฟเวอร์ไม่ตอบ → TypeError
  if (err instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  return fallback;
}
