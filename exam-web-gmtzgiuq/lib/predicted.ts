// Predicted Exam (task 22 / lumo3 งานที่ 8): ป้าย/ปุ่ม/บรรทัดรองของแถวชุด, ข้อมูล Preview ของหน้าทำข้อสอบ
// และ validate ฟอร์มซีรีส์ของแอดมิน — pure functions (ทดสอบได้โดยไม่ render)

export type PredictedSetAccess = 'free' | 'pro';
export type PredictedViewerAccess = 'full' | 'preview' | 'locked';
export type PredictedSetStatus = 'draft' | 'published';

export interface PredictedProgress {
  status: 'in_progress' | 'completed';
  /** โหมดของ attempt — preview = attempt ของผู้ที่ทำได้บางส่วน (เริ่มจากหน้าฝึก) */
  mode: 'practice' | 'exam' | 'preview';
  answered: number;
  total: number;
  scorePercent: number | null;
  attemptId: string;
}

export interface PredictedSetSummary {
  setNo: number;
  examId: string;
  title: string;
  questionCount: number;
  durationMinutes: number | null;
  access: PredictedSetAccess;
  /** null = ไม่มี Preview */
  previewCount: number | null;
  viewerAccess: PredictedViewerAccess;
  myProgress: PredictedProgress | null;
  /** สถานะชุด — 'draft' ส่งมาเฉพาะแอดมิน (ชุดที่ยังไม่เผยแพร่) / ไม่ส่ง = published */
  status: PredictedSetStatus;
}

// ── normalizer ร่วม (ทนข้อมูลขาด) ─────────────────────────────

type RawRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v);
export const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
export const toNumberOrNull = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
export const toCount = (v: unknown): number => Math.max(0, Math.floor(toNumberOrNull(v) ?? 0));

/** previewCount: จำนวนเต็ม > 0 เท่านั้น (null / 0 / ผิดรูป = ไม่มี Preview) */
export function normalizePreviewCount(v: unknown): number | null {
  const n = toNumberOrNull(v);
  return n != null && n >= 1 ? Math.floor(n) : null;
}

/** ไม่รู้จัก → 'locked' (ปลอดภัยไว้ก่อน: ไม่ชวนให้กดเข้าไปทำ) */
export function normalizeViewerAccess(v: unknown): PredictedViewerAccess {
  return v === 'full' || v === 'preview' ? v : 'locked';
}

/** ไม่รู้จัก → 'pro' (ค่าเริ่มต้นของ predicted_sets.access) */
export const normalizeSetAccess = (v: unknown): PredictedSetAccess => (v === 'free' ? 'free' : 'pro');

export function normalizePredictedProgress(value: unknown): PredictedProgress | null {
  if (!isRecord(value)) return null;
  const status = value.status === 'in_progress' || value.status === 'completed' ? value.status : null;
  const attemptId = strOrNull(value.attemptId);
  if (!status || !attemptId) return null;
  const score = toNumberOrNull(value.scorePercent);
  return {
    status,
    // ไม่ระบุ/ไม่รู้จัก → practice (ชุด Predicted เริ่มจากหน้าฝึก /practice/exam)
    mode: value.mode === 'exam' ? 'exam' : value.mode === 'preview' ? 'preview' : 'practice',
    answered: toCount(value.answered),
    total: toCount(value.total),
    scorePercent: score == null ? null : Math.min(100, Math.max(0, score)),
    attemptId,
  };
}

export function normalizePredictedSet(raw: RawRecord, index = 0): PredictedSetSummary | null {
  const examId = strOrNull(raw.examId) ?? (isRecord(raw.exam) ? strOrNull(raw.exam.id) : null);
  if (!examId) return null;
  const setNo = toNumberOrNull(raw.setNo);
  const duration = toNumberOrNull(raw.durationMinutes);
  return {
    setNo: setNo != null && setNo >= 1 ? Math.floor(setNo) : index + 1,
    examId,
    title: strOrNull(raw.title) ?? '',
    questionCount: toCount(raw.questionCount),
    durationMinutes: duration != null && duration > 0 ? duration : null,
    access: normalizeSetAccess(raw.access),
    previewCount: normalizePreviewCount(raw.previewCount),
    viewerAccess: normalizeViewerAccess(raw.viewerAccess),
    myProgress: normalizePredictedProgress(raw.myProgress),
    // ไม่ส่ง / published = เผยแพร่แล้ว, ค่าอื่น (draft ฯลฯ) = ยังไม่เผยแพร่ (ไม่ชวนให้กดเริ่ม)
    status: raw.status == null || raw.status === 'published' ? 'published' : 'draft',
  };
}

