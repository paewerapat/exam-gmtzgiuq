// โค้ดส่วนลด Pro (task 19): ข้อความ error ตาม errorCode, การแสดงมูลค่า/ขอบเขต/สถานะ และฟอร์มแอดมิน
// เป็น pure function ทดสอบแยกได้ (ไม่เรียก API)
import type {
  ProAdminVenue,
  ProDiscountCode,
  ProDiscountCodeInput,
  ProDiscountRedemptionStatus,
  ProDiscountType,
} from '@/lib/api/pro';
import { bahtToSatang, formatSatang, satangToBahtInput } from '@/lib/pro';
import { formatReleaseDate, toBangkokInputValue } from '@/lib/release-date';

// ── ตรงกับ validation ของ API (สัญญา task 19) ───────────────

export const DISCOUNT_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;
export const DISCOUNT_LIMITS = {
  codeMin: 3,
  codeMax: 40,
  description: 255,
  percentMin: 1,
  percentMax: 100,
  /** amount ขั้นต่ำ 1 บาท (= 100 สตางค์) */
  amountMinSatang: 100,
  maxRedemptions: 1000000,
  perUserLimit: 1000,
} as const;

/** ค่าที่แสดงในช่องโค้ด: ตัวพิมพ์ใหญ่ ตัดช่องว่าง (API เก็บตัวพิมพ์ใหญ่) */
export function formatDiscountCodeInput(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

// ── error ของโค้ดส่วนลด (quote.discountError / POST /pro/checkout 400) ──

export const DISCOUNT_ERROR_MESSAGES: Record<string, string> = {
  DISCOUNT_NOT_FOUND: 'ไม่พบโค้ดส่วนลดนี้ กรุณาตรวจสอบอีกครั้ง',
  DISCOUNT_INACTIVE: 'โค้ดส่วนลดนี้ถูกปิดใช้งานแล้ว',
  DISCOUNT_EXPIRED: 'โค้ดส่วนลดนี้หมดอายุแล้ว',
  DISCOUNT_NOT_STARTED: 'โค้ดส่วนลดนี้ยังไม่เริ่มใช้งาน',
  DISCOUNT_NOT_APPLICABLE: 'โค้ดส่วนลดนี้ใช้กับแพ็กเกจนี้ไม่ได้',
  DISCOUNT_USED_UP: 'โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว',
  DISCOUNT_ALREADY_USED: 'คุณใช้โค้ดส่วนลดนี้ครบจำนวนครั้งที่กำหนดแล้ว',
  DISCOUNT_TOO_LARGE: 'โค้ดส่วนลดนี้ลดเต็มจำนวน ยังใช้ชำระเงินไม่ได้',
  AMOUNT_TOO_LOW: 'ยอดหลังหักส่วนลดต่ำกว่าขั้นต่ำ 20 บาท จึงใช้โค้ดนี้ไม่ได้',
  INVALID_FORMAT: 'รูปแบบโค้ดส่วนลดไม่ถูกต้อง',
  TOO_MANY_ATTEMPTS: 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่',
};

export const DISCOUNT_ERROR_FALLBACK = 'ใช้โค้ดส่วนลดนี้ไม่ได้';
export const DISCOUNT_EMPTY_CODE = 'กรุณากรอกโค้ดส่วนลด';

const THAI = /[ก-๙]/;

/** errorCode ที่หมายถึง "โค้ดส่วนลดใช้ไม่ได้" (checkout ตอบกลับ → เอาโค้ดออกแล้วคิดยอดใหม่) */
export function isDiscountErrorCode(errorCode: string | null | undefined): boolean {
  return !!errorCode && (errorCode.startsWith('DISCOUNT_') || errorCode === 'AMOUNT_TOO_LOW');
}

/** รหัสที่รู้จัก → ข้อความของเว็บ, ไม่รู้จักแต่ API ส่งไทยมา → ของ API, อื่น ๆ → fallback */
export function discountErrorMessage(errorCode: string | null | undefined, apiMessage?: string | null): string {
  if (errorCode && DISCOUNT_ERROR_MESSAGES[errorCode]) return DISCOUNT_ERROR_MESSAGES[errorCode];
  if (apiMessage && THAI.test(apiMessage)) return apiMessage;
  return DISCOUNT_ERROR_FALLBACK;
}

// ── การแสดงผล ─────────────────────────────────────────────

/** "20%" / "฿50" */
export function formatDiscountValue(type: ProDiscountType, value: number): string {
  return type === 'percent' ? `${value.toLocaleString('th-TH')}%` : formatSatang(value);
}

export const DISCOUNT_TYPE_LABELS: Record<ProDiscountType, string> = {
  percent: 'เปอร์เซ็นต์',
  amount: 'จำนวนบาท',
};

/** ขอบเขต: "ทุกสนาม" / "NETSAT · ทุกแพ็กเกจ" / "NETSAT · PRO" (ชื่อจาก API ก่อน ไม่มี → หาจาก config) */
export function discountScopeLabel(
  code: Pick<ProDiscountCode, 'venueId' | 'planId' | 'venue' | 'plan'>,
  venues: ProAdminVenue[],
): string {
  if (!code.venueId && !code.planId) return 'ทุกสนาม';
  const venue = venues.find((v) => v.id === code.venueId) ?? venues.find((v) => v.plans.some((p) => p.id === code.planId));
  const plan = code.planId ? venues.flatMap((v) => v.plans).find((p) => p.id === code.planId) : null;
  const venueName = code.venue?.name || venue?.name || 'สนามที่ถูกลบ';
  if (!code.planId) return `${venueName} · ทุกแพ็กเกจ`;
  return `${venueName} · ${code.plan?.name || plan?.name || 'แพ็กเกจที่ถูกลบ'}`;
}

/** ช่วงเวลา: "ไม่จำกัดเวลา" / "ตั้งแต่ …" / "ถึง …" / "… – …" (เวลาไทย) */
export function formatDiscountPeriod(startsAt: string | null, endsAt: string | null): string {
  const start = startsAt ? formatReleaseDate(startsAt) : '';
  const end = endsAt ? formatReleaseDate(endsAt) : '';
  if (start && end) return `${start} – ${end}`;
  if (start) return `ตั้งแต่ ${start}`;
  if (end) return `ถึง ${end}`;
  return 'ไม่จำกัดเวลา';
}

/** "ใช้แล้ว 3 (+2 จอง) / 100" — จอง = รายการที่รอชำระ (นับรวมในสิทธิ์ที่เหลือ) ไม่มีจอง → ไม่แสดงวงเล็บ */
export function formatDiscountUsage(redeemedCount: number, reservedCount: number, maxRedemptions: number | null): string {
  const reserved = reservedCount > 0 ? ` (+${reservedCount.toLocaleString('th-TH')} จอง)` : '';
  const max = maxRedemptions == null ? 'ไม่จำกัด' : maxRedemptions.toLocaleString('th-TH');
  return `ใช้แล้ว ${redeemedCount.toLocaleString('th-TH')}${reserved} / ${max}`;
}

export type DiscountCodeState = 'active' | 'inactive' | 'scheduled' | 'expired' | 'usedUp';

const API_STATES: Record<string, DiscountCodeState> = {
  active: 'active',
  inactive: 'inactive',
  scheduled: 'scheduled',
  expired: 'expired',
  used_up: 'usedUp',
};

/**
 * สถานะที่แสดงในตาราง: ใช้ `status` จาก API (รวมรายการที่จองไว้) — API ไม่ส่ง/ค่าไม่รู้จัก → คิดเอง
 * ลำดับเมื่อคิดเอง: ปิด > หมดอายุ > ใช้ครบ (ใช้แล้ว + จอง) > ยังไม่เริ่ม > ใช้งานได้
 */
export function discountCodeState(
  code: Pick<ProDiscountCode, 'isActive' | 'startsAt' | 'endsAt' | 'maxRedemptions' | 'redeemedCount'> &
    Partial<Pick<ProDiscountCode, 'status' | 'reservedCount'>>,
  now: Date = new Date(),
): DiscountCodeState {
  if (code.status && API_STATES[code.status]) return API_STATES[code.status];
  if (!code.isActive) return 'inactive';
  const t = now.getTime();
  if (code.endsAt && new Date(code.endsAt).getTime() <= t) return 'expired';
  if (code.maxRedemptions != null && code.redeemedCount + (code.reservedCount ?? 0) >= code.maxRedemptions) return 'usedUp';
  if (code.startsAt && new Date(code.startsAt).getTime() > t) return 'scheduled';
  return 'active';
}

export const DISCOUNT_STATE_LABELS: Record<DiscountCodeState, string> = {
  active: 'ใช้งานได้',
  inactive: 'ปิดอยู่',
  scheduled: 'ยังไม่เริ่ม',
  expired: 'หมดอายุ',
  usedUp: 'ใช้ครบแล้ว',
};

export const DISCOUNT_STATE_CLASSES: Record<DiscountCodeState, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  scheduled: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  expired: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  usedUp: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  reserved: 'รอชำระ',
  used: 'ใช้แล้ว',
  released: 'คืนสิทธิ์',
};

