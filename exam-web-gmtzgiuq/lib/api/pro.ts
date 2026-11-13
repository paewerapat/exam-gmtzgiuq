// สมาชิก Pro (task 17): หน้า Upgrade สาธารณะ + สิทธิ์ของฉัน + หลังบ้าน (สนาม แพ็กเกจ ตารางเปรียบเทียบ สมาชิก)
// error ของ endpoint กลุ่มนี้: `{ statusCode, message: <ไทย>, errorCode }` → ApiError (lib/api/apiError)
// ทุก response ผ่าน normalize ก่อนใช้ (ค่าแปลก/ขาด → ค่าปลอดภัย) ข้อความทั้งหมดเป็น plain text แสดงแบบ text เท่านั้น
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const BASE = `${API_URL}/pro`;

// ── ตารางเปรียบเทียบ (pro_venues.comparison) ─────────────────

export type ComparisonCellType = 'check' | 'cross' | 'text';

export interface ComparisonCell {
  type: ComparisonCellType;
  /** ใช้เมื่อ type = text (≤50) */
  text?: string;
  /** บรรทัดเล็กใต้ text (≤100) */
  subtext?: string;
}

export interface ComparisonRow {
  /** id ภายในหน้า editor (ไม่ส่งไป API) */
  id?: string;
  label: string;
  sublabel?: string;
  /** key = plan code */
  cells: Record<string, ComparisonCell>;
}

export interface ComparisonGroup {
  /** id ภายในหน้า editor (ไม่ส่งไป API) */
  id?: string;
  title: string;
  rows: ComparisonRow[];
}

export interface Comparison {
  groups: ComparisonGroup[];
}

// ── หน้า Upgrade สาธารณะ ─────────────────────────────────────

export interface ProPageText {
  title: string;
  subtitle: string;
  venuePickerTitle: string;
  footerNote: string;
}

export interface ProPublicPlan {
  id: string;
  code: string;
  rank: number;
  name: string;
  tagline: string | null;
  /** หน่วยสตางค์ (0 = ฟรี) */
  priceSatang: number;
  priceUnit: string | null;
  priceNote: string | null;
  buttonText: string;
  badge: string | null;
  highlight: boolean;
  isPurchasable: boolean;
}

export interface ProPublicVenue {
  id: string;
  key: string;
  name: string;
  description: string | null;
  comparison: Comparison;
  plans: ProPublicPlan[];
}

/** สถานะที่ API ใช้ (task 18 จะเพิ่ม pending/canceled — ค่าที่ไม่รู้จักเก็บเป็น string เดิม) */
export type ProSubscriptionStatus = 'active' | 'expired' | 'revoked' | (string & {});

export interface ProMySubscription {
  venueId: string;
  planId: string;
  planCode: string;
  status: ProSubscriptionStatus;
  currentPeriodEnd: string;
  autoRenew: boolean;
}

export interface ProUpgradeData {
  page: ProPageText;
  venues: ProPublicVenue[];
  /** [] ถ้าไม่ได้ login */
  my: ProMySubscription[];
}

export interface ProMeItem {
  venueId: string;
  venueKey: string;
  venueName: string;
  planId: string;
  planCode: string;
  planName: string;
  status: ProSubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  source: string;
}

// ── หลังบ้าน ─────────────────────────────────────────────────

/** สิทธิ์จริงของแพ็กเกจ (แยกจากข้อความที่แสดง) — key ที่ไม่รู้จักเก็บไว้ส่งกลับตามเดิม */
export interface ProEntitlements {
  challenge: boolean;
  beyond: boolean;
  /** จำนวนชุด Predicted ต่อวิชา (≥0) หรือ null = ทุกชุด */
  predictedSets: number | null;
  solutions: boolean;
  analytics: boolean;
  mockPurchase: boolean;
  [key: string]: unknown;
}

