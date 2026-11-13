// ชุด Mock Exam (task 11): ชนิดข้อมูล การแปลงค่าจาก API ป้ายสถานะ ปุ่มหลัก และฟอร์มแอดมิน
// + สิทธิ์ของบัญชี (`access`) และ "วิธีรับโค้ด" (`codeInstructions`) ของ task 15
// ไฟล์นี้ไม่ import อะไรจาก lib/api เพื่อให้ lib/api/exams ใช้ตัวแปลงค่าได้โดยไม่วนกัน
import { UNLOCK_WORD, UNLOCKED_WORD } from './unlock-codes';

export type MockAccessType = 'free' | 'code' | 'purchase';
export type ExamLevel = 'easy' | 'medium' | 'hard';

/** คำอธิบายชุดข้อสอบแบบ block เรียงตามที่แอดมินจัด */
export type DetailBlock = { type: 'text'; text: string } | { type: 'image'; url: string };

/** ขั้นตอนหนึ่งใน "วิธีรับโค้ด" (task 15) */
export interface CodeInstructionStep {
  title: string;
  description?: string;
  linkLabel?: string;
  linkUrl?: string;
}

/** "วิธีรับโค้ด" ที่แอดมินตั้งต่อชุด (ใช้กับชุด accessType = code) */
export interface CodeInstructions {
  steps: CodeInstructionStep[];
  note?: string;
}

/** field ของ Mock Exam ที่ส่งใน POST/PUT /exams/admin (ฟอร์มแอดมินส่งครบทุกครั้ง) */
export interface MockExamInput {
  isMock: boolean;
  accessType: MockAccessType;
  price: number | null;
  accessDays: number | null;
  level: ExamLevel | null;
  detailBlocks: DetailBlock[];
  /** null = ไม่มีขั้นตอนและหมายเหตุ */
  codeInstructions: CodeInstructions | null;
}

// ตรงกับ validation ของ API (task 11)
export const MAX_DETAIL_BLOCKS = 50;
export const MAX_DETAIL_TEXT = 20000;
export const MAX_DETAIL_URL = 500;
export const MAX_PRICE = 100000;
export const MAX_ACCESS_DAYS = 3650;
// "วิธีรับโค้ด" (สัญญา task 15)
export const MAX_CODE_STEPS = 10;
export const MAX_STEP_TITLE = 100;
export const MAX_STEP_DESCRIPTION = 300;
export const MAX_STEP_LINK_LABEL = 40;
export const MAX_STEP_LINK_URL = 500;
export const MAX_CODE_NOTE = 300;

export const MOCK_ACCESS_TYPES: MockAccessType[] = ['free', 'code', 'purchase'];
export const ACCESS_TYPE_LABELS: Record<MockAccessType, string> = {
  free: 'เปิดฟรี',
  code: 'ต้องใช้โค้ด',
  purchase: 'ต้องซื้อ',
};

export const EXAM_LEVELS: ExamLevel[] = ['easy', 'medium', 'hard'];
export const LEVEL_LABELS: Record<ExamLevel, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
};

// ── แปลงค่าจาก API ─────────────────────────────────────────

