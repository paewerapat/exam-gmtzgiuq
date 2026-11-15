// Predicted Exam (task 22): หน้า /dashboard/predicted (GET /predicted) + หลังบ้านซีรีส์ (/admin/predicted/...)
// normalizer ทนข้อมูลขาด — field ที่ไม่มี/ผิดรูปได้ค่าที่ปลอดภัย (เช่น viewerAccess ไม่รู้จัก = locked)
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';
import {
  HEX_COLOR,
  isRecord,
  normalizePredictedSet,
  normalizePreviewCount,
  normalizeSetAccess,
  strOrNull,
  toCount,
  toNumberOrNull,
  type PredictedSetAccess,
  type PredictedSetSummary,
} from '@/lib/predicted';

export type {
  PredictedProgress,
  PredictedSetAccess,
  PredictedSetSummary,
  PredictedViewerAccess,
} from '@/lib/predicted';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type RawRecord = Record<string, unknown>;

const list = (v: unknown): RawRecord[] => {
  if (Array.isArray(v)) return v.filter(isRecord);
  if (isRecord(v) && Array.isArray(v.items)) return v.items.filter(isRecord);
  return [];
};

// ── สาธารณะ ─────────────────────────────────────────────────

export interface PredictedVenueTab {
  key: string;
  name: string;
}

export interface PredictedSubjectChip {
  id: string;
  name: string;
  /** จำนวนชุด (ไม่ใช่ซีรีส์) ของวิชานี้ในสนาม */
  count: number;
}

export interface PredictedSeries {
  id: string;
  title: string;
  description: string | null;
  /** hex หรือ null */
  color: string | null;
  venueKey: string | null;
  subject: { id: string; name: string } | null;
  /** เรียงตาม setNo */
  sets: PredictedSetSummary[];
}

export interface PredictedPageData {
  /** สนามที่ API ใช้จริง (field venueKey — ส่ง venue ว่าง = สนามแรก) — API ไม่ส่ง → เดาจากซีรีส์ */
  venue: string | null;
  venues: PredictedVenueTab[];
  subjects: PredictedSubjectChip[];
  series: PredictedSeries[];
  /** จำนวนชุดทั้งหมด */
  total: number;
  /** ผู้ใช้มีแพ็กเกจจ่ายเงินในสนามนี้ (ถ้า API ส่ง) — null = ไม่ทราบ */
  viewerHasPaidPlan: boolean | null;
}

const color = (v: unknown): string | null => (typeof v === 'string' && HEX_COLOR.test(v) ? v : null);

export function normalizePredictedSeries(raw: RawRecord): PredictedSeries | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  const subject = isRecord(raw.subject) && strOrNull(raw.subject.id)
    ? { id: String(raw.subject.id), name: strOrNull(raw.subject.name) ?? '' }
    : null;
  const sets = list(raw.sets)
    .map((s, i) => normalizePredictedSet(s, i))
    .filter((s): s is PredictedSetSummary => s !== null)
    .sort((a, b) => a.setNo - b.setNo);
  return {
    id,
    title: strOrNull(raw.title) ?? '',
    description: strOrNull(raw.description),
    color: color(raw.color),
    venueKey: strOrNull(raw.venueKey) ?? (isRecord(raw.venue) ? strOrNull(raw.venue.key) : null),
    subject,
    sets,
  };
}

export function normalizePredictedPage(raw: unknown): PredictedPageData {
  const data = isRecord(raw) ? raw : {};
  const venues = list(data.venues)
    .map((v) => ({ key: strOrNull(v.key) ?? '', name: strOrNull(v.name) ?? strOrNull(v.key) ?? '' }))
    .filter((v) => v.key);
  const subjects = list(data.subjects)
    .map((s) => ({ id: strOrNull(s.id) ?? '', name: strOrNull(s.name) ?? '', count: toCount(s.count) }))
    .filter((s) => s.id);
  const series = list(data.series)
    .map(normalizePredictedSeries)
    .filter((s): s is PredictedSeries => s !== null);
  const setTotal = series.reduce((sum, s) => sum + s.sets.length, 0);
  const total = toNumberOrNull(data.total);
  const venue =
    strOrNull(data.venueKey) ?? strOrNull(data.venue) ?? (isRecord(data.venue) ? strOrNull(data.venue.key) : null);
  return {
    venue,
    venues,
    subjects,
    series,
    total: total != null && total >= 0 ? Math.floor(total) : setTotal,
    viewerHasPaidPlan: typeof data.viewerHasPaidPlan === 'boolean' ? data.viewerHasPaidPlan : null,
  };
}

