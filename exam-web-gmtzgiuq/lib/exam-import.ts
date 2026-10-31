// นำเข้าชุดข้อสอบจากไฟล์ .zip (exam.json + images/) หรือ .json เดี่ยว
// pure module: ไม่แตะ DOM / fetch — หน้า /admin/exams/import เป็นคนอัปรูปและเรียก createExam
import { strFromU8, unzipSync } from 'fflate';
import type { CreateExamInput, ExamQuestionInput } from '@/lib/api/exams';
import type { QuestionChoice } from '@/lib/api/questions';
import type { Category } from '@/lib/api/categories';
import type { Subject } from '@/lib/api/curriculum';

export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024; // ไฟล์ที่เลือก (.zip/.json)
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ตรงกับ limit ของ POST /upload
const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 200 * 1024 * 1024; // ผลรวมรูปที่แตกจาก zip
const MAX_VARCHAR = 255; // title / chapter / correctAnswer เป็น varchar(255)

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export type ImportIssueLevel = 'error' | 'warning' | 'note';

export interface ImportIssue {
  level: ImportIssueLevel;
  message: string;
}

export interface ImportImage {
  /** path ใน zip เทียบกับโฟลเดอร์ของ exam.json (normalize แล้ว) ใช้เป็น key */
  path: string;
  /** ชื่อไฟล์ (basename) ใช้ตั้งชื่อ File ตอนอัป */
  fileName: string;
  mimeType: string;
  data: Uint8Array;
  /** เลขข้อที่ใช้รูปนี้ */
  usedBy: number[];
}

export type ImportQuestionType = 'multiple_choice' | 'short_answer';

export interface ParsedImportQuestion {
  /** ลำดับหลังเรียงตาม no (0-based) = orderIndex */
  orderIndex: number;
  /** เลขข้อที่แสดง (no ในไฟล์ ถ้าไม่มีใช้ลำดับ) */
  no: number;
  rawType: string;
  type: ImportQuestionType;
  question: string;
  choices: QuestionChoice[];
  correctAnswer: string | null;
  explanation: string | null;
  hint: string | null;
  topicName: string | null;
  /** path รูปที่ใช้ได้ (มีใน zip, นามสกุลถูก, ไม่เกิน 5MB) — key ของ images */
  imagePath: string | null;
  /** path รูปตามที่ไฟล์อ้าง (แสดงในตาราง แม้รูปจะใช้ไม่ได้) */
  imageRef: string | null;
  issues: ImportIssue[];
}

export interface ParsedImport {
  /** ปัญหาระดับไฟล์ — มี error ข้อเดียวก็สร้างไม่ได้ */
  fileIssues: ImportIssue[];
  exam: {
    title: string;
    description: string | null;
    categoryText: string | null;
    durationMinutes: number | null;
  } | null;
  questions: ParsedImportQuestion[];
  /** รูปที่ต้องอัป (dedupe ตาม path) */
  images: ImportImage[];
}

export type ImportQuestionStatus = 'ok' | 'warning' | 'error';

export interface ResolvedImportQuestion extends ParsedImportQuestion {
  topicId: string | null;
  chapterId: string | null;
  chapter: string | null;
  /** true เมื่อจับคู่ topic กับ curriculum ได้ */
  topicMatched: boolean;
  status: ImportQuestionStatus;
}

export interface ResolvedImport {
  fileIssues: ImportIssue[];
  exam: ParsedImport['exam'];
  /** slug หมวดหมู่ที่จับคู่ได้ (null = ต้องให้แอดมินเลือก) */
  matchedCategorySlug: string | null;
  questions: ResolvedImportQuestion[];
  images: ImportImage[];
  hasFileError: boolean;
  /** จำนวนข้อที่มี error */
  errorQuestionCount: number;
  warningQuestionCount: number;
}

// ── helpers ────────────────────────────────────────────────

