// สมาชิก Pro (task 17): หน้า Upgrade สาธารณะ + สิทธิ์ของฉัน + หลังบ้าน (สนาม แพ็กเกจ ตารางเปรียบเทียบ สมาชิก)
// task 18: ชำระเงินผ่าน Opn (quote, checkout, สถานะ payment, ประวัติ, ยกเลิกต่ออายุ, เปลี่ยนบัตร, แท็บการชำระเงินของแอดมิน)
// task 19: โค้ดส่วนลด (quote/checkout รับโค้ด, แอดมินจัดการโค้ดส่วนลด + รายการที่ใช้)
// ข้อมูลบัตรไม่ผ่านโค้ดนี้ — ส่งแค่ token (tokn_...) ที่ได้จาก OmiseCard
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

/** ค่าระดับหน้า + การตั้งค่า VAT (task 18) */
export interface ProPageSettings extends ProPageText {
  /** เปิด VAT 7% กับการชำระครั้งใหม่ */
  vatEnabled: boolean;
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
  /** admin / card / promptpay / code (task 18) */
  source: string;
}

export interface ProUpgradeData {
  page: ProPageSettings;
  venues: ProPublicVenue[];
  /** [] ถ้าไม่ได้ login */
  my: ProMySubscription[];
}

export interface ProMeItem {
  /** id ของ subscription (ใช้กับ cancel-renewal / change-card) */
  id: string;
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
  /** บัตร default ของผู้ใช้ (เฉพาะ source card) */
  cardBrand: string | null;
  cardLastDigits: string | null;
  /** เวลาที่ยกเลิกการต่ออายุ */
  canceledAt: string | null;
  /** ตัดบัตรรอบต่ออายุไม่สำเร็จเมื่อ (API ปิด autoRenew แล้ว; ล้างเมื่อต่ออายุเองสำเร็จ) — null = ไม่มี */
  renewalFailedAt: string | null;
}

// ── ชำระเงิน (task 18) ───────────────────────────────────────

export type ProPaymentMethod = 'card' | 'promptpay';
/** ค่าที่ไม่รู้จักเก็บเป็น string เดิม */
/** canceled (task 19 รอบ 2) = รายการรอชำระที่ถูกแทนที่ด้วย checkout ใหม่ของแพ็กเกจเดียวกัน (ไม่มี QR) */
export type ProPaymentStatus = 'pending' | 'successful' | 'failed' | 'expired' | 'canceled' | (string & {});

export interface ProCheckoutQuote {
  plan: {
    id: string;
    code: string;
    name: string;
    /** ไม่อยู่ในสัญญา task 18 — ถ้า API ส่งมาจะใช้แสดง "ต่ออายุทุก N วัน" (0 = ไม่ทราบ) */
    periodDays: number;
    venue: { id: string; key: string; name: string };
  };
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  vatEnabled: boolean;
  /** สิทธิ์ที่ยังใช้ได้ของสนามนี้ (source: admin / card / promptpay — '' ถ้า API ไม่ส่ง) */
  current: { planId: string; currentPeriodEnd: string; autoRenew: boolean; source: string } | null;
  /** ซื้อแล้วจะเปลี่ยนแพ็กเกจ (เริ่มรอบใหม่ทันที) */
  changesPlan: boolean;
  /** ส่วนลดที่ใช้ได้กับ quote นี้ (task 19) — null = ไม่ได้ส่งโค้ด / โค้ดใช้ไม่ได้ */
  discount: ProQuoteDiscount | null;
  /** ส่งโค้ดมาแต่ใช้ไม่ได้ (quote ไม่ล้ม) */
  discountError: { errorCode: string | null; message: string } | null;
  /** ยอดรอบต่ออายุอัตโนมัติ (ราคาเต็ม + VAT ของราคาเต็ม — ส่วนลดใช้กับรอบแรกเท่านั้น) */
  renewalTotalSatang: number;
}

export type ProDiscountType = 'percent' | 'amount';

export interface ProQuoteDiscount {
  code: string;
  type: ProDiscountType;
  /** percent: 1–100 / amount: สตางค์ */
  value: number;
  /** ยอดที่ลดจริง (สตางค์) */
  discountSatang: number;
}

export interface ProCheckoutInput {
  planId: string;
  method: ProPaymentMethod;
  /** tokn_... เฉพาะ card */
  cardToken?: string;
  /** โค้ดส่วนลด (task 19) — server ตรวจซ้ำและคิดยอดเอง */
  discountCode?: string;
}

