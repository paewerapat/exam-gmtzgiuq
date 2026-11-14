// Exam API Service
import type {
  ExamPassage,
  Question,
  QuestionChoice,
  QuestionDifficulty,
  QuestionType,
  QuestionStatus,
  QuestionAuthor,
} from './questions';
import { withResolvedPassages } from '@/lib/exam-passages';
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';
import {
  normalizeAccessType,
  normalizeCodeInstructions,
  normalizeDetailBlocks,
  normalizeLevel,
  MOCK_ACCESS_VIAS,
  normalizeMockAccess,
  parsePrice,
  type CodeInstructions,
  type DetailBlock,
  type ExamLevel,
  type MockAccessType,
  type MockAccessVia,
  type MockExamAccess,
  type MockExamInput,
} from '@/lib/mock-exam';

export type { ExamPassage } from './questions';
export type {
  CodeInstructions,
  CodeInstructionStep,
  DetailBlock,
  ExamLevel,
  MockAccessStatus,
  MockAccessVia,
  MockAccessType,
  MockExamAccess,
} from '@/lib/mock-exam';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Exam {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: QuestionStatus;
  questionCount: number;
  questions: Question[];
  /** บทอ่านร่วม (API แปลง null → []) */
  passages?: ExamPassage[];
  author: QuestionAuthor;
  subjectId?: string | null;
  bannerImage?: string | null;
  durationMinutes?: number | null;
  /** วันเผยแพร่ ISO 8601 — ใช้จัดลำดับ (API เรียง releaseDate DESC) ไม่ได้ซ่อนชุดก่อนถึงวัน */
  releaseDate: string;
  /** ชุด Mock Exam (task 11) — API ก่อน task 11 ไม่มี field กลุ่มนี้ */
  isMock?: boolean;
  accessType?: MockAccessType;
  /** decimal จาก DB อาจมาเป็น string ("150.00") — ใช้ parsePrice ก่อนคำนวณ/แสดง */
  price?: number | string | null;
  accessDays?: number | null;
  level?: ExamLevel | null;
  /** มีเฉพาะ GET /exams/admin/:id (select: false) */
  detailBlocks?: DetailBlock[] | null;
  /** "วิธีรับโค้ด" (task 15) — มีใน GET /exams/admin/:id */
  codeInstructions?: CodeInstructions | null;
  /** ชุดที่ใช้เฉพาะ Question Bank (task 20) — ซ่อนจากรายการชุดข้อสอบทุกที่ ข้อในชุดนี้ติดป้าย Challenge ได้ */
  bankOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExams {
  items: Exam[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExamStats {
  total: number;
  published: number;
  draft: number;
  byCategory: { category: string; count: number }[];
}

export interface ExamQuestionInput {
  /**
   * แก้ข้อสอบ: id ของข้อเดิมในชุดนี้ → API แก้แถวเดิม (id ไม่เปลี่ยน) / ไม่ส่งหรือ id ของชุดอื่น → สร้างข้อใหม่
   * id ซ้ำกันใน payload เดียว → 400 / สร้างชุดใหม่และนำเข้าไม่ต้องส่ง (API ไม่สนใจ)
   */
  id?: string;
  question: string;
  /** รูปแรก (client เก่า) — API ใช้เฉพาะเมื่อไม่ส่ง questionImages */
  questionImage?: string;
  /** รูปทั้งหมดตามลำดับ (≤ 6) ส่งทุกครั้งตอนแก้ข้อสอบ — [] = ไม่มีรูป */
  questionImages?: string[];
  choices?: QuestionChoice[];
  correctAnswer?: string;
  explanation?: string;
  hint?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  orderIndex?: number;
  topicId?: string | null;
  chapterId?: string | null;
  chapter?: string | null;
  /** id ของบทอ่านใน passages ของ payload เดียวกัน (null = ไม่ใช้บทอ่าน) */
  passageId?: string | null;
  /** ข้อ Challenge — true ได้เฉพาะเมื่อชุดเป็น bankOnly (ไม่งั้น API ตอบ 400 CHALLENGE_NOT_IN_BANK_ONLY) */
  isChallenge?: boolean;
}

/** บทอ่านใน payload สร้าง/แก้ข้อสอบ */
export interface ExamPassageInput {
  id: string;
  title?: string | null;
  body?: string | null;
  images?: string[];
  /** แสดงเลขบรรทัดในบทอ่าน (ฟอร์มแอดมิน/นำเข้าส่งทุกครั้ง) */
  lineNumbers?: boolean;
}

export interface CreateExamInput {
  title: string;
  description?: string;
  category: string;
  status?: QuestionStatus;
  questions: ExamQuestionInput[];
  /** บทอ่านร่วมทั้งหมด (ฟอร์มแอดมินส่งทุกครั้ง) */
  passages?: ExamPassageInput[];
  subjectId?: string | null;
  bannerImage?: string | null;
  durationMinutes?: number | null;
  /** ISO 8601 — ไม่ส่ง = เวลาที่สร้าง */
  releaseDate?: string;
  /** ใช้เฉพาะ Question Bank (task 20) — ไม่ส่ง = false */
  bankOnly?: boolean;
  // ── Mock Exam (task 11) ฟอร์มแอดมินส่งครบทุกครั้ง ไม่ส่ง = ค่าเริ่มต้นของ API ──
  isMock?: MockExamInput['isMock'];
  accessType?: MockExamInput['accessType'];
  price?: MockExamInput['price'];
  accessDays?: MockExamInput['accessDays'];
  level?: MockExamInput['level'];
  detailBlocks?: MockExamInput['detailBlocks'];
  codeInstructions?: MockExamInput['codeInstructions'];
}

export interface UpdateExamInput {
  title?: string;
  description?: string;
  category?: string;
  status?: QuestionStatus;
  questions?: ExamQuestionInput[];
  /** ส่งพร้อม questions เสมอ — API แทนที่บทอ่านทั้งหมด (ส่ง questions โดยไม่ส่ง passages = ล้างเป็น []) */
  passages?: ExamPassageInput[];
  subjectId?: string | null;
  bannerImage?: string | null;
  durationMinutes?: number | null;
  /** ISO 8601 — ไม่ส่ง = คงค่าเดิม */
  releaseDate?: string;
  /** ใช้เฉพาะ Question Bank (task 20) — ไม่ส่ง = คงค่าเดิม */
  bankOnly?: boolean;
  // ── Mock Exam (task 11) ฟอร์มแอดมินส่งครบทุกครั้ง ไม่ส่ง = คงค่าเดิม ──
  isMock?: MockExamInput['isMock'];
  accessType?: MockExamInput['accessType'];
  price?: MockExamInput['price'];
  accessDays?: MockExamInput['accessDays'];
  level?: MockExamInput['level'];
  detailBlocks?: MockExamInput['detailBlocks'];
  codeInstructions?: MockExamInput['codeInstructions'];
}

export interface GetExamsParams {
  page?: number;
  limit?: number;
  status?: QuestionStatus;
  category?: string;
  search?: string;
  /** เฉพาะ admin list: true = เฉพาะชุด Question Bank, false = เฉพาะชุดปกติ, ไม่ส่ง = ทั้งหมด */
  bankOnly?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Public - Get published exams
export async function getPublicExams(
  params: GetExamsParams = {},
): Promise<PaginatedExams> {
  const { page = 1, limit = 12, category, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  if (category) queryParams.set('category', category);
  if (search) queryParams.set('search', search);

  const response = await fetch(
    `${API_URL}/exams?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch exams');
  }

  return response.json();
}

// Public (OptionalJwt) - Get single published exam with questions
// ส่ง token ด้วยเสมอ: ชุด Mock ที่ล็อก (code/purchase) API ตรวจสิทธิ์ของบัญชี — ไม่มีสิทธิ์ → ApiError 403 EXAM_LOCKED
export async function getPublicExam(id: string, signal?: AbortSignal): Promise<Exam> {
  const response = await fetchWithAuth(`${API_URL}/exams/${id}`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response, 'Exam not found');
  }

  // เติม question.passage จาก exam.passages ให้หน้าทำข้อสอบ/ผลลัพธ์ใช้ได้โดยไม่ต้องถือ exam ไว้
  // (questions ถูกเก็บลง localStorage ไปพร้อมบทอ่าน หน้าผลลัพธ์จึงแสดงได้)
  return withResolvedPassages(await response.json());
}

// Admin - Get all exams
export async function getAdminExams(
  params: GetExamsParams = {},
): Promise<PaginatedExams> {
  const { page = 1, limit = 10, status, category, search, bankOnly } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  if (status) queryParams.set('status', status);
  if (category) queryParams.set('category', category);
  if (search) queryParams.set('search', search);
  if (bankOnly !== undefined) queryParams.set('bankOnly', String(bankOnly));

  const response = await fetch(
    `${API_URL}/exams/admin/all?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch exams');
  }

  return response.json();
}

// Admin - Get single exam
export async function getAdminExam(id: string): Promise<Exam> {
  const response = await fetch(`${API_URL}/exams/admin/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Exam not found');
  }

  return response.json();
}

// Admin - Create exam
export async function createExam(input: CreateExamInput): Promise<Exam> {
  const response = await fetch(`${API_URL}/exams/admin`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.message
      ? Array.isArray(errorData.message)
        ? errorData.message.join(', ')
        : errorData.message
      : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

// Admin - Update exam
export async function updateExam(id: string, input: UpdateExamInput): Promise<Exam> {
  const response = await fetch(`${API_URL}/exams/admin/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.message
      ? Array.isArray(errorData.message)
        ? errorData.message.join(', ')
        : errorData.message
      : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

// Admin - Delete exam
export async function deleteExam(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/exams/admin/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete exam');
  }
}

// Public - Get exams by topic
export async function getExamsByTopic(
  topicId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedExams> {
  const response = await fetch(
    `${API_URL}/exams/topic/${topicId}?page=${page}&limit=${limit}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch exams by topic');
  }

  return response.json();
}

// Admin - Get exam stats
export async function getExamStats(): Promise<ExamStats> {
  const response = await fetch(`${API_URL}/exams/admin/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch exam stats');
  }

  return response.json();
}

// ── Mock Exam (task 11) — public, ไม่มี questions/เฉลย ─────────

/** การ์ดในหน้ารายการ Mock Exam (GET /exams/mock) */
export interface MockExamSummary {
  id: string;
  title: string;
  /** slug ของหมวด (ค่าที่ใช้กรอง ?category=) */
  category: string;
  /** ชื่อหมวดจากตาราง categories (ไม่มีหมวดในตาราง → null แสดง slug แทน) */
  categoryName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  bannerImage: string | null;
  questionCount: number;
  durationMinutes: number | null;
  level: ExamLevel | null;
  accessType: MockAccessType;
  /** API คืน number | null (ยังผ่าน parsePrice เผื่อ decimal มาเป็น string) */
  price: number | null;
  releaseDate: string;
  /** สิทธิ์ของบัญชีที่ส่ง token มา (guest → locked สำหรับชุดไม่ฟรี) — task 15 */
  access: MockExamAccess;
  /** key ของสนาม Pro ของหมวดชุดนี้ (category.venueId) null = หมวดไม่ได้ผูกสนาม — task 17 */
  venueKey: string | null;
}

/** หน้ารายละเอียด (GET /exams/mock/:id) */
export interface MockExamDetail extends MockExamSummary {
  description: string | null;
  /** null จาก API → [] */
  detailBlocks: DetailBlock[];
  /** "วิธีรับโค้ด" ที่แอดมินตั้ง (null = ไม่มี) — task 15 */
  codeInstructions: CodeInstructions | null;
}

export interface PaginatedMockExams {
  items: MockExamSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** ตัวเลือกดรอปดาวน์ "เลือกสนามสอบ" (GET /exams/mock/categories) */
export interface MockExamCategory {
  /** ชื่อที่แสดง (ไม่มีในตาราง categories → API ใช้ slug) */
  name: string;
  /** ค่า exam.category — ใช้กรอง ?category=<slug> และเก็บใน query string ของหน้าเว็บ */
  slug: string;
  count: number;
}

export interface GetMockExamsParams {
  category?: string;
  page?: number;
  limit?: number;
}

type RawRecord = Record<string, unknown>;

const toStringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const toNumberOrNull = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** access + via (task 17): via ที่ไม่รู้จัก/ไม่มี → null, ชุดฟรีหรือยังล็อก → null */
export function normalizeMockAccessWithVia(value: unknown, accessType: MockAccessType): MockExamAccess {
  const access = normalizeMockAccess(value, accessType);
  const rawVia = value && typeof value === 'object' ? (value as { via?: unknown }).via : null;
  const via =
    (access.status === 'unlocked' || access.status === 'expired') && MOCK_ACCESS_VIAS.includes(rawVia as MockAccessVia)
      ? (rawVia as MockAccessVia)
      : null;
  return { ...access, via };
}

/** แปลง item จาก API ให้ชนิดตรง (price string → number, enum ที่ไม่รู้จัก → ค่าเริ่มต้น) */
export function normalizeMockExamSummary(raw: RawRecord): MockExamSummary {
  const accessType = normalizeAccessType(raw.accessType);
  return {
    id: String(raw.id ?? ''),
    title: typeof raw.title === 'string' ? raw.title : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    categoryName: toStringOrNull(raw.categoryName),
    subjectId: toStringOrNull(raw.subjectId),
    subjectName: toStringOrNull(raw.subjectName),
    bannerImage: toStringOrNull(raw.bannerImage),
    questionCount: toNumberOrNull(raw.questionCount) ?? 0,
    durationMinutes: toNumberOrNull(raw.durationMinutes),
    level: normalizeLevel(raw.level),
    accessType,
    price: parsePrice(raw.price),
    releaseDate: typeof raw.releaseDate === 'string' ? raw.releaseDate : '',
    access: normalizeMockAccessWithVia(raw.access, accessType),
    venueKey: toStringOrNull(raw.venueKey),
  };
}

export function normalizeMockExamDetail(raw: RawRecord): MockExamDetail {
  return {
    ...normalizeMockExamSummary(raw),
    description: toStringOrNull(raw.description),
    detailBlocks: normalizeDetailBlocks(raw.detailBlocks),
    codeInstructions: normalizeCodeInstructions(raw.codeInstructions),
  };
}

// Public - รายการชุด Mock ที่เผยแพร่ (เรียงวันเผยแพร่ใหม่สุดก่อน)
export async function getMockExams(
  params: GetMockExamsParams = {},
  signal?: AbortSignal,
): Promise<PaginatedMockExams> {
  const { page = 1, limit = 12, category } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (category) query.set('category', category);

  const response = await fetchWithAuth(`${API_URL}/exams/mock?${query.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('Failed to fetch mock exams');

  const data = (await response.json()) as RawRecord;
  const items = Array.isArray(data.items) ? (data.items as RawRecord[]).map(normalizeMockExamSummary) : [];
  return {
    items,
    total: toNumberOrNull(data.total) ?? items.length,
    page: toNumberOrNull(data.page) ?? page,
    limit: toNumberOrNull(data.limit) ?? limit,
    totalPages: toNumberOrNull(data.totalPages) ?? 1,
  };
}

// Public - หมวด (สนามสอบ) ที่มีชุด Mock เผยแพร่อยู่
export async function getMockExamCategories(signal?: AbortSignal): Promise<MockExamCategory[]> {
  const response = await fetchWithAuth(`${API_URL}/exams/mock/categories`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Failed to fetch mock exam categories');

  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  // slug คือค่าที่ใช้กรอง ต้องมีเสมอ (ไม่มีชื่อ → แสดง slug)
  return (data as RawRecord[])
    .filter((c): c is RawRecord => !!c && typeof c.slug === 'string' && c.slug !== '')
    .map((c) => ({
      name: toStringOrNull(c.name) ?? (c.slug as string),
      slug: c.slug as string,
      count: toNumberOrNull(c.count) ?? 0,
    }));
}

// Public - รายละเอียดชุด Mock (ไม่ใช่ Mock / ไม่เผยแพร่ / ไม่มี → null)
export async function getMockExam(id: string, signal?: AbortSignal): Promise<MockExamDetail | null> {
  const response = await fetchWithAuth(`${API_URL}/exams/mock/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to fetch mock exam');
  return normalizeMockExamDetail((await response.json()) as RawRecord);
}

// ── โค้ด Unlock (task 15) ─────────────────────────────────────

/** ตัวเลือก "ชุดที่ Unlock" ในฟอร์มสร้างแคมเปญ: ชุด Mock ที่ไม่ฟรี (รวมแบบร่าง) */
export interface LockableMockExamOption {
  id: string;
  title: string;
  accessType: Exclude<MockAccessType, 'free'>;
  price: number | null;
  status: QuestionStatus;
}

const ADMIN_OPTIONS_PAGE_SIZE = 100;
const ADMIN_OPTIONS_MAX_PAGES = 20;

/**
 * Admin - ชุด Mock ที่ไม่ฟรีทั้งหมด (สำหรับผูกกับแคมเปญโค้ด)
 * API ยังไม่มีตัวกรอง isMock จึงไล่ GET /exams/admin/all ทีละ 100 ชุดแล้วกรองฝั่งเว็บ (สูงสุด 2,000 ชุด)
 */
export async function getLockableMockExams(signal?: AbortSignal): Promise<LockableMockExamOption[]> {
  const out: LockableMockExamOption[] = [];
  for (let page = 1; page <= ADMIN_OPTIONS_MAX_PAGES; page++) {
    const query = new URLSearchParams({ page: String(page), limit: String(ADMIN_OPTIONS_PAGE_SIZE) });
    const response = await fetchWithAuth(`${API_URL}/exams/admin/all?${query.toString()}`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw await toApiError(response, 'Failed to fetch exams');
    const data = (await response.json()) as RawRecord;
    const items = Array.isArray(data.items) ? (data.items as RawRecord[]) : [];
    for (const raw of items) {
      const accessType = normalizeAccessType(raw.accessType);
      if (raw.isMock !== true || accessType === 'free') continue;
      out.push({
        id: String(raw.id ?? ''),
        title: typeof raw.title === 'string' ? raw.title : '',
        accessType,
        price: parsePrice(raw.price),
        status: raw.status === 'published' ? 'published' : 'draft',
      });
    }
    const totalPages = toNumberOrNull(data.totalPages) ?? 1;
    if (page >= totalPages || items.length === 0) break;
  }
  return out;
}
