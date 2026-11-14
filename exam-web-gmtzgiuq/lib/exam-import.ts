// นำเข้าชุดข้อสอบจากไฟล์ .zip (exam.json + images/) หรือ .json เดี่ยว
// pure module: ไม่แตะ DOM / fetch — หน้า /admin/exams/import เป็นคนอัปรูปและเรียก createExam
//
// Question Bank (task 20) — field เพิ่มเติม (ไม่ใส่ = ชุด/ข้อปกติ, รับทั้ง snake_case และ camelCase):
//   exam.bank_only (หรือ exam.bankOnly): true      → ชุดใช้เฉพาะ Question Bank (ซ่อนจากรายการชุดข้อสอบ)
//   questions[].is_challenge (หรือ isChallenge): true → ข้อ Challenge — มีผลเฉพาะชุดที่ bank_only
//   ค่าที่ไม่ใช่ boolean → คำเตือน แล้วใช้ false ; ตัวอย่างไฟล์: lib/__fixtures__/exam-import-bank-sample.json
//   questions[].difficulty: "easy" | "medium" | "hard" (หรือ ง่าย / ปานกลาง / ยาก) ไม่ใส่ = medium ; ค่าอื่น → คำเตือน แล้วใช้ medium
import { strFromU8, unzipSync } from 'fflate';
import type { CreateExamInput, ExamPassageInput, ExamQuestionInput } from '@/lib/api/exams';
import type { QuestionChoice, QuestionDifficulty } from '@/lib/api/questions';
import { MAX_QUESTION_IMAGES, toChoiceInput } from '@/lib/question-images';
import {
  MAX_PASSAGE_BODY,
  MAX_PASSAGE_IMAGES,
  MAX_PASSAGE_TITLE,
  MAX_PASSAGES,
  PASSAGE_ID_PATTERN,
} from '@/lib/exam-passages';
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
  /** เลขข้อที่ใช้รูปนี้ (รูปโจทย์หรือรูปตัวเลือก ไม่ซ้ำ) */
  usedBy: number[];
  /** id บทอ่าน (passage_groups) ที่ใช้รูปนี้ */
  usedByPassages: string[];
}

/** ตัวเลือกที่นำเข้า: รูปเก็บเป็น path ใน zip (แปลงเป็น URL ตอนสร้างข้อสอบ) */
export interface ImportChoice extends QuestionChoice {
  /** path รูปที่ใช้ได้ (key ของ images) */
  imagePath: string | null;
  /** path รูปตามที่ไฟล์อ้าง (แม้รูปจะใช้ไม่ได้) */
  imageRef: string | null;
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
  choices: ImportChoice[];
  correctAnswer: string | null;
  explanation: string | null;
  hint: string | null;
  topicName: string | null;
  /** path รูปโจทย์ที่ใช้ได้ตามลำดับ (มีใน zip, นามสกุลถูก, ไม่เกิน 5MB) — key ของ images */
  imagePaths: string[];
  /** path รูปโจทย์ตามที่ไฟล์อ้าง (แสดงในตาราง แม้รูปจะใช้ไม่ได้) */
  imageRefs: string[];
  /** `passage_group` ตามที่ไฟล์ระบุ (null = ไม่ระบุ) */
  passageGroupRef: string | null;
  /** id บทอ่านที่ผูกจริง (จาก passage_group หรือ applies_to) null = ไม่ใช้บทอ่าน */
  passageId: string | null;
  /**
   * `is_challenge` (หรือ `isChallenge`) = true → ข้อ Challenge (task 20)
   * ส่งเป็นข้อ Challenge จริงเฉพาะเมื่อชุดเป็น bankOnly (ดู buildCreateExamInput)
   */
  isChallenge: boolean;
  /** `difficulty` (round 2) — ไม่ใส่/ค่าที่ไม่รู้จัก = medium */
  difficulty: QuestionDifficulty;
  issues: ImportIssue[];
}

export type ImportQuestionStatus = 'ok' | 'warning' | 'error';

