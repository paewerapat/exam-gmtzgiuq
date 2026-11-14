'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Crown, Lock, SkipForward, X } from 'lucide-react';

interface LockedChallengeQuestionProps {
  /** หน้า Upgrade ที่เลือกสนามของข้อนี้ไว้ เช่น /upgrade?venue=netsat */
  upgradeHref: string;
  /** ข้ามไปข้อถัดไป (ข้อสุดท้าย = ส่ง) */
  onSkip: () => void;
  isLast: boolean;
}

function MountainArt() {
  return (
    <svg viewBox="0 0 220 260" className="w-full h-full" aria-hidden="true">
      <rect width="220" height="260" rx="24" fill="#2e2a7a" />
      <circle cx="165" cy="58" r="26" fill="#f2a33a" />
      <path d="M0 200 L60 120 L110 190 L150 110 L220 200 L220 260 L0 260 Z" fill="#5b4fd8" />
      <path d="M40 260 L120 130 L200 260 Z" fill="#7a6cf0" />
      <path d="M150 110 L162 130 L138 130 Z" fill="#eef0ff" />
      <path d="M151 70 L151 112" stroke="#eef0ff" strokeWidth="3" />
      <path d="M152 72 L176 80 L152 88 Z" fill="#34c38f" />
      <rect x="100" y="178" width="44" height="38" rx="8" fill="#1b1846" stroke="#eef0ff" strokeWidth="3" />
      <path d="M110 178 v-10 a12 12 0 0 1 24 0 v10" fill="none" stroke="#eef0ff" strokeWidth="3" />
      <circle cx="122" cy="197" r="4" fill="#eef0ff" />
    </svg>
  );
}

/**
 * ข้อ Challenge ที่ผู้ใช้ยังไม่มีสิทธิ์ (task 20): การ์ดล็อกแทนโจทย์ + modal ชวน Upgrade ที่เปิดเองเมื่อมาถึงข้อนี้
 * render เป็น component แยก (มี hook ของตัวเอง) — ExamContainer มี early return ก่อน hook บางตัว (BUG-11)
 * ใส่ key ตาม id ของข้อ ให้ modal เปิดใหม่ทุกครั้งที่มาถึงข้อที่ล็อก
 */
export default function LockedChallengeQuestion({ upgradeHref, onSkip, isLast }: LockedChallengeQuestionProps) {
  const [open, setOpen] = useState(true);
  const titleId = useId();
  const descId = useId();
  const unlockRef = useRef<HTMLAnchorElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const skipLabel = isLast ? 'ข้ามข้อและส่ง' : 'ข้ามข้อ';

  useEffect(() => {
    if (!open) return;
    // ปิดแล้วคืนโฟกัสให้ element เดิม + ล็อกการเลื่อนหน้าหลังระหว่างเปิด
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    unlockRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // กัน Tab หลุดออกนอก modal
      if (e.key === 'Tab' && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // element เดิมยังอยู่ในหน้า → คืนโฟกัส (ถ้าถูกถอดไปแล้ว เช่นเปลี่ยนข้อ ก็ปล่อยไป)
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  const skip = () => {
    setOpen(false);
    onSkip();
  };

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-[#16133d] dark:bg-gray-950 text-white dark:text-gray-100 shadow-2xl p-6 sm:p-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_14rem] items-center"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center text-white/70 dark:text-gray-400 hover:bg-white/10 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 dark:bg-gray-800 text-sm font-semibold text-white dark:text-gray-100">
                  <Lock className="w-4 h-4 text-amber-300 dark:text-amber-300" aria-hidden="true" />
                  ข้อ Challenge
                </span>
                <h2 id={titleId} className="mt-4 text-2xl sm:text-4xl font-extrabold leading-tight">
                  คุณเจอข้อ Challenge แล้ว
                </h2>
                <p id={descId} className="mt-3 text-base text-indigo-100 dark:text-gray-300">
                  ข้อนี้เป็นข้อ Challenge สำหรับสมาชิก Pro — ข้อกลุ่มนี้ยากที่สุดใน Question Bank
                  ไว้สำหรับคนที่อยากเก็บคะแนนส่วนสุดท้าย
                </p>
                <p className="mt-4 flex items-center gap-2 text-sm text-white dark:text-gray-100">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} aria-hidden="true" />
                  </span>
                  ทำข้อ Challenge ได้ไม่จำกัด
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link
                    ref={unlockRef}
                    href={upgradeHref}
                    className="inline-flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-white dark:bg-gray-100 text-gray-900 dark:text-gray-900 text-base font-bold hover:bg-indigo-50 dark:hover:bg-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                  >
                    <Crown className="w-5 h-5 text-amber-500 dark:text-amber-500" aria-hidden="true" />
                    Unlock
                  </Link>
                  <button
                    type="button"
                    onClick={skip}
                    className="inline-flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-white/10 dark:bg-gray-800 text-white dark:text-gray-100 text-base font-semibold hover:bg-white/20 dark:hover:bg-gray-700 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
                  >
                    {skipLabel}
                  </button>
                </div>
              </div>
              <div className="hidden md:block h-64">
                <MountainArt />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="px-6 pb-8 pt-2">
      <div className="rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-900/20 px-5 py-10 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
          <Lock className="w-7 h-7 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
        </span>
        <p className="mt-4 text-lg font-bold text-gray-900 dark:text-gray-100">ข้อนี้เป็นข้อ Challenge สำหรับสมาชิก Pro</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ข้อนี้ไม่นับคะแนน กด Unlock เพื่อสมัคร Pro หรือข้ามไปข้อถัดไป</p>
        <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
          <Link
            href={upgradeHref}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            <Crown className="w-4 h-4" aria-hidden="true" />
            Unlock
          </Link>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-white dark:hover:bg-gray-700/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            <SkipForward className="w-4 h-4" aria-hidden="true" />
            {skipLabel}
          </button>
        </div>
      </div>
      {modal}
    </div>
  );
}