/** ราคาจาก API (decimal อาจมาเป็น string เช่น "150.00") → number, ค่าว่าง/ไม่ใช่ตัวเลข → null */
export function parsePrice(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ราคาแบบไทย: จำนวนเต็มไม่มีทศนิยม (1,500) มีเศษแสดง 2 ตำแหน่ง (1,234.50) */
export function formatPrice(price: number): string {
  const hasFraction = Math.round(price * 100) % 100 !== 0;
  return price.toLocaleString('th-TH', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** ค่าที่ไม่รู้จัก/ไม่มี → 'free' (ค่าเริ่มต้นของ API) */
export function normalizeAccessType(value: unknown): MockAccessType {
  return MOCK_ACCESS_TYPES.includes(value as MockAccessType) ? (value as MockAccessType) : 'free';
}

export function normalizeLevel(value: unknown): ExamLevel | null {
  return EXAM_LEVELS.includes(value as ExamLevel) ? (value as ExamLevel) : null;
}

/** URL รูปที่ยอมให้อยู่ในคำอธิบายชุด: ไฟล์ที่อัปขึ้นระบบ (/uploads/...) หรือ http(s) เท่านั้น */
export function isAllowedDetailImageUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith('/uploads/') || /^https?:\/\/[^\s]+$/i.test(u);
}

/** detailBlocks จาก API (null = ไม่มี) → array ที่ใช้ render ได้ (block ผิดรูปทิ้ง) */
export function normalizeDetailBlocks(value: unknown): DetailBlock[] {
  if (!Array.isArray(value)) return [];
  const out: DetailBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as { type?: unknown; text?: unknown; url?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') {
      out.push({ type: 'text', text: b.text });
    } else if (b.type === 'image' && typeof b.url === 'string' && isAllowedDetailImageUrl(b.url)) {
      out.push({ type: 'image', url: b.url.trim() });
    }
  }
  return out;
}

/** ลิงก์ในขั้นตอน "วิธีรับโค้ด": http(s) เท่านั้น (กัน javascript: ฯลฯ) */
export function isAllowedStepLinkUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

const optionalText = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

/** codeInstructions จาก API (null/ผิดรูป → null) — ขั้นตอนไม่มีหัวข้อทิ้ง, ลิงก์ที่ไม่ใช่ http(s) ไม่แสดง */
export function normalizeCodeInstructions(value: unknown): CodeInstructions | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { steps?: unknown; note?: unknown };
  const steps: CodeInstructionStep[] = [];
  if (Array.isArray(raw.steps)) {
    for (const item of raw.steps) {
      if (!item || typeof item !== 'object') continue;
      const st = item as Record<string, unknown>;
      const title = optionalText(st.title);
      if (!title) continue;
      const step: CodeInstructionStep = { title };
      const description = optionalText(st.description);
      if (description) step.description = description;
      const linkUrl = optionalText(st.linkUrl);
      if (linkUrl && isAllowedStepLinkUrl(linkUrl)) {
        step.linkUrl = linkUrl.trim();
        const linkLabel = optionalText(st.linkLabel);
        if (linkLabel) step.linkLabel = linkLabel;
      }
      steps.push(step);
    }
  }
  const note = optionalText(raw.note);
  if (steps.length === 0 && !note) return null;
  return note ? { steps, note } : { steps };
}

// ── สิทธิ์ของบัญชี (task 15) ───────────────────────────────

/**
 * สถานะสิทธิ์จาก API: free = ชุดฟรี, locked = ไม่ฟรีและไม่เคยมีสิทธิ์ (รวม guest),
 * unlocked = มีสิทธิ์ที่ยังไม่หมด, expired = เคยมีแต่หมดแล้ว
 */
export type MockAccessStatus = 'free' | 'locked' | 'unlocked' | 'expired';
export const MOCK_ACCESS_STATUSES: MockAccessStatus[] = ['free', 'locked', 'unlocked', 'expired'];

/** สิทธิ์ของบัญชีกับชุดนี้ (`access` ใน GET /exams/mock, /exams/mock/:id) */
/** ที่มาของสิทธิ์ (task 17): pro = แพ็กเกจ Pro ของสนาม, code / purchase / admin = สิทธิ์รายชุดตามที่มา */
export type MockAccessVia = 'pro' | 'code' | 'purchase' | 'admin';
export const MOCK_ACCESS_VIAS: MockAccessVia[] = ['pro', 'code', 'purchase', 'admin'];

export interface MockExamAccess {
  status: MockAccessStatus;
  /** วันหมดสิทธิ์ ISO (เฉพาะ unlocked/expired) */
  expiresAt: string | null;
  /** ที่มาของสิทธิ์ (API ก่อน task 17 ไม่มี → null) — free/locked = null */
  via?: MockAccessVia | null;
}

/**
 * `access` จาก API → ชนิดที่ใช้ได้ ไม่มี/ผิดรูป (API ก่อน task 15) → ตาม accessType:
 * ชุดฟรี = free เสมอ, ชุดไม่ฟรี = ตามที่ API ส่ง (ไม่รู้จัก → locked)
 */
export function normalizeMockAccess(value: unknown, accessType: MockAccessType): MockExamAccess {
  if (accessType === 'free') return { status: 'free', expiresAt: null };
  const raw = value && typeof value === 'object' ? (value as { status?: unknown; expiresAt?: unknown }) : {};
  const status = MOCK_ACCESS_STATUSES.includes(raw.status as MockAccessStatus)
    ? (raw.status as MockAccessStatus)
    : 'locked';
  const expiresAt = typeof raw.expiresAt === 'string' && raw.expiresAt !== '' ? raw.expiresAt : null;
  // ชุดไม่ฟรีที่ API บอก free (ไม่ควรเกิด) → ถือว่ายังล็อก
  return { status: status === 'free' ? 'locked' : status, expiresAt };
}