/** บทอ่านร่วมจาก `passage_groups[]` */
export interface ParsedImportPassage {
  /** id ตามไฟล์ ('' = ไม่มี) ใช้เป็น id ของบทอ่านในข้อสอบ */
  id: string;
  title: string | null;
  body: string | null;
  /** path รูปที่ใช้ได้ตามลำดับ (key ของ images) */
  imagePaths: string[];
  /** path รูปตามที่ไฟล์อ้าง */
  imageRefs: string[];
  /** เลขข้อตาม `applies_to` */
  appliesTo: number[];
  /** `_example_only: true` */
  exampleOnly: boolean;
  /** `line_numbers: true` → แสดงเลขบรรทัด (ไม่มี/null/ค่าไม่ใช่ boolean = false) */
  lineNumbers: boolean;
  /** เลขข้อที่ผูกกับบทอ่านนี้จริง (passage_group เป็นหลัก ไม่งั้น applies_to) */
  usedBy: number[];
  /** ส่งเข้า API ได้ (id ถูก/ไม่ซ้ำ, body ไม่เกิน, มีเนื้อหาหรือรูปที่ใช้ได้) — false = ไม่นำเข้าชุดนี้ */
  usable: boolean;
  issues: ImportIssue[];
  status: ImportQuestionStatus;
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
  passages: ParsedImportPassage[];
  /** รูปที่ต้องอัป (dedupe ตาม path) */
  images: ImportImage[];
  /** `exam.bank_only` (หรือ `exam.bankOnly`) = true → ชุดใช้เฉพาะ Question Bank (task 20) ค่าเริ่มต้นของสวิตช์ในหน้านำเข้า */
  bankOnly: boolean;
}

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
  passages: ParsedImportPassage[];
  images: ImportImage[];
  /** ค่าจากไฟล์ (หน้านำเข้าให้แอดมินเปลี่ยนได้) */
  bankOnly: boolean;
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
/**
 * อ่าน flag boolean ที่รับได้ทั้ง snake_case และ camelCase (เช่น bank_only / bankOnly)
 * ไม่มี / null = false ; ค่าที่ไม่ใช่ boolean = invalid (ผู้เรียกเตือนแล้วใช้ false)
 */
function readFlag(obj: Record<string, unknown>, keys: string[]): { value: boolean; invalid: unknown } {
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') return { value: v, invalid: undefined };
    return { value: false, invalid: v };
  }
  return { value: false, invalid: undefined };
}

const DIFFICULTY_ALIASES: Record<string, QuestionDifficulty> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  'ง่าย': 'easy',
  'ปานกลาง': 'medium',
  'ยาก': 'hard',
};

/** difficulty ของข้อ: ไม่มี/null/ว่าง = medium (ไม่เตือน) ; ค่าที่ไม่รู้จัก → invalid */
function readDifficulty(v: unknown): { value: QuestionDifficulty; invalid: unknown } {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return { value: 'medium', invalid: undefined };
  const key = typeof v === 'string' ? v.trim().toLowerCase() : '';
  // hasOwn: กัน key ของ prototype ("constructor", "__proto__", "toString") ถูกนับว่าใช้ได้
  const found = Object.hasOwn(DIFFICULTY_ALIASES, key) ? DIFFICULTY_ALIASES[key] : undefined;
  return found ? { value: found, invalid: undefined } : { value: 'medium', invalid: v };
}

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

/** ไม่ได้ใส่รูป (ไม่มี key / null / สตริงว่าง) */
function isNoImage(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** path รูปตามที่ไฟล์อ้าง: รับ `"images/a.png"` หรือ `{ "file": "images/a.png", "alt": "..." }` (ระบุไม่ได้ → '') */
function imageRefOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (isRecord(v)) return asText(v.file).trim();
  return '';
}

/** path รูปที่ข้อสอบอ้างถึง (images[] ทุกรูป + choices[].image ของทุกข้อ + รูปของ passage_groups) normalize แล้ว */
function referencedImagePaths(json: unknown): string[] {
  if (!isRecord(json)) return [];
  const out = new Set<string>();
  const add = (v: unknown) => {
    const path = isNoImage(v) ? null : normalizeZipPath(imageRefOf(v));
    if (path) out.add(path);
  };
  if (Array.isArray(json.questions)) {
    for (const q of json.questions) {
      if (!isRecord(q)) continue;
      if (Array.isArray(q.images)) q.images.slice(0, MAX_QUESTION_IMAGES).forEach(add);
      if (Array.isArray(q.choices)) {
        q.choices.slice(0, CHOICE_LABELS.length).forEach((c) => isRecord(c) && add(c.image));
      }
    }
  }
  if (Array.isArray(json.passage_groups)) {
    for (const g of json.passage_groups.slice(0, MAX_PASSAGES)) {
      if (isRecord(g) && Array.isArray(g.images)) g.images.slice(0, MAX_PASSAGE_IMAGES).forEach(add);
    }
  }
  return [...out];
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
    return { fileIssues: [err(read.error)], exam: null, questions: [], passages: [], images: [], bankOnly: false };
  }
  return parseExamJson(read.source.json, read.source.files, read.source.isZip);
}

