'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { AlertTriangle, CheckCircle2, Crown, KeyRound, Loader2, PlayCircle, ShoppingCart } from 'lucide-react';
import { authInputClass } from '@/components/auth/AuthShell';
import { ApiError } from '@/lib/api/apiError';
import { redeemUnlockCode, type RedeemUnlockCodeResult } from '@/lib/api/unlockCodes';
import {
  canStartMock,
  getMockPrimaryAction,
  getMockPriceLabel,
  normalizeAccessType,
  type MockAccessType,
  type MockExamAccess,
} from '@/lib/mock-exam';
import {
  formatAccessUntil,
  formatCodeInput,
  formatThaiDate,
  normalizeCodeForSubmit,
  PRO_CODE_TEXT,
  proRedeemSuccessMessage,
  redeemErrorMessage,
  redeemSuccessMessage,
  UNLOCK_TEXT,
} from '@/lib/unlock-codes';

/** ข้อความกล่องสิทธิ์ตามที่มา (task 17): pro = แพ็กเกจ Pro ของสนาม / admin, purchase, ไม่ทราบ = กลาง ๆ */
export const ACCESS_VIA_PRO = 'สิทธิ์จากแพ็กเกจ Pro';
export const ACCESS_VIA_OTHER = 'มีสิทธิ์เข้าทำ';

const CARD_CLASS =
  'bg-white dark:bg-gray-800 rounded-2xl border-2 border-indigo-500 dark:border-indigo-500/60 shadow-lg shadow-indigo-100/70 dark:shadow-black/30 p-5 sm:p-6';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

// ปุ่มเริ่มทำ = โหมดข้อสอบจริง (rose) ตาม convention ของเว็บ
const START_CLASS = `flex items-center justify-center gap-2 w-full min-h-12 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm transition ${FOCUS_RING} focus-visible:ring-rose-500`;

const LINK_CLASS =
  'font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

interface MockAccessPanelProps {
  /** venueKey: สนาม Pro ของหมวดชุดนี้ (task 17) — ชุดซื้อที่มีสนาม → ปุ่ม Upgrade */
  exam: { id: string; accessType: MockAccessType; price: number | null; venueKey?: string | null };
  access: MockExamAccess;
  /** ยังไม่ได้เข้าสู่ระบบ */
  isGuest: boolean;
  /** มี attempt โหมด exam ค้าง → "ทำต่อ" */
  hasInProgress: boolean;
  /** กำลังเช็ก attempt ค้าง (ปุ่มเริ่มแสดง loading) */
  checkingProgress: boolean;
  /** เพิ่ง Unlock สำเร็จในหน้านี้ → ย้าย focus ไปปุ่มเริ่มทำ */
  focusStart?: boolean;
  onRedeemed: (result: RedeemUnlockCodeResult) => void;
}

/** ลิงก์ "เข้าสู่ระบบ / สมัครสมาชิก" — login พากลับหน้านี้ (?redirect= ตรวจโดย getSafeRedirect ตาม SEC-13) */
function AuthLinks({ examId }: { examId: string }) {
  const redirect = encodeURIComponent(`/dashboard/mock-exams/${examId}`);
  return (
    <>
      <Link href={`/login?redirect=${redirect}`} className={LINK_CLASS}>
        เข้าสู่ระบบ
      </Link>
      <span aria-hidden="true"> / </span>
      <Link href="/register" className={LINK_CLASS}>
        สมัครสมาชิก
      </Link>
    </>
  );
}

