// Curriculum API (Subject → Chapter → Topic)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  iconEmoji: string | null;
  orderIndex: number;
  isActive: boolean;
  chapterCount?: number;
  examCount?: number;
  chapters?: Chapter[];
  createdAt: string;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  description: string | null;
  orderIndex: number;
  isActive: boolean;
  examCount?: number;
  topics?: Topic[];
  createdAt: string;
}

export interface Topic {
  id: string;
  chapterId: string;
  name: string;
  description: string | null;
  orderIndex: number;
  isActive: boolean;
  examCount?: number;
  createdAt: string;
  // Populated when fetching single topic (findTopic loads relations)
  chapter?: {
    id: string;
    subjectId: string;
    subject?: { id: string };
  };
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── PUBLIC ────────────────────────────────────────────────

export async function getSubjects(): Promise<Subject[]> {
  const res = await fetch(`${API_URL}/curriculum/subjects`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch subjects');
  return res.json();
}

export async function getChaptersBySubject(subjectId: string): Promise<Chapter[]> {
  const res = await fetch(
    `${API_URL}/curriculum/subjects/${subjectId}/chapters`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Failed to fetch chapters');
  return res.json();
}

export async function getTopicsByChapter(chapterId: string): Promise<Topic[]> {
  const res = await fetch(
    `${API_URL}/curriculum/chapters/${chapterId}/topics`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Failed to fetch topics');
  return res.json();
}

export async function getTopic(topicId: string): Promise<Topic> {
  const res = await fetch(`${API_URL}/curriculum/topics/${topicId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Topic not found');
  return res.json();
}

export async function getPublicCurriculumTree(): Promise<Subject[]> {
  const res = await fetch(`${API_URL}/curriculum/public/tree`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch curriculum tree');
  return res.json();
}

// ── ADMIN ─────────────────────────────────────────────────

export async function getAdminCurriculumTree(): Promise<Subject[]> {
  const res = await fetch(`${API_URL}/curriculum/admin/tree`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch curriculum tree');
  return res.json();
}

// Subjects
export async function createSubject(data: {
  name: string;
  description?: string;
  color?: string;
  iconEmoji?: string;
  orderIndex?: number;
}): Promise<Subject> {
  const res = await fetch(`${API_URL}/curriculum/admin/subjects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create subject');
  return res.json();
}

export async function updateSubject(
  id: string,
  data: Partial<Subject>,
): Promise<Subject> {
  const res = await fetch(`${API_URL}/curriculum/admin/subjects/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update subject');
  return res.json();
}

export async function deleteSubject(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/curriculum/admin/subjects/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete subject');
}

// Chapters
export async function createChapter(data: {
  subjectId: string;
  name: string;
  description?: string;
}): Promise<Chapter> {
  const res = await fetch(`${API_URL}/curriculum/admin/chapters`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create chapter');
  return res.json();
}

export async function updateChapter(
  id: string,
  data: Partial<Chapter>,
): Promise<Chapter> {
  const res = await fetch(`${API_URL}/curriculum/admin/chapters/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update chapter');
  return res.json();
}

export async function deleteChapter(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/curriculum/admin/chapters/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete chapter');
}

// Topics
export async function createTopic(data: {
  chapterId: string;
  name: string;
  description?: string;
}): Promise<Topic> {
  const res = await fetch(`${API_URL}/curriculum/admin/topics`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create topic');
  return res.json();
}

export async function updateTopic(
  id: string,
  data: Partial<Topic>,
): Promise<Topic> {
  const res = await fetch(`${API_URL}/curriculum/admin/topics/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update topic');
  return res.json();
}

export async function deleteTopic(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/curriculum/admin/topics/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete topic');
}
