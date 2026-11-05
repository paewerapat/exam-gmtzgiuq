// ชุด Mock Exam (task 11): ชนิดข้อมูล การแปลงค่าจาก API ป้ายสถานะ ปุ่มหลัก และฟอร์มแอดมิน
// ไฟล์นี้ไม่ import อะไรจาก lib/api เพื่อให้ lib/api/exams ใช้ตัวแปลงค่าได้โดยไม่วนกัน

export type MockAccessType = 'free' | 'code' | 'purchase';
export type ExamLevel = 'easy' | 'medium' | 'hard';

/** คำอธิบายชุดข้อสอบแบบ block เรียงตามที่แอดมินจัด */
export type DetailBlock = { type: 'text'; text: string } | { type: 'image'; url: string };

/** field ของ Mock Exam ที่ส่งใน POST/PUT /exams/admin (ฟอร์มแอดมินส่งครบทุกครั้ง) */
export interface MockExamInput {
  isMock: boolean;
  accessType: MockAccessType;
  price: number | null;
  accessDays: number | null;
  level: ExamLevel | null;
  detailBlocks: DetailBlock[];
}

// ตรงกับ validation ของ API (task 11)
export const MAX_DETAIL_BLOCKS = 50;
export const MAX_DETAIL_TEXT = 20000;
export const MAX_DETAIL_URL = 500;
export const MAX_PRICE = 100000;
export const MAX_ACCESS_DAYS = 3650;

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

/**
 * สิทธิ์ของบัญชีกับชุดนี้ — งานนี้ยังไม่มี (ส่ง undefined) งานที่ 2 (โค้ด Unlock) จะส่ง `{ unlocked: true }`
 * เมื่อบัญชีมีสิทธิ์แล้ว
 */
export interface MockExamAccess {
  unlocked?: boolean;
}

export type MockBadgeTone = 'free' | 'campaign' | 'price' | 'unlocked';

export interface MockAccessBadgeInfo {
  label: string;
  tone: MockBadgeTone;
}

interface MockAccessLike {
  accessType?: MockAccessType | string | null;
  price?: number | string | null;
}

/** ป้ายบนการ์ด/หน้ารายละเอียด: ฟรี / Campaign / "<ราคา> บาท" / Unlocked (มีสิทธิ์แล้ว) */
export function getMockAccessBadge(exam: MockAccessLike, access?: MockExamAccess | null): MockAccessBadgeInfo {
  const accessType = normalizeAccessType(exam.accessType);
  if (accessType === 'free') return { label: 'ฟรี', tone: 'free' };
  if (access?.unlocked) return { label: 'Unlocked', tone: 'unlocked' };
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
 * ชุดฟรี (หรือบัญชีมีสิทธิ์แล้ว) → "เริ่มทำ" / "ทำต่อ" (มี attempt โหมด exam ค้าง) ไปหน้าทำข้อสอบจับเวลา `/exam/<id>`
 * ชุดโค้ด → "Unlock" ชุดซื้อ → "ซื้อ" (งานนี้ยังกดไม่ได้)
 */
export function getMockPrimaryAction(
  exam: { id: string; accessType?: MockAccessType | string | null },
  opts: { hasInProgress?: boolean; access?: MockExamAccess | null } = {},
): MockPrimaryAction {
  const accessType = normalizeAccessType(exam.accessType);
  if (accessType === 'free' || opts.access?.unlocked) {
    const href = `/exam/${exam.id}`;
    return opts.hasInProgress ? { kind: 'resume', label: 'ทำต่อ', href } : { kind: 'start', label: 'เริ่มทำ', href };
  }
  if (accessType === 'code') {
    return { kind: 'unlock', label: 'Unlock', note: 'กรอกโค้ดเพื่อ Unlock — เปิดให้ใช้เร็ว ๆ นี้' };
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

export interface MockExamForm {
  isMock: boolean;
  accessType: MockAccessType;
  /** ช่องกรอก (string) แปลงเป็น number ตอนส่ง */
  price: string;
  accessDays: string;
  level: ExamLevel | '';
  blocks: DetailBlockForm[];
}

let blockSeq = 0;
function nextBlockKey() {
  blockSeq += 1;
  return `block_${Date.now().toString(36)}_${blockSeq}`;
}

export function createDetailBlock(type: 'text' | 'image', value = ''): DetailBlockForm {
  return { key: nextBlockKey(), type, text: type === 'text' ? value : '', url: type === 'image' ? value : '' };
}

export function createMockExamForm(): MockExamForm {
  return { isMock: false, accessType: 'free', price: '', accessDays: '', level: '', blocks: [] };
}

interface MockExamFieldsLike {
  isMock?: boolean | null;
  accessType?: MockAccessType | string | null;
  price?: number | string | null;
  accessDays?: number | null;
  level?: ExamLevel | string | null;
  detailBlocks?: unknown;
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
  };
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
  };
}

/** ฟอร์มมีค่าของ Mock ที่กรอกไว้ไหม (ใช้บอกแอดมินว่าเอาติ๊กออกแล้วค่ายังถูกเก็บ) */
export function mockFormHasSettings(form: MockExamForm): boolean {
  return (
    form.accessType !== 'free' ||
    form.price.trim() !== '' ||
    form.accessDays.trim() !== '' ||
    form.level !== '' ||
    form.blocks.length > 0
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
