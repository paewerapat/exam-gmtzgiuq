// บทอ่านร่วม (passage) ที่หลายข้อในข้อสอบเดียวกันใช้ร่วมกัน — ใช้ทั้งหน้าทำข้อสอบ หน้าผลลัพธ์ ฟอร์มแอดมิน และการนำเข้า
// pure module: import แค่ type จาก lib/api เพื่อไม่ให้วนกับ lib/api/exams
import type { ExamPassage } from '@/lib/api/questions';
import type { ExamPassageInput } from '@/lib/api/exams';
import { MAX_QUESTION_IMAGES } from '@/lib/question-images';

/** ตรงกับ validation ของ API */
export const PASSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PASSAGES = 50;
export const MAX_PASSAGE_TITLE = 255;
export const MAX_PASSAGE_BODY = 100_000;
export const MAX_PASSAGE_IMAGES = MAX_QUESTION_IMAGES;
/** ความยาว URL รูปบทอ่าน (API ตรวจ ≤ 255 เท่ารูปโจทย์) */
export const MAX_PASSAGE_IMAGE_URL = 255;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** รูปของบทอ่านตามลำดับ (ตัดค่าว่าง/ไม่ใช่ string) */
export function getPassageImages(p: { images?: unknown } | null | undefined): string[] {
  return Array.isArray(p?.images) ? p.images.filter(isNonEmptyString) : [];
}

/** บทอ่านต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง */
export function passageHasContent(p: { body?: string | null; images?: unknown } | null | undefined): boolean {
  return !!p && (isNonEmptyString(p.body) || getPassageImages(p).length > 0);
}

/**
 * ตรวจรูปร่างบทอ่าน (มาจาก API หรือ localStorage) คืนตัวเดิมถ้าครบอยู่แล้ว
 * ไม่มี id / ไม่มีทั้งเนื้อหาและรูป → null (ไม่แสดงกล่องบทอ่านว่าง ๆ)
 */
function normalizePassage(raw: unknown): ExamPassage | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<ExamPassage>;
  if (!isNonEmptyString(p.id) || !passageHasContent(p)) return null;
  const images = getPassageImages(p);
  const title = typeof p.title === 'string' ? p.title : null;
  const body = typeof p.body === 'string' ? p.body : null;
  const lineNumbersOk = p.lineNumbers === undefined || typeof p.lineNumbers === 'boolean';
  if (
    p.title === title &&
    p.body === body &&
    Array.isArray(p.images) &&
    images.length === p.images.length &&
    lineNumbersOk
  ) {
    return p as ExamPassage;
  }
  // สร้างใหม่ต้องคง lineNumbers ไว้ (ไม่งั้นบทอ่านที่เปิดเลขบรรทัดหายหลังอ่านจาก localStorage)
  return { id: p.id, title, body, images, ...(p.lineNumbers === true ? { lineNumbers: true } : {}) };
}

/** เปิดเลขบรรทัดไหม (ไม่มี key / ค่าไม่ใช่ true = ปิด) */
export function passageShowsLineNumbers(p: { lineNumbers?: unknown } | null | undefined): boolean {
  return p?.lineNumbers === true;
}

// ── เลขบรรทัด ────────────────────────────────────────────────

export type PassageLine =
  /** บรรทัดที่มีข้อความ `no` เริ่ม 1 (`text` มี `\n` ได้เฉพาะบล็อก `$$...$$` ที่คร่อมหลายบรรทัด) */
  | { kind: 'line'; no: number; text: string }
  /** บรรทัดว่าง (หรือมีแต่ช่องว่าง) = เว้นย่อหน้า ไม่นับเลข */
  | { kind: 'blank' }
  /** บล็อกที่แสดงทั้งก้อนและไม่นับเลข (ตาราง Markdown) */
  | { kind: 'block'; text: string };

// กติกาตารางต้องตรงกับ extractMarkdownTables ใน components/latex/LatexRenderer.tsx
// (แถวหัว `|...` + แถวเส้นคั่น `|---|:--:|` จำนวนช่องเท่ากัน แล้วต่อด้วยแถว `|...` ที่ติดกัน)
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;

