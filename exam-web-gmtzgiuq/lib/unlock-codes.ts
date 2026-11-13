// โค้ด Unlock (task 15 / lumo3 งานที่ 2): ข้อความที่ผู้ใช้เห็น, ข้อความ error ตาม errorCode,
// การแสดงวันหมดสิทธิ์ และการตรวจฟอร์มแอดมิน — ไฟล์นี้ไม่ import lib/api หรือ lib/mock-exam (ใช้ได้ทุกที่ไม่วนกัน)

// ── คำที่ใช้บนเว็บ ────────────────────────────────────────
// lumo3 ใช้ "Unlock / Unlocked" (ดีไซน์ใหม่เขียน "ปลดล็อก" — ถ้าผู้ใช้ตัดสินใจเปลี่ยนคำ แก้ที่สองค่านี้)
export const UNLOCK_WORD = 'Unlock';
export const UNLOCKED_WORD = 'Unlocked';

export const UNLOCK_TEXT = {
  boxTitle: `กรอกโค้ด ${UNLOCK_WORD}`,
  boxSubtitle: 'ได้โค้ดแล้ว? กรอกที่นี่ ใช้ได้ 1 ครั้งต่อบัญชี',
  purchaseCodeTitle: `มีโค้ด? กรอกเพื่อ ${UNLOCK_WORD}`,
  inputLabel: `โค้ด ${UNLOCK_WORD}`,
  inputPlaceholder: 'เช่น K7M2XQ9PAB',
  submit: UNLOCK_WORD,
  submitting: 'กำลังตรวจโค้ด...',
  guestNote: 'ต้องเข้าสู่ระบบก่อนกรอกโค้ด',
  unlockedTitle: UNLOCKED_WORD,
  unlockedSubtitle: 'บัญชีของคุณได้สิทธิ์ทำชุดนี้แล้ว',
  unlockedSuccess: 'ใช้โค้ดสำเร็จ',
  expiredTitle: 'สิทธิ์ของคุณหมดอายุแล้ว',
  expiredSubtitle: 'กรอกโค้ดใหม่ (ของแคมเปญอื่น) เพื่อทำชุดนี้อีกครั้ง',
  lockedStatus: `ยังไม่ ${UNLOCK_WORD}`,
  emptyCode: 'กรุณากรอกโค้ด',
  successToast: `${UNLOCK_WORD} สำเร็จ เริ่มทำข้อสอบได้เลย`,
  examLocked: `ชุดข้อสอบนี้ต้อง ${UNLOCK_WORD} ก่อน`,
  lockedDuringExam: 'สิทธิ์ทำชุดนี้หมดอายุระหว่างทำ ระบบจึงบันทึกคำตอบและผลสอบไม่ได้',
  historyLocked: 'สิทธิ์ของชุดนี้หมดอายุ ดูโจทย์และเฉลยไม่ได้',
} as const;

/** toast หลังกรอกโค้ดสำเร็จ (โค้ดผูกหลายชุด → บอกจำนวนชุด) */
export function redeemSuccessMessage(unlockedCount: number): string {
  return unlockedCount > 1
    ? `${UNLOCK_WORD} สำเร็จ ${unlockedCount.toLocaleString('th-TH')} ชุด เริ่มทำข้อสอบได้เลย`
    : UNLOCK_TEXT.successToast;
}

// ── error ของ POST /unlock-codes/redeem ─────────────────────

/** ชื่อประเภทแคมเปญ (task 19) — ห้ามใช้คำว่า "ปลดล็อก" */
export const BATCH_KIND_LABELS: Record<'exam' | 'pro', string> = {
  exam: `${UNLOCK_WORD} ชุดข้อสอบ`,
  pro: 'ให้แพ็กเกจ Pro',
};

