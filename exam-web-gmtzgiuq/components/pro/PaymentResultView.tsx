'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Crown, Loader2, QrCode, RotateCcw, WifiOff, XCircle } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api/apiError';
import { createCheckout, getProPayment, type ProPaymentDetail } from '@/lib/api/pro';
import { formatSatang } from '@/lib/pro';
import {
  CARD_PENDING_POLL_LIMIT_MS,
  checkoutHref,
  formatCountdown,
  isSafeHttpsUrl,
  loginHref,
  MEMBERSHIP_PATH,
  msUntil,
  PAYMENT_EXPIRY_GRACE_MS,
  PAYMENT_POLL_MS,
  paymentErrorMessage,
  resultHref,
} from '@/lib/pro-payments';
import { formatThaiDate } from '@/lib/unlock-codes';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';
const CARD = 'bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700';
const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-12 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400 ${FOCUS_RING}`;
const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-12 px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${FOCUS_RING}`;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * ยัง poll ต่อไหม (ใช้ทั้งหลังได้ผลและหลัง poll ล้ม): pending เท่านั้น —
 * QR poll ถึง expiresAt + ช่วงเผื่อ (ไม่มี expiresAt → ไม่ poll ไม่งั้นวนไม่จบ) / บัตรหยุดหลัง 3 นาที
 */
function shouldKeepPolling(d: ProPaymentDetail, startedAt: number, now: number): boolean {
  if (d.status !== 'pending') return false;
  if (d.method === 'promptpay') {
    const end = d.expiresAt ? new Date(d.expiresAt).getTime() : NaN;
    return Number.isFinite(end) && now < end + PAYMENT_EXPIRY_GRACE_MS;
  }
  return now - startedAt < CARD_PENDING_POLL_LIMIT_MS;
}

type LoadState = { key: string; detail: ProPaymentDetail | null; error: 'not_found' | 'failed' | null };