function tableCells(line: string): string[] {
  let row = line.trim().replace(/\\\|/g, '\u0000');
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|');
}

function isMarkdownTableStart(line: string, next: string | undefined): boolean {
  if (next === undefined || !line.trim().startsWith('|')) return false;
  const sep = next.trim();
  if (!sep.startsWith('|') || !sep.includes('-')) return false;
  const sepCells = tableCells(sep);
  if (sepCells.length === 0 || !sepCells.every((c) => TABLE_SEPARATOR_CELL.test(c.replace(/\s+/g, '')))) return false;
  return tableCells(line).length === sepCells.length;
}

function countBlockMathDelimiters(line: string): number {
  return line.split('$$').length - 1;
}

/**
 * แยก body ของบทอ่านเป็นบรรทัดสำหรับแสดงเลขบรรทัด (บรรทัด = การขึ้นบรรทัดที่ผู้เขียนพิมพ์ ไม่ใช่การตัดตามความกว้างจอ)
 * - บรรทัดว่าง/มีแต่ช่องว่าง → blank ไม่นับเลข
 * - ตาราง Markdown แบบที่ LatexRenderer แปลงเป็น <table> → block ทั้งตาราง ไม่นับเลข
 * - `$$` ที่เปิดแล้วปิดในบรรทัดถัด ๆ ไป → รวมเป็น line เดียว นับ 1 (ไม่มีตัวปิด → นับทีละบรรทัดตามปกติ)
 * - รองรับ `\r\n` / `\r`
 * - บรรทัดว่างที่หัว/ท้าย body ถูกตัดออก (เหลือเฉพาะบรรทัดว่างที่คั่นระหว่างเนื้อหา)
 */
export function splitPassageLines(body: string | null | undefined): PassageLine[] {
  if (!body) return [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out: PassageLine[] = [];
  let no = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      out.push({ kind: 'blank' });
      i++;
      continue;
    }
    if (isMarkdownTableStart(line, lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) j++;
      out.push({ kind: 'block', text: lines.slice(i, j).join('\n') });
      i = j;
      continue;
    }
    let end = i;
    if (countBlockMathDelimiters(line) % 2 === 1) {
      // หาบรรทัดที่ปิด $$ (จำนวน $$ สะสมกลับเป็นคู่)
      let open = 1;
      for (let j = i + 1; j < lines.length; j++) {
        open += countBlockMathDelimiters(lines[j]);
        if (open % 2 === 0) {
          end = j;
          break;
        }
      }
    }
    out.push({ kind: 'line', no: ++no, text: lines.slice(i, end + 1).join('\n') });
    i = end + 1;
  }
  // บรรทัดว่างหัว/ท้าย body (เช่น body ลงท้ายด้วย \n) ไม่ใช่การเว้นย่อหน้า — ตัดทิ้งไม่ให้มีที่ว่างเกิน
  let start = 0;
  let stop = out.length;
  while (start < stop && out[start].kind === 'blank') start++;
  while (stop > start && out[stop - 1].kind === 'blank') stop--;
  return out.slice(start, stop);
}

interface PassageRef {
  passageId?: string | null;
  passage?: ExamPassage | null;
}

/**
 * บทอ่านของข้อ: ใช้ `q.passage` (API resolve มาให้ หรือ getPublicExam เติมไว้) ถ้ามี
 * ไม่งั้นหาใน `exam.passages` ด้วย `q.passageId` — ไม่มี/ไม่เจอ → null
 */
export function getQuestionPassage(
  q: PassageRef | null | undefined,
  exam?: { passages?: ExamPassage[] | null } | null,
): ExamPassage | null {
  if (!q) return null;
  const own = normalizePassage(q.passage);
  if (own) return own;
  if (!isNonEmptyString(q.passageId) || !Array.isArray(exam?.passages)) return null;
  return normalizePassage(exam.passages.find((p) => p?.id === q.passageId));
}