// ── ลิงก์ ─────────────────────────────────────────────────

export const PREDICTED_PAGE_HREF = '/dashboard/predicted';

/** หน้าแพ็กเกจของสนาม — ไม่รู้สนาม → /upgrade */
export function upgradeHref(venueKey: string | null | undefined): string {
  return venueKey ? `/upgrade?venue=${encodeURIComponent(venueKey)}` : '/upgrade';
}

// ── แถวชุดในหน้า Predicted ─────────────────────────────────

export type PredictedBadge = 'preview' | 'pro';

/**
 * ป้ายของแถว: Preview (ฟ้า) เมื่อทำได้บางส่วน / Pro (ทอง) เมื่อชุด pro ที่ผู้ใช้ยังไม่มีสิทธิ์เต็ม
 * ทำได้เต็มแล้ว → ไม่มีป้าย
 */
export function setBadges(set: Pick<PredictedSetSummary, 'access' | 'viewerAccess'>): PredictedBadge[] {
  const badges: PredictedBadge[] = [];
  if (set.viewerAccess === 'preview') badges.push('preview');
  if (set.access === 'pro' && set.viewerAccess !== 'full') badges.push('pro');
  return badges;
}

const n = (v: number) => v.toLocaleString('th-TH');

/** "Preview 20 ข้อ จากทั้งหมด 40 ข้อ" (ทำได้บางส่วน) / "40 ข้อ" */
export function setSubLine(set: Pick<PredictedSetSummary, 'viewerAccess' | 'previewCount' | 'questionCount'>): string {
  if (set.viewerAccess === 'preview' && set.previewCount) {
    return `Preview ${n(Math.min(set.previewCount, set.questionCount || set.previewCount))} ข้อ จากทั้งหมด ${n(set.questionCount)} ข้อ`;
  }
  return `${n(set.questionCount)} ข้อ`;
}

export type SetActionVariant = 'dark' | 'primary' | 'outline' | 'unlock';

export interface SetAction {
  label: string;
  href: string;
  variant: SetActionVariant;
}

export const practiceHref = (examId: string) => `/practice/exam/${encodeURIComponent(examId)}`;

/**
 * attempt ล่าสุดที่ยังใช้กับสิทธิ์ปัจจุบันได้ — attempt Preview ของผู้ที่ตอนนี้ทำได้เต็มแล้ว (ได้ Pro ภายหลัง)
 * ถือว่ายังไม่เริ่ม: เริ่มใหม่ทั้งชุด (server ทิ้ง attempt Preview ที่ค้างให้เอง)
 */
export function effectiveProgress(
  set: Pick<PredictedSetSummary, 'viewerAccess' | 'myProgress'>,
): PredictedProgress | null {
  const progress = set.myProgress;
  if (progress?.mode === 'preview' && set.viewerAccess === 'full') return null;
  return progress;
}

/**
 * ปุ่มของแถว
 * - ชุดฉบับร่าง (แอดมินเห็นเท่านั้น) → ไม่มีปุ่ม (null)
 * - locked → "Unlock" ไปหน้าแพ็กเกจของสนาม
 * - ค้าง → "ทำต่อ" (attempt โหมด exam → /exam, อื่น ๆ → /practice/exam)
 * - ส่งแล้ว → "ดูผล" (หน้าประวัติของ attempt)
 * - ยังไม่เริ่ม (รวม attempt Preview เดิมเมื่อตอนนี้ทำได้เต็ม): ชุด free หรือทำได้แค่ Preview → "Free" /
 *   ชุด pro ที่ทำได้เต็ม → "เริ่มทำ" (หน้าฝึก)
 */
