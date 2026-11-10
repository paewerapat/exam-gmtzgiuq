// Unlock codes API (task 15) — ผู้ใช้กรอกโค้ด + แอดมินจัดการแคมเปญ/โค้ด
// error ของ endpoint กลุ่มนี้: `{ statusCode, message: <ไทย>, errorCode }` → ApiError (lib/api/apiError)
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';
import { filenameFromContentDisposition, safeCsvFilename, type UnlockCodeStatusFilter } from '@/lib/unlock-codes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── ผู้ใช้ ────────────────────────────────────────────────

export interface RedeemUnlockCodeInput {
  /** ตามที่ผู้ใช้กรอก — API ตัดช่องว่าง/ขีดและไม่สนตัวพิมพ์ */
  code: string;
  /** ชุดที่กรอกโค้ดอยู่ (API ตรวจว่าโค้ดใช้กับชุดนี้ได้) */
  examId: string;
}

export interface RedeemUnlockCodeResult {
  /** ทุกชุดที่บัญชีได้สิทธิ์จากโค้ดนี้ (โค้ดผูกหลายชุด → หลาย id) */
  unlockedExamIds: string[];
  /** วันหมดสิทธิ์ ISO */
  expiresAt: string;
}

/** POST /unlock-codes/redeem (JWT) — ผิด → ApiError ที่มี errorCode (INVALID_FORMAT, NOT_FOUND, ...) */
export async function redeemUnlockCode(input: RedeemUnlockCodeInput): Promise<RedeemUnlockCodeResult> {
  const response = await fetchWithAuth(`${API_URL}/unlock-codes/redeem`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response, 'Failed to redeem code');
  const data = (await response.json()) as Record<string, unknown>;
  return {
    unlockedExamIds: Array.isArray(data.unlockedExamIds)
      ? data.unlockedExamIds.filter((v): v is string => typeof v === 'string')
      : [],
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
  };
}

// ── แอดมิน ────────────────────────────────────────────────

