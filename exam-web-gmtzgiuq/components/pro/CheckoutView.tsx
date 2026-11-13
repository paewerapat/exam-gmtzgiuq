'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  Info,
  Loader2,
  Lock,
  QrCode,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api/apiError';
import { createCheckout, getCheckoutQuote, type ProCheckoutQuote, type ProPaymentMethod } from '@/lib/api/pro';
import { getOmisePublicKey, loadOmiseCard, omiseErrorMessage, OMISE_NOT_READY_MESSAGE, requestCardToken } from '@/lib/omise';
import { formatSatang } from '@/lib/pro';
import { checkoutHref, loginHref, MEMBERSHIP_PATH, paymentErrorMessage, redirectToAuthorize, resultHref } from '@/lib/pro-payments';
import { formatThaiDate } from '@/lib/unlock-codes';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';
const CARD = 'bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700';
const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-12 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400 ${FOCUS_RING}`;

const CARD_FAILED_FALLBACK = 'ทำรายการไม่สำเร็จ กรุณาลองบัตรอื่นหรือติดต่อธนาคาร';

/** แพ็กเกจเดียวกันที่ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว — API ตอบ 409 ALREADY_AUTO_RENEW ทั้งบัตรและ PromptPay */
function isAlreadyAutoRenewing(quote: ProCheckoutQuote): boolean {
  const c = quote.current;
  return !!c && !quote.changesPlan && c.autoRenew && (c.source === 'card' || c.source === '');
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

type LoadError = { message: string; retryable: boolean };

/** /upgrade/checkout?plan=<planId> — สรุปยอด (VAT) เลือกวิธีชำระ แล้วเปิดหน้าต่างบัตรของ Opn หรือสร้าง QR PromptPay */
export default function CheckoutView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan')?.trim() || '';

  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${planId}|${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; quote: ProCheckoutQuote | null; error: LoadError | null } | null>(null);
  const loading = !!planId && !!userId && result?.key !== requestKey;
  const quote = loading ? null : (result?.quote ?? null);

  const [method, setMethod] = useState<ProPaymentMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [payError, setPayError] = useState<string | null>(null);
  const publicKey = getOmisePublicKey();

  // ยังไม่ login → /login แล้วกลับมาหน้านี้ (layout รอ auth โหลดเสร็จก่อน render หน้านี้)
  useEffect(() => {
    if (!userId) router.replace(loginHref(planId ? checkoutHref(planId) : '/upgrade'));
  }, [userId, planId, router]);

  useEffect(() => {
    if (!planId || !userId) return;
    const controller = new AbortController();
    getCheckoutQuote(planId, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, quote: res, error: null });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const notPurchasable = err instanceof ApiError && (err.status === 400 || err.status === 404);
        setResult({
          key: requestKey,
          quote: null,
          error: {
            message: notPurchasable
              ? paymentErrorMessage(err, 'แพ็กเกจนี้ยังไม่เปิดให้สมัคร')
              : paymentErrorMessage(err, 'โหลดข้อมูลการชำระเงินไม่สำเร็จ'),
            retryable: !notPurchasable,
          },
        });
      });
    return () => controller.abort();
  }, [planId, userId, requestKey]);

  // เลือกบัตร → โหลด omise.js ล่วงหน้า (เฉพาะหน้านี้) ล้มก็ไม่เป็นไร กดชำระจะลองใหม่และแจ้ง error
  useEffect(() => {
    if (method !== 'card' || !publicKey || !quote || isAlreadyAutoRenewing(quote)) return;
    loadOmiseCard().catch(() => {});
  }, [method, publicKey, quote]);

  function stopSubmitting() {
    submittingRef.current = false;
    setSubmitting(false);
  }

  async function handlePay() {
    if (!quote || submittingRef.current || isAlreadyAutoRenewing(quote)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setPayError(null);
    try {
      if (method === 'promptpay') {
        const res = await createCheckout({ planId: quote.plan.id, method: 'promptpay' });
        if (!res.paymentId) throw new Error('missing paymentId');
        router.push(resultHref(res.paymentId, quote.plan.id));
        return;
      }

      const token = await requestCardToken({
        amountSatang: quote.totalSatang,
        // Opn ต่อท้ายยอด + THB บนปุ่มให้เอง จึงไม่ใส่ยอดซ้ำ
        submitLabel: 'ชำระเงิน',
      });
      if (!token) {
        // ผู้ใช้ปิดหน้าต่างบัตร
        stopSubmitting();
        return;
      }
      const res = await createCheckout({ planId: quote.plan.id, method: 'card', cardToken: token });
      if (res.status === 'failed') {
        setPayError(res.failureMessage || CARD_FAILED_FALLBACK);
        stopSubmitting();
        return;
      }
      if (res.status === 'pending' && res.authorizeUri) {
        // 3-D Secure: ไปหน้ายืนยันของธนาคาร แล้ว Opn พากลับมาที่ /upgrade/result?payment=
        if (!redirectToAuthorize(res.authorizeUri)) throw new Error('unsafe authorizeUri');
        return;
      }
      if (!res.paymentId) throw new Error('missing paymentId');
      router.push(resultHref(res.paymentId, quote.plan.id));
    } catch (err) {
      setPayError(omiseErrorMessage(err) ?? paymentErrorMessage(err, 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
      stopSubmitting();
    }
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center py-32" role="status" aria-label="กำลังไปหน้าเข้าสู่ระบบ">
        <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
      </div>
    );
  }

  if (!planId || (!loading && !quote)) {
    const error: LoadError = !planId
      ? { message: 'ไม่พบแพ็กเกจที่เลือก', retryable: false }
      : (result?.error ?? { message: 'โหลดข้อมูลการชำระเงินไม่สำเร็จ', retryable: true });
    return (
      <div className={`${CARD} px-6 py-16 text-center max-w-xl mx-auto mt-8`}>
        <AlertCircle className="w-14 h-14 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200 break-words">{error.message}</h1>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {error.retryable && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={PRIMARY_BUTTON}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          )}
          <Link
            href="/upgrade"
            className={`inline-flex items-center gap-2 min-h-12 px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${FOCUS_RING}`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            กลับไปเลือกแพ็กเกจ
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !quote) {
    return (
      <div className="flex items-center justify-center py-32" role="status" aria-label="กำลังโหลด">
        <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
      </div>
    );
  }

  const { plan, current } = quote;
  const currentUntil = current ? formatThaiDate(current.currentPeriodEnd) : null;
  const alreadyAutoRenew = isAlreadyAutoRenewing(quote);
  const renewSamePlan = !!current && !quote.changesPlan && !alreadyAutoRenew;
  const cardUnavailable = method === 'card' && !publicKey;
  const payDisabled = submitting || cardUnavailable || alreadyAutoRenew;
  const renewEvery = plan.periodDays > 0 ? `ทุก ${plan.periodDays.toLocaleString('th-TH')} วัน` : 'ทุกรอบ';

  const methods: { id: ProPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] = [
    { id: 'card', label: 'บัตรเครดิต/เดบิต', desc: `ต่ออายุอัตโนมัติ${renewEvery} ยกเลิกได้ตลอด`, icon: CreditCard },
    { id: 'promptpay', label: 'PromptPay QR', desc: 'ชำระทีละรอบ ไม่ต่ออายุอัตโนมัติ กดต่ออายุเองเมื่อใกล้หมด', icon: QrCode },
  ];

  return (
    <FadeIn>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href={plan.venue.key ? `/upgrade?venue=${encodeURIComponent(plan.venue.key)}` : '/upgrade'}
          className={`inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-gray-600 hover:text-indigo-700 dark:text-gray-400 dark:hover:text-indigo-300 rounded-lg ${FOCUS_RING}`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          กลับไปเลือกแพ็กเกจ
        </Link>

        <section aria-labelledby="checkout-title" className={`${CARD} p-4 sm:p-6`}>
          <h1 id="checkout-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            ชำระเงิน
          </h1>
          <dl className="mt-4 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            <div className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-gray-600 dark:text-gray-400">สนาม</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100 text-right break-words min-w-0">{plan.venue.name || '-'}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-gray-600 dark:text-gray-400">แพ็กเกจ</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100 text-right break-words min-w-0">{plan.name || '-'}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-gray-600 dark:text-gray-400">ราคา</dt>
              <dd className="text-gray-900 dark:text-gray-100 tabular-nums">{formatSatang(quote.subtotalSatang)}</dd>
            </div>
            {quote.vatEnabled && (
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-gray-600 dark:text-gray-400">VAT 7%</dt>
                <dd className="text-gray-900 dark:text-gray-100 tabular-nums">{formatSatang(quote.vatSatang)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 pt-3 pb-1">
              <dt className="font-semibold text-gray-900 dark:text-gray-100">ยอดชำระ</dt>
              <dd data-testid="checkout-total" className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatSatang(quote.totalSatang)}
              </dd>
            </div>
          </dl>

          {quote.changesPlan && current && (
            <div
              role="note"
              className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200"
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">เปลี่ยนแพ็กเกจจะเริ่มรอบใหม่ทันที</p>
                <p className="mt-0.5">
                  แพ็กเกจเดิมของสนามนี้{currentUntil ? ` (ใช้ได้ถึง ${currentUntil})` : ''} จะสิ้นสุดเมื่อชำระสำเร็จ ไม่คิดส่วนต่างของวันที่เหลือ
                  {current.autoRenew ? ' และการต่ออายุอัตโนมัติของแพ็กเกจเดิมจะถูกยกเลิก' : ''}
                </p>
              </div>
            </div>
          )}
          {alreadyAutoRenew && (
            <div
              role="note"
              data-testid="already-auto-renew"
              className="mt-4 flex gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-900/30 dark:text-indigo-200"
            >
              <Info className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">แพ็กเกจนี้ต่ออายุอัตโนมัติอยู่แล้ว</p>
                <p className="mt-0.5">
                  ระบบจะตัดบัตรให้เองเมื่อครบรอบ{currentUntil ? ` (${currentUntil})` : ''} จึงไม่ต้องชำระซ้ำ หากต้องการชำระเองให้ยกเลิกการต่ออายุก่อนที่{' '}
                  <Link
                    href={MEMBERSHIP_PATH}
                    className={`font-semibold underline underline-offset-2 text-indigo-700 dark:text-indigo-300 rounded ${FOCUS_RING}`}
                  >
                    สมาชิกของฉัน
                  </Link>
                </p>
              </div>
            </div>
          )}
          {renewSamePlan && (
            <div
              role="note"
              className="mt-4 flex gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-900/30 dark:text-indigo-200"
            >
              <Info className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <p className="min-w-0">
                คุณมีแพ็กเกจนี้อยู่แล้ว{currentUntil ? ` ใช้ได้ถึง ${currentUntil}` : ''} ชำระแล้วจะต่อจากวันหมดอายุเดิม
                {current?.autoRenew ? ' (แพ็กเกจนี้ตั้งต่ออายุอัตโนมัติอยู่แล้ว)' : ''}
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="checkout-method-title" className={`${CARD} p-4 sm:p-6`}>
          <h2 id="checkout-method-title" className="font-bold text-gray-900 dark:text-gray-100">
            วิธีชำระเงิน
          </h2>
          <div role="radiogroup" aria-labelledby="checkout-method-title" className="mt-3 grid gap-3 sm:grid-cols-2">
            {methods.map((m) => {
              const selected = method === m.id;
              const Icon = m.icon;
              return (
                <label
                  key={m.id}
                  className={`relative flex items-start gap-3 min-w-0 rounded-xl border-2 p-3 sm:p-4 cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10'
                      : 'border-gray-200 hover:border-indigo-300 dark:border-gray-700 dark:hover:border-indigo-500/60'
                  } ${submitting || alreadyAutoRenew ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <input
                    type="radio"
                    name="pay-method"
                    value={m.id}
                    checked={selected}
                    disabled={submitting || alreadyAutoRenew}
                    onChange={() => {
                      setMethod(m.id);
                      setPayError(null);
                    }}
                    className="sr-only"
                  />
                  <Icon
                    className={`w-6 h-6 flex-shrink-0 ${selected ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900 dark:text-gray-100">{m.label}</span>
                    <span className="block mt-0.5 text-xs text-gray-600 dark:text-gray-400">{m.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {method === 'card' ? (
            cardUnavailable ? (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                {OMISE_NOT_READY_MESSAGE} กรุณาเลือก PromptPay หรือลองใหม่ภายหลัง
              </p>
            ) : (
              <p className="mt-4 flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                กรอกข้อมูลบัตรในหน้าต่างของ Opn Payments โดยตรง LUMO ไม่เห็นและไม่เก็บเลขบัตร · ต่ออายุอัตโนมัติ{renewEvery}
                ด้วยยอด {formatSatang(quote.totalSatang)} ยกเลิกได้ตลอดในหน้าสมาชิกของฉัน
              </p>
            )
          ) : (
            <p className="mt-4 flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
              <QrCode className="w-4 h-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              กดชำระแล้วจะได้ QR สำหรับสแกนด้วยแอปธนาคาร ต้องชำระภายในเวลาที่กำหนด
            </p>
          )}

          {payError && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-300"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{payError}</span>
            </p>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={payDisabled}
            aria-busy={submitting}
            className={`${PRIMARY_BUTTON} mt-5 w-full`}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : method === 'card' ? (
              <Lock className="w-5 h-5" aria-hidden="true" />
            ) : (
              <QrCode className="w-5 h-5" aria-hidden="true" />
            )}
            {submitting
              ? 'กำลังดำเนินการ...'
              : method === 'card'
                ? `ชำระด้วยบัตร ${formatSatang(quote.totalSatang)}`
                : `สร้าง QR ชำระ ${formatSatang(quote.totalSatang)}`}
          </button>
        </section>
      </div>
    </FadeIn>
  );
}
