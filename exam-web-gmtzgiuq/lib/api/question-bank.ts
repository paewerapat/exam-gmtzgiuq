// Question Bank / Challenge Questions API (task 20) — module `question-bank` ของ API
// ทุก route เป็น OptionalJwt: ส่ง token ถ้ามี (ได้สถิติ/สิทธิ์ Challenge ของบัญชี) guest ก็เรียกได้
import type { Question } from './questions';
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const BASE = `${API_URL}/question-bank`;

export type QbMode = 'bank' | 'challenge';
export type QbDifficulty = 'easy' | 'medium' | 'hard_challenge';
export type QbProgressFilter = 'all' | 'undone' | 'done' | 'wrong';

export const QB_ERROR_VENUE_NOT_FOUND = 'QB_VENUE_NOT_FOUND';
export const QB_ERROR_SUBJECT_NOT_FOUND = 'QB_SUBJECT_NOT_FOUND';
export const QB_ERROR_LOGIN_REQUIRED = 'QB_LOGIN_REQUIRED';

export interface QbVenue {
  id: string;
  key: string;
  name: string;
}

export interface QbSubjectCard {
  id: string;
  /** bankLabel ของวิชา (ว่าง = name) */
  label: string;
  color: string;
  iconEmoji: string | null;
  total: number;
  answered: number;
  /** 0–100 */
  percent: number;
}

export interface QbWeek {
  /** วันจันทร์ต้นสัปดาห์ (เวลาไทย) YYYY-MM-DD */
  weekStart: string;
  correct: number;
  wrong: number;
}

export interface QbStats {
  answered: number;
  /** 0–100 (ตอบถูกครั้งแรก / ข้อที่ตอบครั้งแรก) — ไม่มีข้อมูล = null */
  accuracy: number | null;
  streakDays: number;
  /** 12 สัปดาห์ล่าสุด เก่า → ใหม่ */
  weekly: QbWeek[];
}

export interface QbVenueOverview {
  venue: QbVenue;
  mode: QbMode;
  subjects: QbSubjectCard[];
  /** null = ไม่ได้ login */
  stats: QbStats | null;
  challengeUnlocked: boolean;
}

export interface QbCounts {
  /** ไม่มีในโหมด challenge */
  easy?: number;
  /** ไม่มีในโหมด challenge */
  medium?: number;
  hardChallenge: number;
}

export interface QbTopic {
  id: string;
  name: string;
  total: number;
  answered: number;
  /** 0–100 — ยังไม่เคยตอบ = null */
  accuracy: number | null;
  counts: QbCounts;
}

export interface QbGroup {
  gradeLabel: string | null;
  term: number | null;
  /** ชื่อกลุ่มจาก API ("ม.4 เทอม 1" / "ม.4" / "เทอม 1" / "อื่น ๆ") — ไม่มี = คำนวณเองด้วย groupLabel() */
  label?: string;
  topics: QbTopic[];
}

export interface QbSubjectDetail {
  subject: { id: string; label: string; color: string };
  venue: QbVenue;
  mode: QbMode;
  totals: { all: number; easy: number; medium: number; hardChallenge: number };
  groups: QbGroup[];
  challengeUnlocked: boolean;
}

export interface QbSessionInput {
  subjectId: string;
  mode: QbMode;
  /** ว่าง/ไม่ส่ง = ทุกบท (≤ 100) */
  topicIds?: string[];
  /** โหมด bank เท่านั้น — ว่าง/ไม่ส่ง = ทุกระดับ */
  difficulties?: QbDifficulty[];
  /** ไม่ใช่ 'all' ต้อง login (ไม่งั้น 401 QB_LOGIN_REQUIRED) */
  progress?: QbProgressFilter;
  /** 1–200 (API default 50) */
  limit?: number;
}

/** ข้อ Challenge ที่ยังไม่มีสิทธิ์ — server ไม่ส่งโจทย์/ตัวเลือก/เฉลยมา */
export interface QbLockedQuestion {
  id: string;
  topicId: string | null;
  locked: true;
  isChallenge: true;
}