export interface ProCheckoutResult {
  paymentId: string;
  status: ProPaymentStatus;
  /** 3-D Secure → พาไปหน้านี้ */
  authorizeUri: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
  failureMessage: string | null;
}

export interface ProPaymentDetail {
  id: string;
  status: ProPaymentStatus;
  method: string;
  totalSatang: number;
  subtotalSatang: number;
  vatSatang: number;
  qrImageUrl: string | null;
  expiresAt: string | null;
  failureMessage: string | null;
  /** id ไม่อยู่ในสัญญา ('' ถ้า API ไม่ส่ง) — ใช้กับปุ่มลองใหม่ */
  plan: { id: string; name: string };
  venue: { name: string };
  subscription: { currentPeriodEnd: string; autoRenew: boolean } | null;
  /** ตัดเงินแล้วแต่ไม่ได้ให้สิทธิ์จากรายการนี้ (เช่น QR ที่ถูกแทนที่แล้วยังมีคนจ่าย) → ต้องคืนเงิน (ไม่ส่ง = false) */
  refundRequired: boolean;
}

/** แถวประวัติการชำระของฉัน (GET /pro/payments/me) */
export interface ProMyPayment {
  id: string;
  status: ProPaymentStatus;
  method: string;
  isRenewal: boolean;
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  subscriptionId: string | null;
  plan: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
  /** ตัดเงินแล้วแต่ให้สิทธิ์ไม่ได้ → ต้องคืนเงิน (ไม่ส่ง = false) */
  refundRequired: boolean;
}

export interface ProMyPaymentPage {
  items: ProMyPayment[];
  total: number;
}

export interface ProAdminPayment {
  id: string;
  /** null = บัญชีผู้ใช้ถูกลบไปแล้ว */
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string } | null;
  method: string;
  status: ProPaymentStatus;
  isRenewal: boolean;
  totalSatang: number;
  vatSatang: number;
  /** รหัสอ้างอิงของ Opn (chrg_...) */
  omiseChargeId: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  /** ต้องคืนเงินในแดชบอร์ด Opn (ไม่ส่ง = false) */
  refundRequired: boolean;
  /** ส่วนลด (สตางค์) จากโค้ดส่วนลด (task 19) — 0 = ไม่มี */
  discountSatang: number;
  /** โค้ดส่วนลดที่ใช้ — null = ไม่มี */
  discountCode: string | null;
}

export interface ProAdminPaymentPage {
  items: ProAdminPayment[];
  total: number;
}

export type ProPaymentStatusFilter = 'pending' | 'successful' | 'failed' | 'expired' | 'canceled';

