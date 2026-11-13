// helper ของสมาชิก Pro (task 17): ราคา, สถานะสิทธิ์, editor ตารางเปรียบเทียบ, validate ฟอร์มแพ็กเกจ
// ฟังก์ชันใน editor เป็น pure (คืนค่าใหม่ ไม่แก้ของเดิม) เพื่อใช้กับ setState และทดสอบแยกได้
import type {
  Comparison,
  ComparisonCell,
  ComparisonGroup,
  ComparisonRow,
  ProEntitlements,
  ProMySubscription,
  ProPlanInput,
  ProSubscriptionStatus,
} from '@/lib/api/pro';

// ── error จาก API (/pro/*) ─────────────────────────────────

/** ข้อความไทยของ errorCode ที่ต้องบอกวิธีแก้ให้ชัด (กฎแพ็กเกจฟรี) — code อื่นใช้ข้อความไทยจาก API ตามเดิม */
export const PRO_ERROR_MESSAGES: Record<string, string> = {
  FREE_PLAN_MOCK_PURCHASE: 'แพ็กเกจระดับ 0 (ฟรี) ให้สิทธิ์ "ชุด Mock ที่ต้องซื้อ" ไม่ได้ ปิดสิทธิ์นี้หรือเปลี่ยนระดับเป็น 1 ขึ้นไป',
  FREE_PLAN_EXISTS: 'สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อยู่แล้ว มีได้สนามละ 1 แพ็กเกจ',
  FREE_PLAN_PRICE: 'แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0 และเปิดให้ซื้อไม่ได้',
  PURCHASABLE_NEEDS_PRICE: 'แพ็กเกจที่เปิดให้ซื้อต้องมีราคามากกว่า 0',
};

// มีอักษรไทย (ก–๙) = ข้อความจาก API เป็นภาษาไทย
const THAI = /[ก-๙]/;

/** error → ข้อความไทยที่แสดง: errorCode ที่รู้จัก → ข้อความในตาราง / ข้อความไทยจาก API → ใช้ตามนั้น / อื่น ๆ → fallback */
export function proErrorMessage(err: unknown, fallback: string): string {
  const e = err as { errorCode?: unknown; message?: unknown } | null;
  if (e && typeof e.errorCode === 'string' && PRO_ERROR_MESSAGES[e.errorCode]) return PRO_ERROR_MESSAGES[e.errorCode];
  if (e && typeof e.message === 'string' && THAI.test(e.message)) return e.message;
  return fallback;
}

// ── ราคา / วันที่ / สถานะ ─────────────────────────────────────