export interface ProAdminPlan extends ProPublicPlan {
  venueId: string;
  periodDays: number;
  sortOrder: number;
  isVisible: boolean;
  entitlements: ProEntitlements;
}

export interface ProAdminVenue {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  comparison: Comparison;
  /** เรียงตาม sortOrder */
  plans: ProAdminPlan[];
}

export interface ProAdminConfig {
  page: ProPageText;
  /** ทุกสนาม (รวมที่ปิด) เรียงตาม sortOrder พร้อมแพ็กเกจ (รวมที่ซ่อน) */
  venues: ProAdminVenue[];
}

export interface ProVenueInput {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  /** PUT เท่านั้น */
  comparison?: Comparison;
}

export interface ProPlanInput {
  code: string;
  rank: number;
  name: string;
  tagline: string | null;
  priceSatang: number;
  priceUnit: string | null;
  priceNote: string | null;
  periodDays: number;
  buttonText: string;
  badge: string | null;
  highlight: boolean;
  sortOrder: number;
  isVisible: boolean;
  isPurchasable: boolean;
  entitlements: ProEntitlements;
}

export interface ProAdminSubscription {
  id: string;
  /** null = บัญชีผู้ใช้ถูกลบไปแล้ว */
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string } | null;
  /** API คิดจากวันหมดอายุแล้ว (active ที่เลยวัน → expired) */
  status: ProSubscriptionStatus;
  source: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  note: string | null;
  createdAt: string;
}

export interface ProSubscriptionPage {
  items: ProAdminSubscription[];
  total: number;
}

export interface GetProSubscriptionsParams {
  page?: number;
  /** ≤100 */
  limit?: number;
  venueId?: string;
  planId?: string;
  status?: 'active' | 'expired' | 'revoked';
  /** อีเมล/ชื่อ */
  search?: string;
}

export interface GrantProSubscriptionInput {
  email: string;
  planId: string;
  /** 1–3650 */
  days: number;
  note?: string;
}

// ── normalize ────────────────────────────────────────────────

type RawRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
// MySQL tinyint อาจมาเป็น 0/1
const bool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : v === 1 || v === '1' ? true : v === 0 || v === '0' ? false : fallback;

function normalizeCell(raw: unknown): ComparisonCell | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (type !== 'check' && type !== 'cross' && type !== 'text') return null;
  if (type !== 'text') return { type };
  const cell: ComparisonCell = { type, text: str(raw.text) };
  const sub = strOrNull(raw.subtext);
  if (sub) cell.subtext = sub;
  return cell;
}

/** comparison จาก API (json อาจเป็น null / string / รูปผิด) → { groups } ที่ใช้ได้เสมอ */
export function normalizeComparison(raw: unknown): Comparison {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (!isRecord(value) || !Array.isArray(value.groups)) return { groups: [] };
  const groups = value.groups.filter(isRecord).map((g) => ({
    title: str(g.title),
    rows: (Array.isArray(g.rows) ? g.rows : []).filter(isRecord).map((r) => {
      const cells: Record<string, ComparisonCell> = {};
      if (isRecord(r.cells)) {
        for (const [code, c] of Object.entries(r.cells)) {
          const cell = normalizeCell(c);
          if (cell) cells[code] = cell;
        }
      }
      const row: ComparisonRow = { label: str(r.label), cells };
      const sub = strOrNull(r.sublabel);
      if (sub) row.sublabel = sub;
      return row;
    }),
  }));
  return { groups };
}

export function normalizePageText(raw: unknown): ProPageText {
  const p = isRecord(raw) ? raw : {};
  return {
    title: str(p.title),
    subtitle: str(p.subtitle),
    venuePickerTitle: str(p.venuePickerTitle),
    footerNote: str(p.footerNote),
  };
}

