// Attempts API Service
import type { QuestionCategory } from './questions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ExamAttempt {
  id: string;
  userId: string;
  examId: string | null;
  examTitle: string;
  category: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  totalTime: number;
  timePerQuestion: Record<string, number>;
  answers: Record<string, string>;
  questionIds: string[];
  currentIndex: number;
  status: string; // 'in_progress' | 'completed' | 'abandoned'
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  exam?: {
    id: string;
    title: string;
    category: string;
  } | null;
}

export interface PaginatedAttempts {
  items: ExamAttempt[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttemptCategoryStats {
  category: string;
  attempts: number;
  averageScore: number;
}

export interface AttemptStats {
  totalAttempts: number;
  averageScore: number;
  uniqueUsers: number;
  byCategory: AttemptCategoryStats[];
}

export interface UserCategoryStats {
  category: string;
  attempts: number;
  averageScore: number;
  bestScore: number;
}

export interface UserAttemptStats {
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  totalTime: number;
  byCategory: UserCategoryStats[];
}

export interface ExamAttemptStats {
  totalAttempts: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  averageTime: number;
  uniqueUsers: number;
}

export interface SubmitAttemptInput {
  examId: string;
  examTitle: string;
  category: QuestionCategory;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  totalTime: number;
  timePerQuestion: Record<string, number>;
  answers: Record<string, string>;
  questionIds: string[];
  startedAt: string;
  completedAt?: string;
}

export interface StartInProgressInput {
  examId: string;
  examTitle: string;
  category: QuestionCategory;
  totalQuestions: number;
  questionIds: string[];
  startedAt: string;
}

export interface UpdateProgressInput {
  currentIndex: number;
  answers: Record<string, string>;
  timePerQuestion: Record<string, number>;
}

export interface GetAttemptsParams {
  page?: number;
  limit?: number;
  category?: QuestionCategory;
  examId?: string;
  userId?: string;
  search?: string;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// User - Submit attempt
export async function submitAttempt(input: SubmitAttemptInput): Promise<ExamAttempt> {
  const response = await fetch(`${API_URL}/attempts`, {
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

// User - Get my attempts
export async function getMyAttempts(
  params: GetAttemptsParams = {},
): Promise<PaginatedAttempts> {
  const { page = 1, limit = 10, category } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (category) queryParams.set('category', category);

  const response = await fetch(
    `${API_URL}/attempts/my?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch attempts');
  }

  return response.json();
}

// User - Get my attempts for a specific exam
export async function getMyExamAttempts(
  examId: string,
  params: GetAttemptsParams = {},
): Promise<PaginatedAttempts> {
  const { page = 1, limit = 10 } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  const response = await fetch(
    `${API_URL}/attempts/my/exam/${examId}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch exam attempts');
  }

  return response.json();
}

// User - Get single attempt detail
export async function getMyAttempt(id: string): Promise<ExamAttempt> {
  const response = await fetch(`${API_URL}/attempts/my/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Attempt not found');
  }

  return response.json();
}

// Admin - Get all attempts
export async function getAdminAttempts(
  params: GetAttemptsParams = {},
): Promise<PaginatedAttempts> {
  const { page = 1, limit = 10, userId, examId, category, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (userId) queryParams.set('userId', userId);
  if (examId) queryParams.set('examId', examId);
  if (category) queryParams.set('category', category);
  if (search) queryParams.set('search', search);

  const response = await fetch(
    `${API_URL}/attempts/admin/all?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch attempts');
  }

  return response.json();
}

// Admin - Get single attempt
export async function getAdminAttempt(id: string): Promise<ExamAttempt> {
  const response = await fetch(`${API_URL}/attempts/admin/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Attempt not found');
  }

  return response.json();
}

// User - Get my stats
export async function getMyStats(): Promise<UserAttemptStats> {
  const response = await fetch(`${API_URL}/attempts/my/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }

  return response.json();
}

// Admin - Get exam attempt stats
export async function getAdminExamAttemptStats(examId: string): Promise<ExamAttemptStats> {
  const response = await fetch(`${API_URL}/attempts/admin/exam/${examId}/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch exam stats');
  }

  return response.json();
}

// Admin - Get attempts by user
export async function getAdminUserAttempts(
  userId: string,
  params: GetAttemptsParams = {},
): Promise<PaginatedAttempts> {
  const { page = 1, limit = 10, category } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (category) queryParams.set('category', category);

  const response = await fetch(
    `${API_URL}/attempts/admin/user/${userId}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch user attempts');
  }

  return response.json();
}

// Admin - Get stats
export async function getAttemptStats(): Promise<AttemptStats> {
  const response = await fetch(`${API_URL}/attempts/admin/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch attempt stats');
  }

  return response.json();
}

// ── IN-PROGRESS ────────────────────────────────────────────

// User - Start in-progress attempt
export async function startInProgressAttempt(
  input: StartInProgressInput,
): Promise<ExamAttempt> {
  const response = await fetch(`${API_URL}/attempts/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error('Failed to start attempt');
  return response.json();
}

// User - Update in-progress attempt
export async function updateAttemptProgress(
  id: string,
  input: UpdateProgressInput,
): Promise<void> {
  const response = await fetch(`${API_URL}/attempts/${id}/progress`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error('Failed to update attempt progress');
}

// User - Complete an in-progress attempt
export async function completeAttempt(
  id: string,
  input: SubmitAttemptInput,
): Promise<ExamAttempt> {
  const response = await fetch(`${API_URL}/attempts/${id}/complete`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error('Failed to complete attempt');
  return response.json();
}

// User - Get all my in-progress attempts
export async function getMyInProgressAttempts(): Promise<ExamAttempt[]> {
  const response = await fetch(`${API_URL}/attempts/my/in-progress`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error('Failed to fetch in-progress attempts');
  return response.json();
}

// User - Get in-progress attempt for a specific exam (null if none)
export async function getMyInProgressForExam(
  examId: string,
): Promise<ExamAttempt | null> {
  const response = await fetch(
    `${API_URL}/attempts/my/in-progress/exam/${examId}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to check in-progress attempt');
  return response.json();
}
