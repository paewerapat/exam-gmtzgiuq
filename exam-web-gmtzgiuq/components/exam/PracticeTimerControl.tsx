'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { ChevronDown, Timer } from 'lucide-react';
import { formatTime, formatTimeReadable } from '@/lib/exam-utils';
import {
  defaultTimerMinutes,
  parseTimerMinutes,
  practiceTimerRemaining,
  TIMER_MAX_MINUTES,
  TIMER_MIN_MINUTES,
  TIMER_MODE_LABELS,
  TIMER_PRESETS,
} from '@/lib/practice-timer';
import type { PracticeTimerSettings } from '@/types/exam';

export const TIME_UP_MESSAGE = 'หมดเวลาที่ตั้งไว้';

type TimerInput = Pick<PracticeTimerSettings, 'mode' | 'minutes' | 'autoSubmit'>;

interface PracticeTimerControlProps {
  /** ค่าที่ตั้งใน session (ไม่มี = นับขึ้นแบบเดิม) */
  settings: PracticeTimerSettings | null | undefined;
  /** เวลาทำรวม (วินาที) — ฐานของนับถอยหลัง */
  totalSec: number;
  /** ค่าที่แสดงในโหมดนับขึ้น (เวลาของข้อปัจจุบัน เหมือนหน้าเดิม) */
  countUpSeconds: number;
  /** เวลาสอบจริงของชุด (exam.durationMinutes) — ไม่มี = ไม่แสดงบรรทัดค่าแนะนำ */
  recommendedMinutes?: number | null;
  /** กันแจ้งหมดเวลาซ้ำข้าม session */
  sessionId: string;
  onApply: (settings: TimerInput) => void;
  /** หมดเวลาและติ๊กส่งอัตโนมัติ → ส่งข้อสอบแบบเดียวกับกดส่ง */
  onTimeUp: () => void | Promise<void>;
  /** แจ้ง "หมดเวลาที่ตั้งไว้" แล้ว (ไม่ส่งอัตโนมัติ) → จำใน session (reload แล้วไม่ toast ซ้ำ) */
  onExpiredNotified?: () => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const PANEL_MAX_WIDTH = 416;
const GUTTER = 16;

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

/**
 * นาฬิกากลางแถบบนของหน้าทำข้อสอบโหมดฝึก (task 21 — ดีไซน์ภาพ 8–9): กดแล้วเปิดหน้าต่าง "ตั้งค่าเวลา"
 * เลือกนับขึ้น / นับถอยหลังตั้งเวลาเอง (1–600 นาที, ปุ่มลัด 30/60/90/120) และส่งอัตโนมัติเมื่อหมดเวลา
 * หน้าต่าง render ผ่าน portal ไป document.body (framer-motion transform ทำ position: fixed เพี้ยน)
 */
export default function PracticeTimerControl({
  settings,
  totalSec,
  countUpSeconds,
  recommendedMinutes,
  sessionId,
  onApply,
  onTimeUp,
  onExpiredNotified,
}: PracticeTimerControlProps) {
  const ids = useId();
  const dialogId = `${ids}-dialog`;
  const titleId = `${ids}-title`;
  const minutesId = `${ids}-minutes`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  // ค่าในฟอร์ม (ตั้งใหม่ทุกครั้งที่เปิด)
  const [mode, setMode] = useState<TimerInput['mode']>('up');
  const [minutesText, setMinutesText] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const remaining = practiceTimerRemaining(settings, totalSec);
  const isDown = remaining != null;
  const expired = remaining === 0;
  const display = isDown ? remaining : countUpSeconds;
  const modeLabel = TIMER_MODE_LABELS[isDown ? 'down' : 'up'];

  // หมดเวลา: แจ้ง/ส่งครั้งเดียวต่อการตั้งค่า (key เปลี่ยนเมื่อกด "ใช้เวลานี้" ใหม่)
  const expiryKey =
    settings?.mode === 'down' ? `${sessionId}:${settings.startTotalSec}:${settings.minutes}:${settings.autoSubmit}` : null;
  const firedRef = useRef<string | null>(null);
  const autoSubmitOnExpiry = settings?.autoSubmit === true;
  // แจ้งไปแล้วใน session นี้ (เก็บใน session.practiceTimer) → reload/resume แล้วไม่ toast ซ้ำ
  const alreadyNotified = settings?.expiredNotified === true;
  const onTimeUpRef = useRef(onTimeUp);
  const onExpiredNotifiedRef = useRef(onExpiredNotified);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
    onExpiredNotifiedRef.current = onExpiredNotified;
  }, [onTimeUp, onExpiredNotified]);

  useEffect(() => {
    if (!expired || !expiryKey || firedRef.current === expiryKey) return;
    firedRef.current = expiryKey;
    if (autoSubmitOnExpiry) {
      void onTimeUpRef.current();
      return;
    }
    if (alreadyNotified) return;
    toast.warning(TIME_UP_MESSAGE);
    onExpiredNotifiedRef.current?.();
  }, [expired, expiryKey, autoSubmitOnExpiry, alreadyNotified]);

  // หมดเวลาแล้วระบบกำลังส่งให้ → ปิดหน้าต่าง / ไม่ส่ง → screen reader ได้ยินว่าหมดเวลาและทำต่อได้
  const dialogOpen = open && !(expired && autoSubmitOnExpiry);
  const liveMessage = expired && !autoSubmitOnExpiry ? `${TIME_UP_MESSAGE} ทำข้อสอบต่อได้` : announce;

  function openDialog() {
    setMode(settings?.mode ?? 'up');
    setMinutesText(String(settings?.minutes ?? defaultTimerMinutes(recommendedMinutes)));
    setAutoSubmit(settings?.autoSubmit ?? true);
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function apply() {
    if (mode === 'up') {
      onApply({ mode: 'up', minutes: settings?.minutes ?? defaultTimerMinutes(recommendedMinutes), autoSubmit });
      setAnnounce('เปลี่ยนเป็นนับขึ้นแล้ว');
      closeDialog();
      return;
    }
    const minutes = parseTimerMinutes(minutesText);
    if (minutes == null) {
      setError(`กรุณาใส่เวลาเป็นจำนวนเต็ม ${TIMER_MIN_MINUTES}–${TIMER_MAX_MINUTES} นาที`);
      document.getElementById(minutesId)?.focus();
      return;
    }
    onApply({ mode: 'down', minutes, autoSubmit });
    setAnnounce(`ตั้งนับถอยหลัง ${minutes} นาทีแล้ว`);
    closeDialog();
  }

  // ตำแหน่งหน้าต่าง: ใต้นาฬิกา กึ่งกลาง (ไม่เกินขอบจอ) — วัดใหม่เมื่อเลื่อน/ปรับขนาดจอ
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(PANEL_MAX_WIDTH, vw - GUTTER * 2);
      const center = rect ? rect.left + rect.width / 2 : vw / 2;
      const left = Math.min(Math.max(center - width / 2, GUTTER), vw - GUTTER - width);
      const top = Math.max(GUTTER, (rect?.bottom ?? 0) + 8);
      setPanelStyle({ top, left, width, maxHeight: `calc(100dvh - ${top + GUTTER}px)` });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // เปิดแล้ว focus ตัวเลือกโหมดที่เลือกอยู่
  useEffect(() => {
    if (!open) return;
    const checked = panelRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    checked?.focus();
  }, [open]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDialog();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const parsedMinutes = parseTimerMinutes(minutesText);
  const recommended =
    recommendedMinutes != null && recommendedMinutes > 0 ? Math.round(recommendedMinutes) : null;

  const dialog = dialogOpen ? (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 sm:bg-transparent" aria-hidden="true" onClick={closeDialog} />
      <div
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        style={panelStyle}
        className="absolute overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-2xl shadow-indigo-900/10 dark:shadow-black/40 p-5 sm:p-6"
      >
        <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-gray-100">
          ตั้งค่าเวลา
        </h2>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
          เลือกวิธีจับเวลาได้ตามต้องการ เปลี่ยนได้ระหว่างทำ
        </p>

        <fieldset className="mt-4">
          <legend className="sr-only">โหมดจับเวลา</legend>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
            {(
              [
                { value: 'up', label: 'นับขึ้น' },
                { value: 'down', label: 'นับถอยหลัง (ตั้งเวลาเอง)' },
              ] as const
            ).map((opt) => {
              const checked = mode === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`relative flex items-center justify-center text-center min-h-11 px-2 rounded-lg text-sm font-semibold cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                    checked
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-mode`}
                    value={opt.value}
                    checked={checked}
                    onChange={() => {
                      setMode(opt.value);
                      setError(null);
                    }}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        {mode === 'down' && (
          <div className="mt-4">
            <label htmlFor={minutesId} className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
              ตั้งเวลา
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id={minutesId}
                type="number"
                inputMode="numeric"
                min={TIMER_MIN_MINUTES}
                max={TIMER_MAX_MINUTES}
                step={1}
                value={minutesText}
                onChange={(e) => {
                  setMinutesText(e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${errorId} ${hintId}` : hintId}
                className={`w-28 min-h-12 px-3 rounded-xl border-2 text-center text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  error ? 'border-red-500 dark:border-red-400' : 'border-indigo-500 dark:border-indigo-400'
                }`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">นาที</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="ปุ่มลัดเวลา">
              {TIMER_PRESETS.map((m) => {
                const active = parsedMinutes === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setMinutesText(String(m));
                      setError(null);
                    }}
                    className={`min-h-11 min-w-14 px-3 rounded-full border text-sm font-semibold transition ${FOCUS} ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'border-gray-200 text-gray-700 hover:border-indigo-300 dark:border-gray-600 dark:text-gray-300 dark:hover:border-indigo-500'
                    }`}
                  >
                    <span aria-hidden="true">{m}</span>
                    <span className="sr-only">{m} นาที</span>
                  </button>
                );
              })}
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <p id={hintId} className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {recommended != null && <>ค่าแนะนำเท่าเวลาสอบจริงของชุดนี้ {recommended.toLocaleString('th-TH')} นาที · </>}
              ใส่เวลาเองได้ {TIMER_MIN_MINUTES}–{TIMER_MAX_MINUTES} นาที
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSubmit}
                onChange={(e) => setAutoSubmit(e.target.checked)}
                className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-indigo-600 focus:ring-indigo-500"
              />
              ส่งข้อสอบอัตโนมัติเมื่อหมดเวลา
            </label>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={closeDialog}
            className={`min-h-12 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${FOCUS}`}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={apply}
            className={`min-h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-sm font-semibold text-white transition ${FOCUS}`}
          >
            ใช้เวลานี้
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (dialogOpen ? closeDialog() : openDialog())}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        aria-controls={dialogOpen ? dialogId : undefined}
        aria-label={`ตั้งค่าเวลา (ตอนนี้${modeLabel} ${formatTimeReadable(display)}${expired ? ' หมดเวลาแล้ว' : ''})`}
        data-testid="practice-timer"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border-2 transition ${FOCUS} ${
          dialogOpen
            ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-900/20'
            : 'border-transparent hover:border-indigo-200 hover:bg-gray-50 dark:hover:border-indigo-800 dark:hover:bg-gray-700/50'
        }`}
      >
        <Timer
          className={`w-5 h-5 flex-shrink-0 ${expired ? 'text-red-500 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}
          aria-hidden="true"
        />
        <span
          data-testid="practice-timer-value"
          className={`font-bold text-xl sm:text-2xl tabular-nums tracking-tight ${
            expired ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {formatTime(display)}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[11px] font-semibold whitespace-nowrap">
          {modeLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${dialogOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <span className="sr-only" role="status" aria-live="polite" data-testid="practice-timer-live">
        {liveMessage}
      </span>
      {dialog && typeof document !== 'undefined' ? createPortal(dialog, document.body) : null}
    </>
  );
}
