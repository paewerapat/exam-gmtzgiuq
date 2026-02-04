// Question API Service
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type QuestionCategory =
  | 'general_knowledge'
  | 'kor_por'
  | 'toeic'
  | 'gat_pat'
  | 'o_net'
  | 'mathematics'
  | 'english'
  | 'science'
  | 'driving_license';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'multiple_choice' | 'true_false';
export type QuestionStatus = 'draft' | 'published';

export interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Question {
  id: string;
  question: string;
  questionImage?: string;
  choices: QuestionChoice[];
  explanation?: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  status: QuestionStatus;
  tags?: string[];
  author: QuestionAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedQuestions {
  items: Question[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QuestionStats {
  total: number;
  published: number;
  draft: number;
  byCategory: { category: string; count: number }[];
}

export interface GetQuestionsParams {
  page?: number;
  limit?: number;
  status?: QuestionStatus;
  category?: QuestionCategory;
  difficulty?: QuestionDifficulty;
  search?: string;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Admin - Get all questions
export async function getAdminQuestions(
  params: GetQuestionsParams = {},
): Promise<PaginatedQuestions> {
  const { page = 1, limit = 10, status, category, difficulty, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  if (status) queryParams.set('status', status);
  if (category) queryParams.set('category', category);
  if (difficulty) queryParams.set('difficulty', difficulty);
  if (search) queryParams.set('search', search);

  const response = await fetch(
    `${API_URL}/questions/admin/all?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch questions');
  }

  return response.json();
}

// Admin - Get single question
export async function getAdminQuestion(id: string): Promise<Question> {
  const response = await fetch(`${API_URL}/questions/admin/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Question not found');
  }

  return response.json();
}

// Admin - Create question
export async function createQuestion(
  input: Omit<Question, 'id' | 'author' | 'createdAt' | 'updatedAt'>,
): Promise<Question> {
  const response = await fetch(`${API_URL}/questions/admin`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to create question');
  }

  return response.json();
}

// Admin - Update question
export async function updateQuestion(
  id: string,
  input: Partial<Omit<Question, 'id' | 'author' | 'createdAt' | 'updatedAt'>>,
): Promise<Question> {
  const response = await fetch(`${API_URL}/questions/admin/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to update question');
  }

  return response.json();
}

// Admin - Delete question
export async function deleteQuestion(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/questions/admin/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete question');
  }
}

// Admin - Get question stats
export async function getQuestionStats(): Promise<QuestionStats> {
  const response = await fetch(`${API_URL}/questions/admin/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch question stats');
  }

  return response.json();
}

// Category display names (Thai)
export const categoryDisplayNames: Record<QuestionCategory, string> = {
  general_knowledge: 'ความรู้ทั่วไป',
  kor_por: 'ก.พ.',
  toeic: 'TOEIC',
  gat_pat: 'GAT/PAT',
  o_net: 'O-NET',
  mathematics: 'คณิตศาสตร์',
  english: 'ภาษาอังกฤษ',
  science: 'วิทยาศาสตร์',
  driving_license: 'ใบขับขี่',
};

export const difficultyDisplayNames: Record<QuestionDifficulty, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
};

export const difficultyColors: Record<QuestionDifficulty, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

export const statusDisplayNames: Record<QuestionStatus, string> = {
  draft: 'แบบร่าง',
  published: 'เผยแพร่',
};