export interface GetProAdminPaymentsParams {
  page?: number;
  /** ≤100 */
  limit?: number;
  status?: ProPaymentStatusFilter;
  method?: ProPaymentMethod;
  venueId?: string;
  /** อีเมล/ชื่อ/รหัสอ้างอิง */
  search?: string;
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
  page: ProPageSettings;
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

// ── โค้ดส่วนลด (task 19) ─────────────────────────────────────

export interface ProDiscountCode {
  id: string;
  /** ตัวพิมพ์ใหญ่ A–Z 0–9 - _ (3–40) */
  code: string;
  description: string | null;
  discountType: ProDiscountType;
  /** percent: 1–100 / amount: สตางค์ (≥100) */
  discountValue: number;
  /** null = ทุกสนาม */
  venueId: string | null;
  /** null = ทุกแพ็กเกจ (ของสนามนั้น / ทุกสนาม) */
  planId: string | null;
  /** ชื่อสนาม/แพ็กเกจ ถ้า API ส่งมา (ไม่ส่ง → หน้าแอดมินหาเองจาก config) */
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string } | null;
  startsAt: string | null;
  endsAt: string | null;
  /** null = ไม่จำกัด */
  maxRedemptions: number | null;
  perUserLimit: number;
  isActive: boolean;
  /** ใช้สำเร็จแล้ว (payment successful) */
  redeemedCount: number;
  /** จองไว้กับรายการที่ยังรอชำระ (นับรวมในสิทธิ์ที่เหลือ) — รอบ 2 */
  reservedCount: number;
  /** สถานะจาก API: active / inactive / scheduled / expired / used_up — '' = API ไม่ส่ง (หน้าเว็บคิดเอง) */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProDiscountCodePage {
  items: ProDiscountCode[];
  total: number;
}

export interface GetProDiscountCodesParams {
  page?: number;
  /** ≤100 */
  limit?: number;
  /** ค้นหาโค้ด/คำอธิบาย */
  search?: string;
  isActive?: boolean;
}

/** POST body — PUT ส่งเฉพาะฟิลด์ที่เปลี่ยน (code/ประเภท/มูลค่าแก้ไม่ได้หลังมีการใช้ → 409) */
export interface ProDiscountCodeInput {
  code: string;
  description: string | null;
  discountType: ProDiscountType;
  discountValue: number;
  venueId: string | null;
  planId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perUserLimit: number;
  isActive: boolean;
}

export type ProDiscountRedemptionStatus = 'reserved' | 'used' | 'released' | (string & {});

export interface ProDiscountRedemption {
  /** null = บัญชีผู้ใช้ถูกลบไปแล้ว */
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  paymentId: string;
  amountSatang: number;
  status: ProDiscountRedemptionStatus;
  createdAt: string;
}

export interface ProDiscountRedemptionPage {
  items: ProDiscountRedemption[];
  total: number;
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

export function normalizePageText(raw: unknown): ProPageSettings {
  const p = isRecord(raw) ? raw : {};
  return {
    title: str(p.title),
    subtitle: str(p.subtitle),
    venuePickerTitle: str(p.venuePickerTitle),
    footerNote: str(p.footerNote),
    vatEnabled: bool(p.vatEnabled),
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
    source: str(m.source),
  }));
  return { page: normalizePageText(data.page), venues, my };
}

function normalizeMeItem(m: RawRecord): ProMeItem {
  return {
    id: str(m.id) || str(m.subscriptionId),
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
    cardBrand: strOrNull(m.cardBrand),
    cardLastDigits: strOrNull(m.cardLastDigits),
    canceledAt: strOrNull(m.canceledAt),
    renewalFailedAt: strOrNull(m.renewalFailedAt),
  };
}

const satang = (v: unknown) => Math.max(0, Math.round(num(v)));

const discountType = (v: unknown): ProDiscountType => (v === 'amount' ? 'amount' : 'percent');

function normalizeQuoteDiscount(raw: unknown): ProQuoteDiscount | null {
  if (!isRecord(raw)) return null;
  const code = str(raw.code);
  if (!code) return null;
  return {
    code,
    type: discountType(raw.type),
    value: Math.max(0, num(raw.value)),
    discountSatang: satang(raw.discountSatang),
  };
}

export function normalizeCheckoutQuote(raw: unknown): ProCheckoutQuote {
  const d = isRecord(raw) ? raw : {};
  const p = isRecord(d.plan) ? d.plan : {};
  const v = isRecord(p.venue) ? p.venue : {};
  const c = isRecord(d.current) ? d.current : null;
  const de = isRecord(d.discountError) ? d.discountError : null;
  const totalSatang = satang(d.totalSatang);
  return {
    plan: {
      id: str(p.id),
      code: str(p.code),
      name: str(p.name),
      periodDays: Math.max(0, Math.floor(num(p.periodDays))),
      venue: { id: str(v.id), key: str(v.key), name: str(v.name) },
    },
    subtotalSatang: satang(d.subtotalSatang),
    vatSatang: satang(d.vatSatang),
    totalSatang,
    vatEnabled: bool(d.vatEnabled),
    current: c
      ? { planId: str(c.planId), currentPeriodEnd: str(c.currentPeriodEnd), autoRenew: bool(c.autoRenew), source: str(c.source) }
      : null,
    changesPlan: bool(d.changesPlan),
    discount: normalizeQuoteDiscount(d.discount),
    discountError: de ? { errorCode: strOrNull(de.errorCode), message: str(de.message) } : null,
    // API ที่ไม่ส่งค่านี้ = ไม่มีส่วนลด → รอบถัดไปเท่ากับยอดนี้
    renewalTotalSatang: d.renewalTotalSatang == null ? totalSatang : satang(d.renewalTotalSatang),
  };
}

export function normalizeCheckoutResult(raw: unknown): ProCheckoutResult {
  const d = isRecord(raw) ? raw : {};
  return {
    paymentId: str(d.paymentId),
    status: str(d.status),
    authorizeUri: strOrNull(d.authorizeUri),
    qrImageUrl: strOrNull(d.qrImageUrl),
    expiresAt: strOrNull(d.expiresAt),
    failureMessage: strOrNull(d.failureMessage),
  };
}