export const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FORMAT: 'รูปแบบโค้ดไม่ถูกต้อง',
  NOT_FOUND: 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง',
  DISABLED: 'โค้ดนี้ถูกปิดใช้งานแล้ว',
  EXPIRED: 'โค้ดนี้หมดอายุแล้ว',
  USED: 'โค้ดนี้ถูกใช้ไปแล้ว',
  ALREADY_REDEEMED: 'คุณใช้โค้ดนี้ไปแล้ว ใช้ซ้ำไม่ได้',
  BATCH_ALREADY_USED: 'บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว',
  NOT_FOR_THIS_EXAM: 'โค้ดนี้ใช้กับชุดข้อสอบนี้ไม่ได้',
  TOO_MANY_ATTEMPTS: 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่',
  // task 19: โค้ดแบบให้แพ็กเกจ Pro
  ALREADY_HIGHER_PLAN: 'คุณมีแพ็กเกจของสนามนี้ที่ระดับสูงกว่าหรือเท่ากันอยู่แล้ว โค้ดนี้จึงยังไม่ถูกใช้',
};

/**
 * ข้อความเมื่อกรอกโค้ดในหน้า /upgrade หรือสมาชิกของฉัน (ไม่ได้อยู่ในหน้าชุดข้อสอบ — ไม่ส่ง examId)
 * โค้ดแบบ Unlock ชุดข้อสอบ → API ตอบ NOT_FOR_THIS_EXAM → บอกให้ไปกรอกที่หน้าชุด
 */
export const PRO_REDEEM_ERROR_MESSAGES: Record<string, string> = {
  ...REDEEM_ERROR_MESSAGES,
  NOT_FOR_THIS_EXAM: 'โค้ดนี้ใช้กับชุดข้อสอบ กรุณากรอกที่หน้าชุดข้อสอบ',
};

export const PRO_CODE_TEXT = {
  toggle: 'มีโค้ด?',
  title: 'มีโค้ด? กรอกเพื่อรับแพ็กเกจ',
  subtitle: 'โค้ดที่ได้จากกิจกรรมหรือโปรโมชัน ใช้ได้ 1 ครั้งต่อบัญชี',
  inputLabel: 'โค้ด',
  submit: 'ใช้โค้ด',
  submitting: 'กำลังตรวจโค้ด...',
  guestNote: 'ต้องเข้าสู่ระบบก่อนกรอกโค้ด',
  /** ต่อแพ็กเกจที่ตัดบัตรอัตโนมัติแล้ว แต่รอบตัดบัตรถัดไปยังไม่เลื่อน (autoRenewDatesDiffer) */
  autoRenewNote: 'ต่ออายุสิทธิ์แล้ว แต่วันตัดบัตรรอบถัดไปยังเป็นวันเดิม',
} as const;

/** "ได้รับแพ็กเกจ PRO NETSAT ถึง 30 พ.ย. 2569" (ชื่อแพ็กเกจมีชื่อสนามอยู่แล้ว → ไม่ต่อชื่อสนามซ้ำ) */
export function proRedeemSuccessMessage(result: {
  venue: { name: string };
  plan: { name: string };
  currentPeriodEnd: string;
}): string {
  const plan = result.plan.name.trim();
  const venue = result.venue.name.trim();
  const name =
    venue && !plan.toLowerCase().includes(venue.toLowerCase()) ? [plan, venue].filter(Boolean).join(' ') : plan;
  const until = formatThaiDate(result.currentPeriodEnd);
  return `ได้รับแพ็กเกจ${name ? ` ${name}` : ''}${until ? ` ถึง ${until}` : ''}`;
}

/** ข้อความ error ของกล่อง "มีโค้ด?" (หน้า /upgrade, สมาชิกของฉัน) */
export function proRedeemErrorMessage(errorCode: string | null | undefined, apiMessage?: string | null): string {
  if (errorCode && PRO_REDEEM_ERROR_MESSAGES[errorCode]) return PRO_REDEEM_ERROR_MESSAGES[errorCode];
  return redeemErrorMessage(null, apiMessage);
}

const REDEEM_FALLBACK = 'ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

/**
 * ข้อความใต้ช่องโค้ด: รหัสที่รู้จัก → ข้อความของเว็บ (คุมคำเอง), ไม่รู้จักแต่ API ส่งข้อความไทยมา → ใช้ของ API,
 * ไม่มีอะไรเลย (เช่น network error) → ข้อความทั่วไป
 */