export interface QbSession {
  venueKey: string;
  /** ชื่อสนาม (round 2) — API เก่าไม่มี = '' (หน้าเว็บ fallback เป็น key) */
  venueName: string;
  subjectLabel: string;
  /** จำนวนข้อที่ตรงตัวกรองทั้งหมดก่อนตัดด้วย limit */
  total: number;
  /** ข้อปกติเป็น Question เต็ม / ข้อที่ล็อกเป็น stub ที่ locked = true (ดู toLockedQuestion) */
  questions: Question[];
}

// ── normalize ────────────────────────────────────────────────

type RawRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
// COUNT จาก MySQL อาจมาเป็น string
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v, NaN));
const cleanNumOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n === null || Number.isNaN(n) ? null : n;
};

function normalizeVenue(raw: unknown): QbVenue {
  const v = isRecord(raw) ? raw : {};
  return { id: str(v.id), key: str(v.key), name: str(v.name) };
}

function normalizeSubjectCard(raw: RawRecord): QbSubjectCard {
  return {
    id: str(raw.id),
    label: str(raw.label),
    color: str(raw.color) || '#6366f1',
    iconEmoji: strOrNull(raw.iconEmoji),
    total: num(raw.total),
    answered: num(raw.answered),
    percent: num(raw.percent),
  };
}

function normalizeStats(raw: unknown): QbStats | null {
  if (!isRecord(raw)) return null;
  return {
    answered: num(raw.answered),
    accuracy: cleanNumOrNull(raw.accuracy),
    streakDays: num(raw.streakDays),
    weekly: (Array.isArray(raw.weekly) ? raw.weekly.filter(isRecord) : []).map((w) => ({
      weekStart: str(w.weekStart),
      correct: num(w.correct),
      wrong: num(w.wrong),
    })),
  };
}

export function normalizeVenueOverview(raw: unknown): QbVenueOverview {
  const data = isRecord(raw) ? raw : {};
  return {
    venue: normalizeVenue(data.venue),
    mode: data.mode === 'challenge' ? 'challenge' : 'bank',
    subjects: (Array.isArray(data.subjects) ? data.subjects.filter(isRecord) : []).map(normalizeSubjectCard),
    stats: normalizeStats(data.stats),
    challengeUnlocked: data.challengeUnlocked === true,
  };
}

function normalizeCounts(raw: unknown): QbCounts {
  const c = isRecord(raw) ? raw : {};
  const counts: QbCounts = { hardChallenge: num(c.hardChallenge) };
  if (c.easy !== undefined) counts.easy = num(c.easy);
  if (c.medium !== undefined) counts.medium = num(c.medium);
  return counts;
}

export function normalizeSubjectDetail(raw: unknown): QbSubjectDetail {
  const data = isRecord(raw) ? raw : {};
  const subject = isRecord(data.subject) ? data.subject : {};
  const totals = isRecord(data.totals) ? data.totals : {};
  return {
    subject: { id: str(subject.id), label: str(subject.label), color: str(subject.color) || '#6366f1' },
    venue: normalizeVenue(data.venue),
    mode: data.mode === 'challenge' ? 'challenge' : 'bank',
    totals: {
      all: num(totals.all),
      easy: num(totals.easy),
      medium: num(totals.medium),
      hardChallenge: num(totals.hardChallenge),
    },
    groups: (Array.isArray(data.groups) ? data.groups.filter(isRecord) : []).map((g) => ({
      gradeLabel: strOrNull(g.gradeLabel),
      term: cleanNumOrNull(g.term),
      ...(typeof g.label === 'string' && g.label.trim() ? { label: g.label.trim() } : {}),
      topics: (Array.isArray(g.topics) ? g.topics.filter(isRecord) : []).map((t) => ({
        id: str(t.id),
        name: str(t.name),
        total: num(t.total),
        answered: num(t.answered),
        accuracy: cleanNumOrNull(t.accuracy),
        counts: normalizeCounts(t.counts),
      })),
    })),
    challengeUnlocked: data.challengeUnlocked === true,
  };
}