export function normalizePaymentDetail(raw: unknown): ProPaymentDetail {
  const d = isRecord(raw) ? raw : {};
  const s = isRecord(d.subscription) ? d.subscription : null;
  const status = str(d.status);
  return {
    id: str(d.id),
    status,
    method: str(d.method),
    totalSatang: satang(d.totalSatang),
    subtotalSatang: satang(d.subtotalSatang),
    vatSatang: satang(d.vatSatang),
    // canceled = ถูกแทนที่แล้ว ห้ามแสดง QR เดิมให้สแกน (API ไม่ส่งอยู่แล้ว กันไว้อีกชั้น)
    qrImageUrl: status === 'canceled' ? null : strOrNull(d.qrImageUrl),
    expiresAt: strOrNull(d.expiresAt),
    failureMessage: strOrNull(d.failureMessage),
    plan: { id: str(isRecord(d.plan) ? d.plan.id : ''), name: str(isRecord(d.plan) ? d.plan.name : '') },
    venue: { name: str(isRecord(d.venue) ? d.venue.name : '') },
    subscription: s ? { currentPeriodEnd: str(s.currentPeriodEnd), autoRenew: bool(s.autoRenew) } : null,
    refundRequired: bool(d.refundRequired),
  };
}

export function normalizeMyPayment(raw: RawRecord): ProMyPayment {
  const p = isRecord(raw.plan) ? raw.plan : null;
  const v = isRecord(raw.venue) ? raw.venue : null;
  return {
    id: str(raw.id),
    status: str(raw.status),
    method: str(raw.method),
    isRenewal: bool(raw.isRenewal),
    subtotalSatang: satang(raw.subtotalSatang),
    vatSatang: satang(raw.vatSatang),
    totalSatang: satang(raw.totalSatang),
    failureMessage: strOrNull(raw.failureMessage),
    paidAt: strOrNull(raw.paidAt),
    createdAt: str(raw.createdAt),
    subscriptionId: strOrNull(raw.subscriptionId),
    plan: p ? { id: str(p.id), name: str(p.name) } : null,
    venue: v ? { id: str(v.id), name: str(v.name) } : null,
    refundRequired: bool(raw.refundRequired),
  };
}

export function normalizeAdminPayment(raw: RawRecord): ProAdminPayment {
  const u = isRecord(raw.user) ? raw.user : null;
  const v = isRecord(raw.venue) ? raw.venue : null;
  const p = isRecord(raw.plan) ? raw.plan : null;
  return {
    id: str(raw.id),
    user: u ? { id: str(u.id), email: str(u.email), firstName: strOrNull(u.firstName), lastName: strOrNull(u.lastName) } : null,
    venue: v ? { id: str(v.id), key: str(v.key), name: str(v.name) } : null,
    plan: p ? { id: str(p.id), code: str(p.code), name: str(p.name) } : null,
    method: str(raw.method),
    status: str(raw.status),
    isRenewal: bool(raw.isRenewal),
    totalSatang: satang(raw.totalSatang),
    vatSatang: satang(raw.vatSatang),
    omiseChargeId: strOrNull(raw.omiseChargeId),
    failureMessage: strOrNull(raw.failureMessage),
    paidAt: strOrNull(raw.paidAt),
    createdAt: str(raw.createdAt),
    refundRequired: bool(raw.refundRequired),
    discountSatang: satang(raw.discountSatang),
    // รับได้ทั้ง string และ { code }
    discountCode: isRecord(raw.discountCode) ? strOrNull(raw.discountCode.code) : strOrNull(raw.discountCode),
  };
}

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v, Number.NaN);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