/** 19900 → "฿199" / 19950 → "฿199.50" / 129900 → "฿1,299" */
export function formatSatang(satang: number): string {
  const safe = Number.isFinite(satang) ? Math.max(0, Math.round(satang)) : 0;
  const whole = safe % 100 === 0;
  return `฿${(safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** ช่องราคาในฟอร์มแอดมิน (บาท) → สตางค์ — ว่าง/ติดลบ/ทศนิยมเกิน 2 ตำแหน่ง → null */
export function bahtToSatang(value: string): number | null {
  const v = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** สตางค์ → ข้อความในช่องราคา (บาท) */
export function satangToBahtInput(satang: number): string {
  return satang % 100 === 0 ? String(satang / 100) : (satang / 100).toFixed(2);
}

/** สิทธิ์ที่ยังใช้ได้ = status active และยังไม่ถึงวันหมดอายุ */
export function isSubscriptionLive(
  sub: { status: ProSubscriptionStatus; currentPeriodEnd: string },
  now: Date = new Date(),
): boolean {
  if (sub.status !== 'active') return false;
  const end = new Date(sub.currentPeriodEnd).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

/** สิทธิ์ของสนามนี้ที่ยังใช้ได้ (ถ้ามีหลายแถวเอาที่หมดช้าสุด) */
export function findLiveSubscription(
  my: ProMySubscription[],
  venueId: string,
  now: Date = new Date(),
): ProMySubscription | null {
  let best: ProMySubscription | null = null;
  for (const s of my) {
    if (s.venueId !== venueId || !isSubscriptionLive(s, now)) continue;
    if (!best || new Date(s.currentPeriodEnd).getTime() > new Date(best.currentPeriodEnd).getTime()) best = s;
  }
  return best;
}

/** สถานะที่แสดงในตารางแอดมิน — active ที่เลยวันหมดอายุนับเป็น expired */
export function effectiveSubscriptionStatus(
  sub: { status: ProSubscriptionStatus; currentPeriodEnd: string },
  now: Date = new Date(),
): ProSubscriptionStatus {
  if (sub.status === 'active' && !isSubscriptionLive(sub, now)) return 'expired';
  return sub.status;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'ใช้งานอยู่',
  expired: 'หมดอายุ',
  revoked: 'ถอนสิทธิ์แล้ว',
};

export const SUBSCRIPTION_STATUS_CLASSES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  expired: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  revoked: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export function subscriptionStatusLabel(status: ProSubscriptionStatus): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

export const SUBSCRIPTION_SOURCE_LABELS: Record<string, string> = {
  admin: 'แอดมินให้สิทธิ์',
  card: 'บัตร',
  promptpay: 'PromptPay',
  code: 'โค้ด',
};

export function subscriptionSourceLabel(source: string): string {
  return SUBSCRIPTION_SOURCE_LABELS[source] ?? (source || '-');
}

// ── ตารางเปรียบเทียบ: ขีดจำกัดตามสัญญา API ───────────────────

export const COMPARISON_LIMITS = {
  groups: 20,
  rowsPerGroup: 50,
  groupTitle: 100,
  label: 150,
  sublabel: 200,
  text: 50,
  subtext: 100,
} as const;

let idSeq = 0;
/** id ภายใน editor (ใช้เป็น React key ให้ focus ตามแถวตอนเลื่อน) */
export function newEditorId(prefix = 'cmp'): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

/** ใส่ id ให้ทุกกลุ่ม/แถว (ตอนโหลดเข้า editor) */
export function withEditorIds(comparison: Comparison): Comparison {
  return {
    groups: comparison.groups.map((g) => ({
      ...g,
      id: g.id ?? newEditorId('g'),
      rows: g.rows.map((r) => ({ ...r, id: r.id ?? newEditorId('r') })),
    })),
  };
}

/** สลับตำแหน่ง index กับเพื่อนบ้าน (dir -1 ขึ้น / +1 ลง) — ขอบ = คืนของเดิม */
export function moveItem<T>(items: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function mapGroup(c: Comparison, gi: number, fn: (g: ComparisonGroup) => ComparisonGroup): Comparison {
  return { groups: c.groups.map((g, i) => (i === gi ? fn(g) : g)) };
}

function mapRow(c: Comparison, gi: number, ri: number, fn: (r: ComparisonRow) => ComparisonRow): Comparison {
  return mapGroup(c, gi, (g) => ({ ...g, rows: g.rows.map((r, i) => (i === ri ? fn(r) : r)) }));
}

export function addGroup(c: Comparison, title = ''): Comparison {
  if (c.groups.length >= COMPARISON_LIMITS.groups) return c;
  return { groups: [...c.groups, { id: newEditorId('g'), title, rows: [] }] };
}

export function removeGroup(c: Comparison, gi: number): Comparison {
  return { groups: c.groups.filter((_, i) => i !== gi) };
}

export function moveGroup(c: Comparison, gi: number, dir: -1 | 1): Comparison {
  return { groups: moveItem(c.groups, gi, dir) };
}

export function updateGroupTitle(c: Comparison, gi: number, title: string): Comparison {
  return mapGroup(c, gi, (g) => ({ ...g, title }));
}

export function addRow(c: Comparison, gi: number): Comparison {
  return mapGroup(c, gi, (g) =>
    g.rows.length >= COMPARISON_LIMITS.rowsPerGroup
      ? g
      : { ...g, rows: [...g.rows, { id: newEditorId('r'), label: '', cells: {} }] },
  );
}

export function removeRow(c: Comparison, gi: number, ri: number): Comparison {
  return mapGroup(c, gi, (g) => ({ ...g, rows: g.rows.filter((_, i) => i !== ri) }));
}

export function moveRow(c: Comparison, gi: number, ri: number, dir: -1 | 1): Comparison {
  return mapGroup(c, gi, (g) => ({ ...g, rows: moveItem(g.rows, ri, dir) }));
}

export function updateRow(
  c: Comparison,
  gi: number,
  ri: number,
  patch: Partial<Pick<ComparisonRow, 'label' | 'sublabel'>>,
): Comparison {
  return mapRow(c, gi, ri, (r) => ({ ...r, ...patch }));
}

/** ตั้ง cell ของแพ็กเกจ (null = ลบ cell → หน้าเว็บแสดงว่าง) */
export function setCell(c: Comparison, gi: number, ri: number, planCode: string, cell: ComparisonCell | null): Comparison {
  return mapRow(c, gi, ri, (r) => {
    const cells = { ...r.cells };
    if (cell) cells[planCode] = cell;
    else delete cells[planCode];
    return { ...r, cells };
  });
}

/** เปลี่ยนชนิด cell โดยเก็บข้อความเดิมไว้ (สลับ ✓ แล้วกลับมาเป็นข้อความ ข้อความยังอยู่) */
export function changeCellType(
  c: Comparison,
  gi: number,
  ri: number,
  planCode: string,
  type: ComparisonCell['type'] | 'none',
): Comparison {
  if (type === 'none') return setCell(c, gi, ri, planCode, null);
  const prev = c.groups[gi]?.rows[ri]?.cells[planCode];
  if (type === 'text') {
    return setCell(c, gi, ri, planCode, { type, text: prev?.text ?? '', subtext: prev?.subtext });
  }
  return setCell(c, gi, ri, planCode, { ...prev, type });
}

/** validate ก่อนบันทึก (API ตรวจซ้ำ) → ข้อความไทย หรือ null */
export function validateComparison(c: Comparison): string | null {
  const L = COMPARISON_LIMITS;
  if (c.groups.length > L.groups) return `มีกลุ่มได้ไม่เกิน ${L.groups} กลุ่ม`;
  for (let gi = 0; gi < c.groups.length; gi++) {
    const g = c.groups[gi];
    const gName = `กลุ่มที่ ${gi + 1}`;
    if (!g.title.trim()) return `${gName}: กรุณากรอกชื่อกลุ่ม`;
    if (g.title.length > L.groupTitle) return `${gName}: ชื่อกลุ่มยาวเกิน ${L.groupTitle} ตัวอักษร`;
    if (g.rows.length > L.rowsPerGroup) return `${gName}: มีแถวได้ไม่เกิน ${L.rowsPerGroup} แถว`;
    for (let ri = 0; ri < g.rows.length; ri++) {
      const r = g.rows[ri];
      const rName = `${gName} แถวที่ ${ri + 1}`;
      if (!r.label.trim()) return `${rName}: กรุณากรอกชื่อแถว`;
      if (r.label.length > L.label) return `${rName}: ชื่อแถวยาวเกิน ${L.label} ตัวอักษร`;
      if ((r.sublabel ?? '').length > L.sublabel) return `${rName}: คำอธิบายยาวเกิน ${L.sublabel} ตัวอักษร`;
      for (const cell of Object.values(r.cells)) {
        if (cell.type !== 'text') continue;
        if (!(cell.text ?? '').trim()) return `${rName}: ช่องแบบข้อความต้องมีข้อความ`;
        if ((cell.text ?? '').length > L.text) return `${rName}: ข้อความในช่องยาวเกิน ${L.text} ตัวอักษร`;
        if ((cell.subtext ?? '').length > L.subtext) return `${rName}: ข้อความรองยาวเกิน ${L.subtext} ตัวอักษร`;
      }
    }
  }
  return null;
}

// ── ฟอร์มแพ็กเกจ ──────────────────────────────────────────────

export const DEFAULT_ENTITLEMENTS: ProEntitlements = {
  challenge: false,
  beyond: false,
  predictedSets: 1,
  solutions: false,
  analytics: false,
  mockPurchase: false,
};

/** สิทธิ์แบบเปิด/ปิด (ลำดับในฟอร์ม) */
export const ENTITLEMENT_TOGGLES: { key: 'challenge' | 'beyond' | 'solutions' | 'analytics' | 'mockPurchase'; label: string; hint: string }[] = [
  { key: 'challenge', label: 'ข้อ Challenge', hint: 'ทำข้อ Challenge ของสนามนี้ได้' },
  { key: 'beyond', label: 'ข้อ Beyond', hint: 'ทำข้อ Beyond ของสนามนี้ได้' },
  { key: 'solutions', label: 'เฉลยพร้อมวิธีทำ', hint: 'ดูเฉลยละเอียดของ Predicted Exam' },
  { key: 'analytics', label: 'Analytics', hint: 'ดูรายงานวิเคราะห์ของสนามนี้' },
  { key: 'mockPurchase', label: 'ชุด Mock ที่ต้องซื้อ', hint: 'เข้าชุด Mock แบบ "ต้องซื้อ" ของสนามนี้ได้' },
];

export const PLAN_LIMITS = {
  code: 30,
  name: 50,
  tagline: 150,
  priceUnit: 30,
  priceNote: 150,
  buttonText: 50,
  badge: 30,
  periodDaysMax: 3650,
} as const;

/** รหัสแพ็กเกจ / key ของสนาม (ตรงกับ PRO_CODE_PATTERN ของ API) */
export const PLAN_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,29}$/;
export const MAX_PREDICTED_SETS = 1000;

/** validate ฟอร์มแพ็กเกจ (ตามกฎ API) → ข้อความไทย หรือ null */
export function validatePlanInput(
  input: ProPlanInput,
  otherCodes: string[] = [],
  /** สนามนี้มีแพ็กเกจระดับ 0 อื่นอยู่แล้ว (API ตอบ 409 FREE_PLAN_EXISTS) */
  otherFreePlanExists = false,
): string | null {
  const L = PLAN_LIMITS;
  const code = input.code.trim();
  if (!code) return 'กรุณากรอกรหัสแพ็กเกจ';
  if (code.length > L.code) return `รหัสแพ็กเกจยาวเกิน ${L.code} ตัวอักษร`;
  if (!PLAN_CODE_PATTERN.test(code)) return 'รหัสแพ็กเกจใช้ได้เฉพาะ a-z, 0-9, - และ _ (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)';
  if (otherCodes.includes(code)) return 'รหัสแพ็กเกจนี้มีอยู่แล้วในสนามนี้';
  if (!input.name.trim()) return 'กรุณากรอกชื่อแพ็กเกจ';
  if (input.name.length > L.name) return `ชื่อแพ็กเกจยาวเกิน ${L.name} ตัวอักษร`;
  if (!Number.isInteger(input.rank) || input.rank < 0) return 'ระดับต้องเป็นจำนวนเต็มตั้งแต่ 0';
  if (!Number.isInteger(input.priceSatang) || input.priceSatang < 0) return 'ราคาไม่ถูกต้อง';
  if (input.rank === 0 && input.priceSatang > 0) return 'แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0';
  if (input.rank === 0 && input.isPurchasable) return 'แพ็กเกจระดับ 0 (ฟรี) เปิดให้ซื้อไม่ได้';
  if (input.rank === 0 && otherFreePlanExists) return PRO_ERROR_MESSAGES.FREE_PLAN_EXISTS;
  if (input.rank === 0 && input.entitlements.mockPurchase === true) return PRO_ERROR_MESSAGES.FREE_PLAN_MOCK_PURCHASE;
  if (input.rank > 0 && input.isPurchasable && input.priceSatang <= 0) return PRO_ERROR_MESSAGES.PURCHASABLE_NEEDS_PRICE;
  if (!Number.isInteger(input.periodDays) || input.periodDays < 1 || input.periodDays > L.periodDaysMax)
    return `อายุแพ็กเกจต้องอยู่ระหว่าง 1–${L.periodDaysMax.toLocaleString('th-TH')} วัน`;
  if (!input.buttonText.trim()) return 'กรุณากรอกข้อความปุ่ม';
  if (input.buttonText.length > L.buttonText) return `ข้อความปุ่มยาวเกิน ${L.buttonText} ตัวอักษร`;
  if ((input.tagline ?? '').length > L.tagline) return `คำโปรยยาวเกิน ${L.tagline} ตัวอักษร`;
  if ((input.priceUnit ?? '').length > L.priceUnit) return `หน่วยราคายาวเกิน ${L.priceUnit} ตัวอักษร`;
  if ((input.priceNote ?? '').length > L.priceNote) return `หมายเหตุราคายาวเกิน ${L.priceNote} ตัวอักษร`;
  if ((input.badge ?? '').length > L.badge) return `ป้ายยาวเกิน ${L.badge} ตัวอักษร`;
  const sets = input.entitlements.predictedSets;
  if (sets !== null && (!Number.isInteger(sets) || sets < 0 || sets > MAX_PREDICTED_SETS))
    return `จำนวนชุด Predicted ต้องเป็นจำนวนเต็ม 0–${MAX_PREDICTED_SETS.toLocaleString('th-TH')}`;
  return null;
}

/** validate ฟอร์มสนาม → ข้อความไทย หรือ null */
export function validateVenueInput(
  input: { key: string; name: string; description: string | null },
  otherKeys: string[] = [],
): string | null {
  const key = input.key.trim();
  if (!key) return 'กรุณากรอก key ของสนาม';
  if (!PLAN_CODE_PATTERN.test(key)) return 'key ใช้ได้เฉพาะ a-z, 0-9, - และ _ (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข ไม่เกิน 30 ตัว)';
  if (otherKeys.includes(key)) return 'key นี้มีสนามอื่นใช้แล้ว';
  if (!input.name.trim()) return 'กรุณากรอกชื่อสนาม';
  if (input.name.length > VENUE_LIMITS.name) return `ชื่อสนามยาวเกิน ${VENUE_LIMITS.name} ตัวอักษร`;
  if ((input.description ?? '').length > VENUE_LIMITS.description)
    return `คำอธิบายยาวเกิน ${VENUE_LIMITS.description} ตัวอักษร`;
  return null;
}

export const VENUE_LIMITS = { name: 100, description: 500 } as const;

/** แถวสมาชิกที่บัญชีผู้ใช้ถูกลบไปแล้ว (API ส่ง user: null) */
export const DELETED_USER_LABEL = '(ผู้ใช้ถูกลบ)';

/** ชื่อเต็มของผู้ใช้ (ไม่มี → อีเมล) */
export function displayUserName(user: { email: string; firstName: string | null; lastName: string | null } | null): string {
  if (!user) return DELETED_USER_LABEL;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email;
}