type ImageUsage = { questionNo: number } | { passageId: string };

/**
 * ตัวตรวจรูปหนึ่งรูป (path/ชนิด/มีใน zip/ขนาด) ใช้ร่วมกันทั้งรูปโจทย์ รูปตัวเลือก และรูปบทอ่าน
 * คืน path ที่ใช้ได้ หรือ null (ใส่ error ลง issues); รูปที่ใช้ได้ถูกจดลง images ครั้งเดียวต่อ path
 */
function createImageResolver(files: Map<string, ZipEntry>, fromZip: boolean, images: Map<string, ImportImage>) {
  return (ref: string, prefix: string, issues: ImportIssue[], usage: ImageUsage): string | null => {
    const path = normalizeZipPath(ref);
    const ext = path ? extOf(path) : '';
    const entry = path ? files.get(path) : undefined;
    if (!path) {
      issues.push(err(`${prefix}path รูปไม่ถูกต้อง "${ref}" (ห้ามมี .. หรือขึ้นต้นด้วย /)`));
    } else if (!IMAGE_MIME[ext]) {
      issues.push(err(`${prefix}ไม่รองรับไฟล์รูปชนิดนี้ "${ref}" (รองรับ png, jpg, jpeg, gif, webp)`));
    } else if (!entry) {
      issues.push(
        err(
          fromZip
            ? `${prefix}ไม่พบรูป "${ref}" ใน zip`
            : `${prefix}ไม่พบรูป "${ref}" (นำเข้าไฟล์ .json เดี่ยวจะไม่มีรูป ให้ใช้ .zip)`,
        ),
      );
    } else if (entry.size > MAX_IMAGE_BYTES || !entry.data) {
      issues.push(err(`${prefix}รูป "${ref}" ใหญ่เกิน 5MB`));
    } else {
      // อัปโหลดครั้งเดียวต่อ path แม้หลายข้อ/หลายตัวเลือก/บทอ่านใช้ร่วมกัน
      let image = images.get(path);
      if (!image) {
        image = { path, fileName: basename(path), mimeType: IMAGE_MIME[ext], data: entry.data, usedBy: [], usedByPassages: [] };
        images.set(path, image);
      }
      if ('questionNo' in usage) {
        if (!image.usedBy.includes(usage.questionNo)) image.usedBy.push(usage.questionNo);
      } else if (!image.usedByPassages.includes(usage.passageId)) {
        image.usedByPassages.push(usage.passageId);
      }
      return path;
    }
    return null;
  };
}

