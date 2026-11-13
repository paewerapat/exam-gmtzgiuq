import { HttpException } from '@nestjs/common';

/** Errors of /pro/* (and the venue check of categories), shown in Thai. */
export const PRO_ERRORS = {
  VENUE_NOT_FOUND: { status: 404, message: 'ไม่พบสนามนี้' },
  PLAN_NOT_FOUND: { status: 404, message: 'ไม่พบแพ็กเกจนี้' },
  SUBSCRIPTION_NOT_FOUND: { status: 404, message: 'ไม่พบรายการสมาชิกนี้' },
  USER_NOT_FOUND: { status: 404, message: 'ไม่พบผู้ใช้ที่มีอีเมลนี้' },
  VENUE_KEY_TAKEN: { status: 409, message: 'รหัสสนามนี้ถูกใช้แล้ว' },
  PLAN_CODE_TAKEN: {
    status: 409,
    message: 'รหัสแพ็กเกจนี้ถูกใช้แล้วในสนามนี้',
  },
  VENUE_IN_USE: {
    status: 409,
    message: 'สนามนี้มีสมาชิกอ้างอิงอยู่ ลบไม่ได้ ให้ปิดการใช้งานสนามแทน',
  },
  PLAN_IN_USE: {
    status: 409,
    message: 'แพ็กเกจนี้มีสมาชิกอ้างอิงอยู่ ลบไม่ได้ ให้ซ่อนแพ็กเกจแทน',
  },
  FREE_PLAN_PRICE: {
    status: 400,
    message: 'แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0 และเปิดให้ซื้อไม่ได้',
  },
  PURCHASABLE_NEEDS_PRICE: {
    status: 400,
    message: 'แพ็กเกจที่เปิดให้ซื้อต้องมีราคามากกว่า 0',
  },
  FREE_PLAN_MOCK_PURCHASE: {
    status: 400,
    message:
      'แพ็กเกจฟรี (ระดับ 0) เปิดสิทธิ์ชุด Mock ที่ต้องซื้อ (mockPurchase) ไม่ได้',
  },
  FREE_PLAN_EXISTS: {
    status: 409,
    message:
      'สนามนี้มีแพ็กเกจฟรี (ระดับ 0) อยู่แล้ว สนามหนึ่งมีแพ็กเกจฟรีได้ 1 แพ็กเกจ',
  },
  PLAN_RANK_IN_USE: {
    status: 409,
    message:
      'เปลี่ยนแพ็กเกจนี้เป็นระดับ 0 (ฟรี) ไม่ได้ เพราะมีสมาชิกอ้างอิงแพ็กเกจนี้อยู่',
  },
  FREE_PLAN_GRANT: {
    status: 400,
    message:
      'ให้สิทธิ์แพ็กเกจฟรี (ระดับ 0) ไม่ได้ กรุณาเลือกแพ็กเกจที่เสียเงิน',
  },
  ALREADY_REVOKED: { status: 409, message: 'สิทธิ์นี้ถูกถอนไปแล้ว' },
  NOT_ACTIVE: { status: 409, message: 'สิทธิ์นี้ไม่ได้ใช้งานอยู่แล้ว' },
  USER_BUSY: {
    status: 409,
    message: 'กำลังมีการแก้ไขสิทธิ์ของผู้ใช้นี้อยู่ กรุณาลองใหม่อีกครั้ง',
  },
  CONCURRENT_UPDATE: {
    status: 409,
    message: 'มีการแก้ไขข้อมูลนี้พร้อมกันอยู่ กรุณาลองใหม่อีกครั้ง',
  },
  INVALID_STATUS_FILTER: {
    status: 400,
    message: 'status ต้องเป็น active, expired หรือ revoked',
  },
  // ── payments (task 18) ──
  PLAN_NOT_PURCHASABLE: {
    status: 400,
    message: 'แพ็กเกจนี้ยังไม่เปิดให้ซื้อ',
  },
  AMOUNT_TOO_LOW: {
    status: 400,
    message: 'ยอดชำระต้องไม่ต่ำกว่า 20 บาท กรุณาติดต่อผู้ดูแลระบบ',
  },
  PAYMENT_NOT_FOUND: { status: 404, message: 'ไม่พบรายการชำระเงินนี้' },
  PAYMENT_IN_PROGRESS: {
    status: 409,
    message:
      'มีรายการชำระเงินของแพ็กเกจนี้กำลังดำเนินการอยู่ กรุณารอสักครู่แล้วลองใหม่',
  },
  CARD_DECLINED: {
    status: 400,
    message:
      'ไม่สามารถใช้บัตรนี้ได้ กรุณาตรวจสอบข้อมูลบัตรแล้วกรอกใหม่ หรือใช้บัตรอื่น',
  },
  OMISE_UNAVAILABLE: {
    status: 503,
    message: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่',
  },
  NOT_RENEWABLE: {
    status: 409,
    message: 'รายการนี้ไม่ได้ตั้งต่ออายุอัตโนมัติด้วยบัตร',
  },
  ALREADY_AUTO_RENEW: {
    status: 409,
    message:
      'แพ็กเกจนี้ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว ไม่ต้องชำระซ้ำ (ยกเลิกการต่ออายุก่อนหากต้องการชำระเอง)',
  },
  NOT_CARD_SUBSCRIPTION: {
    status: 409,
    message: 'เปลี่ยนบัตรได้เฉพาะแพ็กเกจที่ชำระด้วยบัตรและยังใช้งานอยู่',
  },
  // 503 (not 429) so Opn always retries if it were ever hit by mistake
  WEBHOOK_RATE_LIMITED: {
    status: 503,
    message: 'เรียกบ่อยเกินไป กรุณาลองใหม่ภายหลัง',
  },
  INVALID_PAYMENT_FILTER: {
    status: 400,
    message:
      'status ต้องเป็น pending, successful, failed หรือ expired และ method ต้องเป็น card หรือ promptpay',
  },
} as const;

export type ProErrorCode = keyof typeof PRO_ERRORS;

/** `{ statusCode, message (Thai), errorCode }` like the unlock codes (task 15). */
export class ProException extends HttpException {
  constructor(readonly errorCode: ProErrorCode) {
    const { status, message } = PRO_ERRORS[errorCode];
    super({ statusCode: status, message, errorCode }, status);
  }
}

type DbError = {
  code?: string;
  errno?: number;
  driverError?: { code?: string; errno?: number };
};

function hasDbError(err: unknown, code: string, errno: number): boolean {
  const e = err as DbError;
  return (
    e?.code === code ||
    e?.errno === errno ||
    e?.driverError?.code === code ||
    e?.driverError?.errno === errno
  );
}

export function isDuplicateKey(err: unknown): boolean {
  return hasDbError(err, 'ER_DUP_ENTRY', 1062);
}

/** A row is still referenced by a FK (delete of a venue/plan in use). */
export function isRowReferenced(err: unknown): boolean {
  return hasDbError(err, 'ER_ROW_IS_REFERENCED_2', 1451);
}

/** A FK points to a row that does not exist (1452), e.g. deleted meanwhile. */
export function isMissingReference(err: unknown): boolean {
  return hasDbError(err, 'ER_NO_REFERENCED_ROW_2', 1452);
}

/** InnoDB chose this transaction as a deadlock victim (rolled back). */
export function isDeadlock(err: unknown): boolean {
  return hasDbError(err, 'ER_LOCK_DEADLOCK', 1213);
}

/** innodb_lock_wait_timeout ran out (1205). */
export function isLockWaitTimeout(err: unknown): boolean {
  return hasDbError(err, 'ER_LOCK_WAIT_TIMEOUT', 1205);
}