export const REDEMPTION_STATUS_CLASSES: Record<string, string> = {
  reserved: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  used: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  released: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export function redemptionStatusLabel(status: ProDiscountRedemptionStatus): string {
  return REDEMPTION_STATUS_LABELS[status] ?? (status || '-');
}

export function redemptionStatusClass(status: ProDiscountRedemptionStatus): string {
  return REDEMPTION_STATUS_CLASSES[status] ?? REDEMPTION_STATUS_CLASSES.released;
}

// ── ฟอร์มแอดมิน ─────────────────────────────────────────────

export interface DiscountCodeForm {
  code: string;
  description: string;
  discountType: ProDiscountType;
  /** percent: เปอร์เซ็นต์ / amount: บาท (แปลงเป็นสตางค์ตอนส่ง) */
  value: string;
  /** '' = ทุกสนาม */
  venueId: string;
  /** '' = ทุกแพ็กเกจ */
  planId: string;
  /** datetime-local เวลาไทย ('' = ไม่กำหนด) */
  startsAt: string;
  endsAt: string;
  /** '' = ไม่จำกัด */
  maxRedemptions: string;
  perUserLimit: string;
  isActive: boolean;
}

export type DiscountFormField = 'code' | 'description' | 'value' | 'startsAt' | 'endsAt' | 'maxRedemptions' | 'perUserLimit';
export type DiscountFormErrors = Partial<Record<DiscountFormField, string>>;

export const DISCOUNT_FIELD_ORDER: DiscountFormField[] = [
  'code',
  'description',
  'value',
  'startsAt',
  'endsAt',
  'maxRedemptions',
  'perUserLimit',
];

/** ค่าเริ่มต้นของฟอร์ม (แก้ไข → ค่าจากโค้ดเดิม) */
export function createDiscountForm(code?: ProDiscountCode | null): DiscountCodeForm {
  if (!code) {
    return {
      code: '',
      description: '',
      discountType: 'percent',
      value: '',
      venueId: '',
      planId: '',
      startsAt: '',
      endsAt: '',
      maxRedemptions: '',
      perUserLimit: '1',
      isActive: true,
    };
  }
  return {
    code: code.code,
    description: code.description ?? '',
    discountType: code.discountType,
    value: code.discountType === 'percent' ? String(code.discountValue) : satangToBahtInput(code.discountValue),
    venueId: code.venueId ?? '',
    planId: code.planId ?? '',
    startsAt: toBangkokInputValue(code.startsAt),
    endsAt: toBangkokInputValue(code.endsAt),
    maxRedemptions: code.maxRedemptions == null ? '' : String(code.maxRedemptions),
    perUserLimit: String(code.perUserLimit),
    isActive: code.isActive,
  };
}

const INT_PATTERN = /^\d+$/;

/** มูลค่าส่วนลดที่ส่ง API: percent = จำนวนเต็ม 1–100 / amount = บาท → สตางค์ (≥100) — ผิด → null */
export function discountValueToApi(type: ProDiscountType, value: string): number | null {
  const v = value.trim();
  if (type === 'percent') {
    if (!INT_PATTERN.test(v)) return null;
    const n = Number(v);
    return n >= DISCOUNT_LIMITS.percentMin && n <= DISCOUNT_LIMITS.percentMax ? n : null;
  }
  const satang = bahtToSatang(v);
  return satang != null && satang >= DISCOUNT_LIMITS.amountMinSatang ? satang : null;
}

/**
 * ตรวจฟอร์ม คืน error แยกช่อง (ผ่าน → {})
 * `toIso` แปลง datetime-local (เวลาไทย) → ISO
 */
export function validateDiscountForm(form: DiscountCodeForm, toIso: (value: string) => string | null): DiscountFormErrors {
  const errors: DiscountFormErrors = {};
  const code = formatDiscountCodeInput(form.code);
  if (!code) errors.code = 'กรุณากรอกโค้ด';
  else if (!DISCOUNT_CODE_PATTERN.test(code)) {
    errors.code = `โค้ดต้องยาว ${DISCOUNT_LIMITS.codeMin}–${DISCOUNT_LIMITS.codeMax} ตัว ใช้ได้เฉพาะ A–Z 0–9 - และ _`;
  }

  if (form.description.trim().length > DISCOUNT_LIMITS.description) {
    errors.description = `คำอธิบายยาวได้ไม่เกิน ${DISCOUNT_LIMITS.description} ตัวอักษร`;
  }

  if (discountValueToApi(form.discountType, form.value) == null) {
    errors.value =
      form.discountType === 'percent'
        ? 'ส่วนลดต้องเป็นจำนวนเต็ม 1–100%'
        : 'ส่วนลดต้องเป็นจำนวนบาทตั้งแต่ 1 บาทขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)';
  }

  const start = form.startsAt.trim() ? toIso(form.startsAt.trim()) : null;
  const end = form.endsAt.trim() ? toIso(form.endsAt.trim()) : null;
  if (form.startsAt.trim() && !start) errors.startsAt = 'วันเริ่มไม่ถูกต้อง';
  if (form.endsAt.trim() && !end) errors.endsAt = 'วันสิ้นสุดไม่ถูกต้อง';
  else if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    errors.endsAt = 'วันสิ้นสุดต้องอยู่หลังวันเริ่ม';
  }

  const max = form.maxRedemptions.trim();
  if (max && (!INT_PATTERN.test(max) || Number(max) < 1 || Number(max) > DISCOUNT_LIMITS.maxRedemptions)) {
    errors.maxRedemptions = 'จำนวนครั้งสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 1 (ว่าง = ไม่จำกัด)';
  }
  const per = form.perUserLimit.trim();
  if (!INT_PATTERN.test(per) || Number(per) < 1 || Number(per) > DISCOUNT_LIMITS.perUserLimit) {
    errors.perUserLimit = `ใช้ได้ต่อบัญชีต้องเป็นจำนวนเต็ม 1–${DISCOUNT_LIMITS.perUserLimit.toLocaleString('th-TH')}`;
  }
  return errors;
}

