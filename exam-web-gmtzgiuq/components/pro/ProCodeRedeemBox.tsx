'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { CheckCircle2, ChevronDown, Gift, Info, KeyRound, Loader2 } from 'lucide-react';
import { authInputClass } from '@/components/auth/AuthShell';
import { ApiError } from '@/lib/api/apiError';
import { redeemUnlockCode, type RedeemProCodeResult } from '@/lib/api/unlockCodes';
import { loginHref } from '@/lib/pro-payments';
import {
  formatCodeInput,
  normalizeCodeForSubmit,
  PRO_CODE_TEXT,
  proRedeemErrorMessage,
  proRedeemSuccessMessage,
  redeemSuccessMessage,
  UNLOCK_TEXT,
} from '@/lib/unlock-codes';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

interface ProCodeRedeemBoxProps {
  isLoggedIn: boolean;
  /** หน้าที่ให้ login แล้วกลับมา */
  loginRedirect: string;
  /** ได้แพ็กเกจแล้ว → หน้าโหลดสิทธิ์ใหม่ */
  onRedeemed: (result: RedeemProCodeResult) => void;
  /** เปิดช่องกรอกไว้ตั้งแต่แรก (ไม่ต้องกด "มีโค้ด?") */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * กล่อง "มีโค้ด?" (task 19) ในหน้า /upgrade และสมาชิกของฉัน — กรอกโค้ดแบบให้แพ็กเกจ Pro (ไม่ส่ง examId)
 * สำเร็จ → "ได้รับแพ็กเกจ … ถึง …" / โค้ดของชุดข้อสอบ → บอกให้ไปกรอกที่หน้าชุด
 */
export default function ProCodeRedeemBox({
  isLoggedIn,
  loginRedirect,
  onRedeemed,
  defaultOpen = false,
  className = '',
}: ProCodeRedeemBoxProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoRenewNote, setAutoRenewNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const panelId = `${uid}-panel`;
  const inputId = `${uid}-code`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isLoggedIn || submittingRef.current) return;
    const value = normalizeCodeForSubmit(code);
    if (!value) {
      setError(UNLOCK_TEXT.emptyCode);
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setAutoRenewNote(false);
    try {
      const result = await redeemUnlockCode({ code: value });
      if (result.kind === 'pro') {
        const message = proRedeemSuccessMessage(result);
        setSuccess(message);
        setAutoRenewNote(result.autoRenewDatesDiffer);
        setCode('');
        toast.success(message);
        onRedeemed(result);
      } else {
        // API ไม่ควรตอบแบบนี้เมื่อไม่ส่ง examId (API ตอบ 422 NOT_FOR_THIS_EXAM) — ถ้าเกิดขึ้นถือว่าใช้โค้ดสำเร็จ
        const message = redeemSuccessMessage(result.unlockedExamIds.length);
        setSuccess(message);
        setCode('');
        toast.success(message);
      }
    } catch (err) {
      setError(err instanceof ApiError ? proRedeemErrorMessage(err.errorCode, err.message) : proRedeemErrorMessage(null));
      inputRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <section
      aria-label={PRO_CODE_TEXT.title}
      className={`rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 ${className}`}
      data-testid="pro-code-box"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 min-h-12 px-4 py-3 text-left rounded-2xl ${FOCUS_RING}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Gift className="w-5 h-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold text-gray-900 dark:text-gray-100">{PRO_CODE_TEXT.toggle}</span>
            <span className="block text-xs text-gray-600 dark:text-gray-400">กรอกโค้ดเพื่อรับแพ็กเกจ</span>
          </span>
        </span>
        <ChevronDown
          className={`w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={panelId} className="px-4 pb-4">
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {PRO_CODE_TEXT.inputLabel}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(formatCodeInput(e.target.value));
                    if (error) setError(null);
                  }}
                  disabled={!isLoggedIn}
                  // ระหว่างตรวจโค้ดใช้ readOnly (ไม่ใช่ disabled) เพื่อคืน focus ให้ช่องได้ทันทีเมื่อโค้ดผิด
                  readOnly={submitting}
                  placeholder={UNLOCK_TEXT.inputPlaceholder}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={64}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  className={`${authInputClass({ invalid: !!error })} font-mono tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-sans`}
                />
              </div>
              <button
                type="submit"
                disabled={!isLoggedIn || submitting}
                className={`flex-shrink-0 min-h-11 inline-flex items-center justify-center gap-2 px-4 sm:px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 ${FOCUS_RING}`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    <span className="sr-only">{PRO_CODE_TEXT.submitting}</span>
                  </>
                ) : (
                  PRO_CODE_TEXT.submit
                )}
              </button>
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400 break-words">
                {error}
              </p>
            )}
            <p id={hintId} className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              {isLoggedIn ? (
                PRO_CODE_TEXT.subtitle
              ) : (
                <>
                  {PRO_CODE_TEXT.guestNote} ·{' '}
                  <Link
                    href={loginHref(loginRedirect)}
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    เข้าสู่ระบบ
                  </Link>
                </>
              )}
            </p>
          </form>
          {success && (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-200"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{success}</span>
            </p>
          )}
          {success && autoRenewNote && (
            <p
              role="note"
              data-testid="auto-renew-dates-note"
              className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-200"
            >
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{PRO_CODE_TEXT.autoRenewNote}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
