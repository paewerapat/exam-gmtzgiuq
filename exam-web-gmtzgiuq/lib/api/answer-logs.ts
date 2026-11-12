// Answer logs API (task 16) — บันทึกคำตอบรายข้อของการฝึกที่ไม่มี attempt
// (ฝึกตาม topic / subject / chapter) ส่วน flow ที่มี attempt server บันทึกเองตอน complete
import type { ExamSession } from '@/types/exam';
import { fetchWithAuth } from './authFetch';
import { toApiError } from './apiError';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** client ส่งได้แค่ 'practice' (exam/preview/pro มาจาก server เท่านั้น) */
export type AnswerLogMode = 'practice';

export interface AnswerLogItem {
  questionId: string;
  /** รูปแบบเดียวกับ attempt.answers[qid]: id ตัวเลือก ("c" / "b,c,d") หรือข้อความตอบสั้น — 1–500 ตัวอักษร */
  selected: string;
  /** วินาที จำนวนเต็ม ≥ 0 */
  timeSpentSec: number;
  mode: AnswerLogMode;
}

export interface PostAnswerLogsResult {
  /** จำนวนแถวที่บันทึกจริง (ข้อที่ไม่มีอยู่/ไม่ published/ไม่มีสิทธิ์ server ข้าม) */
  saved: number;
}

/** จำนวน item สูงสุดต่อ request ตามสัญญา API */
export const ANSWER_LOG_BATCH_SIZE = 200;
/** ความยาว selected สูงสุดตามสัญญา API */
export const ANSWER_LOG_SELECTED_MAX = 500;

/**
 * POST /answer-logs (JWT) — items 1–200 ข้อ; ผิดพลาด (รวม 401) → throw ApiError
 * งานเบื้องหลังตอนจบการฝึก: token หมดอายุต้องไม่ล้าง token และไม่พาออกจากหน้าผลไป /login
 */
export async function postAnswerLogs(items: AnswerLogItem[]): Promise<PostAnswerLogsResult> {
  const response = await fetchWithAuth(
    `${API_URL}/answer-logs`,
    { method: 'POST', body: JSON.stringify({ items }) },
    { redirectOnUnauthorized: false },
  );
  if (!response.ok) throw await toApiError(response, 'Failed to save answer logs');
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const saved = Number(data?.saved);
  return { saved: Number.isFinite(saved) ? saved : 0 };
}

/**
 * แปลง session ที่ทำเสร็จเป็นรายการ log: เฉพาะข้อที่ตอบ (ไม่ว่าง/ไม่ใช่ช่องว่างล้วน) ตามลำดับข้อ ไม่ซ้ำ
 * คำตอบยาวเกิน 500 ตัวอักษรข้าม (ตัดทิ้งจะทำให้ server ตรวจถูก/ผิดเพี้ยน และ API จะตอบ 400 ทั้งก้อน)
 */
export function buildPracticeAnswerLogItems(session: ExamSession): AnswerLogItem[] {
  const items: AnswerLogItem[] = [];
  const seen = new Set<string>();
  for (const questionId of session.questionIds ?? []) {
    if (!questionId || seen.has(questionId)) continue;
    seen.add(questionId);
    const selected = session.answers?.[questionId];
    if (typeof selected !== 'string' || !selected.trim() || selected.length > ANSWER_LOG_SELECTED_MAX) continue;
    const seconds = Number(session.timePerQuestion?.[questionId] ?? 0);
    items.push({
      questionId,
      selected,
      timeSpentSec: Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0,
      mode: 'practice',
    });
  }
  return items;
}

function hasToken(): boolean {
  try {
    return typeof window !== 'undefined' && !!localStorage.getItem('token');
  } catch {
    return false;
  }
}

// session ที่ส่งไปแล้วในหน้านี้ (id ของ session สุ่มใหม่ทุกครั้งที่เริ่ม) — กันส่งซ้ำเมื่อ effect/handler ถูกเรียกซ้ำ
const loggedSessionIds = new Set<string>();

/**
 * บันทึกคำตอบของการฝึกที่ไม่มี attempt — ไม่ throw ไม่ขวางผู้ใช้
 * ไม่ได้ login / ไม่มีข้อที่ตอบ / session นี้ส่งไปแล้ว → ไม่ส่ง
 * มากกว่า 200 ข้อแบ่งก้อน; ก้อนที่ล้ม → console.warn แล้วส่งก้อนถัดไป
 * คืนจำนวนที่ server บันทึกรวม
 */
export async function logPracticeAnswers(session: ExamSession): Promise<number> {
  if (!hasToken()) return 0;
  if (session.id) {
    if (loggedSessionIds.has(session.id)) return 0;
    loggedSessionIds.add(session.id);
  }
  const items = buildPracticeAnswerLogItems(session);
  let saved = 0;
  for (let i = 0; i < items.length; i += ANSWER_LOG_BATCH_SIZE) {
    try {
      const result = await postAnswerLogs(items.slice(i, i + ANSWER_LOG_BATCH_SIZE));
      saved += result.saved;
    } catch (err) {
      console.warn('Failed to save answer logs:', err);
    }
  }
  return saved;
}