/** เริ่มทำ/ทำต่อได้ไหม: ชุดฟรี หรือมีสิทธิ์ที่ยังไม่หมด */
export function canStartMock(
  exam: { accessType?: MockAccessType | string | null },
  access?: MockExamAccess | null,
): boolean {
  return normalizeAccessType(exam.accessType) === 'free' || access?.status === 'unlocked';
}

// ── ข้อความแสดงผล ─────────────────────────────────────────

/** ชื่อสนามสอบที่แสดง: categoryName จาก API (ชื่อในตาราง categories) ไม่มี → slug (exam.category) */
export function mockCategoryLabel(exam: { category: string; categoryName?: string | null }): string {
  return exam.categoryName?.trim() || exam.category;
}

/** "สนามสอบ · วิชา" (ไม่มีวิชา → สนามสอบอย่างเดียว) */
export function formatMockContext(exam: {
  category: string;
  categoryName?: string | null;
  subjectName?: string | null;
}): string {
  const category = mockCategoryLabel(exam);
  return exam.subjectName ? `${category} · ${exam.subjectName}` : category;
}

/** "N ข้อ · M นาที" (ไม่ตั้งเวลา → "ไม่จับเวลา") */
export function formatMockMeta(questionCount: number, durationMinutes: number | null | undefined): string {
  const time = durationMinutes && durationMinutes > 0 ? `${durationMinutes.toLocaleString('th-TH')} นาที` : 'ไม่จับเวลา';
  return `${questionCount.toLocaleString('th-TH')} ข้อ · ${time}`;
}

// ── ป้ายสถานะ ─────────────────────────────────────────────

export type MockBadgeTone = 'free' | 'campaign' | 'price' | 'unlocked';

export interface MockAccessBadgeInfo {
  label: string;
  tone: MockBadgeTone;
}

interface MockAccessLike {
  accessType?: MockAccessType | string | null;
  price?: number | string | null;
}

/**
 * ป้ายบนการ์ด/หน้ารายละเอียด: ฟรี / Unlocked (มีสิทธิ์ที่ยังไม่หมด) / Campaign (ชุดโค้ดที่ล็อกหรือสิทธิ์หมด)
 * / "<ราคา> บาท" (ชุดซื้อที่ยังไม่มีสิทธิ์)
 */
export function getMockAccessBadge(exam: MockAccessLike, access?: MockExamAccess | null): MockAccessBadgeInfo {
  const accessType = normalizeAccessType(exam.accessType);
  if (accessType === 'free') return { label: 'ฟรี', tone: 'free' };
  if (access?.status === 'unlocked') return { label: UNLOCKED_WORD, tone: 'unlocked' };
  if (accessType === 'code') return { label: 'Campaign', tone: 'campaign' };
  const price = parsePrice(exam.price);
  return { label: price != null && price > 0 ? `${formatPrice(price)} บาท` : 'ต้องซื้อ', tone: 'price' };
}

/** ราคาบนหน้ารายละเอียด: ชุดฟรี → "ฟรี", ชุดซื้อ → "<ราคา> บาท", ชุดโค้ด → null (ไม่แสดงแถวราคา) */
export function getMockPriceLabel(exam: MockAccessLike): string | null {
  const accessType = normalizeAccessType(exam.accessType);
  if (accessType === 'free') return 'ฟรี';
  if (accessType === 'code') return null;
  const price = parsePrice(exam.price);
  return price != null && price > 0 ? `${formatPrice(price)} บาท` : null;
}

// ── ปุ่มหลักหน้ารายละเอียด ─────────────────────────────────

export type MockPrimaryAction =
  | { kind: 'start'; label: string; href: string }
  | { kind: 'resume'; label: string; href: string }
  | { kind: 'unlock'; label: string; note: string }
  | { kind: 'buy'; label: string; note: string };