/** /upgrade/result?payment=<id>[&plan=<planId>] — ผลการชำระ (กลับจาก 3DS / QR PromptPay + นับถอยหลัง + poll ทุก 5 วินาที) */
export default function PaymentResultView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('payment')?.trim() || '';
  const planParam = searchParams.get('plan')?.trim() || '';

  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${paymentId}|${userId ?? ''}|${reloadKey}`;
  const [state, setState] = useState<LoadState | null>(null);
  // stopped = หยุด poll แล้วทั้งที่สถานะล่าสุดยัง pending → แสดงปุ่ม "ตรวจสอบอีกครั้ง"
  const [pollState, setPollState] = useState<{ key: string; netError: boolean; stopped: boolean }>({ key: '', netError: false, stopped: false });
  const current = state?.key === requestKey ? state : null;
  const detail = current?.detail ?? null;
  const loading = !!paymentId && !!userId && !current;
  const netError = pollState.key === requestKey && pollState.netError;
  const pollStopped = pollState.key === requestKey && pollState.stopped;

  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      const back = paymentId ? resultHref(paymentId, planParam || null) : '/upgrade';
      router.replace(loginHref(back));
    }
  }, [userId, paymentId, planParam, router]);

  // โหลด + poll ทุก 5 วินาทีขณะ pending (setTimeout ต่อกันทีละรอบ ไม่ซ้อน) — ออกจากหน้า/เปลี่ยน payment → หยุด
  useEffect(() => {
    if (!paymentId || !userId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let last: ProPaymentDetail | null = null;
    const startedAt = Date.now();

    const run = async () => {
      controller = new AbortController();
      try {
        const d = await getProPayment(paymentId, controller.signal);
        if (stopped) return;
        last = d;
        setState({ key: requestKey, detail: d, error: null });
        const t = Date.now();
        setNow(t);
        const keep = shouldKeepPolling(d, startedAt, t);
        setPollState({ key: requestKey, netError: false, stopped: !keep && d.status === 'pending' });
        if (keep) timer = setTimeout(run, PAYMENT_POLL_MS);
      } catch (err) {
        if (stopped || isAbortError(err)) return;
        if (last) {
          // poll รอบนี้ล้ม (เน็ตหลุด / Opn ล่ม) → ลองต่อตามกฎเดียวกับ shouldKeepPolling ไม่งั้นหยุดแล้วให้กดตรวจสอบเอง
          const t = Date.now();
          setNow(t);
          const keep = shouldKeepPolling(last, startedAt, t);
          setPollState({ key: requestKey, netError: true, stopped: !keep });
          if (keep) timer = setTimeout(run, PAYMENT_POLL_MS);
          return;
        }
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        setState({ key: requestKey, detail: null, error: notFound ? 'not_found' : 'failed' });
      }
    };
    void run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [paymentId, userId, requestKey]);

  // นับถอยหลังของ QR
  const ticking = detail?.status === 'pending' && detail.method === 'promptpay' && !!detail.expiresAt;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const planId = detail?.plan.id || planParam;

  async function handleNewQr() {
    if (!planId || retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await createCheckout({ planId, method: 'promptpay' });
      if (!res.paymentId) throw new Error('missing paymentId');
      router.replace(resultHref(res.paymentId, planId));
    } catch (err) {
      setRetryError(paymentErrorMessage(err, 'สร้าง QR ใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }

  const spinner = (label: string) => (
    <div className="flex items-center justify-center py-32" role="status" aria-label={label}>
      <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
    </div>
  );

  if (!userId) return spinner('กำลังไปหน้าเข้าสู่ระบบ');
  if (loading) return spinner('กำลังโหลด');

  if (!paymentId || !detail) {
    const notFound = !paymentId || current?.error === 'not_found';
    return (
      <div className={`${CARD} px-6 py-16 text-center max-w-xl mx-auto mt-8`}>
        <AlertCircle className="w-14 h-14 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {notFound ? 'ไม่พบรายการชำระเงินนี้' : 'โหลดสถานะการชำระเงินไม่สำเร็จ'}
        </h1>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!notFound && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={PRIMARY_BUTTON}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          )}
          <Link href="/upgrade" className={SECONDARY_BUTTON}>
            กลับไปหน้าแพ็กเกจ
          </Link>
        </div>
      </div>
    );
  }

  const summary = (
    <dl className="mt-5 w-full rounded-xl bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-sm text-left divide-y divide-gray-200 dark:divide-gray-700">
      <div className="flex items-start justify-between gap-4 py-2">
        <dt className="text-gray-600 dark:text-gray-400">แพ็กเกจ</dt>
        <dd className="font-medium text-gray-900 dark:text-gray-100 text-right break-words min-w-0">
          {[detail.venue.name, detail.plan.name].filter(Boolean).join(' · ') || '-'}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 py-2">
        <dt className="text-gray-600 dark:text-gray-400">ยอดชำระ</dt>
        <dd className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums text-right">
          {formatSatang(detail.totalSatang)}
          {detail.vatSatang > 0 && (
            <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">รวม VAT {formatSatang(detail.vatSatang)}</span>
          )}
        </dd>
      </div>
    </dl>
  );

  const left = msUntil(detail.expiresAt, now);
  const qrExpired = detail.status === 'expired' || (detail.status === 'pending' && detail.method === 'promptpay' && left === 0);
  const retryAction =
    detail.method === 'promptpay' ? (
      planId ? (
        <button type="button" onClick={handleNewQr} disabled={retrying} aria-busy={retrying} className={PRIMARY_BUTTON}>
          {retrying ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <QrCode className="w-4 h-4" aria-hidden="true" />}
          สร้าง QR ใหม่
        </button>
      ) : (
        <Link href="/upgrade" className={PRIMARY_BUTTON}>
          เลือกแพ็กเกจอีกครั้ง
        </Link>
      )
    ) : (
      <Link href={planId ? checkoutHref(planId) : '/upgrade'} className={PRIMARY_BUTTON}>
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        ลองชำระอีกครั้ง
      </Link>
    );

  // หยุด poll แล้วแต่ยัง pending → ให้ผู้ใช้กดถามสถานะเอง (โหลดใหม่ + poll รอบใหม่)
  const checkAgain = (primary: boolean) => (
    <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={primary ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
      <RotateCcw className="w-4 h-4" aria-hidden="true" />
      ตรวจสอบอีกครั้ง
    </button>
  );

  let body: React.ReactNode;
  if (detail.status === 'successful') {
    const until = formatThaiDate(detail.subscription?.currentPeriodEnd);
    body = (
      <>
        <CheckCircle2 className="w-16 h-16 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          สมัครสำเร็จ{until ? ` · ใช้ได้ถึง ${until}` : ''}
        </h1>
        {detail.subscription?.autoRenew && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ต่ออายุอัตโนมัติ ยกเลิกได้ตลอดในหน้าสมาชิกของฉัน</p>
        )}
        {summary}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/dashboard/mock-exams" className={PRIMARY_BUTTON}>
            เริ่มทำข้อสอบ
          </Link>
          <Link href={MEMBERSHIP_PATH} className={SECONDARY_BUTTON}>
            <Crown className="w-4 h-4" aria-hidden="true" />
            ดูสมาชิกของฉัน
          </Link>
        </div>
      </>
    );
  } else if (qrExpired) {
    body = (
      <>
        <Clock className="w-16 h-16 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">QR หมดอายุแล้ว</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ยังไม่ได้รับการชำระเงิน สร้าง QR ใหม่เพื่อชำระอีกครั้ง</p>
        {summary}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {retryAction}
          {/* หมดเวลาตามนาฬิกาเครื่องแต่ server ยังบอก pending (เช่นเน็ตหลุดช่วงท้าย) → ถามสถานะล่าสุดได้ */}
          {detail.status === 'pending' && pollStopped && checkAgain(false)}
        </div>
      </>
    );
  } else if (detail.status === 'failed' || detail.status === 'expired') {
    body = (
      <>
        <XCircle className="w-16 h-16 text-red-500 dark:text-red-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">ชำระเงินไม่สำเร็จ</h1>
        <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300 break-words">
          {detail.failureMessage || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
        </p>
        {summary}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">{retryAction}</div>
      </>
    );
  } else if (detail.status === 'pending' && detail.method === 'promptpay') {
    body = (
      <>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">สแกน QR เพื่อชำระเงิน</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ใช้แอปธนาคารหรือแอปที่รองรับ PromptPay</p>
        {isSafeHttpsUrl(detail.qrImageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูป QR จาก Opn (โดเมนภายนอก, images.unoptimized)
          <img
            src={detail.qrImageUrl}
            alt={`QR PromptPay ยอด ${formatSatang(detail.totalSatang)}`}
            className="mt-4 w-full max-w-[16rem] aspect-square rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-white"
          />
        ) : (
          <p className="mt-4 text-sm text-red-700 dark:text-red-300">แสดง QR ไม่ได้ กรุณาสร้าง QR ใหม่</p>
        )}
        <p className="mt-4 text-3xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{formatSatang(detail.totalSatang)}</p>
        {left !== null && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span>
              QR หมดอายุใน <span data-testid="qr-countdown" className="tabular-nums">{formatCountdown(left)}</span>
            </span>
          </p>
        )}
        {pollStopped ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400" role="status">
            ยังไม่ได้รับผลการชำระเงิน ชำระแล้วกดตรวจสอบอีกครั้ง
          </p>
        ) : (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status">
            <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ชำระแล้วหน้านี้จะอัปเดตเองภายในไม่กี่วินาที
          </p>
        )}
        {summary}
        {(pollStopped || !isSafeHttpsUrl(detail.qrImageUrl)) && (
          <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {pollStopped && checkAgain(true)}
            {!isSafeHttpsUrl(detail.qrImageUrl) && planId && retryAction}
          </div>
        )}
      </>
    );
  } else {
    // บัตรที่ยัง pending (กลับจาก 3-D Secure) หรือสถานะที่ไม่รู้จัก
    body = (
      <>
        {pollStopped ? (
          <Clock className="w-16 h-16 text-amber-500 dark:text-amber-400" aria-hidden="true" />
        ) : (
          <Loader2 className="w-16 h-16 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
        )}
        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
          {pollStopped ? 'ยังไม่ได้รับผลการชำระเงิน' : 'กำลังยืนยันการชำระเงิน...'}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400" role="status">
          {pollStopped
            ? 'ธนาคารยังไม่ยืนยันรายการ กดตรวจสอบอีกครั้ง หรือกลับมาดูภายหลังในหน้าสมาชิกของฉัน'
            : 'กรุณาอย่าปิดหน้านี้ ระบบกำลังรอผลจากธนาคาร'}
        </p>
        {summary}
        {pollStopped && (
          <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {checkAgain(true)}
            <Link href={MEMBERSHIP_PATH} className={SECONDARY_BUTTON}>
              ไปหน้าสมาชิกของฉัน
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <FadeIn>
      <div className="max-w-lg mx-auto">
        <section className={`${CARD} px-4 py-8 sm:px-8 flex flex-col items-center text-center`} aria-live="polite">
          {body}
          {netError && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {pollStopped ? 'เชื่อมต่อไม่ได้ กดตรวจสอบอีกครั้งเมื่อพร้อม' : 'เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...'}
            </p>
          )}
          {retryError && (
            <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300 break-words">
              {retryError}
            </p>
          )}
        </section>
      </div>
    </FadeIn>
  );
}