const err = (message: string): ImportIssue => ({ level: 'error', message });
const warn = (message: string): ImportIssue => ({ level: 'warning', message });
const note = (message: string): ImportIssue => ({ level: 'note', message });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** เลขข้อ: รับ number หรือ string ตัวเลข ("1") */
function parseNo(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

function extOf(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** normalize path ใน zip / ที่ไฟล์อ้าง: `\`→`/` ตัด `./` นำหน้า คืน null ถ้ามี `..` หรือขึ้นต้นด้วย `/` */
export function normalizeZipPath(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments = p.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.length === 0 || segments.includes('..')) return null;
  return segments.join('/');
}

/** path รูปที่ข้อสอบอ้างถึง (images[0].file ของแต่ละข้อ) normalize แล้ว */
function referencedImagePaths(json: unknown): string[] {
  if (!isRecord(json) || !Array.isArray(json.questions)) return [];
  const out: string[] = [];
  for (const q of json.questions) {
    if (!isRecord(q) || !Array.isArray(q.images) || q.images.length === 0) continue;
    const first = q.images[0];
    const path = isRecord(first) ? normalizeZipPath(asText(first.file)) : null;
    if (path) out.push(path);
  }
  return out;
}

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  );
}

function looksLikeJson(bytes: Uint8Array): boolean {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // BOM
  while (i < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i])) i++;
  return bytes[i] === 0x7b; // {
}

function decodeJson(bytes: Uint8Array): { value: unknown } | { error: string } {
  let text = strFromU8(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { error: `ไฟล์ exam.json ไม่ใช่ JSON ที่ถูกต้อง (${detail})` };
  }
}

interface ZipEntry {
  size: number;
  data: Uint8Array | null; // null = ไม่ได้แตก (ใหญ่เกิน limit)
}

interface ImportSource {
  json: unknown;
  /** ไฟล์ทั้งหมดในโฟลเดอร์ของ exam.json (key = path สัมพัทธ์) */
  files: Map<string, ZipEntry>;
  isZip: boolean;
}

function readSource(fileName: string, bytes: Uint8Array): { source: ImportSource } | { error: string } {
  if (bytes.length > MAX_IMPORT_FILE_BYTES) {
    return { error: 'ไฟล์ใหญ่เกิน 100MB' };
  }

  if (isZip(bytes)) {
    const zipError = 'อ่านไฟล์ zip ไม่ได้ ไฟล์อาจเสียหายหรือบีบอัดด้วยวิธีที่ไม่รองรับ';
    const isExamJsonPath = (p: string) => p === 'exam.json' || /^[^/]+\/exam\.json$/.test(p);

    // รอบ 1: อ่านรายชื่อ + ขนาดทุกไฟล์ แตกเฉพาะ exam.json (root หรือโฟลเดอร์ชั้นเดียว)
    const sizes = new Map<string, number>();
    let examEntries: Record<string, Uint8Array>;
    try {
      examEntries = unzipSync(bytes, {
        filter: (info) => {
          const path = info.name.replace(/\\/g, '/');
          if (path.endsWith('/') || path.startsWith('__MACOSX/')) return false;
          sizes.set(path, info.originalSize);
          return isExamJsonPath(path) && info.originalSize <= MAX_JSON_BYTES;
        },
      });
    } catch {
      return { error: zipError };
    }

    let examPath: string | null = null;
    if (sizes.has('exam.json')) {
      examPath = 'exam.json';
    } else {
      const nested = [...sizes.keys()].filter((p) => p !== 'exam.json' && isExamJsonPath(p));
      if (nested.length > 1) {
        return { error: 'พบ exam.json มากกว่า 1 ไฟล์ใน zip กรุณาเหลือไว้ชุดเดียว' };
      }
      examPath = nested[0] ?? null;
    }
    if (!examPath) {
      return { error: 'ไม่พบไฟล์ exam.json ใน zip (ต้องอยู่ที่ root หรือในโฟลเดอร์ชั้นเดียว)' };
    }
    const examData = Object.entries(examEntries).find(([name]) => name.replace(/\\/g, '/') === examPath)?.[1];
    if (!examData) {
      return { error: 'ไฟล์ exam.json ใหญ่เกิน 10MB' };
    }
    const decoded = decodeJson(examData);
    if ('error' in decoded) return { error: decoded.error };

    // map path ใน zip → path สัมพัทธ์กับโฟลเดอร์ของ exam.json
    const baseDir = examPath.slice(0, examPath.length - 'exam.json'.length);
    const relOf = (path: string): string | null =>
      path === examPath || !path.startsWith(baseDir) ? null : normalizeZipPath(path.slice(baseDir.length));

    const files = new Map<string, ZipEntry>();
    for (const [path, size] of sizes) {
      const rel = relOf(path);
      if (rel) files.set(rel, { size, data: null });
    }

    // รอบ 2: แตกเฉพาะรูปที่ exam.json อ้างถึง (ไม่เกิน 5MB ต่อรูป และรวมไม่เกินเพดาน)
    const wanted = new Set<string>();
    let wantedBytes = 0;
    for (const rel of referencedImagePaths(decoded.value)) {
      const entry = files.get(rel);
      if (!entry || entry.size > MAX_IMAGE_BYTES || !IMAGE_MIME[extOf(rel)]) continue;
      wanted.add(rel);
      wantedBytes += entry.size;
    }
    if (wantedBytes > MAX_TOTAL_IMAGE_BYTES) {
      return { error: 'รูปที่อ้างถึงรวมกันใหญ่เกิน 200MB กรุณาแบ่งเป็นหลายชุด' };
    }
    if (wanted.size > 0) {
      let imageEntries: Record<string, Uint8Array>;
      try {
        imageEntries = unzipSync(bytes, {
          filter: (info) => {
            const rel = relOf(info.name.replace(/\\/g, '/'));
            return !!rel && wanted.has(rel) && info.originalSize <= MAX_IMAGE_BYTES;
          },
        });
      } catch {
        return { error: zipError };
      }
      for (const [name, data] of Object.entries(imageEntries)) {
        const rel = relOf(name.replace(/\\/g, '/'));
        if (rel) files.set(rel, { size: data.length, data });
      }
    }

    return { source: { json: decoded.value, files, isZip: true } };
  }

  if (fileName.toLowerCase().endsWith('.json') || looksLikeJson(bytes)) {
    if (bytes.length > MAX_JSON_BYTES) return { error: 'ไฟล์ JSON ใหญ่เกิน 10MB' };
    const decoded = decodeJson(bytes);
    if ('error' in decoded) return { error: decoded.error };
    return { source: { json: decoded.value, files: new Map(), isZip: false } };
  }

  return { error: 'ไฟล์ไม่ใช่ .zip หรือ .json กรุณาเลือกไฟล์ที่สร้างตามรูปแบบนำเข้า' };
}

// ── parse ─────────────────────────────────────────────────

/** แตก zip / อ่าน json แล้วตรวจและแมปเป็นข้อมูลนำเข้า (ยังไม่จับคู่ category/topic) */
export function parseImportFile(fileName: string, bytes: Uint8Array): ParsedImport {
  const read = readSource(fileName, bytes);
  if ('error' in read) {
    return { fileIssues: [err(read.error)], exam: null, questions: [], images: [] };
  }
  return parseExamJson(read.source.json, read.source.files, read.source.isZip);
}

function parseExamJson(json: unknown, files: Map<string, ZipEntry>, fromZip: boolean): ParsedImport {
  const fileIssues: ImportIssue[] = [];
  const empty: ParsedImport = { fileIssues, exam: null, questions: [], images: [] };

  if (!isRecord(json)) {
    fileIssues.push(err('รูปแบบ exam.json ไม่ถูกต้อง (ต้องเป็น object)'));
    return empty;
  }

  const examRaw = json.exam;
  if (!isRecord(examRaw)) {
    fileIssues.push(err('ไม่พบข้อมูลชุดข้อสอบ (exam) ในไฟล์'));
    return empty;
  }

  const title = asText(examRaw.title).trim();
  if (!title) fileIssues.push(err('ไม่มีชื่อชุดข้อสอบ (exam.title)'));
  else if (title.length > MAX_VARCHAR) fileIssues.push(err(`ชื่อชุดข้อสอบยาวเกิน ${MAX_VARCHAR} ตัวอักษร`));

  const description = asText(examRaw.note).trim() || null;
  const categoryText = asText(examRaw.category).trim() || null;

  let durationMinutes: number | null = null;
  const dur = examRaw.duration_minutes;
  if (dur !== undefined && dur !== null) {
    if (typeof dur === 'number' && Number.isInteger(dur) && dur > 0) {
      durationMinutes = dur;
    } else {
      fileIssues.push(warn(`เวลาทำข้อสอบ (duration_minutes) "${String(dur)}" ไม่ใช่จำนวนเต็มบวก จะไม่จับเวลา`));
    }
  }

  const status = asText(examRaw.status).trim();
  if (status && status !== 'draft') {
    fileIssues.push(note(`สถานะในไฟล์คือ "${status}" แต่ระบบจะสร้างเป็นแบบร่างเสมอ`));
  }

  if (Array.isArray(json.passage_groups) && json.passage_groups.length > 0) {
    fileIssues.push(warn('ไฟล์มีบทอ่านร่วม (passage_groups) ซึ่งยังไม่รองรับ บทอ่านจะไม่ถูกนำเข้า'));
  }

  const rawQuestions = json.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    fileIssues.push(err('ไม่พบข้อสอบในไฟล์ (questions ว่าง)'));
    return { ...empty, exam: { title, description, categoryText, durationMinutes } };
  }

  // เรียงตาม no (ข้อที่ไม่มี no ไปท้าย เรียงตามลำดับเดิม)
  const ordered = rawQuestions
    .map((q, i) => ({ q, i, no: isRecord(q) ? parseNo(q.no) : null }))
    .sort((a, b) => {
      if (a.no !== null && b.no !== null) return a.no - b.no || a.i - b.i;
      if (a.no !== null) return -1;
      if (b.no !== null) return 1;
      return a.i - b.i;
    });

  const seenNo = new Set<number>();
  const images = new Map<string, ImportImage>();

  const questions = ordered.map(({ q, no }, orderIndex): ParsedImportQuestion => {
    const displayNo = no ?? orderIndex + 1;
    const issues: ImportIssue[] = [];
    const base: ParsedImportQuestion = {
      orderIndex,
      no: displayNo,
      rawType: '',
      type: 'multiple_choice',
      question: '',
      choices: [],
      correctAnswer: null,
      explanation: null,
      hint: null,
      topicName: null,
      imagePath: null,
      imageRef: null,
      issues,
    };

    if (!isRecord(q)) {
      issues.push(err('ข้อมูลข้อนี้ไม่ถูกต้อง (ต้องเป็น object)'));
      return base;
    }

    if (no === null) issues.push(warn('ไม่มีเลขข้อ (no) ใช้ลำดับในไฟล์แทน'));
    else if (seenNo.has(no)) issues.push(warn(`เลขข้อ ${no} ซ้ำกับข้ออื่น`));
    if (no !== null) seenNo.add(no);

    // type
    const rawType = asText(q.type).trim();
    base.rawType = rawType;
    if (rawType === 'mcq') base.type = 'multiple_choice';
    else if (rawType === 'numeric') base.type = 'short_answer';
    else issues.push(err(`ประเภทข้อ "${rawType || '(ว่าง)'}" ไม่รองรับ (รองรับ mcq, numeric)`));

    // stem
    const stem = asText(q.stem);
    if (!stem.trim()) issues.push(err('ไม่มีโจทย์ (stem)'));
    base.question = stem;

    // images
    const imgs = Array.isArray(q.images) ? q.images : [];
    if (imgs.length > 0) {
      if (imgs.length > 1) issues.push(warn(`มีรูป ${imgs.length} รูป ใช้ได้แค่รูปแรก`));
      const first = imgs[0];
      const ref = isRecord(first) ? asText(first.file).trim() : '';
      if (!ref) {
        issues.push(err('ไม่ได้ระบุไฟล์รูป (images[0].file)'));
      } else {
        base.imageRef = ref;
        const path = normalizeZipPath(ref);
        const ext = path ? extOf(path) : '';
        const entry = path ? files.get(path) : undefined;
        if (!path) {
          issues.push(err(`path รูปไม่ถูกต้อง "${ref}" (ห้ามมี .. หรือขึ้นต้นด้วย /)`));
        } else if (!IMAGE_MIME[ext]) {
          issues.push(err(`ไม่รองรับไฟล์รูปชนิดนี้ "${ref}" (รองรับ png, jpg, jpeg, gif, webp)`));
        } else if (!entry) {
          issues.push(err(fromZip ? `ไม่พบรูป "${ref}" ใน zip` : `ไม่พบรูป "${ref}" (นำเข้าไฟล์ .json เดี่ยวจะไม่มีรูป ให้ใช้ .zip)`));
        } else if (entry.size > MAX_IMAGE_BYTES || !entry.data) {
          issues.push(err(`รูป "${ref}" ใหญ่เกิน 5MB`));
        } else {
          base.imagePath = path;
          const existing = images.get(path);
          if (existing) existing.usedBy.push(displayNo);
          else {
            images.set(path, {
              path,
              fileName: basename(path),
              mimeType: IMAGE_MIME[ext],
              data: entry.data,
              usedBy: [displayNo],
            });
          }
        }
      }
    }

    // choices / answer
    if (base.type === 'multiple_choice' && rawType === 'mcq') {
      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      if (rawChoices.length < 2 || rawChoices.length > 6) {
        issues.push(err(`ต้องมีตัวเลือก 2–6 ตัว (พบ ${rawChoices.length} ตัว)`));
      }
      let labelProblem = false;
      let choiceImage = false;
      const seenLabels = new Set<string>();
      const labels: string[] = [];
      const texts: string[] = [];
      rawChoices.forEach((c, i) => {
        const label = isRecord(c) ? asText(c.label).trim().toUpperCase() : '';
        const text = isRecord(c) ? asText(c.text) : '';
        if (isRecord(c) && c.image !== undefined && c.image !== null && c.image !== '') choiceImage = true;
        if (!CHOICE_LABELS.includes(label)) {
          labelProblem = true;
          issues.push(err(`ตัวเลือกที่ ${i + 1} มี label "${label || '(ว่าง)'}" ไม่ถูกต้อง (ต้องเป็น A–F)`));
        } else if (seenLabels.has(label)) {
          labelProblem = true;
          issues.push(err(`label ตัวเลือก "${label}" ซ้ำกัน`));
        }
        seenLabels.add(label);
        labels.push(label);
        texts.push(text);
        if (!text.trim()) issues.push(warn(`ตัวเลือก ${label || i + 1} ไม่มีข้อความ`));
      });
      if (choiceImage) issues.push(warn('ยังไม่รองรับรูปในตัวเลือก รูปในตัวเลือกจะไม่ถูกนำเข้า'));

      const correct = asText(q.correct).trim().toUpperCase();
      if (!correct) {
        issues.push(err('ไม่ได้ระบุคำตอบที่ถูก (correct)'));
      } else if (!labels.includes(correct)) {
        issues.push(err(`คำตอบที่ถูก "${correct}" ไม่ตรงกับตัวเลือกใด`));
      }

      // เกิน 6 ตัว (error ไปแล้ว) → ใช้ 6 ตัวแรก (a–f) ให้หน้าแก้ไข/หน้าทำข้อสอบรองรับ
      base.choices = labels.slice(0, CHOICE_LABELS.length).map((label, i) => ({
        // label เพี้ยน → ใช้ a, b, c, ... ตามลำดับ ให้หน้าแก้ไขเปิดได้
        id: labelProblem ? String.fromCharCode(97 + i) : label.toLowerCase(),
        text: texts[i],
        isCorrect: !!correct && label === correct,
      }));

      if (Array.isArray(q.correct_multi) && q.correct_multi.length > 1) {
        issues.push(warn('ยังไม่รองรับตอบถูกหลายข้อ ใช้ correct ข้อเดียวไปก่อน'));
      }
    } else if (base.type === 'short_answer' && rawType === 'numeric') {
      const value = asText(q.correct_value).trim();
      if (!value) {
        issues.push(err('ไม่มีคำตอบ (correct_value)'));
      } else if (value.length > MAX_VARCHAR) {
        issues.push(err(`คำตอบ (correct_value) ยาวเกิน ${MAX_VARCHAR} ตัวอักษร`));
        base.correctAnswer = value.slice(0, MAX_VARCHAR);
      } else {
        base.correctAnswer = value;
      }
    }

    // explanation / hint
    const explanation = asText(q.explanation);
    if (explanation.trim()) base.explanation = explanation;
    else issues.push(warn('ไม่มีคำอธิบายเฉลย'));
    const hint = asText(q.hint);
    if (hint.trim()) base.hint = hint;

    // topic (จับคู่ทีหลังใน resolveImport)
    base.topicName = asText(q.topic).trim() || null;

    if (q.passage_group !== undefined && q.passage_group !== null && q.passage_group !== '') {
      issues.push(warn('ยังไม่รองรับบทอ่านร่วม บทอ่านจะไม่ถูกต่อเข้าโจทย์'));
    }

    const reviewNote = asText(q.review_note).trim();
    if (reviewNote) issues.push(note(reviewNote));

    return base;
  });

  return {
    fileIssues,
    exam: { title, description, categoryText, durationMinutes },
    questions,
    images: [...images.values()],
  };
}

// ── resolve (category / topic) ────────────────────────────

interface TopicRef {
  id: string;
  name: string;
  chapterId: string;
  subjectId: string;
}

function flattenTopics(subjects: Subject[]): TopicRef[] {
  const out: TopicRef[] = [];
  for (const s of subjects) {
    for (const c of s.chapters ?? []) {
      for (const t of c.topics ?? []) {
        out.push({ id: t.id, name: t.name, chapterId: t.chapterId || c.id, subjectId: s.id });
      }
    }
  }
  return out;
}

function statusOf(issues: ImportIssue[]): ImportQuestionStatus {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warning')) return 'warning';
  return 'ok';
}

export function matchCategory(categoryText: string | null, categories: Category[]): string | null {
  if (!categoryText) return null;
  const key = normKey(categoryText);
  const found = categories.find((c) => normKey(c.name) === key || normKey(c.slug) === key);
  return found ? found.slug : null;
}

/** จับคู่หมวดหมู่และ topic กับข้อมูลในระบบ (เรียกใหม่ทุกครั้งที่เปลี่ยนวิชา) */
export function resolveImport(
  parsed: ParsedImport,
  ctx: { categories: Category[]; subjects: Subject[]; subjectId: string | null },
): ResolvedImport {
  const allTopics = flattenTopics(ctx.subjects);
  const scope = ctx.subjectId ? allTopics.filter((t) => t.subjectId === ctx.subjectId) : allTopics;

  const questions = parsed.questions.map((q): ResolvedImportQuestion => {
    const issues = [...q.issues];
    let topicId: string | null = null;
    let chapterId: string | null = null;
    let chapter: string | null = null;
    let topicMatched = false;

    if (q.topicName) {
      const key = normKey(q.topicName);
      const matches = scope.filter((t) => normKey(t.name) === key);
      if (matches.length === 1) {
        topicId = matches[0].id;
        chapterId = matches[0].chapterId;
        chapter = matches[0].name;
        topicMatched = true;
      } else {
        chapter = q.topicName.slice(0, MAX_VARCHAR);
        if (matches.length > 1) {
          issues.push(
            warn(
              ctx.subjectId
                ? `หัวข้อ "${q.topicName}" ซ้ำกันหลายบทในวิชาที่เลือก ยังไม่ผูกหัวข้อ`
                : `หัวข้อ "${q.topicName}" มีหลายวิชา เลือกวิชาก่อนเพื่อจับคู่`,
            ),
          );
        } else {
          issues.push(
            warn(
              ctx.subjectId
                ? `ไม่พบหัวข้อ "${q.topicName}" ในวิชาที่เลือก`
                : `ไม่พบหัวข้อ "${q.topicName}" ในหลักสูตร`,
            ),
          );
        }
      }
    }

    return { ...q, issues, topicId, chapterId, chapter, topicMatched, status: statusOf(issues) };
  });

  return {
    fileIssues: parsed.fileIssues,
    exam: parsed.exam,
    matchedCategorySlug: matchCategory(parsed.exam?.categoryText ?? null, ctx.categories),
    questions,
    images: parsed.images,
    hasFileError: parsed.fileIssues.some((i) => i.level === 'error'),
    errorQuestionCount: questions.filter((q) => q.status === 'error').length,
    warningQuestionCount: questions.filter((q) => q.status === 'warning').length,
  };
}

// ── build payload ─────────────────────────────────────────

/** สร้าง payload ของ createExam (สถานะ draft เสมอ) imageUrls: path รูป → url ที่อัปได้ */
export function buildCreateExamInput(
  resolved: ResolvedImport,
  opts: { category: string; subjectId: string | null; imageUrls: Record<string, string> },
): CreateExamInput {
  if (!resolved.exam || resolved.hasFileError) {
    throw new Error('ไฟล์มีข้อผิดพลาด สร้างชุดข้อสอบไม่ได้');
  }
  const questions: ExamQuestionInput[] = resolved.questions.map((q) => ({
    question: q.question,
    questionImage: (q.imagePath && opts.imageUrls[q.imagePath]) || undefined,
    type: q.type,
    choices: q.type === 'short_answer' ? [] : q.choices,
    correctAnswer: q.type === 'short_answer' ? (q.correctAnswer ?? '') : undefined,
    explanation: q.explanation ?? undefined,
    hint: q.hint ?? undefined,
    orderIndex: q.orderIndex,
    topicId: q.topicId,
    chapterId: q.chapterId,
    chapter: q.chapter,
  }));

  return {
    title: resolved.exam.title,
    description: resolved.exam.description ?? undefined,
    category: opts.category,
    status: 'draft',
    questions,
    subjectId: opts.subjectId || null,
    durationMinutes: resolved.exam.durationMinutes,
  };
}