export function firstDiscountErrorField(errors: DiscountFormErrors): DiscountFormField | null {
  return DISCOUNT_FIELD_ORDER.find((f) => !!errors[f]) ?? null;
}

/** ฟอร์มที่ผ่าน validate → body ของ API (เลือกแพ็กเกจโดยไม่เลือกสนาม → ไม่ส่ง planId) */
export function discountFormToInput(form: DiscountCodeForm, toIso: (value: string) => string | null): ProDiscountCodeInput {
  const venueId = form.venueId || null;
  return {
    code: formatDiscountCodeInput(form.code),
    description: form.description.trim() || null,
    discountType: form.discountType,
    discountValue: discountValueToApi(form.discountType, form.value) ?? 0,
    venueId,
    planId: venueId ? form.planId || null : null,
    startsAt: form.startsAt.trim() ? toIso(form.startsAt.trim()) : null,
    endsAt: form.endsAt.trim() ? toIso(form.endsAt.trim()) : null,
    maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions.trim()) : null,
    perUserLimit: Number(form.perUserLimit.trim()),
    isActive: form.isActive,
  };
}

/** แก้ไข: ส่งเฉพาะฟิลด์ที่เปลี่ยน (code/ประเภท/มูลค่าที่ไม่ได้แตะจะไม่ทำให้ API ตอบ 409) */
export function diffDiscountInput(original: ProDiscountCode, next: ProDiscountCodeInput): Partial<ProDiscountCodeInput> {
  const before: ProDiscountCodeInput = {
    code: original.code,
    description: original.description,
    discountType: original.discountType,
    discountValue: original.discountValue,
    venueId: original.venueId,
    planId: original.planId,
    startsAt: original.startsAt,
    endsAt: original.endsAt,
    maxRedemptions: original.maxRedemptions,
    perUserLimit: original.perUserLimit,
    isActive: original.isActive,
  };
  const sameTime = (a: string | null, b: string | null) =>
    a === b || (!!a && !!b && new Date(a).getTime() === new Date(b).getTime());
  const out: Partial<ProDiscountCodeInput> = {};
  (Object.keys(next) as (keyof ProDiscountCodeInput)[]).forEach((key) => {
    const a = before[key];
    const b = next[key];
    const same = key === 'startsAt' || key === 'endsAt' ? sameTime(a as string | null, b as string | null) : a === b;
    if (!same) (out as Record<string, unknown>)[key] = b;
  });
  return out;
}