export function normalizePublicPlan(raw: RawRecord): ProPublicPlan {
  return {
    id: str(raw.id),
    code: str(raw.code),
    rank: num(raw.rank),
    name: str(raw.name),
    tagline: strOrNull(raw.tagline),
    priceSatang: Math.max(0, Math.round(num(raw.priceSatang))),
    priceUnit: strOrNull(raw.priceUnit),
    priceNote: strOrNull(raw.priceNote),
    buttonText: str(raw.buttonText),
    badge: strOrNull(raw.badge),
    highlight: bool(raw.highlight),
    isPurchasable: bool(raw.isPurchasable),
  };
}

export function normalizeEntitlements(raw: unknown): ProEntitlements {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const e = isRecord(value) ? value : {};
  const sets = e.predictedSets;
  return {
    ...e,
    challenge: bool(e.challenge),
    beyond: bool(e.beyond),
    predictedSets: sets === null ? null : Math.max(0, Math.floor(num(sets, 0))),
    solutions: bool(e.solutions),
    analytics: bool(e.analytics),
    mockPurchase: bool(e.mockPurchase),
  };
}

export function normalizeAdminPlan(raw: RawRecord, venueId = ''): ProAdminPlan {
  return {
    ...normalizePublicPlan(raw),
    venueId: str(raw.venueId, venueId) || venueId,
    periodDays: num(raw.periodDays, 30),
    sortOrder: num(raw.sortOrder),
    isVisible: bool(raw.isVisible, true),
    entitlements: normalizeEntitlements(raw.entitlements),
  };
}

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

export function normalizeAdminVenue(raw: RawRecord, allPlans: ProAdminPlan[] = []): ProAdminVenue {
  const id = str(raw.id);
  const nested = Array.isArray(raw.plans)
    ? raw.plans.filter(isRecord).map((p) => normalizeAdminPlan(p, id))
    : [];
  const plans = nested.length > 0 ? nested : allPlans.filter((p) => p.venueId === id);
  return {
    id,
    key: str(raw.key),
    name: str(raw.name),
    description: strOrNull(raw.description),
    sortOrder: num(raw.sortOrder),
    isActive: bool(raw.isActive, true),
    comparison: normalizeComparison(raw.comparison),
    plans: [...plans].sort(bySortOrder),
  };
}

/** รับได้ทั้ง venues[].plans และ plans ระดับบน (มี venueId) */
export function normalizeAdminConfig(raw: unknown): ProAdminConfig {
  const data = isRecord(raw) ? raw : {};
  const topPlans = Array.isArray(data.plans) ? data.plans.filter(isRecord).map((p) => normalizeAdminPlan(p)) : [];
  const venues = (Array.isArray(data.venues) ? data.venues.filter(isRecord) : [])
    .map((v) => normalizeAdminVenue(v, topPlans))
    .sort(bySortOrder);
  return { page: normalizePageText(data.page), venues };
}

export function normalizeUpgradeData(raw: unknown): ProUpgradeData {
  const data = isRecord(raw) ? raw : {};
  const venues = (Array.isArray(data.venues) ? data.venues.filter(isRecord) : []).map((v) => ({
    id: str(v.id),
    key: str(v.key),
    name: str(v.name),
    description: strOrNull(v.description),
    comparison: normalizeComparison(v.comparison),
    plans: (Array.isArray(v.plans) ? v.plans.filter(isRecord) : []).map(normalizePublicPlan),
  }));
  const my = (Array.isArray(data.my) ? data.my.filter(isRecord) : []).map((m) => ({
    venueId: str(m.venueId),
    planId: str(m.planId),
    planCode: str(m.planCode),
    status: str(m.status),
    currentPeriodEnd: str(m.currentPeriodEnd),
    autoRenew: bool(m.autoRenew),
  }));
  return { page: normalizePageText(data.page), venues, my };
}

function normalizeMeItem(m: RawRecord): ProMeItem {
  return {
    venueId: str(m.venueId),
    venueKey: str(m.venueKey),
    venueName: str(m.venueName),
    planId: str(m.planId),
    planCode: str(m.planCode),
    planName: str(m.planName),
    status: str(m.status),
    currentPeriodStart: str(m.currentPeriodStart),
    currentPeriodEnd: str(m.currentPeriodEnd),
    autoRenew: bool(m.autoRenew),
    source: str(m.source),
  };
}