export function setAction(set: PredictedSetSummary, venueKey: string | null): SetAction | null {
  if (set.status === 'draft') return null;
  if (set.viewerAccess === 'locked') return { label: 'Unlock', href: upgradeHref(venueKey), variant: 'unlock' };
  const progress = effectiveProgress(set);
  if (progress?.status === 'in_progress') {
    const href = progress.mode === 'exam' ? `/exam/${encodeURIComponent(set.examId)}` : practiceHref(set.examId);
    return { label: 'ทำต่อ', href, variant: 'outline' };
  }
  if (progress?.status === 'completed') {
    return {
      label: 'ดูผล',
      href: `/dashboard/history/${encodeURIComponent(progress.attemptId)}`,
      variant: 'outline',
    };
  }
  if (set.access === 'free' || set.viewerAccess === 'preview') {
    return { label: 'Free', href: practiceHref(set.examId), variant: 'dark' };
  }
  return { label: 'เริ่มทำ', href: practiceHref(set.examId), variant: 'primary' };
}

// ── หน้าทำข้อสอบ: GET /exams/:id ของชุด Predicted ────────────────

export interface ExamPredictedInfo {
  access: 'full' | 'preview';
  /** จำนวนข้อที่ทำได้ (preview) — null = API ไม่ส่ง (ใช้จำนวนข้อที่ได้มาแทน) */
  previewCount: number | null;
  /** จำนวนข้อทั้งชุด — 0 = API ไม่ส่ง */
  totalQuestions: number;
  seriesId: string | null;
  setNo: number | null;
  /** key สนาม (ถ้า API ส่ง) ใช้ทำลิงก์ /upgrade?venue= */
  venueKey: string | null;
}

/** field predicted ของ GET /exams/:id — ไม่ใช่ชุด Predicted / ผิดรูป → null */
export function normalizeExamPredicted(value: unknown): ExamPredictedInfo | null {
  if (!isRecord(value)) return null;
  if (value.access !== 'full' && value.access !== 'preview') return null;
  const setNo = toNumberOrNull(value.setNo);
  return {
    access: value.access,
    previewCount: normalizePreviewCount(value.previewCount),
    totalQuestions: toCount(value.totalQuestions),
    seriesId: strOrNull(value.seriesId),
    setNo: setNo != null && setNo >= 1 ? Math.floor(setNo) : null,
    venueKey: strOrNull(value.venueKey),
  };
}

/** จำนวนข้อที่ทำได้ / ทั้งชุด สำหรับแถบ "Preview X จาก Y ข้อ" (X ไม่เกินจำนวนข้อที่ได้มาจริง) */
export function previewCounts(info: ExamPredictedInfo, loadedQuestions: number): { answerable: number; total: number } {
  const answerable =
    loadedQuestions > 0 ? Math.min(info.previewCount ?? loadedQuestions, loadedQuestions) : (info.previewCount ?? 0);
  return { answerable, total: Math.max(info.totalQuestions, answerable) };
}

/**
 * session/attempt ที่ทำไว้ตอนเป็น Preview แต่ตอนนี้ทำได้เต็ม (ได้ Pro ภายหลัง) → ไม่ทำต่อ ให้เริ่มใหม่ทั้งชุด
 * (server ทิ้ง attempt Preview ที่ค้างให้เองตอน start)
 * - attempt บน server: ดูจาก mode 'preview' เท่านั้น
 * - session ในเครื่อง: createdAsPreview = สิทธิ์ที่จำไว้ตอนสร้าง (recallPredicted ก่อนโหลดรอบนี้) เป็น preview
 * ไม่นับจำนวนข้อ — attempt เต็มที่แอดมินเพิ่มข้อภายหลังต้องทำต่อได้ (คำตอบไม่หาย)
 */
export function isStalePreviewProgress(
  info: ExamPredictedInfo | null,
  progress: { mode?: string | null },
  createdAsPreview = false,
): boolean {
  if (info?.access !== 'full') return false;
  return progress.mode === 'preview' || createdAsPreview;
}

export const previewBarText = (answerable: number, total: number) => `Preview ${n(answerable)} จาก ${n(total)} ข้อ`;
export const previewUpgradeText = (total: number) => `Upgrade เป็น Pro เพื่อทำครบ ${n(total)} ข้อ`;

// หน้าผล (results) อ่านจาก localStorage จึงจำข้อมูล Preview ของชุดไว้ต่อ examId (ไม่แตะ ExamSession / key กลาง — BUG-6)
const STORAGE_KEY = 'predicted_exam_info';

export function rememberPredicted(examId: string, info: ExamPredictedInfo | null) {
  if (typeof window === 'undefined') return;
  try {
    if (info) localStorage.setItem(`${STORAGE_KEY}_${examId}`, JSON.stringify(info));
    else localStorage.removeItem(`${STORAGE_KEY}_${examId}`);
  } catch {
    // storage เต็ม/ถูกปิด → หน้าผลแค่ไม่แสดงกล่อง Upgrade
  }
}