export function redeemErrorMessage(errorCode: string | null | undefined, apiMessage?: string | null): string {
  if (errorCode && REDEEM_ERROR_MESSAGES[errorCode]) return REDEEM_ERROR_MESSAGES[errorCode];
  if (apiMessage && /[฀-๿]/.test(apiMessage)) return apiMessage;
  return REDEEM_FALLBACK;
}

/** ค่าที่แสดงในช่องกรอก: ตัวพิมพ์ใหญ่อัตโนมัติ (API ไม่สนตัวพิมพ์และตัดช่องว่าง/ขีดเองอยู่แล้ว) */
export function formatCodeInput(value: string): string {
  return value.toUpperCase();
}

/** ค่าที่ส่ง API: ตัดช่องว่างหัวท้าย (ขีด/ช่องว่างกลางโค้ด API จัดการเอง) */
export function normalizeCodeForSubmit(value: string): string {
  return value.trim();
}

// ── วันหมดสิทธิ์ ──────────────────────────────────────────

const TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "30 พ.ย. 2569" (เวลาไทย) ค่าไม่ถูกต้อง → null */
export function formatThaiDate(value: string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString('th-TH', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
}

/** "30 พ.ย." (ใช้ในแถบหัว) */
export function formatThaiShortDate(value: string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString('th-TH', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
}

/** จำนวนวันที่เหลือ (ปัดขึ้น — เหลือ 3 ชม. = 1 วัน) หมดแล้ว → 0, ค่าไม่ถูกต้อง → null */
export function daysRemaining(expiresAt: string | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(expiresAt);
  if (!d) return null;
  const diff = d.getTime() - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

/** "ทำได้ถึง 30 พ.ย. 2569 · เหลือ 22 วัน" (ไม่มีวันหมด → "ทำได้ไม่จำกัดเวลา") */
export function formatAccessUntil(expiresAt: string | null | undefined, now: Date = new Date()): string {
  const date = formatThaiDate(expiresAt);
  const days = daysRemaining(expiresAt, now);
  if (!date || days == null) return 'ทำได้ไม่จำกัดเวลา';
  const left = days >= 1 ? `เหลือ ${days.toLocaleString('th-TH')} วัน` : 'เหลือไม่ถึง 1 วัน';
  return `ทำได้ถึง ${date} · ${left}`;
}

// ── ฟอร์มแอดมิน: สร้างแคมเปญ ────────────────────────────────

// ตรงกับ validation ของ API (สัญญา task 15)
export const MAX_BATCH_NAME = 150;
export const MAX_BATCH_CODES = 5000;
export const MAX_BATCH_ACCESS_DAYS = 3650;

export type UnlockBatchFormKind = 'exam' | 'pro';

export interface UnlockBatchForm {
  name: string;
  /** exam = Unlock ชุดข้อสอบ, pro = ให้แพ็กเกจ Pro (task 19) */
  kind: UnlockBatchFormKind;
  /** kind pro: สนามที่เลือก (ใช้กรอง dropdown แพ็กเกจ) */
  venueId: string;
  /** kind pro: แพ็กเกจที่ให้ */
  proPlanId: string;
  allMock: boolean;
  examIds: string[];
  /** ช่องกรอก (string) แปลงเป็น number ตอนส่ง */
  count: string;
  accessDays: string;
  /** ค่า datetime-local เวลาไทย ('' = ไม่กำหนด) */
  codeExpiresAt: string;
}

export type UnlockBatchField = 'name' | 'exams' | 'proPlan' | 'count' | 'accessDays' | 'codeExpiresAt';
export type UnlockBatchErrors = Partial<Record<UnlockBatchField, string>>;

export function createUnlockBatchForm(): UnlockBatchForm {
  return {
    name: '',
    kind: 'exam',
    venueId: '',
    proPlanId: '',
    allMock: false,
    examIds: [],
    count: '100',
    accessDays: '30',
    codeExpiresAt: '',
  };
}

const INT_PATTERN = /^\d+$/;

/**
 * ตรวจฟอร์มสร้างแคมเปญ คืน error แยกช่อง (ผ่านทั้งหมด → {})
 * `toIso` แปลงวันหมดอายุโค้ด (เวลาไทย) → ISO, `now` ใช้ตรวจว่าไม่ใช่เวลาที่ผ่านไปแล้ว
 */
export function validateUnlockBatchForm(
  form: UnlockBatchForm,
  toIso: (value: string) => string | null,
  now: Date = new Date(),
): UnlockBatchErrors {
  const errors: UnlockBatchErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'กรุณาตั้งชื่อแคมเปญ';
  else if (name.length > MAX_BATCH_NAME) errors.name = `ชื่อแคมเปญยาวได้ไม่เกิน ${MAX_BATCH_NAME} ตัวอักษร`;

  // ฟอร์มเก่าที่ไม่มี kind = exam
  if (form.kind === 'pro') {
    if (!form.proPlanId) errors.proPlan = 'กรุณาเลือกแพ็กเกจ';
  } else if (!form.allMock && form.examIds.length === 0) {
    errors.exams = 'กรุณาเลือกชุดข้อสอบอย่างน้อย 1 ชุด';
  }

  const count = form.count.trim();
  if (!INT_PATTERN.test(count) || Number(count) < 1 || Number(count) > MAX_BATCH_CODES) {
    errors.count = `จำนวนโค้ดต้องเป็นจำนวนเต็ม 1–${MAX_BATCH_CODES.toLocaleString('th-TH')}`;
  }

  const days = form.accessDays.trim();
  if (!INT_PATTERN.test(days) || Number(days) < 1 || Number(days) > MAX_BATCH_ACCESS_DAYS) {
    errors.accessDays =
      form.kind === 'pro'
        ? `จำนวนวันของแพ็กเกจต้องเป็น 1–${MAX_BATCH_ACCESS_DAYS.toLocaleString('th-TH')}`
        : `อายุการเข้าถึงต้องเป็นจำนวนวัน 1–${MAX_BATCH_ACCESS_DAYS.toLocaleString('th-TH')}`;
  }

  const expires = form.codeExpiresAt.trim();
  if (expires) {
    const iso = toIso(expires);
    if (!iso) errors.codeExpiresAt = 'วันหมดอายุโค้ดไม่ถูกต้อง';
    else if (new Date(iso).getTime() <= now.getTime()) errors.codeExpiresAt = 'วันหมดอายุโค้ดต้องเป็นเวลาในอนาคต';
  }
  return errors;
}

/** ช่องแรกที่ผิด (เรียงตามลำดับในฟอร์ม) ใช้ย้าย focus หลังกดสร้าง */
export function firstBatchErrorField(errors: UnlockBatchErrors): UnlockBatchField | null {
  const order: UnlockBatchField[] = ['name', 'exams', 'proPlan', 'count', 'accessDays', 'codeExpiresAt'];
  return order.find((f) => !!errors[f]) ?? null;
}

// ── สถานะโค้ดในตารางแอดมิน ──────────────────────────────────

export type UnlockCodeStatusFilter = 'all' | 'used' | 'unused' | 'disabled';

export const CODE_STATUS_FILTERS: { value: UnlockCodeStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'used', label: 'ใช้แล้ว' },
  { value: 'unused', label: 'ยังไม่ใช้' },
  { value: 'disabled', label: 'ปิด' },
];

/** ชื่อผู้ใช้ที่แสดง: ชื่อ-นามสกุล ไม่มี → null (แสดงอีเมลอย่างเดียว) */
export function formatUserName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim();
  return name || null;
}

/** ชื่อไฟล์จาก Content-Disposition (รองรับ filename*=UTF-8'') ไม่มี → fallback */
export function filenameFromContentDisposition(header: string | null | undefined, fallback: string): string {
  if (header) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
    if (star) {
      try {
        return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
      } catch {
        /* ใช้แบบ filename= ต่อ */
      }
    }
    const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/.exec(header);
    const value = plain?.[1] ?? plain?.[2];
    if (value && value.trim()) return value.trim();
  }
  return fallback;
}

/** ชื่อไฟล์สำรองจากชื่อแคมเปญ: ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ */
export function safeCsvFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '_').trim().slice(0, 100) || 'unlock-codes';
  return `${base}.csv`;
}
