/**
 * แปลง error จาก GraphQL auth (register / resetPassword / verifyEmail) เป็นข้อความไทยที่บอกสาเหตุ + วิธีแก้
 * ไม่โชว์ข้อความอังกฤษดิบอย่าง "Bad Request Exception" ให้ผู้ใช้เห็น
 *
 * รูปแบบ error ที่รองรับ (Apollo Client 4):
 * - CombinedGraphQLErrors: `{ message, errors: [{ message, extensions: { code, originalError: { message: string | string[] } } }] }`
 *   (ValidationPipe ของ API ให้ message = "Bad Request Exception" และรายละเอียดอยู่ใน extensions.originalError.message)
 * - network error: TypeError "Failed to fetch" / ServerError ที่มี statusCode
 * - Error ธรรมดา
 */

export type AuthErrorContext = 'register' | 'resetPassword' | 'verifyEmail';

export const AUTH_ERROR_MESSAGES = {
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
  emailTaken: 'อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่นสมัคร',
  invalidEmail: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีเมล เช่น you@example.com',
  passwordTooShort: 'รหัสผ่านสั้นเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร',
  nameTooLong: 'ชื่อหรือนามสกุลยาวเกินไป กรุณากรอกไม่เกิน 100 ตัวอักษร',
  invalidResetToken: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่',
  expiredResetToken: 'ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่',
  invalidVerifyToken: 'ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือถูกใช้ไปแล้ว',
  expiredVerifyToken: 'ลิงก์ยืนยันอีเมลหมดอายุแล้ว กรุณาเข้าสู่ระบบแล้วขอลิงก์ยืนยันใหม่',
} as const;

const FALLBACK: Record<AuthErrorContext, string> = {
  register: 'สมัครสมาชิกไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง',
  resetPassword: 'รีเซ็ตรหัสผ่านไม่สำเร็จ ลิงก์อาจหมดอายุแล้ว กรุณาขอลิงก์ใหม่',
  verifyEmail: 'ยืนยันอีเมลไม่สำเร็จ ลิงก์อาจหมดอายุแล้ว',
};

const THAI_RE = /[฀-๿]/;

type GqlLikeError = { message?: unknown; extensions?: { code?: unknown; originalError?: { message?: unknown } } };

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** รวบรวมข้อความทั้งหมดใน error (ข้อความหลัก + รายละเอียดของ validation) */
function collectMessages(error: unknown): { messages: string[]; codes: string[]; network: boolean } {
  const messages: string[] = [];
  const codes: string[] = [];
  let network = false;

  if (!error || typeof error !== 'object') {
    if (typeof error === 'string') messages.push(error);
    return { messages, codes, network };
  }

  const e = error as {
    message?: unknown;
    name?: unknown;
    statusCode?: unknown;
    errors?: unknown;
    graphQLErrors?: unknown;
    networkError?: unknown;
  };

  const gqlErrors = [...asArray(e.errors), ...asArray(e.graphQLErrors)] as GqlLikeError[];
  for (const g of gqlErrors) {
    if (!g || typeof g !== 'object') continue;
    if (typeof g.message === 'string') messages.push(g.message);
    if (typeof g.extensions?.code === 'string') codes.push(g.extensions.code);
    const detail = g.extensions?.originalError?.message;
    if (typeof detail === 'string') messages.push(detail);
    for (const d of asArray(detail)) if (typeof d === 'string') messages.push(d);
  }

  if (gqlErrors.length === 0) {
    if (typeof e.message === 'string') messages.push(e.message);
    const name = typeof e.name === 'string' ? e.name : '';
    const msg = typeof e.message === 'string' ? e.message : '';
    if (
      e.networkError ||
      name === 'ServerError' ||
      name === 'ServerParseError' ||
      typeof e.statusCode === 'number' ||
      /failed to fetch|networkerror|network request failed|load failed/i.test(msg)
    ) {
      network = true;
    }
  }

  return { messages, codes, network };
}

export function getAuthErrorMessage(error: unknown, context: AuthErrorContext): string {
  const { messages, network } = collectMessages(error);

  // อีเมลซ้ำ: API ตอบ "อีเมลนี้ถูกใช้งานแล้ว" (บอกแค่สาเหตุ) → เติมวิธีแก้
  if (context === 'register' && messages.some((m) => m.trim() === 'อีเมลนี้ถูกใช้งานแล้ว')) {
    return AUTH_ERROR_MESSAGES.emailTaken;
  }

  // API ส่งข้อความไทยมาเอง (เช่น สมัครด้วย Google แล้ว) → ใช้ตามนั้น
  const thai = messages.find((m) => THAI_RE.test(m));
  if (thai) return thai;

  const all = messages.join('\n').toLowerCase();

  if (/reset token has expired/.test(all)) return AUTH_ERROR_MESSAGES.expiredResetToken;
  if (/invalid reset token/.test(all)) return AUTH_ERROR_MESSAGES.invalidResetToken;
  if (/verification token has expired/.test(all)) return AUTH_ERROR_MESSAGES.expiredVerifyToken;
  if (/invalid verification token/.test(all)) return AUTH_ERROR_MESSAGES.invalidVerifyToken;

  // อีเมลซ้ำเกิดได้เฉพาะตอนสมัคร (หน้าอื่น "duplicate" อาจหมายถึงอย่างอื่น → ใช้ fallback ของหน้านั้น)
  if (context === 'register' && /already (exists|registered|in use|taken)|duplicate|er_dup_entry/.test(all)) {
    return AUTH_ERROR_MESSAGES.emailTaken;
  }

  // รายละเอียดจาก ValidationPipe (class-validator)
  if (/email must be an email/.test(all)) return AUTH_ERROR_MESSAGES.invalidEmail;
  if (/password must be longer than/.test(all)) return AUTH_ERROR_MESSAGES.passwordTooShort;
  if (/(firstname|lastname) must be shorter than/.test(all)) return AUTH_ERROR_MESSAGES.nameTooLong;
  if (/token should not be empty|token must be a string/.test(all)) {
    if (context === 'resetPassword') return AUTH_ERROR_MESSAGES.invalidResetToken;
    if (context === 'verifyEmail') return AUTH_ERROR_MESSAGES.invalidVerifyToken;
  }

  if (network) return AUTH_ERROR_MESSAGES.network;

  return FALLBACK[context];
}