/**
 * ชุดฟรี (หรือบัญชีมีสิทธิ์ที่ยังไม่หมด) → "เริ่มทำข้อสอบ" / "ทำต่อ" (มี attempt โหมด exam ค้าง)
 * ไปหน้าทำข้อสอบจับเวลา `/exam/<id>` · ชุดโค้ด → กรอกโค้ด · ชุดซื้อ → "ซื้อ" (ยังกดไม่ได้ — งานที่ 3)
 */
export function getMockPrimaryAction(
  exam: { id: string; accessType?: MockAccessType | string | null },
  opts: { hasInProgress?: boolean; access?: MockExamAccess | null } = {},
): MockPrimaryAction {
  const accessType = normalizeAccessType(exam.accessType);
  if (canStartMock(exam, opts.access)) {
    const href = `/exam/${exam.id}`;
    return opts.hasInProgress
      ? { kind: 'resume', label: 'ทำต่อ', href }
      : { kind: 'start', label: 'เริ่มทำข้อสอบ', href };
  }
  if (accessType === 'code') {
    return { kind: 'unlock', label: UNLOCK_WORD, note: `กรอกโค้ดเพื่อ ${UNLOCK_WORD} ชุดนี้` };
  }
  return { kind: 'buy', label: 'ซื้อ', note: 'เปิดให้ซื้อเร็ว ๆ นี้' };
}

// ── ฟอร์มแอดมิน ───────────────────────────────────────────

export interface DetailBlockForm {
  /** key ใน React (ไม่ส่ง API) */
  key: string;
  type: 'text' | 'image';
  text: string;
  url: string;
}

/** ขั้นตอน "วิธีรับโค้ด" ในฟอร์มแอดมิน */
export interface CodeStepForm {
  /** key ใน React (ไม่ส่ง API) */
  key: string;
  title: string;
  description: string;
  linkLabel: string;
  linkUrl: string;
}

export interface MockExamForm {
  isMock: boolean;
  accessType: MockAccessType;
  /** ช่องกรอก (string) แปลงเป็น number ตอนส่ง */
  price: string;
  accessDays: string;
  level: ExamLevel | '';
  blocks: DetailBlockForm[];
  /** "วิธีรับโค้ด" (แก้ได้เมื่อ accessType = code) */
  codeSteps: CodeStepForm[];
  codeNote: string;
}

let blockSeq = 0;
function nextBlockKey() {
  blockSeq += 1;
  return `block_${Date.now().toString(36)}_${blockSeq}`;
}

export function createDetailBlock(type: 'text' | 'image', value = ''): DetailBlockForm {
  return { key: nextBlockKey(), type, text: type === 'text' ? value : '', url: type === 'image' ? value : '' };
}

let stepSeq = 0;
export function createCodeStep(value: Partial<CodeInstructionStep> = {}): CodeStepForm {
  stepSeq += 1;
  return {
    key: `step_${Date.now().toString(36)}_${stepSeq}`,
    title: value.title ?? '',
    description: value.description ?? '',
    linkLabel: value.linkLabel ?? '',
    linkUrl: value.linkUrl ?? '',
  };
}

export function createMockExamForm(): MockExamForm {
  return {
    isMock: false,
    accessType: 'free',
    price: '',
    accessDays: '',
    level: '',
    blocks: [],
    codeSteps: [],
    codeNote: '',
  };
}

interface MockExamFieldsLike {
  isMock?: boolean | null;
  accessType?: MockAccessType | string | null;
  price?: number | string | null;
  accessDays?: number | null;
  level?: ExamLevel | string | null;
  detailBlocks?: unknown;
  codeInstructions?: unknown;
}

/** ค่าจาก GET /exams/admin/:id → ฟอร์ม (API เก่าที่ยังไม่มี field → ค่าเริ่มต้น) */
export function mockFormFromExam(exam: MockExamFieldsLike): MockExamForm {
  const price = parsePrice(exam.price);
  return {
    isMock: exam.isMock === true,
    accessType: normalizeAccessType(exam.accessType),
    price: price != null ? String(price) : '',
    accessDays: exam.accessDays != null ? String(exam.accessDays) : '',
    level: normalizeLevel(exam.level) ?? '',
    blocks: normalizeDetailBlocks(exam.detailBlocks).map((b) =>
      b.type === 'text' ? createDetailBlock('text', b.text) : createDetailBlock('image', b.url),
    ),
    ...codeFormFromInstructions(exam.codeInstructions),
  };
}