/** กล่องขวาของหน้ารายละเอียด Mock: เริ่มทำ / กรอกโค้ด Unlock / ซื้อ ตามชนิดชุดและสิทธิ์ของบัญชี */
export default function MockAccessPanel({
  exam,
  access,
  isGuest,
  hasInProgress,
  checkingProgress,
  focusStart = false,
  onRedeemed,
}: MockAccessPanelProps) {
  const accessType = normalizeAccessType(exam.accessType);
  const canStart = canStartMock(exam, access);
  const action = getMockPrimaryAction(exam, { hasInProgress, access });
  const startRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (focusStart && !checkingProgress) startRef.current?.focus();
  }, [focusStart, checkingProgress]);

  if (canStart && (action.kind === 'start' || action.kind === 'resume')) {
    const unlocked = access.status === 'unlocked';
    return (
      <div className={CARD_CLASS} data-testid="mock-access-panel">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {unlocked ? UNLOCK_TEXT.unlockedTitle : 'เริ่มทำข้อสอบ'}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {unlocked ? UNLOCK_TEXT.unlockedSubtitle : 'พร้อมแล้วกดเริ่มทำข้อสอบได้เลย'}
        </p>

        {/* วันหมดสิทธิ์ null = ไม่หมดอายุ (เช่นแอดมิน) → ไม่แสดงกล่องสิทธิ์ / ข้อความตามที่มาของสิทธิ์ (task 17) */}
        {unlocked && access.expiresAt && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            {access.via === 'code' ? (
              <p className="min-w-0">
                <span className="block font-semibold">{UNLOCK_TEXT.unlockedSuccess}</span>
                <span className="block" data-testid="access-until">
                  {formatAccessUntil(access.expiresAt)}
                </span>
              </p>
            ) : (
              <p className="min-w-0" data-testid="access-until">
                <span className="font-semibold">{access.via === 'pro' ? ACCESS_VIA_PRO : ACCESS_VIA_OTHER}</span>
                {formatThaiDate(access.expiresAt) && ` · ใช้ได้ถึง ${formatThaiDate(access.expiresAt)}`}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          {checkingProgress ? (
            <span role="status" className={`${START_CLASS} bg-rose-600/70 hover:bg-rose-600/70`}>
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              กำลังตรวจสอบ...
            </span>
          ) : (
            <Link ref={startRef} href={action.href} className={START_CLASS}>
              <PlayCircle className="w-5 h-5" aria-hidden="true" />
              {action.label}
            </Link>
          )}
          {action.kind === 'resume' && !checkingProgress && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">คุณมีการทำชุดนี้ค้างอยู่ กดเพื่อทำต่อ</p>
          )}
        </div>

        {isGuest && accessType === 'free' && (
          <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            เข้าสู่ระบบเพื่อบันทึกคะแนนและติดตามพัฒนาการ · <AuthLinks examId={exam.id} />
          </p>
        )}
      </div>
    );
  }

  if (accessType === 'code') {
    return <RedeemCodeForm examId={exam.id} access={access} isGuest={isGuest} onRedeemed={onRedeemed} />;
  }

  // ชุดซื้อที่ยังไม่มีสิทธิ์: หมวดผูกสนาม Pro → ปุ่ม Upgrade ไปหน้าแพ็กเกจของสนามนั้น (task 17)
  // หมวดไม่ผูกสนาม → ปุ่ม "ซื้อ" กดไม่ได้แบบเดิม
  if (exam.venueKey) {
    return (
      <div className={CARD_CLASS} data-testid="mock-access-panel">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">สมัครแพ็กเกจเพื่อทำชุดนี้</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          ชุดนี้เปิดให้ผู้ที่สมัครแพ็กเกจของสนามสอบนี้ ทำได้ทุกชุดในสนามเดียวกัน
        </p>
        {access.status === 'expired' && <ExpiredNotice expiresAt={access.expiresAt} className="mt-3" />}
        <Link
          href={`/upgrade?venue=${encodeURIComponent(exam.venueKey)}`}
          className={`mt-4 flex items-center justify-center gap-2 w-full min-h-12 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm transition ${FOCUS_RING} focus-visible:ring-indigo-500`}
        >
          <Crown className="w-5 h-5" aria-hidden="true" />
          Upgrade
        </Link>

        <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{UNLOCK_TEXT.purchaseCodeTitle}</h3>
          <RedeemCodeFields examId={exam.id} isGuest={isGuest} onRedeemed={onRedeemed} className="mt-2" />
        </div>
      </div>
    );
  }

  const priceLabel = getMockPriceLabel(exam);
  return (
    <div className={CARD_CLASS} data-testid="mock-access-panel">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">ซื้อชุดข้อสอบ</h2>
      {priceLabel && (
        <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-300">{priceLabel}</p>
      )}
      {access.status === 'expired' && <ExpiredNotice expiresAt={access.expiresAt} className="mt-3" />}
      <button
        type="button"
        disabled
        aria-describedby="mock-buy-note"
        className="mt-4 flex items-center justify-center gap-2 w-full min-h-12 px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold cursor-not-allowed"
      >
        <ShoppingCart className="w-5 h-5" aria-hidden="true" />
        ซื้อ
      </button>
      <p id="mock-buy-note" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        เปิดให้ซื้อเร็ว ๆ นี้
      </p>

      {/* ชุดซื้อ Unlock ได้ด้วยโค้ดที่แอดมินผูกไว้กับชุดนี้ (task 15 รอบ 2) */}
      <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{UNLOCK_TEXT.purchaseCodeTitle}</h3>
        <RedeemCodeFields examId={exam.id} isGuest={isGuest} onRedeemed={onRedeemed} className="mt-2" />
      </div>
    </div>
  );
}

function ExpiredNotice({ expiresAt, className = '' }: { expiresAt: string | null; className?: string }) {
  const date = formatThaiDate(expiresAt);
  return (
    <div
      className={`flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 ${className}`}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        <span className="block font-semibold">{UNLOCK_TEXT.expiredTitle}</span>
        {date && <span className="block">หมดอายุเมื่อ {date}</span>}
      </p>
    </div>
  );
}

/** การ์ดกรอกโค้ดของชุด code: guest = ช่อง disabled + ลิงก์เข้าสู่ระบบ / locked / expired = กรอกได้ */
function RedeemCodeForm({
  examId,
  access,
  isGuest,
  onRedeemed,
}: {
  examId: string;
  access: MockExamAccess;
  isGuest: boolean;
  onRedeemed: (result: RedeemUnlockCodeResult) => void;
}) {
  const expired = access.status === 'expired';
  return (
    <div className={CARD_CLASS} data-testid="mock-access-panel">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {expired ? UNLOCK_TEXT.expiredTitle : UNLOCK_TEXT.boxTitle}
      </h2>
      {expired ? (
        <>
          {formatThaiDate(access.expiresAt) && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              หมดอายุเมื่อ {formatThaiDate(access.expiresAt)}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{UNLOCK_TEXT.expiredSubtitle}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{UNLOCK_TEXT.boxSubtitle}</p>
      )}
      <RedeemCodeFields examId={examId} isGuest={isGuest} onRedeemed={onRedeemed} className="mt-4" />
    </div>
  );
}

/**
 * ช่องกรอกโค้ด + ปุ่ม Unlock + error ใต้ช่อง (ใช้ในการ์ดชุดโค้ด และใต้ปุ่ม "ซื้อ" ของชุดซื้อ)
 * guest = ช่อง disabled + "ต้องเข้าสู่ระบบก่อนกรอกโค้ด · เข้าสู่ระบบ / สมัครสมาชิก"
 */
function RedeemCodeFields({
  examId,
  isGuest,
  onRedeemed,
  className = '',
}: {
  examId: string;
  isGuest: boolean;
  onRedeemed: (result: RedeemUnlockCodeResult) => void;
  className?: string;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // โค้ดแบบให้แพ็กเกจ Pro (task 19): บอกผลไว้ใต้ช่อง (ถ้าแพ็กเกจให้สิทธิ์ชุดนี้ กล่องจะเปลี่ยนเป็นปุ่มเริ่มทำหลังโหลดสิทธิ์ใหม่)
  const [proSuccess, setProSuccess] = useState<string | null>(null);
  const [proAutoRenewNote, setProAutoRenewNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = isGuest || submitting;

  const hintId = 'unlock-code-hint';
  const errorId = 'unlock-code-error';
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isGuest || submitting) return;
    const value = normalizeCodeForSubmit(code);
    if (!value) {
      setError(UNLOCK_TEXT.emptyCode);
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    setProSuccess(null);
    try {
      const result = await redeemUnlockCode({ code: value, examId });
      if (result.kind === 'pro') {
        const message = proRedeemSuccessMessage(result);
        toast.success(message);
        setProSuccess(message);
        setProAutoRenewNote(result.autoRenewDatesDiffer);
        setCode('');
        setSubmitting(false);
        onRedeemed(result);
        return;
      }
      toast.success(redeemSuccessMessage(result.unlockedExamIds.length));
      onRedeemed(result);
    } catch (err) {
      const message =
        err instanceof ApiError ? redeemErrorMessage(err.errorCode, err.message) : redeemErrorMessage(null);
      setError(message);
      setSubmitting(false);
      // คง focus ไว้ที่ช่องเพื่อแก้โค้ดต่อได้ทันที (ข้อความ error ประกาศผ่าน role=alert)
      inputRef.current?.focus();
    }
  }

  return (
      <form onSubmit={handleSubmit} noValidate className={className}>
        <label htmlFor="unlock-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {UNLOCK_TEXT.inputLabel}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <KeyRound className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              ref={inputRef}
              id="unlock-code"
              name="unlock-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(formatCodeInput(e.target.value));
                if (error) setError(null);
              }}
              disabled={disabled}
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
            disabled={disabled}
            className={`flex-shrink-0 min-h-11 inline-flex items-center justify-center gap-2 px-4 sm:px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 ${FOCUS_RING} focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only">{UNLOCK_TEXT.submitting}</span>
              </>
            ) : (
              UNLOCK_TEXT.submit
            )}
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {proSuccess && (
          <p
            role="status"
            className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-200"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{proSuccess}</span>
          </p>
        )}
        {proSuccess && proAutoRenewNote && (
          <p
            role="note"
            data-testid="auto-renew-dates-note"
            className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-200"
          >
            {PRO_CODE_TEXT.autoRenewNote}
          </p>
        )}
        <p id={hintId} className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          {isGuest ? (
            <>
              {UNLOCK_TEXT.guestNote} · <AuthLinks examId={examId} />
            </>
          ) : (
            'ไม่สนตัวพิมพ์เล็ก-ใหญ่ เว้นวรรคหรือขีดได้'
          )}
        </p>
      </form>
  );
}