export function recallPredicted(examId: string): ExamPredictedInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${examId}`);
    return raw ? normalizeExamPredicted(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ── แอดมิน: ฟอร์มซีรีส์ ──────────────────────────────────────

export interface SeriesSetDraft {
  examId: string;
  title: string;
  /** 0 = ไม่ทราบ (ข้อมูลจาก API ไม่ครบ) */
  questionCount: number;
  access: PredictedSetAccess;
  /** ข้อความในช่อง (ว่าง = ไม่มี Preview) */
  previewText: string;
}

export interface SeriesDraft {
  title: string;
  description: string;
  venueId: string;
  subjectId: string;
  /** ว่าง = ไม่กำหนดสี */
  color: string;
  sortOrder: string;
  isActive: boolean;
  sets: SeriesSetDraft[];
}

/** #rgb หรือ #rrggbb (ตรงกับ API) */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const SERIES_TITLE_MAX = 150;
export const SERIES_DESCRIPTION_MAX = 500;
export const SERIES_SETS_MAX = 50;
export const SERIES_SORT_MAX = 1_000_000;

/** ข้อความในช่อง Preview → จำนวน (ว่าง/0 = null) — ไม่ใช่จำนวนเต็มบวก → NaN */
export function parsePreviewText(text: string): number | null {
  const t = text.trim();
  if (t === '' || t === '0') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** error ต่อแถว (ไทย) — ไม่มี → null */
export function setDraftError(set: SeriesSetDraft): string | null {
  const preview = parsePreviewText(set.previewText);
  if (preview === null) return null;
  if (Number.isNaN(preview)) return 'Preview ต้องเป็นจำนวนเต็มบวก หรือเว้นว่าง';
  if (set.questionCount > 0 && preview >= set.questionCount) return 'Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด';
  return null;
}

/** error แรกของฟอร์ม (ไทย) — ผ่าน → null */
export function validateSeriesDraft(draft: SeriesDraft): string | null {
  const title = draft.title.trim();
  if (!title) return 'กรุณากรอกชื่อซีรีส์';
  if (title.length > SERIES_TITLE_MAX) return `ชื่อซีรีส์ยาวได้ไม่เกิน ${SERIES_TITLE_MAX} ตัวอักษร`;
  if (draft.description.trim().length > SERIES_DESCRIPTION_MAX) {
    return `คำอธิบายยาวได้ไม่เกิน ${SERIES_DESCRIPTION_MAX} ตัวอักษร`;
  }
  if (!draft.venueId) return 'กรุณาเลือกสนามสอบ';
  if (draft.color.trim() && !HEX_COLOR.test(draft.color.trim())) return 'สีต้องเป็นรหัส hex เช่น #4f46e5';
  const sort = draft.sortOrder.trim();
  if (sort && (!/^\d+$/.test(sort) || Number(sort) > SERIES_SORT_MAX)) {
    return `ลำดับต้องเป็นจำนวนเต็ม 0–${SERIES_SORT_MAX.toLocaleString('th-TH')}`;
  }
  if (draft.sets.length > SERIES_SETS_MAX) return `ซีรีส์หนึ่งมีได้ไม่เกิน ${SERIES_SETS_MAX} ชุด`;
  const seen = new Set<string>();
  for (let i = 0; i < draft.sets.length; i++) {
    const set = draft.sets[i];
    if (seen.has(set.examId)) return `ชุดที่ ${i + 1} ซ้ำกับชุดอื่นในซีรีส์`;
    seen.add(set.examId);
    const err = setDraftError(set);
    if (err) return `ชุดที่ ${i + 1}: ${err}`;
  }
  return null;
}

/** ย้ายแถว (ขึ้น −1 / ลง +1) — เลขชุด = ลำดับในตาราง */
export function moveSet<T>(sets: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= sets.length || target < 0 || target >= sets.length) return sets;
  const next = [...sets];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const THAI = /[฀-๿]/;

/** ข้อความ error ที่แสดงแอดมิน: ใช้ข้อความไทยจาก API ถ้ามี ไม่งั้นใช้ fallback (ไทย) */
export function predictedErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : null;
  return message && THAI.test(message) ? message : fallback;
}