function parseExamJson(json: unknown, files: Map<string, ZipEntry>, fromZip: boolean): ParsedImport {
  const fileIssues: ImportIssue[] = [];
  const empty: ParsedImport = { fileIssues, exam: null, questions: [], passages: [], images: [], bankOnly: false };

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

  // ใช้เฉพาะ Question Bank (task 20)
  const bankFlag = readFlag(examRaw, ['bank_only', 'bankOnly']);
  if (bankFlag.invalid !== undefined) {
    fileIssues.push(warn(`bank_only ต้องเป็น true หรือ false (พบ ${describeJsonValue(bankFlag.invalid)}) จะนำเข้าเป็นชุดปกติ`));
  }
  const bankOnly = bankFlag.value;

  const rawQuestions = json.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    fileIssues.push(err('ไม่พบข้อสอบในไฟล์ (questions ว่าง)'));
    return { ...empty, exam: { title, description, categoryText, durationMinutes }, bankOnly };
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
  const resolveImageFor = createImageResolver(files, fromZip, images);

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
      imagePaths: [],
      imageRefs: [],
      passageGroupRef: null,
      passageId: null,
      isChallenge: false,
      difficulty: 'medium',
      issues,
    };

    /** ตรวจรูปหนึ่งรูปของข้อนี้ คืน path ที่ใช้ได้ หรือ null; prefix บอกว่าเป็นรูปไหน */
    const resolveImage = (ref: string, prefix: string): string | null =>
      resolveImageFor(ref, prefix, issues, { questionNo: displayNo });

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

    // images (ทุกรูปตามลำดับ สูงสุด 6)
    const imgs = Array.isArray(q.images) ? q.images : [];
    if (imgs.length > MAX_QUESTION_IMAGES) {
      issues.push(
        err(`มีรูป ${imgs.length} รูป เกินสูงสุด ${MAX_QUESTION_IMAGES} รูปต่อข้อ (นำเข้าเฉพาะ ${MAX_QUESTION_IMAGES} รูปแรก)`),
      );
    }
    imgs.slice(0, MAX_QUESTION_IMAGES).forEach((img, i) => {
      const ref = imageRefOf(img);
      if (!ref) {
        issues.push(err(`ไม่ได้ระบุไฟล์รูป (images[${i}].file)`));
        return;
      }
      base.imageRefs.push(ref);
      const path = resolveImage(ref, imgs.length > 1 ? `รูปที่ ${i + 1}: ` : '');
      if (path) base.imagePaths.push(path);
    });

    // choices / answer
    if (base.type === 'multiple_choice' && rawType === 'mcq') {
      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      if (rawChoices.length < 2 || rawChoices.length > 6) {
        issues.push(err(`ต้องมีตัวเลือก 2–6 ตัว (พบ ${rawChoices.length} ตัว)`));
      }
      let labelProblem = false;
      const seenLabels = new Set<string>();
      const labels: string[] = [];
      const texts: string[] = [];
      const choiceImageRefs: (string | null)[] = [];
      const choiceImagePaths: (string | null)[] = [];
      rawChoices.forEach((c, i) => {
        const label = isRecord(c) ? asText(c.label).trim().toUpperCase() : '';
        const text = isRecord(c) ? asText(c.text) : '';
        const rawImage = isRecord(c) ? c.image : undefined;
        let imageRef: string | null = null;
        let imagePath: string | null = null;
        // ตัวเลือกเกิน 6 ตัว (error ไปแล้ว) ไม่ถูกนำเข้า → ไม่ต้องตรวจ/อัปรูป
        if (!isNoImage(rawImage) && i < CHOICE_LABELS.length) {
          const ref = imageRefOf(rawImage);
          const prefix = `ตัวเลือก ${label || i + 1}: `;
          if (!ref) {
            issues.push(err(`${prefix}ไม่ได้ระบุไฟล์รูป (image ต้องเป็น path หรือ { "file": ... })`));
          } else {
            imageRef = ref;
            imagePath = resolveImage(ref, prefix);
          }
        }
        choiceImageRefs.push(imageRef);
        choiceImagePaths.push(imagePath);
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
        // ตัวเลือกที่เป็นรูปล้วนไม่ต้องมีข้อความ
        if (!text.trim() && !imageRef) issues.push(warn(`ตัวเลือก ${label || i + 1} ไม่มีข้อความ`));
      });

      const correct = asText(q.correct).trim().toUpperCase();
      // correct_multi (array ไม่ว่าง) ใช้แทน correct — ตัดซ้ำ, ตัวเดียว = ข้อปกติ
      const multiRaw = Array.isArray(q.correct_multi) ? q.correct_multi : [];
      if (
        !Array.isArray(q.correct_multi) &&
        q.correct_multi !== undefined &&
        q.correct_multi !== null &&
        q.correct_multi !== ''
      ) {
        issues.push(warn('correct_multi ต้องเป็น array เช่น ["B","C"] — ไม่ได้ใช้ค่านี้ ใช้ correct แทน'));
      }
      const correctSet = new Set<string>();
      if (multiRaw.length > 0) {
        const multi = [...new Set(multiRaw.map((v) => asText(v).trim().toUpperCase()))];
        const unknown = multi.filter((l) => !labels.includes(l));
        if (unknown.length > 0) {
          const shown = unknown.map((l) => `"${l || '(ว่าง)'}"`).join(', ');
          issues.push(err(`คำตอบที่ถูก (correct_multi) ${shown} ไม่ตรงกับตัวเลือกใด`));
        }
        multi.filter((l) => labels.includes(l)).forEach((l) => correctSet.add(l));
        if (correct && !multi.includes(correct)) {
          issues.push(warn(`correct "${correct}" ไม่อยู่ใน correct_multi ใช้ correct_multi เป็นเฉลย`));
        }
      } else if (!correct) {
        issues.push(err('ไม่ได้ระบุคำตอบที่ถูก (correct)'));
      } else if (!labels.includes(correct)) {
        issues.push(err(`คำตอบที่ถูก "${correct}" ไม่ตรงกับตัวเลือกใด`));
      } else {
        correctSet.add(correct);
      }

      const grading = asText(q.grading).trim();
      if (grading && grading !== 'all_or_none') {
        issues.push(warn(`วิธีให้คะแนน (grading) "${grading}" ไม่รองรับ ระบบรองรับเฉพาะ all_or_none (ต้องเลือกครบทุกข้อที่ถูกจึงได้คะแนน)`));
      }

      // เกิน 6 ตัว (error ไปแล้ว) → ใช้ 6 ตัวแรก (a–f) ให้หน้าแก้ไข/หน้าทำข้อสอบรองรับ
      base.choices = labels.slice(0, CHOICE_LABELS.length).map((label, i) => ({
        // label เพี้ยน → ใช้ a, b, c, ... ตามลำดับ ให้หน้าแก้ไขเปิดได้
        id: labelProblem ? String.fromCharCode(97 + i) : label.toLowerCase(),
        text: texts[i],
        isCorrect: correctSet.has(label),
        imagePath: choiceImagePaths[i],
        imageRef: choiceImageRefs[i],
      }));
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

    // บทอ่านร่วม (ผูกจริงหลังอ่าน passage_groups — ดู bindPassages)
    base.passageGroupRef = asText(q.passage_group).trim() || null;

    // ข้อ Challenge (task 20)
    const challengeFlag = readFlag(q, ['is_challenge', 'isChallenge']);
    if (challengeFlag.invalid !== undefined) {
      issues.push(warn(`is_challenge ต้องเป็น true หรือ false (พบ ${describeJsonValue(challengeFlag.invalid)}) จะนำเข้าเป็นข้อปกติ`));
    }
    base.isChallenge = challengeFlag.value;

    // ระดับความยาก (round 2)
    const diff = readDifficulty(q.difficulty);
    if (diff.invalid !== undefined) {
      issues.push(
        warn(`ระดับความยาก (difficulty) ${describeJsonValue(diff.invalid)} ไม่รองรับ (ใช้ได้ easy, medium, hard) จะนำเข้าเป็นปานกลาง`),
      );
    }
    base.difficulty = diff.value;

    const reviewNote = asText(q.review_note).trim();
    if (reviewNote) issues.push(note(reviewNote));

    return base;
  });

  // บทอ่านอ่านหลังข้อ (ลำดับรูปที่อัปยังเป็นรูปข้อก่อน) แล้วผูกกับข้อ
  const passages = parsePassageGroups(json.passage_groups, fileIssues, resolveImageFor);
  bindPassages(questions, passages);

  return {
    fileIssues,
    exam: { title, description, categoryText, durationMinutes },
    questions,
    passages,
    images: [...images.values()],
    bankOnly,
  };
}