export function normalizeAdminSubscription(raw: RawRecord): ProAdminSubscription {
  const u = isRecord(raw.user) ? raw.user : null;
  const v = isRecord(raw.venue) ? raw.venue : null;
  const p = isRecord(raw.plan) ? raw.plan : null;
  return {
    id: str(raw.id),
    user: u ? { id: str(u.id), email: str(u.email), firstName: strOrNull(u.firstName), lastName: strOrNull(u.lastName) } : null,
    venue: v ? { id: str(v.id), key: str(v.key), name: str(v.name) } : null,
    plan: p ? { id: str(p.id), code: str(p.code), name: str(p.name) } : null,
    status: str(raw.status),
    source: str(raw.source),
    currentPeriodStart: str(raw.currentPeriodStart),
    currentPeriodEnd: str(raw.currentPeriodEnd),
    autoRenew: bool(raw.autoRenew),
    note: strOrNull(raw.note),
    createdAt: str(raw.createdAt),
  };
}

/** ตัด id ภายใน editor และ cell ว่างออกก่อนส่ง API */
export function toComparisonPayload(comparison: Comparison): Comparison {
  return {
    groups: comparison.groups.map((g) => ({
      title: g.title,
      rows: g.rows.map((r) => {
        const cells: Record<string, ComparisonCell> = {};
        for (const [code, c] of Object.entries(r.cells)) {
          if (c.type === 'text') {
            cells[code] = { type: 'text', text: c.text ?? '', ...(c.subtext ? { subtext: c.subtext } : {}) };
          } else {
            cells[code] = { type: c.type };
          }
        }
        return { label: r.label, ...(r.sublabel ? { sublabel: r.sublabel } : {}), cells };
      }),
    })),
  };
}

// ── public / ผู้ใช้ ─────────────────────────────────────────

