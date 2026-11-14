// ตั้งค่าเวลาในหน้าทำข้อสอบโหมดฝึก (task 21 / lumo3 งานที่ 7) — pure functions ใช้ทั้ง reducer และ UI
import type { ExamSession, PracticeTimerSettings } from '@/types/exam';

export const TIMER_MIN_MINUTES = 1;
export const TIMER_MAX_MINUTES = 600;
export const TIMER_PRESETS = [30, 60, 90, 120] as const;
export const DEFAULT_TIMER_MINUTES = 60;

export const TIMER_MODE_LABELS: Record<PracticeTimerSettings['mode'], string> = {
  up: 'นับขึ้น',
  down: 'นับถอยหลัง',
};

/**
 * เวลาทำรวม (วินาที) = ผลรวม timePerQuestion โดยข้อที่เปิดอยู่ใช้ currentTimer (ค่าล่าสุดที่ยังไม่ได้เก็บลง session)
 * ใช้เป็นฐานของนับถอยหลัง จึงไม่นับช่วงที่ปิดหน้าไป และ resume แล้วได้เวลาที่เหลือตรงกับก่อนปิด
 */
export function totalActiveSeconds(
  session: Pick<ExamSession, 'timePerQuestion' | 'questionIds' | 'currentIndex'>,
  currentTimer: number,
): number {
  const currentId = session.questionIds[session.currentIndex];
  let total = 0;
  for (const [id, sec] of Object.entries(session.timePerQuestion ?? {})) {
    if (id === currentId) continue;
    if (Number.isFinite(sec) && sec > 0) total += sec;
  }
  if (currentId) total += Math.max(0, Number.isFinite(currentTimer) ? currentTimer : 0);
  return total;
}

/** วินาทีที่เหลือของนับถอยหลัง (ไม่ติดลบ) — โหมดนับขึ้น/ไม่มีการตั้ง → null */
export function practiceTimerRemaining(
  settings: PracticeTimerSettings | null | undefined,
  totalSec: number,
): number | null {
  if (!settings || settings.mode !== 'down') return null;
  const elapsed = Math.max(0, totalSec - settings.startTotalSec);
  return Math.max(0, settings.minutes * 60 - elapsed);
}

/** ค่าเริ่มต้นในช่องนาที: เวลาสอบจริงของชุด (ถ้ามีและอยู่ในช่วง) ไม่งั้น 60 */
export function defaultTimerMinutes(recommendedMinutes: number | null | undefined): number {
  return isValidTimerMinutes(recommendedMinutes ?? NaN) ? Number(recommendedMinutes) : DEFAULT_TIMER_MINUTES;
}

export function isValidTimerMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= TIMER_MIN_MINUTES && value <= TIMER_MAX_MINUTES;
}

/** ช่องนาที (string) → จำนวนนาที ไม่ถูกต้อง → null */
export function parseTimerMinutes(value: string): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return isValidTimerMinutes(n) ? n : null;
}

/** ตั้งค่าใหม่จาก state ปัจจุบัน (ใช้ใน reducer) */
export function buildPracticeTimer(
  input: Pick<PracticeTimerSettings, 'mode' | 'minutes' | 'autoSubmit'>,
  totalSec: number,
): PracticeTimerSettings {
  const minutes = isValidTimerMinutes(input.minutes) ? input.minutes : DEFAULT_TIMER_MINUTES;
  return { mode: input.mode, minutes, autoSubmit: input.autoSubmit, startTotalSec: Math.max(0, totalSec) };
}