// ── passage_groups ────────────────────────────────────────

const MAX_VALUE_PREVIEW = 40;

/** ค่าจาก JSON สำหรับใส่ในข้อความเตือน: JSON.stringify (object ไม่กลายเป็น [object Object]) ตัดเกิน 40 ตัวด้วย … */
function describeJsonValue(v: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length > MAX_VALUE_PREVIEW ? `${s.slice(0, MAX_VALUE_PREVIEW)}…` : s;
}

/** อ่าน `passage_groups[]` (id, title, body, images, applies_to, line_numbers, _example_only) — ยังไม่ผูกกับข้อ */
function parsePassageGroups(
  raw: unknown,
  fileIssues: ImportIssue[],
  resolveImageFor: ReturnType<typeof createImageResolver>,
): ParsedImportPassage[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    fileIssues.push(err('passage_groups ต้องเป็น array'));
    return [];
  }
  if (raw.length > MAX_PASSAGES) {
    fileIssues.push(err(`บทอ่านร่วมมี ${raw.length} ชุด เกินสูงสุด ${MAX_PASSAGES} ชุดต่อข้อสอบ`));
  }

  const seenIds = new Set<string>();
  return raw.slice(0, MAX_PASSAGES).map((g, i): ParsedImportPassage => {
    const issues: ImportIssue[] = [];
    const passage: ParsedImportPassage = {
      id: '',
      title: null,
      body: null,
      imagePaths: [],
      imageRefs: [],
      appliesTo: [],
      exampleOnly: false,
      lineNumbers: false,
      usedBy: [],
      usable: false,
      issues,
      status: 'ok',
    };
    if (!isRecord(g)) {
      issues.push(err(`บทอ่านลำดับที่ ${i + 1} ไม่ถูกต้อง (ต้องเป็น object) จะไม่ถูกนำเข้า`));
      passage.status = 'error';
      return passage;
    }

    const id = asText(g.id).trim();
    passage.id = id;
    let idOk = false;
    if (!id) {
      issues.push(err(`บทอ่านลำดับที่ ${i + 1} ไม่มี id จะไม่ถูกนำเข้า`));
    } else if (!PASSAGE_ID_PATTERN.test(id)) {
      issues.push(
        err(`id บทอ่าน "${id}" ไม่ถูกต้อง (ใช้ได้เฉพาะ A–Z a–z 0–9 _ - ยาวไม่เกิน 64 ตัวอักษร) จะไม่ถูกนำเข้า`),
      );
    } else if (seenIds.has(id)) {
      issues.push(err(`id บทอ่าน "${id}" ซ้ำกับบทอ่านอื่น ชุดนี้จะไม่ถูกนำเข้า`));
    } else {
      idOk = true;
    }
    if (id) seenIds.add(id);

    const title = asText(g.title).trim();
    if (title.length > MAX_PASSAGE_TITLE) {
      issues.push(warn(`ชื่อบทอ่านยาวเกิน ${MAX_PASSAGE_TITLE} ตัวอักษร จะถูกตัดให้เหลือ ${MAX_PASSAGE_TITLE} ตัว`));
    }
    passage.title = title ? title.slice(0, MAX_PASSAGE_TITLE) : null;

    const body = asText(g.body);
    const bodyTooLong = body.length > MAX_PASSAGE_BODY;
    if (bodyTooLong) {
      issues.push(
        err(`เนื้อหาบทอ่าน (body) ยาวเกิน ${MAX_PASSAGE_BODY.toLocaleString('en-US')} ตัวอักษร จะไม่ถูกนำเข้า`),
      );
    }
    passage.body = body.trim() ? body : null;

    const imgs = Array.isArray(g.images) ? g.images : [];
    if (imgs.length > MAX_PASSAGE_IMAGES) {
      issues.push(err(`บทอ่านมีรูป ${imgs.length} รูป เกินสูงสุด ${MAX_PASSAGE_IMAGES} รูป`));
    }
    imgs.slice(0, MAX_PASSAGE_IMAGES).forEach((img, j) => {
      const ref = imageRefOf(img);
      if (!ref) {
        issues.push(err(`ไม่ได้ระบุไฟล์รูปบทอ่าน (images[${j}].file)`));
        return;
      }
      passage.imageRefs.push(ref);
      const path = resolveImageFor(ref, imgs.length > 1 ? `รูปที่ ${j + 1}: ` : '', issues, {
        passageId: id || `#${i + 1}`,
      });
      if (path) passage.imagePaths.push(path);
    });

    if (!passage.body && passage.imageRefs.length === 0) {
      issues.push(err('บทอ่านไม่มีทั้งเนื้อหา (body) และรูป จะไม่ถูกนำเข้า'));
    } else if (!passage.body && passage.imagePaths.length === 0) {
      issues.push(err('รูปของบทอ่านใช้ไม่ได้ทั้งหมดและไม่มีเนื้อหา (body) จะไม่ถูกนำเข้า'));
    }
    // ใช้ได้ = API รับได้: id ถูกและไม่ซ้ำ, body ไม่เกิน, มีเนื้อหาหรือรูปที่ใช้ได้อย่างน้อยหนึ่งอย่าง
    passage.usable = idOk && !bodyTooLong && (!!passage.body || passage.imagePaths.length > 0);

    if (Array.isArray(g.applies_to)) {
      for (const v of g.applies_to) {
        const no = parseNo(v);
        if (no === null) issues.push(warn(`applies_to มีค่า "${String(v)}" ที่ไม่ใช่เลขข้อ`));
        else if (!passage.appliesTo.includes(no)) passage.appliesTo.push(no);
      }
    } else if (g.applies_to !== undefined && g.applies_to !== null) {
      issues.push(warn('applies_to ต้องเป็น array ของเลขข้อ เช่น [28, 29, 30] — ไม่ได้ใช้ค่านี้'));
    }

    if (typeof g.line_numbers === 'boolean') {
      passage.lineNumbers = g.line_numbers;
    } else if (g.line_numbers !== undefined && g.line_numbers !== null) {
      issues.push(
        warn(`line_numbers ต้องเป็น true หรือ false (ได้ ${describeJsonValue(g.line_numbers)}) — บทอ่านนี้จะไม่แสดงเลขบรรทัด`),
      );
    }

    if (g._example_only === true) {
      passage.exampleOnly = true;
      issues.push(warn('บทอ่านนี้เป็นข้อตัวอย่าง (_example_only) ไม่ใช่บทอ่านจริง'));
    }

    return passage;
  });
}

