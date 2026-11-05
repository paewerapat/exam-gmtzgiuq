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
import {
  normalizeAccessType,
  normalizeDetailBlocks,
  normalizeLevel,
  parsePrice,
  type DetailBlock,
  type ExamLevel,
  type MockAccessType,
  type MockExamInput,
} from '@/lib/mock-exam';

export type { ExamPassage } from './questions';
export type { DetailBlock, ExamLevel, MockAccessType } from '@/lib/mock-exam';

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
  // ── Mock Exam (task 11) ฟอร์มแอดมินส่งครบทุกครั้ง ไม่ส่ง = ค่าเริ่มต้นของ API ──
  isMock?: MockExamInput['isMock'];
  accessType?: MockExamInput['accessType'];
  price?: MockExamInput['price'];
  accessDays?: MockExamInput['accessDays'];
  level?: MockExamInput['level'];
  detailBlocks?: MockExamInput['detailBlocks'];
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
  // ── Mock Exam (task 11) ฟอร์มแอดมินส่งครบทุกครั้ง ไม่ส่ง = คงค่าเดิม ──
  isMock?: MockExamInput['isMock'];
  accessType?: MockExamInput['accessType'];
  price?: MockExamInput['price'];
  accessDays?: MockExamInput['accessDays'];
  level?: MockExamInput['level'];
  detailBlocks?: MockExamInput['detailBlocks'];
}

export interface GetExamsParams {
  page?: number;
  limit?: number;
  status?: QuestionStatus;
  category?: string;
  search?: string;
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

// Public - Get single published exam with questions
export async function getPublicExam(id: string, signal?: AbortSignal): Promise<Exam> {
  const response = await fetch(`${API_URL}/exams/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error('Exam not found');
  }

  // เติม question.passage จาก exam.passages ให้หน้าทำข้อสอบ/ผลลัพธ์ใช้ได้โดยไม่ต้องถือ exam ไว้
  // (questions ถูกเก็บลง localStorage ไปพร้อมบทอ่าน หน้าผลลัพธ์จึงแสดงได้)
  return withResolvedPassages(await response.json());
}

// Admin - Get all exams
export async function getAdminExams(
  params: GetExamsParams = {},
): Promise<PaginatedExams> {
  const { page = 1, limit = 10, status, category, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  if (status) queryParams.set('status', status);
  if (category) queryParams.set('category', category);
  if (search) queryParams.set('search', search);

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
}

/** หน้ารายละเอียด (GET /exams/mock/:id) */
export interface MockExamDetail extends MockExamSummary {
  description: string | null;
  /** null จาก API → [] */
  detailBlocks: DetailBlock[];
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

/** แปลง item จาก API ให้ชนิดตรง (price string → number, enum ที่ไม่รู้จัก → ค่าเริ่มต้น) */
export function normalizeMockExamSummary(raw: RawRecord): MockExamSummary {
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
    accessType: normalizeAccessType(raw.accessType),
    price: parsePrice(raw.price),
    releaseDate: typeof raw.releaseDate === 'string' ? raw.releaseDate : '',
  };
}

export function normalizeMockExamDetail(raw: RawRecord): MockExamDetail {
  return {
    ...normalizeMockExamSummary(raw),
    description: toStringOrNull(raw.description),
    detailBlocks: normalizeDetailBlocks(raw.detailBlocks),
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