/** GET /predicted?venue=&subject= (Jwt optional — ส่ง token เพื่อได้ viewerAccess/myProgress ของบัญชี) */
export async function getPredicted(
  params: { venue?: string; subject?: string } = {},
  signal?: AbortSignal,
): Promise<PredictedPageData> {
  const query = new URLSearchParams();
  if (params.venue) query.set('venue', params.venue);
  if (params.subject) query.set('subject', params.subject);
  const qs = query.toString();
  const response = await fetchWithAuth(`${API_URL}/predicted${qs ? `?${qs}` : ''}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'โหลดชุด Predicted Exam ไม่สำเร็จ');
  return normalizePredictedPage(await response.json());
}

// ── หลังบ้าน ─────────────────────────────────────────────────

const ADMIN = `${API_URL}/admin/predicted`;

export interface AdminPredictedSet {
  examId: string;
  setNo: number;
  access: PredictedSetAccess;
  previewCount: number | null;
  /** ชื่อชุด/จำนวนข้อจาก exam ที่ API แนบมา (ไม่มี → '' / 0) */
  title: string;
  questionCount: number;
  status: string | null;
}

export interface AdminPredictedSeries {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  venueId: string;
  venueKey: string | null;
  venueName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  sortOrder: number;
  isActive: boolean;
  sets: AdminPredictedSet[];
  /** จำนวนชุด (API รายการอาจไม่ส่ง sets มา แต่ส่ง setCount) */
  setCount: number;
  updatedAt: string | null;
}

export interface PredictedExamOption {
  id: string;
  title: string;
  questionCount: number;
  status: string | null;
  subjectName: string | null;
  categoryName: string | null;
}

export interface PredictedSeriesInput {
  title: string;
  description: string | null;
  venueId: string;
  subjectId: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  sets: { examId: string; setNo: number; access: PredictedSetAccess; previewCount: number | null }[];
}

function examCount(raw: RawRecord): number {
  const exam = isRecord(raw.exam) ? raw.exam : {};
  const value = raw.questionCount ?? raw.totalQuestions ?? exam.questionCount ?? exam.totalQuestions;
  if (value != null) return toCount(value);
  return Array.isArray(exam.questions) ? exam.questions.length : 0;
}

export function normalizeAdminPredictedSet(raw: RawRecord, index = 0): AdminPredictedSet | null {
  const exam = isRecord(raw.exam) ? raw.exam : {};
  const examId = strOrNull(raw.examId) ?? strOrNull(exam.id);
  if (!examId) return null;
  const setNo = toNumberOrNull(raw.setNo);
  return {
    examId,
    setNo: setNo != null && setNo >= 1 ? Math.floor(setNo) : index + 1,
    access: normalizeSetAccess(raw.access),
    previewCount: normalizePreviewCount(raw.previewCount),
    title: strOrNull(raw.title) ?? strOrNull(raw.examTitle) ?? strOrNull(exam.title) ?? '',
    questionCount: examCount(raw),
    status: strOrNull(raw.status) ?? strOrNull(exam.status),
  };
}

export function normalizeAdminPredictedSeries(raw: RawRecord): AdminPredictedSeries | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  const venue = isRecord(raw.venue) ? raw.venue : {};
  const subject = isRecord(raw.subject) ? raw.subject : {};
  const sets = list(raw.sets)
    .map((s, i) => normalizeAdminPredictedSet(s, i))
    .filter((s): s is AdminPredictedSet => s !== null)
    .sort((a, b) => a.setNo - b.setNo);
  const sortOrder = toNumberOrNull(raw.sortOrder);
  const setCount = toNumberOrNull(raw.setCount);
  return {
    id,
    title: strOrNull(raw.title) ?? '',
    description: strOrNull(raw.description),
    color: color(raw.color),
    venueId: strOrNull(raw.venueId) ?? strOrNull(venue.id) ?? '',
    venueKey: strOrNull(raw.venueKey) ?? strOrNull(venue.key),
    venueName: strOrNull(raw.venueName) ?? strOrNull(venue.name),
    subjectId: strOrNull(raw.subjectId) ?? strOrNull(subject.id),
    subjectName: strOrNull(raw.subjectName) ?? strOrNull(subject.name),
    sortOrder: sortOrder != null ? Math.floor(sortOrder) : 0,
    isActive: raw.isActive !== false,
    sets,
    setCount: setCount != null && setCount >= 0 ? Math.floor(setCount) : sets.length,
    updatedAt: strOrNull(raw.updatedAt),
  };
}

export function normalizePredictedExamOption(raw: RawRecord): PredictedExamOption | null {
  const id = strOrNull(raw.id) ?? strOrNull(raw.examId);
  if (!id) return null;
  const subject = isRecord(raw.subject) ? raw.subject : {};
  return {
    id,
    title: strOrNull(raw.title) ?? '',
    questionCount: examCount(raw),
    status: strOrNull(raw.status),
    subjectName: strOrNull(raw.subjectName) ?? strOrNull(subject.name),
    categoryName: strOrNull(raw.categoryName) ?? strOrNull(raw.category),
  };
}

async function sendJson(url: string, method: string, body: unknown, fallback: string): Promise<unknown> {
  const response = await fetchWithAuth(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await toApiError(response, fallback);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

/** GET /admin/predicted/series — กรองสนามที่หน้าเว็บ (เรียงตามสนาม → sortOrder → ชื่อ ทำที่หน้า) */
export async function getAdminPredictedSeries(signal?: AbortSignal): Promise<AdminPredictedSeries[]> {
  const response = await fetchWithAuth(`${ADMIN}/series`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'โหลดรายการซีรีส์ไม่สำเร็จ');
  return list(await response.json())
    .map(normalizeAdminPredictedSeries)
    .filter((s): s is AdminPredictedSeries => s !== null);
}

/** GET /admin/predicted/series/:id */
export async function getAdminPredictedSeriesById(id: string, signal?: AbortSignal): Promise<AdminPredictedSeries> {
  const response = await fetchWithAuth(`${ADMIN}/series/${encodeURIComponent(id)}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'โหลดซีรีส์ไม่สำเร็จ');
  const data: unknown = await response.json();
  const series = isRecord(data) ? normalizeAdminPredictedSeries(data) : null;
  if (!series) throw new Error('Invalid series response');
  return series;
}

