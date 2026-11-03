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

export type { ExamPassage } from './questions';

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