/** exam.passages null → [] และเติม `passage` ให้ทุกข้อ (ใช้ใน getPublicExam) */
export function withResolvedPassages<
  T extends { passages?: ExamPassage[] | null; questions?: PassageRef[] | null },
>(exam: T): T {
  if (!exam || typeof exam !== 'object') return exam;
  const passages = Array.isArray(exam.passages) ? exam.passages : [];
  const questions = Array.isArray(exam.questions)
    ? exam.questions.map((q) => ({ ...q, passage: getQuestionPassage(q, { passages }) }))
    : exam.questions;
  return { ...exam, passages, questions };
}

function samePassageValue(a: ExamPassage, b: ExamPassage): boolean {
  if (a === b) return true;
  const ai = getPassageImages(a);
  const bi = getPassageImages(b);
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.body === b.body &&
    passageShowsLineNumbers(a) === passageShowsLineNumbers(b) &&
    ai.length === bi.length &&
    ai.every((x, i) => x === bi[i])
  );
}

/** flag ที่ pack ใส่ให้ข้อที่ตัดบทอ่านออก — unpack เติมบทอ่านคืนเฉพาะข้อที่มี flag นี้ */
export const PACKED_PASSAGE_FLAG = '__passageFromPrevious';

/**
 * ก่อนเก็บ localStorage: ข้อในกลุ่มเดียวกันเก็บบทอ่านเต็มแค่ข้อแรก ข้อถัดไปเหลือ passageId + flag
 * (บทอ่านยาวได้ 100k ตัว × หลายข้อ → QuotaExceededError) — ใช้คู่กับ unpackQuestionPassages ตอนอ่านกลับ
 * เทียบทั้ง id และเนื้อหา (ฝึกตาม topic รวมหลายข้อสอบ id บทอ่านอาจซ้ำข้ามข้อสอบได้)
 */
export function packQuestionPassages<T extends PassageRef>(questions: T[]): T[] {
  const last = new Map<string, ExamPassage>();
  return questions.map((q) => {
    const p = normalizePassage(q?.passage);
    if (!p) return q;
    const prev = last.get(p.id);
    last.set(p.id, p);
    if (prev && samePassageValue(prev, p)) {
      const { passage: _drop, ...rest } = q;
      void _drop;
      return { ...rest, passageId: p.id, [PACKED_PASSAGE_FLAG]: true } as unknown as T;
    }
    return q;
  });
}

/**
 * อ่านกลับจาก localStorage: ข้อที่ pack ตัดบทอ่านออก (มี flag) → ใช้บทอ่านล่าสุดที่ id เดียวกันจากข้อก่อนหน้า แล้วลบ flag
 * ข้อที่ไม่มี flag ไม่ถูกแตะ (ข้อจากแหล่งอื่นที่ไม่มี key passage ไม่ได้บทอ่านของข้ออื่นมาโดยผิด) ข้อมูลรูปแบบเก่า (คัดลอกทุกข้อ) อ่านได้เหมือนเดิม
 */
export function unpackQuestionPassages<T extends PassageRef>(questions: T[]): T[] {
  if (!Array.isArray(questions)) return questions;
  const last = new Map<string, ExamPassage>();
  return questions.map((q) => {
    if (!q || typeof q !== 'object') return q;
    const p = normalizePassage(q.passage);
    if (p) {
      last.set(p.id, p);
      return q;
    }
    const record = q as T & Record<string, unknown>;
    if (record[PACKED_PASSAGE_FLAG] !== true) return q;
    const { [PACKED_PASSAGE_FLAG]: _flag, ...rest } = record;
    void _flag;
    const shared = isNonEmptyString(q.passageId) ? last.get(q.passageId) : undefined;
    return { ...rest, passage: shared ?? null } as T;
  });
}

/** ชื่อที่แสดงของบทอ่าน: title หรือ "บทอ่านที่ n" (index เริ่ม 0) */
export function passageLabel(p: { title?: string | null }, index: number): string {
  return p.title?.trim() || `บทอ่านที่ ${index + 1}`;
}

// ── ฟอร์มแอดมิน ─────────────────────────────────────────────