export function normalizeDiscountCode(raw: RawRecord): ProDiscountCode {
  const v = isRecord(raw.venue) ? raw.venue : null;
  const p = isRecord(raw.plan) ? raw.plan : null;
  return {
    id: str(raw.id),
    code: str(raw.code),
    description: strOrNull(raw.description),
    discountType: discountType(raw.discountType),
    discountValue: Math.max(0, Math.round(num(raw.discountValue))),
    venueId: strOrNull(raw.venueId) ?? (v ? strOrNull(v.id) : null),
    planId: strOrNull(raw.planId) ?? (p ? strOrNull(p.id) : null),
    venue: v ? { id: str(v.id), key: str(v.key), name: str(v.name) } : null,
    plan: p ? { id: str(p.id), code: str(p.code), name: str(p.name) } : null,
    startsAt: strOrNull(raw.startsAt),
    endsAt: strOrNull(raw.endsAt),
    maxRedemptions: intOrNull(raw.maxRedemptions),
    perUserLimit: Math.max(1, Math.floor(num(raw.perUserLimit, 1))),
    isActive: bool(raw.isActive, true),
    redeemedCount: Math.max(0, Math.floor(num(raw.redeemedCount))),
    reservedCount: Math.max(0, Math.floor(num(raw.reservedCount))),
    status: str(raw.status),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  };
}