export interface UnlockBatch {
  id: string;
  name: string;
  /** true = ทุกชุด Mock ที่ไม่ฟรี (รวมชุดที่สร้างภายหลัง) — exams ว่าง */
  allMock: boolean;
  exams: { id: string; title: string }[];
  codeCount: number;
  usedCount: number;
  accessDays: number;
  /** วันสุดท้ายที่กรอกโค้ดได้ ISO (null = ไม่หมดอายุ) */
  codeExpiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UnlockCodeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface UnlockCode {
  id: string;
  code: string;
  isActive: boolean;
  usedAt: string | null;
  usedBy: UnlockCodeUser | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetUnlockBatchesParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateUnlockBatchInput {
  name: string;
  /** Mock ที่ไม่ฟรี (allMock = true ไม่ต้องส่ง) */
  examIds?: string[];
  allMock: boolean;
  /** 1–5000 */
  count: number;
  /** 1–3650 */
  accessDays: number;
  /** ISO พร้อม offset (ไม่ส่ง = ไม่หมดอายุ) */
  codeExpiresAt?: string;
}

export interface UpdateUnlockBatchInput {
  name?: string;
  isActive?: boolean;
  /** null = ไม่หมดอายุ */
  codeExpiresAt?: string | null;
}

export interface GetUnlockCodesParams {
  status?: UnlockCodeStatusFilter;
  search?: string;
  page?: number;
  limit?: number;
}

type RawRecord = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
// COUNT จาก SQL อาจมาเป็น string
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

export function normalizeUnlockBatch(raw: RawRecord): UnlockBatch {
  const exams = Array.isArray(raw.exams)
    ? (raw.exams as unknown[])
        .filter((e): e is RawRecord => !!e && typeof e === 'object')
        .map((e) => ({ id: str(e.id), title: str(e.title) }))
    : [];
  return {
    id: str(raw.id),
    name: str(raw.name),
    allMock: raw.allMock === true,
    exams,
    codeCount: num(raw.codeCount),
    usedCount: num(raw.usedCount),
    accessDays: num(raw.accessDays),
    codeExpiresAt: strOrNull(raw.codeExpiresAt),
    isActive: raw.isActive !== false,
    createdAt: str(raw.createdAt),
  };
}

export function normalizeUnlockCode(raw: RawRecord): UnlockCode {
  const u = raw.usedBy && typeof raw.usedBy === 'object' ? (raw.usedBy as RawRecord) : null;
  return {
    id: str(raw.id),
    code: str(raw.code),
    isActive: raw.isActive !== false,
    usedAt: strOrNull(raw.usedAt),
    usedBy: u
      ? { id: str(u.id), email: str(u.email), firstName: strOrNull(u.firstName), lastName: strOrNull(u.lastName) }
      : null,
  };
}

function normalizePage<T>(data: RawRecord, map: (raw: RawRecord) => T, page: number, limit: number): Paginated<T> {
  const items = Array.isArray(data.items) ? (data.items as RawRecord[]).map(map) : [];
  return {
    items,
    total: num(data.total, items.length),
    page: num(data.page, page),
    limit: num(data.limit, limit),
    totalPages: Math.max(1, num(data.totalPages, 1)),
  };
}

const ADMIN_BASE = `${API_URL}/unlock-codes/admin`;

/** GET /unlock-codes/admin/batches?page&limit&search */
export async function getUnlockBatches(
  params: GetUnlockBatchesParams = {},
  signal?: AbortSignal,
): Promise<Paginated<UnlockBatch>> {
  const { page = 1, limit = 20, search } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search?.trim()) query.set('search', search.trim());
  const response = await fetchWithAuth(`${ADMIN_BASE}/batches?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch unlock batches');
  return normalizePage((await response.json()) as RawRecord, normalizeUnlockBatch, page, limit);
}

/** POST /unlock-codes/admin/batches — สร้างแคมเปญพร้อมโค้ด (5,000 โค้ดใช้เวลาหลายวินาที) */
export async function createUnlockBatch(input: CreateUnlockBatchInput): Promise<UnlockBatch> {
  const body: CreateUnlockBatchInput = {
    name: input.name,
    allMock: input.allMock,
    count: input.count,
    accessDays: input.accessDays,
    ...(input.allMock ? {} : { examIds: input.examIds ?? [] }),
    ...(input.codeExpiresAt ? { codeExpiresAt: input.codeExpiresAt } : {}),
  };
  const response = await fetchWithAuth(`${ADMIN_BASE}/batches`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw await toApiError(response, 'Failed to create unlock batch');
  return normalizeUnlockBatch((await response.json()) as RawRecord);
}

/** GET /unlock-codes/admin/batches/:id */
export async function getUnlockBatch(id: string, signal?: AbortSignal): Promise<UnlockBatch> {
  const response = await fetchWithAuth(`${ADMIN_BASE}/batches/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch unlock batch');
  return normalizeUnlockBatch((await response.json()) as RawRecord);
}

/** PATCH /unlock-codes/admin/batches/:id — ชื่อ / เปิด-ปิด / วันหมดอายุโค้ด (ชุดที่ผูกและอายุสิทธิ์แก้ไม่ได้) */
export async function updateUnlockBatch(id: string, input: UpdateUnlockBatchInput): Promise<UnlockBatch> {
  const response = await fetchWithAuth(`${ADMIN_BASE}/batches/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response, 'Failed to update unlock batch');
  return normalizeUnlockBatch((await response.json()) as RawRecord);
}

/** GET /unlock-codes/admin/batches/:id/codes?status&search&page&limit */
export async function getUnlockBatchCodes(
  batchId: string,
  params: GetUnlockCodesParams = {},
  signal?: AbortSignal,
): Promise<Paginated<UnlockCode>> {
  const { status = 'all', search, page = 1, limit = 50 } = params;
  const query = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  if (search?.trim()) query.set('search', search.trim());
  const response = await fetchWithAuth(
    `${ADMIN_BASE}/batches/${encodeURIComponent(batchId)}/codes?${query.toString()}`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) throw await toApiError(response, 'Failed to fetch unlock codes');
  return normalizePage((await response.json()) as RawRecord, normalizeUnlockCode, page, limit);
}

/** PATCH /unlock-codes/admin/codes/:id — ปิด/เปิดโค้ดเดียว */
export async function updateUnlockCode(id: string, input: { isActive: boolean }): Promise<UnlockCode> {
  const response = await fetchWithAuth(`${ADMIN_BASE}/codes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response, 'Failed to update unlock code');
  return normalizeUnlockCode((await response.json()) as RawRecord);
}

/**
 * GET /unlock-codes/admin/batches/:id/codes.csv — ไฟล์ CSV (มี BOM สำหรับ Excel ไทย) ทั้งแคมเปญ
 * ต้องส่ง token จึงดาวน์โหลดผ่าน fetch แล้วให้หน้าเว็บสร้างลิงก์ดาวน์โหลดเอง
 * ชื่อไฟล์จาก Content-Disposition (ไม่มี/อ่านไม่ได้ เช่น CORS ไม่ expose header → ชื่อแคมเปญ)
 */
export async function downloadUnlockBatchCsv(
  batchId: string,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetchWithAuth(`${ADMIN_BASE}/batches/${encodeURIComponent(batchId)}/codes.csv`, {
    cache: 'no-store',
    headers: { Accept: 'text/csv' },
  });
  if (!response.ok) throw await toApiError(response, 'Failed to download CSV');
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    safeCsvFilename(fallbackName),
  );
  return { blob, filename };
}