/** placeholder ของข้อที่ล็อก → Question stub ให้ ExamContext/ExamContainer ใช้ต่อได้ (ไม่มีเนื้อหาข้อ) */
export function toLockedQuestion(raw: { id: string; topicId?: string | null }): Question {
  return {
    id: raw.id,
    topicId: raw.topicId ?? undefined,
    locked: true,
    isChallenge: true,
    question: '',
    choices: [],
    category: 'general_knowledge',
    difficulty: 'hard',
    type: 'multiple_choice',
    status: 'published',
    author: { id: '', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

export function isLockedQuestion(q: Pick<Question, 'locked'> | null | undefined): boolean {
  return q?.locked === true;
}

export function normalizeSession(raw: unknown): QbSession {
  const data = isRecord(raw) ? raw : {};
  const questions = (Array.isArray(data.questions) ? data.questions.filter(isRecord) : []).map((q) =>
    q.locked === true
      ? toLockedQuestion({ id: str(q.id), topicId: strOrNull(q.topicId) })
      : (q as unknown as Question),
  );
  return {
    venueKey: str(data.venueKey),
    venueName: str(data.venueName),
    subjectLabel: str(data.subjectLabel),
    total: num(data.total, questions.length),
    questions,
  };
}

// ── requests ─────────────────────────────────────────────────

/** GET /question-bank/venues?mode= — สนามที่ active และมีวิชาผูก เรียงตาม sortOrder */
export async function getQbVenues(mode: QbMode, signal?: AbortSignal): Promise<QbVenue[]> {
  const response = await fetchWithAuth(`${BASE}/venues?mode=${mode}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch question bank venues');
  const data: unknown = await response.json();
  return Array.isArray(data) ? data.map(normalizeVenue) : [];
}

/** GET /question-bank/venues/:key?mode= — การ์ดวิชา + สถิติ (stats null เมื่อไม่ login) */
export async function getQbVenueOverview(
  key: string,
  mode: QbMode,
  signal?: AbortSignal,
): Promise<QbVenueOverview> {
  const response = await fetchWithAuth(`${BASE}/venues/${encodeURIComponent(key)}?mode=${mode}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch question bank venue');
  return normalizeVenueOverview(await response.json());
}

/** GET /question-bank/subjects/:id?mode= — บทของวิชาจัดกลุ่มตามชั้น/เทอม */
export async function getQbSubject(id: string, mode: QbMode, signal?: AbortSignal): Promise<QbSubjectDetail> {
  const response = await fetchWithAuth(`${BASE}/subjects/${encodeURIComponent(id)}?mode=${mode}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch question bank subject');
  return normalizeSubjectDetail(await response.json());
}

/**
 * POST /question-bank/sessions — ข้อสำหรับฝึก เรียงตามบทแล้วสุ่มในบท
 * ส่งเฉพาะ field ที่มีค่า (difficulties เฉพาะโหมด bank) — ไม่มีข้อ = questions []
 */
export async function createQbSession(input: QbSessionInput, signal?: AbortSignal): Promise<QbSession> {
  const body: Record<string, unknown> = { subjectId: input.subjectId, mode: input.mode };
  if (input.topicIds && input.topicIds.length > 0) body.topicIds = input.topicIds;
  if (input.mode === 'bank' && input.difficulties && input.difficulties.length > 0) {
    body.difficulties = input.difficulties;
  }
  if (input.progress && input.progress !== 'all') body.progress = input.progress;
  if (input.limit !== undefined) body.limit = input.limit;

  const response = await fetchWithAuth(
    `${BASE}/sessions`,
    { method: 'POST', body: JSON.stringify(body), signal },
    // guest ที่ token หมดอายุไม่ควรถูกพาออกจากหน้าฝึก — 401 คืนเป็น ApiError ให้หน้าแสดงเอง
    { redirectOnUnauthorized: false },
  );
  if (!response.ok) throw await toApiError(response, 'Failed to start question bank session');
  return normalizeSession(await response.json());
}