export function normalizeDiscountRedemption(raw: RawRecord): ProDiscountRedemption {
  const u = isRecord(raw.user) ? raw.user : null;
  return {
    user: u ? { id: str(u.id), email: str(u.email), firstName: strOrNull(u.firstName), lastName: strOrNull(u.lastName) } : null,
    paymentId: str(raw.paymentId),
    amountSatang: satang(raw.amountSatang),
    status: str(raw.status),
    createdAt: str(raw.createdAt),
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

/**
 * GET /pro/checkout/quote?planId=&code= (JWT) — แพ็กเกจซื้อไม่ได้ → ApiError 400 PLAN_NOT_PURCHASABLE
 * code (task 19): โค้ดใช้ไม่ได้ quote ไม่ล้ม แต่คืน discountError
 */
export async function getCheckoutQuote(planId: string, signal?: AbortSignal, code?: string): Promise<ProCheckoutQuote> {
  const query = new URLSearchParams({ planId });
  if (code?.trim()) query.set('code', code.trim());
  const response = await fetchWithAuth(`${BASE}/checkout/quote?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch checkout quote');
  return normalizeCheckoutQuote(await response.json());
}

/** POST /pro/checkout — ยอดคิดที่ server (ไม่ส่ง amount) บัตรส่งแค่ token */
export async function createCheckout(input: ProCheckoutInput): Promise<ProCheckoutResult> {
  const body: ProCheckoutInput = { planId: input.planId, method: input.method };
  if (input.method === 'card' && input.cardToken) body.cardToken = input.cardToken;
  if (input.discountCode?.trim()) body.discountCode = input.discountCode.trim();
  return normalizeCheckoutResult(await sendJson(`${BASE}/checkout`, 'POST', body, 'Failed to create checkout'));
}

/** GET /pro/payments/:id (เจ้าของเท่านั้น คนอื่น 404) — ยัง pending server จะถาม Opn ให้ */
export async function getProPayment(id: string, signal?: AbortSignal): Promise<ProPaymentDetail> {
  const response = await fetchWithAuth(`${BASE}/payments/${encodeURIComponent(id)}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch payment');
  return normalizePaymentDetail(await response.json());
}

/** GET /pro/payments/me?page&limit (≤50) — รับได้ทั้ง { items, total } และ array */
export async function getMyProPayments(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ProMyPaymentPage> {
  const { page = 1, limit = 10 } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(50, limit)) });
  const response = await fetchWithAuth(`${BASE}/payments/me?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch payments');
  const data: unknown = await response.json();
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : [];
  const items = list.filter(isRecord).map(normalizeMyPayment);
  return { items, total: isRecord(data) ? num(data.total, items.length) : items.length };
}

/** POST /pro/subscriptions/:id/cancel-renewal (เจ้าของ) — สิทธิ์ใช้ได้ถึงวันหมด */
export async function cancelProRenewal(subscriptionId: string): Promise<void> {
  await sendJson(
    `${BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel-renewal`,
    'POST',
    undefined,
    'Failed to cancel renewal',
  );
}

export interface ProChangeCardResult {
  cardBrand: string | null;
  cardLastDigits: string | null;
  /** id ของ subscription ที่ตั้งต่ออายุอัตโนมัติด้วยบัตรใหม่ไม่สำเร็จ (ถูกปิดต่ออายุ) */
  autoRenewFailed: string[];
}

/** POST /pro/subscriptions/:id/change-card { cardToken } → บัตรใหม่ (ยี่ห้อ + เลขท้าย) + รายการที่ตั้งต่ออายุใหม่ไม่สำเร็จ */
export async function changeProCard(subscriptionId: string, cardToken: string): Promise<ProChangeCardResult> {
  const data = await sendJson(
    `${BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/change-card`,
    'POST',
    { cardToken },
    'Failed to change card',
  );
  const d = isRecord(data) ? data : {};
  return {
    cardBrand: strOrNull(d.cardBrand),
    cardLastDigits: strOrNull(d.cardLastDigits),
    autoRenewFailed: Array.isArray(d.autoRenewFailed) ? d.autoRenewFailed.filter((x): x is string => typeof x === 'string' && x !== '') : [],
  };
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

/** PUT /pro/admin/page (vatEnabled ไม่ส่ง = คงค่าเดิม) */
export async function updateProPage(input: ProPageText & { vatEnabled?: boolean }): Promise<ProPageSettings> {
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

/** GET /pro/admin/payments?page&limit&status&method&venueId&search */
export async function getProAdminPayments(
  params: GetProAdminPaymentsParams = {},
  signal?: AbortSignal,
): Promise<ProAdminPaymentPage> {
  const { page = 1, limit = 20, status, method, venueId, search } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(100, limit)) });
  if (status) query.set('status', status);
  if (method) query.set('method', method);
  if (venueId) query.set('venueId', venueId);
  if (search?.trim()) query.set('search', search.trim());
  const response = await fetchWithAuth(`${ADMIN}/payments?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch payments');
  const data: unknown = await response.json();
  const body = isRecord(data) ? data : {};
  const items = Array.isArray(body.items) ? body.items.filter(isRecord).map(normalizeAdminPayment) : [];
  return { items, total: num(body.total, items.length) };
}

// ── โค้ดส่วนลด (task 19) ─────────────────────────────────────

const DISCOUNT_ADMIN = `${ADMIN}/discount-codes`;

/** GET /pro/admin/discount-codes?page&limit&search&isActive — รับได้ทั้ง { items, total } และ array */
export async function getProDiscountCodes(
  params: GetProDiscountCodesParams = {},
  signal?: AbortSignal,
): Promise<ProDiscountCodePage> {
  const { page = 1, limit = 20, search, isActive } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(100, limit)) });
  if (search?.trim()) query.set('search', search.trim());
  if (isActive !== undefined) query.set('isActive', String(isActive));
  const response = await fetchWithAuth(`${DISCOUNT_ADMIN}?${query.toString()}`, { cache: 'no-store', signal });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch discount codes');
  const data: unknown = await response.json();
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : [];
  const items = list.filter(isRecord).map(normalizeDiscountCode);
  return { items, total: isRecord(data) ? num(data.total, items.length) : items.length };
}

/** POST /pro/admin/discount-codes — โค้ดซ้ำ → ApiError 409 */
export async function createProDiscountCode(input: ProDiscountCodeInput): Promise<ProDiscountCode> {
  const data = await sendJson(DISCOUNT_ADMIN, 'POST', input, 'Failed to create discount code');
  return normalizeDiscountCode(isRecord(data) ? data : {});
}

/**
 * PUT /pro/admin/discount-codes/:id — ฟิลด์ที่ไม่ส่งคงค่าเดิม (เปิด/ปิด = { isActive })
 * แก้ code/ประเภท/มูลค่าหลังมีการใช้แล้ว → ApiError 409
 */
export async function updateProDiscountCode(id: string, input: Partial<ProDiscountCodeInput>): Promise<ProDiscountCode> {
  const data = await sendJson(`${DISCOUNT_ADMIN}/${encodeURIComponent(id)}`, 'PUT', input, 'Failed to update discount code');
  return normalizeDiscountCode(isRecord(data) ? data : {});
}

/** GET /pro/admin/discount-codes/:id/redemptions?page&limit (≤100) */
export async function getProDiscountRedemptions(
  id: string,
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ProDiscountRedemptionPage> {
  const { page = 1, limit = 20 } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(100, limit)) });
  const response = await fetchWithAuth(`${DISCOUNT_ADMIN}/${encodeURIComponent(id)}/redemptions?${query.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw await toApiError(response, 'Failed to fetch discount redemptions');
  const data: unknown = await response.json();
  const body = isRecord(data) ? data : {};
  const items = Array.isArray(body.items) ? body.items.filter(isRecord).map(normalizeDiscountRedemption) : [];
  return { items, total: num(body.total, items.length) };
}