/**
 * ผูกข้อกับบทอ่าน: `passage_group` ของข้อเป็นหลัก ถ้าไม่มีแต่เลขข้ออยู่ใน `applies_to` → ผูกตาม applies_to
 * สองแหล่งขัดกัน → เตือนแล้วใช้ passage_group; อ้าง id ที่ไม่มี/บทอ่านที่ใช้ไม่ได้ → error ที่ข้อ (ข้อนั้นไม่มีบทอ่าน)
 * แล้วสรุปที่บทอ่าน: ไม่มีข้อใช้ / applies_to อ้างข้อที่ไม่มี → เตือน (เรียกครั้งเดียว — แก้ issues ในที่)
 *
 * บทอ่านที่มี error ไม่บล็อกการสร้าง (แบบเดียวกับข้อที่มี error) — บทอ่านที่ใช้ไม่ได้ไม่ถูกส่ง ข้อที่ผูกไว้ถูกแจ้ง
 */
function bindPassages(questions: ParsedImportQuestion[], passages: ParsedImportPassage[]): void {
  // ตัวแรกของแต่ละ id (รวมชุดที่ใช้ไม่ได้ ไว้แยกข้อความ "ไม่มี" กับ "ใช้ไม่ได้")
  const byId = new Map<string, ParsedImportPassage>();
  for (const p of passages) {
    if (p.id && !byId.has(p.id)) byId.set(p.id, p);
  }
  // applies_to → เลขข้อ: แยกบทอ่านที่ใช้ได้ (ผูกได้) กับที่ใช้ไม่ได้ (ข้อที่ผูกผ่าน applies_to อย่างเดียวต้องถูกแจ้ง)
  const claims = new Map<number, string[]>();
  const badClaims = new Map<number, string[]>();
  passages.forEach((p, i) => {
    const target = p.usable ? claims : badClaims;
    const label = p.id || `ลำดับที่ ${i + 1}`;
    for (const no of p.appliesTo) target.set(no, [...(target.get(no) ?? []), label]);
  });
  const quote = (ids: string[]) => ids.map((id) => `"${id}"`).join(', ');
  // ไฟล์ใช้ passage_group ที่ข้ออยู่แล้ว → applies_to ที่ไม่ตรงกับ passage_group ควรเตือน
  const fileUsesPassageGroup = questions.some((q) => !!q.passageGroupRef);

  for (const q of questions) {
    const claimed = claims.get(q.no) ?? [];
    const badClaimed = badClaims.get(q.no) ?? [];
    const ref = q.passageGroupRef;
    if (ref) {
      const target = byId.get(ref);
      if (!target) {
        q.issues.push(err(`อ้างบทอ่าน "${ref}" (passage_group) ที่ไม่มีใน passage_groups ข้อนี้จะไม่มีบทอ่าน`));
        continue;
      }
      if (!target.usable) {
        q.issues.push(err(`บทอ่าน "${ref}" มีข้อผิดพลาดจึงไม่ถูกนำเข้า ข้อนี้จะไม่มีบทอ่าน`));
        continue;
      }
      q.passageId = ref;
      const others = claimed.filter((id) => id !== ref);
      if (others.length > 0) {
        q.issues.push(warn(`passage_group "${ref}" ขัดกับ applies_to ของบทอ่าน ${quote(others)} ใช้ passage_group`));
      } else if (target.appliesTo.length > 0 && !target.appliesTo.includes(q.no)) {
        q.issues.push(
          warn(`passage_group "${ref}" แต่ข้อนี้ไม่อยู่ใน applies_to ของบทอ่าน "${ref}" (applies_to กับ passage_group ไม่ตรงกัน ผูกตาม passage_group)`),
        );
      }
    } else if (claimed.length > 0) {
      q.passageId = claimed[0];
      if (claimed.length > 1) {
        q.issues.push(warn(`ข้อนี้อยู่ใน applies_to ของหลายบทอ่าน (${quote(claimed)}) ใช้ "${claimed[0]}"`));
      }
      if (fileUsesPassageGroup) {
        q.issues.push(
          warn(`ข้อนี้ไม่ได้ระบุ passage_group แต่อยู่ใน applies_to ของบทอ่าน "${claimed[0]}" (applies_to กับ passage_group ไม่ตรงกัน ผูกตาม applies_to)`),
        );
      }
    } else if (badClaimed.length > 0) {
      q.issues.push(
        err(`บทอ่าน ${quote(badClaimed)} (applies_to) มีข้อผิดพลาดจึงไม่ถูกนำเข้า ข้อนี้จะไม่มีบทอ่าน`),
      );
    }
    if (q.passageId) {
      const p = byId.get(q.passageId)!;
      if (!p.usedBy.includes(q.no)) p.usedBy.push(q.no);
    }
  }

  const questionNos = new Set(questions.map((q) => q.no));
  for (const p of passages) {
    const missing = p.appliesTo.filter((no) => !questionNos.has(no));
    if (missing.length > 0) p.issues.push(warn(`applies_to อ้างข้อ ${missing.join(', ')} ที่ไม่มีในไฟล์`));
    if (p.usable && p.usedBy.length === 0) p.issues.push(warn('ไม่มีข้อใดใช้บทอ่านนี้'));
    p.usedBy.sort((a, b) => a - b);
    p.status = statusOf(p.issues);
  }
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
    passages: parsed.passages,
    images: parsed.images,
    bankOnly: parsed.bankOnly,
    hasFileError: parsed.fileIssues.some((i) => i.level === 'error'),
    errorQuestionCount: questions.filter((q) => q.status === 'error').length,
    warningQuestionCount: questions.filter((q) => q.status === 'warning').length,
  };
}