function toSeries(data: unknown, fallbackId?: string): AdminPredictedSeries | null {
  if (!isRecord(data)) return null;
  return normalizeAdminPredictedSeries(fallbackId && !data.id ? { ...data, id: fallbackId } : data);
}

/**
 * POST /admin/predicted/series — ส่ง sets ไปด้วย; ถ้า API สร้างแค่ตัวซีรีส์ (ตอบกลับโดยไม่มีชุด)
 * ตามด้วย PUT ทั้งชุดอีกครั้งเพื่อบันทึกชุด (สัญญา: PUT แทนที่ sets ทั้งหมด)
 */
export async function createPredictedSeries(input: PredictedSeriesInput): Promise<AdminPredictedSeries | null> {
  const created = toSeries(await sendJson(`${ADMIN}/series`, 'POST', input, 'สร้างซีรีส์ไม่สำเร็จ'));
  if (created && input.sets.length > 0 && created.sets.length === 0) {
    return updatePredictedSeries(created.id, input);
  }
  return created;
}

/** PUT /admin/predicted/series/:id — sets แทนที่ทั้งหมด (ใน transaction ฝั่ง API) */
export async function updatePredictedSeries(id: string, input: PredictedSeriesInput): Promise<AdminPredictedSeries | null> {
  return toSeries(
    await sendJson(`${ADMIN}/series/${encodeURIComponent(id)}`, 'PUT', input, 'บันทึกซีรีส์ไม่สำเร็จ'),
    id,
  );
}

/** DELETE /admin/predicted/series/:id — ชุดในซีรีส์กลับเป็นชุดปกติ (ข้อสอบไม่ถูกลบ) */
export async function deletePredictedSeries(id: string): Promise<void> {
  await sendJson(`${ADMIN}/series/${encodeURIComponent(id)}`, 'DELETE', undefined, 'ลบซีรีส์ไม่สำเร็จ');
}

/** GET /admin/predicted/exams?search= — ชุดที่ยังไม่อยู่ในซีรีส์ใด (ไม่ใช่ Mock / bankOnly) */
export async function searchPredictedExamOptions(search: string, signal?: AbortSignal): Promise<PredictedExamOption[]> {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  const qs = query.toString();
  const response = await fetchWithAuth(`${ADMIN}/exams${qs ? `?${qs}` : ''}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'ค้นหาชุดข้อสอบไม่สำเร็จ');
  return list(await response.json())
    .map(normalizePredictedExamOption)
    .filter((o): o is PredictedExamOption => o !== null);
}