/**
 * codeInstructions จาก API → ช่องในฟอร์ม (อ่านแบบไม่ทิ้งข้อมูล: ขั้นตอนที่ API คืนมาแสดงครบให้แอดมินแก้
 * แม้ลิงก์จะผิดรูป — ตรวจตอนบันทึก)
 */
function codeFormFromInstructions(value: unknown): Pick<MockExamForm, 'codeSteps' | 'codeNote'> {
  if (!value || typeof value !== 'object') return { codeSteps: [], codeNote: '' };
  const raw = value as { steps?: unknown; note?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const codeSteps = Array.isArray(raw.steps)
    ? raw.steps
        .filter((st): st is Record<string, unknown> => !!st && typeof st === 'object')
        .map((st) =>
          createCodeStep({
            title: str(st.title),
            description: str(st.description),
            linkLabel: str(st.linkLabel),
            linkUrl: str(st.linkUrl),
          }),
        )
    : [];
  return { codeSteps, codeNote: str(raw.note) };
}

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const DAYS_PATTERN = /^\d+$/;

/** ตรวจช่องราคา (ว่าง = ผ่าน) */
function priceError(price: string): string | null {
  if (price === '') return null;
  const n = Number(price);
  if (!PRICE_PATTERN.test(price) || !(n > 0)) return 'Mock Exam: ราคาต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)';
  if (n > MAX_PRICE) return `Mock Exam: ราคาต้องไม่เกิน ${MAX_PRICE.toLocaleString('th-TH')} บาท`;
  return null;
}

/** ตรวจช่องอายุการเข้าถึง (ว่าง = ผ่าน) */
function accessDaysError(days: string): string | null {
  if (days === '') return null;
  const n = Number(days);
  if (!DAYS_PATTERN.test(days) || n < 1 || n > MAX_ACCESS_DAYS) {
    return `Mock Exam: อายุการเข้าถึงต้องเป็นจำนวนวัน 1–${MAX_ACCESS_DAYS.toLocaleString('th-TH')}`;
  }
  return null;
}

/** ตรวจ block เดียว (ไม่รวมคำนำหน้า "ช่องที่ N") */
function blockError(b: DetailBlockForm): string | null {
  if (b.type === 'text') {
    if (!b.text.trim()) return 'กรุณาพิมพ์ข้อความหรือลบช่องนี้';
    if (b.text.length > MAX_DETAIL_TEXT) {
      return `ข้อความยาวได้ไม่เกิน ${MAX_DETAIL_TEXT.toLocaleString('th-TH')} ตัวอักษร`;
    }
    return null;
  }
  const url = b.url.trim();
  if (!url) return 'กรุณาใส่รูปหรือลบช่องนี้';
  if (url.length > MAX_DETAIL_URL) return `URL รูปยาวได้ไม่เกิน ${MAX_DETAIL_URL} ตัวอักษร`;
  if (!isAllowedDetailImageUrl(url)) return 'URL รูปต้องขึ้นต้นด้วย http(s):// หรือ /uploads/';
  return null;
}

/** ตรวจขั้นตอน "วิธีรับโค้ด" ขั้นเดียว (ไม่รวมคำนำหน้า "ขั้นที่ N") */
export function codeStepError(st: CodeStepForm): string | null {
  const title = st.title.trim();
  if (!title) return 'กรุณาใส่หัวข้อหรือลบขั้นตอนนี้';
  if (title.length > MAX_STEP_TITLE) return `หัวข้อยาวได้ไม่เกิน ${MAX_STEP_TITLE} ตัวอักษร`;
  if (st.description.trim().length > MAX_STEP_DESCRIPTION) {
    return `คำอธิบายยาวได้ไม่เกิน ${MAX_STEP_DESCRIPTION} ตัวอักษร`;
  }
  const label = st.linkLabel.trim();
  const url = st.linkUrl.trim();
  if (label.length > MAX_STEP_LINK_LABEL) return `ข้อความปุ่มยาวได้ไม่เกิน ${MAX_STEP_LINK_LABEL} ตัวอักษร`;
  if (label && !url) return 'ใส่ลิงก์ของปุ่ม หรือลบข้อความปุ่ม';
  if (url) {
    if (url.length > MAX_STEP_LINK_URL) return `ลิงก์ยาวได้ไม่เกิน ${MAX_STEP_LINK_URL} ตัวอักษร`;
    if (!isAllowedStepLinkUrl(url)) return 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://';
  }
  return null;
}

/** ตรวจ "วิธีรับโค้ด" ทั้งชุด (ผ่าน → null) */
export function validateCodeInstructionsForm(form: Pick<MockExamForm, 'codeSteps' | 'codeNote'>): string | null {
  if (form.codeSteps.length > MAX_CODE_STEPS) return `วิธีรับโค้ด: มีได้ไม่เกิน ${MAX_CODE_STEPS} ขั้นตอน`;
  for (let i = 0; i < form.codeSteps.length; i++) {
    const err = codeStepError(form.codeSteps[i]);
    if (err) return `วิธีรับโค้ด ขั้นที่ ${i + 1}: ${err}`;
  }
  if (form.codeNote.trim().length > MAX_CODE_NOTE) {
    return `วิธีรับโค้ด: หมายเหตุยาวได้ไม่เกิน ${MAX_CODE_NOTE} ตัวอักษร`;
  }
  return null;
}

/** ขั้นตอนในฟอร์ม → ค่าที่ส่ง API (ช่องว่างไม่ส่ง) */
export function toCodeInstructionStep(st: CodeStepForm): CodeInstructionStep {
  const step: CodeInstructionStep = { title: st.title.trim() };
  const description = st.description.trim();
  const linkUrl = st.linkUrl.trim();
  const linkLabel = st.linkLabel.trim();
  if (description) step.description = description;
  if (linkUrl) {
    step.linkUrl = linkUrl;
    if (linkLabel) step.linkLabel = linkLabel;
  }
  return step;
}

/**
 * ฟอร์ม → codeInstructions ที่ส่ง API (ไม่มีขั้นตอนและหมายเหตุ → null)
 * `strict` = ตรวจแล้ว (ชุดโค้ด) ส่งตามที่กรอก / ไม่ strict = ไม่ได้ตรวจ ส่งเฉพาะขั้นตอนที่ถูกต้อง (ค่ายังถูกเก็บไว้)
 */
export function toCodeInstructions(
  form: Pick<MockExamForm, 'codeSteps' | 'codeNote'>,
  strict = true,
): CodeInstructions | null {
  const stepsForm = strict
    ? form.codeSteps
    : form.codeSteps.filter((st) => !codeStepError(st)).slice(0, MAX_CODE_STEPS);
  const steps = stepsForm.map(toCodeInstructionStep);
  const rawNote = form.codeNote.trim();
  const note = strict || rawNote.length <= MAX_CODE_NOTE ? rawNote : '';
  if (steps.length === 0 && !note) return null;
  return note ? { steps, note } : { steps };
}

/** ตรวจฟอร์มก่อนบันทึก คืนข้อความ error ภาษาไทย (ผ่าน → null) ไม่ใช่ Mock → ไม่ตรวจ */
export function validateMockForm(form: MockExamForm): string | null {
  if (!form.isMock) return null;

  const price = form.price.trim();
  if (form.accessType === 'purchase' && price === '') return 'Mock Exam: ชุดที่ต้องซื้อต้องระบุราคา';
  const pErr = priceError(price);
  if (pErr) return pErr;

  const dErr = accessDaysError(form.accessDays.trim());
  if (dErr) return dErr;

  if (form.blocks.length > MAX_DETAIL_BLOCKS) {
    return `คำอธิบายชุดข้อสอบมีได้ไม่เกิน ${MAX_DETAIL_BLOCKS} ช่อง`;
  }
  for (let i = 0; i < form.blocks.length; i++) {
    const err = blockError(form.blocks[i]);
    if (err) return `คำอธิบายชุดข้อสอบ ช่องที่ ${i + 1}: ${err}`;
  }
  // "วิธีรับโค้ด" ตรวจเฉพาะชุดโค้ด (ชุดอื่นเก็บค่าที่กรอกไว้แบบไม่ตรวจ)
  if (form.accessType === 'code') return validateCodeInstructionsForm(form);
  return null;
}

const toDetailBlock = (b: DetailBlockForm): DetailBlock =>
  b.type === 'text' ? { type: 'text', text: b.text } : { type: 'image', url: b.url.trim() };

/**
 * ฟอร์ม → field ที่ส่ง API (ส่งครบทุกครั้ง)
 * - เป็น Mock: ส่งตามที่กรอก (ผ่าน validateMockForm แล้ว)
 * - ไม่ใช่ Mock: ส่ง `isMock:false` พร้อมค่าที่กรอกไว้ — ติ๊กกลับแล้วข้อมูล/รูปยังอยู่
 *   (ไม่ตรวจฟอร์ม จึงตัดเฉพาะค่าที่ API จะปฏิเสธ: ราคา/จำนวนวันที่ไม่ถูกต้อง → null, block ว่าง/ผิดรูปไม่ส่ง
 *   และ "ต้องซื้อ" ที่ไม่มีราคา → ส่ง 'free' เพราะ API บังคับราคาสำหรับ purchase ไม่ว่า isMock เป็นอะไร)
 */
export function toMockExamInput(form: MockExamForm): MockExamInput {
  const price = form.price.trim();
  const days = form.accessDays.trim();
  if (form.isMock) {
    return {
      isMock: true,
      accessType: form.accessType,
      price: price === '' ? null : Number(price),
      accessDays: days === '' ? null : Number(days),
      level: form.level || null,
      detailBlocks: form.blocks.map(toDetailBlock),
      codeInstructions: toCodeInstructions(form, form.accessType === 'code'),
    };
  }
  const safePrice = price !== '' && !priceError(price) ? Number(price) : null;
  const safeDays = days !== '' && !accessDaysError(days) ? Number(days) : null;
  return {
    isMock: false,
    accessType: form.accessType === 'purchase' && safePrice == null ? 'free' : form.accessType,
    price: safePrice,
    accessDays: safeDays,
    level: form.level || null,
    detailBlocks: form.blocks
      .filter((b) => !blockError(b))
      .slice(0, MAX_DETAIL_BLOCKS)
      .map(toDetailBlock),
    codeInstructions: toCodeInstructions(form, false),
  };
}

/** ฟอร์มมีค่าของ Mock ที่กรอกไว้ไหม (ใช้บอกแอดมินว่าเอาติ๊กออกแล้วค่ายังถูกเก็บ) */
export function mockFormHasSettings(form: MockExamForm): boolean {
  return (
    form.accessType !== 'free' ||
    form.price.trim() !== '' ||
    form.accessDays.trim() !== '' ||
    form.level !== '' ||
    form.blocks.length > 0 ||
    form.codeSteps.length > 0 ||
    form.codeNote.trim() !== ''
  );
}

/**
 * รูปในคำอธิบายชุดในรูปแบบที่ collectFormImageUrls/imagesToDiscard ใช้ได้
 * รับได้ทั้ง block ของฟอร์มและ block ใน payload (รวมกับรูปข้อ/บทอ่าน เพื่อไม่ลบไฟล์ที่ยังใช้อยู่ที่อื่น)
 */
export function detailBlockImageHolders(
  blocks: ReadonlyArray<DetailBlock | DetailBlockForm>,
): { questionImages: string[] }[] {
  const urls = blocks.flatMap((b) => (b.type === 'image' && b.url.trim() ? [b.url.trim()] : []));
  return [{ questionImages: urls }];
}

// ── URL รูป / ลิงก์ย้อนกลับ ───────────────────────────────

/** base URL ของ API (ค่าเดียวกับ lib/api/*) — ไฟล์อัปโหลดเสิร์ฟที่โดเมนของ API */
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

/** รูป `/uploads/...` (path สัมพัทธ์) → URL เต็มบนโดเมน API เพราะเว็บกับ uploads อยู่คนละโดเมน; URL อื่นคงเดิม */
export function resolveUploadUrl(url: string, apiBaseUrl: string = API_BASE_URL): string {
  const u = url.trim();
  return u.startsWith('/uploads/') ? `${apiBaseUrl.replace(/\/+$/, '')}${u}` : u;
}

/** ปุ่มย้อนกลับจากหน้าทำข้อสอบจับเวลา/ผลสอบ: ชุด Mock → หน้ารายละเอียด Mock, ชุดปกติ → หน้าข้อสอบจริง */
export function getExamBackLink(examId: string | null | undefined, isMock: boolean): { href: string; label: string } {
  if (isMock) {
    return {
      href: examId ? `/dashboard/mock-exams/${examId}` : '/dashboard/mock-exams',
      label: 'กลับหน้า Mock Exam',
    };
  }
  return { href: '/dashboard/exam', label: 'กลับหน้าข้อสอบจริง' };
}