// ── build payload ─────────────────────────────────────────

/**
 * รูปที่ต้องอัปจริง: รูปที่ข้อ (โจทย์/ตัวเลือก) หรือบทอ่านที่นำเข้าได้อ้างถึง
 * รูปของบทอ่านที่ใช้ไม่ได้ (ไม่ถูกส่ง) ไม่อัป ไม่งั้นไฟล์ค้างบน server
 */
export function importImagesToUpload(resolved: Pick<ResolvedImport, 'images' | 'questions' | 'passages'>): ImportImage[] {
  const needed = new Set<string>();
  for (const q of resolved.questions) {
    q.imagePaths.forEach((path) => needed.add(path));
    q.choices.forEach((c) => c.imagePath && needed.add(c.imagePath));
  }
  for (const p of resolved.passages) {
    if (p.usable) p.imagePaths.forEach((path) => needed.add(path));
  }
  return resolved.images.filter((img) => needed.has(img.path));
}

/** สร้าง payload ของ createExam (สถานะ draft เสมอ) imageUrls: path รูป → url ที่อัปได้ */
export function buildCreateExamInput(
  resolved: ResolvedImport,
  opts: {
    category: string;
    subjectId: string | null;
    imageUrls: Record<string, string>;
    /** สวิตช์ "ใช้เฉพาะ Question Bank" ในหน้านำเข้า (ไม่ส่ง = ค่าจากไฟล์) */
    bankOnly?: boolean;
  },
): CreateExamInput {
  if (!resolved.exam || resolved.hasFileError) {
    throw new Error('ไฟล์มีข้อผิดพลาด สร้างชุดข้อสอบไม่ได้');
  }
  const urlOf = (path: string | null) => (path && opts.imageUrls[path]) || null;
  const bankOnly = opts.bankOnly ?? resolved.bankOnly;
  const questions: ExamQuestionInput[] = resolved.questions.map((q) => {
    const questionImages = q.imagePaths.map(urlOf).filter((u): u is string => !!u);
    return {
      question: q.question,
      // ส่ง questionImages เสมอ (API ใช้ array เป็นหลัก) questionImage = รูปแรก
      questionImages,
      questionImage: questionImages[0],
      type: q.type,
      choices:
        q.type === 'short_answer'
          ? []
          : q.choices.map((c) =>
              toChoiceInput({ id: c.id, text: c.text, isCorrect: c.isCorrect, image: urlOf(c.imagePath) }),
            ),
      correctAnswer: q.type === 'short_answer' ? (q.correctAnswer ?? '') : undefined,
      explanation: q.explanation ?? undefined,
      hint: q.hint ?? undefined,
      orderIndex: q.orderIndex,
      topicId: q.topicId,
      chapterId: q.chapterId,
      chapter: q.chapter,
      passageId: q.passageId,
      // ข้อ Challenge ได้เฉพาะชุด bankOnly (ชุดปกติ API ตอบ 400) — ชุดปกติส่ง false
      isChallenge: bankOnly && q.isChallenge,
      difficulty: q.difficulty,
    };
  });

  // ส่งเฉพาะบทอ่านที่ใช้ได้ (ข้อที่ผูกกับชุดที่ใช้ไม่ได้มี passageId = null อยู่แล้ว)
  const passages: ExamPassageInput[] = resolved.passages.filter((p) => p.usable).map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    images: p.imagePaths.map(urlOf).filter((u): u is string => !!u),
    lineNumbers: p.lineNumbers,
  }));

  return {
    title: resolved.exam.title,
    description: resolved.exam.description ?? undefined,
    category: opts.category,
    status: 'draft',
    questions,
    passages,
    subjectId: opts.subjectId || null,
    durationMinutes: resolved.exam.durationMinutes,
    bankOnly,
  };
}