export interface PassageForm {
  id: string;
  title: string;
  body: string;
  /** URL รูปตามลำดับ (≤ 6) */
  images: string[];
  /** แสดงเลขบรรทัด */
  lineNumbers: boolean;
}

/** id ใหม่รูปแบบ `p-<สุ่ม>` ตรง PASSAGE_ID_PATTERN และไม่ซ้ำกับที่มี */
export function createPassageId(existing: Iterable<string>): string {
  const used = new Set(existing);
  for (;;) {
    const id = `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

export function createEmptyPassage(existingIds: Iterable<string>): PassageForm {
  return { id: createPassageId(existingIds), title: '', body: '', images: [], lineNumbers: false };
}

export function passageFormFromApi(p: ExamPassage): PassageForm {
  return {
    id: p.id,
    title: p.title ?? '',
    body: p.body ?? '',
    images: getPassageImages(p),
    lineNumbers: passageShowsLineNumbers(p),
  };
}

/** payload ของ API: title/body ว่าง → null, lineNumbers เป็น boolean เสมอ (body เก็บตามที่พิมพ์ ไม่ตัดช่องว่าง เพื่อรักษาการขึ้นบรรทัด) */
export function toPassageInput(p: PassageForm): ExamPassageInput {
  return {
    id: p.id,
    title: p.title.trim() || null,
    body: p.body.trim() ? p.body : null,
    images: p.images.filter(isNonEmptyString),
    // ส่งทุกครั้ง (PUT แทนที่บทอ่านทั้งหมด — ไม่ส่ง = API ตั้งเป็น false)
    lineNumbers: p.lineNumbers === true,
  };
}

/** ตรวจบทอ่านก่อนบันทึก คืนข้อความผิดพลาด (ภาษาไทย) ข้อแรก หรือ null ถ้าผ่าน */
export function validatePassageForms(passages: PassageForm[]): string | null {
  if (passages.length > MAX_PASSAGES) return `บทอ่านร่วมมีได้ไม่เกิน ${MAX_PASSAGES} ชุดต่อข้อสอบ`;
  const seen = new Set<string>();
  for (let i = 0; i < passages.length; i++) {
    const p = passages[i];
    const label = `บทอ่านที่ ${i + 1}`;
    if (!PASSAGE_ID_PATTERN.test(p.id) || seen.has(p.id)) return `${label}: รหัสบทอ่านไม่ถูกต้องหรือซ้ำ`;
    seen.add(p.id);
    if (p.title.trim().length > MAX_PASSAGE_TITLE) return `${label}: ชื่อบทอ่านยาวเกิน ${MAX_PASSAGE_TITLE} ตัวอักษร`;
    if (p.body.length > MAX_PASSAGE_BODY) {
      return `${label}: เนื้อหายาวเกิน ${MAX_PASSAGE_BODY.toLocaleString('th-TH')} ตัวอักษร`;
    }
    if (p.images.length > MAX_PASSAGE_IMAGES) return `${label}: ใส่รูปได้ไม่เกิน ${MAX_PASSAGE_IMAGES} รูป`;
    if (p.images.some((url) => url.length > MAX_PASSAGE_IMAGE_URL)) {
      return `${label}: URL รูปยาวได้ไม่เกิน ${MAX_PASSAGE_IMAGE_URL} ตัวอักษร`;
    }
    if (!passageHasContent(p)) return `${label}: ต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง`;
  }
  return null;
}

/** แปลงบทอ่านเป็นรูปร่างเดียวกับข้อ (questionImages) ให้ใช้ collectFormImageUrls / imagesToDiscard ได้ */
export function passageImageHolders(passages: { images: string[] }[]): { questionImages: string[] }[] {
  return passages.map((p) => ({ questionImages: p.images }));
}

/** เลขข้อ (เริ่ม 1) ที่ใช้บทอ่านนี้ */
export function questionNumbersUsingPassage(questions: { passageId?: string | null }[], passageId: string): number[] {
  const out: number[] = [];
  questions.forEach((q, i) => {
    if (q.passageId === passageId) out.push(i + 1);
  });
  return out;
}