/** GET /pro/upgrade (public — ส่ง token ถ้ามีเพื่อได้ `my`) */
export async function getProUpgrade(signal?: AbortSignal): Promise<ProUpgradeData> {
  const response = await fetchWithAuth(`${BASE}/upgrade`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch upgrade page');
  return normalizeUpgradeData(await response.json());
}

/** GET /pro/me (JWT) — สิทธิ์ที่ยังไม่หมด */
export async function getMyPro(signal?: AbortSignal): Promise<ProMeItem[]> {
  const response = await fetchWithAuth(`${BASE}/me`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch my subscriptions');
  const data: unknown = await response.json();
  return Array.isArray(data) ? data.filter(isRecord).map(normalizeMeItem) : [];
}

// ── แอดมิน ───────────────────────────────────────────────────

const ADMIN = `${BASE}/admin`;

async function sendJson(url: string, method: string, body: unknown, fallback: string): Promise<unknown> {
  const response = await fetchWithAuth(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await toApiError(response, fallback);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

/** GET /pro/admin/config */
export async function getProAdminConfig(signal?: AbortSignal): Promise<ProAdminConfig> {
  const response = await fetchWithAuth(`${ADMIN}/config`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch pro config');
  return normalizeAdminConfig(await response.json());
}

/** PUT /pro/admin/page */
export async function updateProPage(input: ProPageText): Promise<ProPageText> {
  return normalizePageText(await sendJson(`${ADMIN}/page`, 'PUT', input, 'Failed to update page text'));
}

/** POST /pro/admin/venues */
export async function createProVenue(input: Omit<ProVenueInput, 'comparison'>): Promise<ProAdminVenue> {
  const data = await sendJson(`${ADMIN}/venues`, 'POST', input, 'Failed to create venue');
  return normalizeAdminVenue(isRecord(data) ? data : {});
}

/** PUT /pro/admin/venues/:id (รวม comparison) — ฟิลด์ที่ไม่ส่งคงค่าเดิม */
export async function updateProVenue(id: string, input: Partial<ProVenueInput>): Promise<ProAdminVenue> {
  const body: Partial<ProVenueInput> = input.comparison
    ? { ...input, comparison: toComparisonPayload(input.comparison) }
    : input;
  const data = await sendJson(`${ADMIN}/venues/${encodeURIComponent(id)}`, 'PUT', body, 'Failed to update venue');
  return normalizeAdminVenue(isRecord(data) ? data : {});
}

/** DELETE /pro/admin/venues/:id — มี subscription อ้าง → ApiError 409 */
export async function deleteProVenue(id: string): Promise<void> {
  await sendJson(`${ADMIN}/venues/${encodeURIComponent(id)}`, 'DELETE', undefined, 'Failed to delete venue');
}

/** POST /pro/admin/plans */
export async function createProPlan(venueId: string, input: ProPlanInput): Promise<ProAdminPlan> {
  const data = await sendJson(`${ADMIN}/plans`, 'POST', { venueId, ...input }, 'Failed to create plan');
  return normalizeAdminPlan(isRecord(data) ? data : {}, venueId);
}

/** PUT /pro/admin/plans/:id — ฟิลด์ที่ไม่ส่งคงค่าเดิม */
export async function updateProPlan(id: string, input: Partial<ProPlanInput>): Promise<ProAdminPlan> {
  const data = await sendJson(`${ADMIN}/plans/${encodeURIComponent(id)}`, 'PUT', input, 'Failed to update plan');
  return normalizeAdminPlan(isRecord(data) ? data : {});
}

/** DELETE /pro/admin/plans/:id — มี subscription อ้าง → ApiError 409 */
export async function deleteProPlan(id: string): Promise<void> {
  await sendJson(`${ADMIN}/plans/${encodeURIComponent(id)}`, 'DELETE', undefined, 'Failed to delete plan');
}

/** GET /pro/admin/subscriptions?page&limit&venueId&planId&status&search */
export async function getProSubscriptions(
  params: GetProSubscriptionsParams = {},
  signal?: AbortSignal,
): Promise<ProSubscriptionPage> {
  const { page = 1, limit = 20, venueId, planId, status, search } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(100, limit)) });
  if (venueId) query.set('venueId', venueId);
  if (planId) query.set('planId', planId);
  if (status) query.set('status', status);
  if (search?.trim()) query.set('search', search.trim());
  const response = await fetchWithAuth(`${ADMIN}/subscriptions?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch subscriptions');
  const data: unknown = await response.json();
  const body = isRecord(data) ? data : {};
  const items = Array.isArray(body.items) ? body.items.filter(isRecord).map(normalizeAdminSubscription) : [];
  return { items, total: num(body.total, items.length) };
}

/** POST /pro/admin/subscriptions — ให้สิทธิ์ (แทนที่ active เดิมของสนามเดียวกัน) ผู้ใช้ไม่พบ 404 / plan ฟรี 400 */
export async function grantProSubscription(input: GrantProSubscriptionInput): Promise<ProAdminSubscription> {
  const body: GrantProSubscriptionInput = {
    email: input.email.trim(),
    planId: input.planId,
    days: input.days,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  const data = await sendJson(`${ADMIN}/subscriptions`, 'POST', body, 'Failed to grant subscription');
  return normalizeAdminSubscription(isRecord(data) ? data : {});
}

/** POST /pro/admin/subscriptions/:id/revoke */
export async function revokeProSubscription(id: string, note?: string): Promise<ProAdminSubscription> {
  const data = await sendJson(
    `${ADMIN}/subscriptions/${encodeURIComponent(id)}/revoke`,
    'POST',
    note?.trim() ? { note: note.trim() } : {},
    'Failed to revoke subscription',
  );
  return normalizeAdminSubscription(isRecord(data) ? data : {});
}
