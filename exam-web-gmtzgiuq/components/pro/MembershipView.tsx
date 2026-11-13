'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CreditCard,
  Crown,
  LogIn,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import { confirmDanger } from '@/components/admin/pro/confirm';
import { useAuth } from '@/contexts/AuthContext';
import {
  cancelProRenewal,
  changeProCard,
  getMyPro,
  getMyProPayments,
  type ProMeItem,
  type ProMyPaymentPage,
} from '@/lib/api/pro';
import { getOmisePublicKey, omiseErrorMessage, OMISE_NOT_READY_MESSAGE, requestCardToken } from '@/lib/omise';
import { formatSatang, subscriptionSourceLabel } from '@/lib/pro';
import {
  checkoutHref,
  formatCardLabel,
  loginHref,
  MEMBERSHIP_PATH,
  paymentErrorMessage,
  paymentMethodLabel,
  paymentStatusClass,
  paymentStatusLabel,
  resultHref,
} from '@/lib/pro-payments';
import { daysRemaining, formatThaiDate } from '@/lib/unlock-codes';

const PAYMENTS_LIMIT = 10;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';
const CARD = 'bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700';
const BTN = `inline-flex items-center justify-center gap-1.5 min-h-11 px-4 py-2 rounded-full text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`;
const BTN_PRIMARY = `${BTN} bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-400`;
const BTN_OUTLINE = `${BTN} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50`;
const BTN_DANGER = `${BTN} border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/30`;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

type Busy = { id: string; action: 'cancel' | 'card' } | null;

/** /dashboard/membership — แพ็กเกจที่มีต่อสนาม วันหมด วิธีชำระ บัตร ยกเลิกต่ออายุ เปลี่ยนบัตร ต่ออายุ + ประวัติการชำระ */
export default function MembershipView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [reloadKey, setReloadKey] = useState(0);
  const subsKey = `${userId ?? ''}|${reloadKey}`;
  const [subsResult, setSubsResult] = useState<{ key: string; items: ProMeItem[] | null } | null>(null);
  const subsLoading = !!userId && subsResult?.key !== subsKey;
  const subs = subsLoading ? null : (subsResult?.items ?? null);

  const [page, setPage] = useState(1);
  const paymentsKey = `${userId ?? ''}|${page}|${reloadKey}`;
  const [paymentsResult, setPaymentsResult] = useState<{ key: string; data: ProMyPaymentPage | null } | null>(null);
  const paymentsLoading = !!userId && paymentsResult?.key !== paymentsKey;
  const payments = paymentsLoading ? null : (paymentsResult?.data ?? null);

  const [busy, setBusy] = useState<Busy>(null);
  // เปลี่ยนบัตรแล้วตั้งต่ออายุอัตโนมัติใหม่ไม่สำเร็จ (ชื่อแพ็กเกจที่ถูกปิดต่ออายุ)
  const [cardWarning, setCardWarning] = useState<string[] | null>(null);
  const busyRef = useRef(false);
  const publicKey = getOmisePublicKey();

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    getMyPro(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setSubsResult({ key: subsKey, items });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load my subscriptions:', err);
        setSubsResult({ key: subsKey, items: null });
      });
    return () => controller.abort();
  }, [userId, subsKey]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    getMyProPayments({ page, limit: PAYMENTS_LIMIT }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPaymentsResult({ key: paymentsKey, data });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load my payments:', err);
        setPaymentsResult({ key: paymentsKey, data: null });
      });
    return () => controller.abort();
  }, [userId, page, paymentsKey]);

  function startBusy(next: NonNullable<Busy>): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(next);
    return true;
  }
  function endBusy() {
    busyRef.current = false;
    setBusy(null);
  }

  async function handleCancelRenewal(sub: ProMeItem) {
    if (busyRef.current) return;
    const until = formatThaiDate(sub.currentPeriodEnd);
    const ok = await confirmDanger(
      'ยกเลิกการต่ออายุอัตโนมัติ?',
      `${[sub.venueName, sub.planName].filter(Boolean).join(' · ')} จะไม่ถูกตัดบัตรอีก สิทธิ์ยังใช้ได้ถึง ${until ?? 'วันหมดอายุ'}`,
      'ยกเลิกการต่ออายุ',
    );
    if (!ok || !startBusy({ id: sub.id, action: 'cancel' })) return;
    try {
      await cancelProRenewal(sub.id);
      setSubsResult((prev) =>
        prev?.items
          ? { ...prev, items: prev.items.map((s) => (s.id === sub.id ? { ...s, autoRenew: false, canceledAt: new Date().toISOString() } : s)) }
          : prev,
      );
      toast.success('ยกเลิกการต่ออายุแล้ว');
    } catch (err) {
      toast.error(paymentErrorMessage(err, 'ยกเลิกการต่ออายุไม่สำเร็จ'));
    } finally {
      endBusy();
    }
  }

  async function handleChangeCard(sub: ProMeItem) {
    if (!startBusy({ id: sub.id, action: 'card' })) return;
    try {
      const token = await requestCardToken({ amountSatang: 0, submitLabel: 'บันทึกบัตร', hideAmount: true });
      if (!token) return;
      const card = await changeProCard(sub.id, token);
      const label = formatCardLabel(card.cardBrand, card.cardLastDigits);
      if (card.autoRenewFailed.length > 0) {
        // server ปิดต่ออายุของแพ็กเกจเหล่านี้แล้ว → แจ้งค้างไว้บนหน้า
        const names = card.autoRenewFailed.map((id) => {
          const s = subs?.find((x) => x.id === id);
          return s ? [s.venueName, s.planName].filter(Boolean).join(' · ') || 'แพ็กเกจ' : 'แพ็กเกจ';
        });
        setCardWarning(Array.from(new Set(names)));
        toast.warning('เปลี่ยนบัตรแล้ว แต่ตั้งต่ออายุอัตโนมัติใหม่ไม่สำเร็จบางแพ็กเกจ');
      } else {
        setCardWarning(null);
        toast.success(label ? `เปลี่ยนเป็นบัตร ${label} แล้ว` : 'เปลี่ยนบัตรแล้ว');
      }
      // โหลดสถานะจาก server ใหม่ (บัตร / การต่ออายุของทุกแพ็กเกจ)
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(omiseErrorMessage(err) ?? paymentErrorMessage(err, 'เปลี่ยนบัตรไม่สำเร็จ'));
    } finally {
      endBusy();
    }
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-indigo-900/40">
          <Crown className="w-10 h-10 text-indigo-500 dark:text-indigo-300" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">เข้าสู่ระบบเพื่อดูสมาชิกของฉัน</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">ดูแพ็กเกจ วันหมดอายุ และประวัติการชำระเงินของคุณ</p>
        <Link href={loginHref(MEMBERSHIP_PATH)} className={BTN_PRIMARY}>
          <LogIn className="w-4 h-4" aria-hidden="true" />
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  const totalPages = payments ? Math.max(1, Math.ceil(payments.total / PAYMENTS_LIMIT)) : 1;

  return (
    <FadeIn>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Crown className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              สมาชิกของฉัน
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">แพ็กเกจของแต่ละสนาม การต่ออายุ และประวัติการชำระเงิน</p>
          </div>
          <Link href="/upgrade" className={BTN_OUTLINE}>
            ดูแพ็กเกจทั้งหมด
          </Link>
        </div>

        {cardWarning && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">เปลี่ยนบัตรแล้ว แต่ตั้งต่ออายุอัตโนมัติด้วยบัตรใหม่ไม่สำเร็จ</p>
              <p className="mt-0.5 break-words">
                ปิดการต่ออายุอัตโนมัติของ {cardWarning.join(', ')} แล้ว สิทธิ์ยังใช้ได้ถึงวันหมดอายุ กด &quot;ต่ออายุ&quot; เพื่อชำระเองก่อนหมดอายุ
              </p>
            </div>
          </div>
        )}

        {/* แพ็กเกจของฉัน */}
        <section aria-labelledby="my-plans-title" className="space-y-3">
          <h2 id="my-plans-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            แพ็กเกจของฉัน
          </h2>
          {subsLoading ? (
            <div className={`${CARD} p-8 text-center`} role="status">
              <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400 mx-auto" aria-hidden="true" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
            </div>
          ) : !subs ? (
            <div className={`${CARD} p-8 text-center`}>
              <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400">โหลดข้อมูลสมาชิกไม่สำเร็จ</p>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={`${BTN_PRIMARY} mt-3`}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            </div>
          ) : subs.length === 0 ? (
            <div className={`${CARD} p-8 text-center`}>
              <Crown className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
              <p className="font-medium text-gray-700 dark:text-gray-300">ยังไม่มีแพ็กเกจที่ใช้งานอยู่</p>
              <Link href="/upgrade" className={`${BTN_PRIMARY} mt-4`}>
                ดูแพ็กเกจ
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {subs.map((sub) => {
                const until = formatThaiDate(sub.currentPeriodEnd);
                const days = daysRemaining(sub.currentPeriodEnd);
                const isCard = sub.source === 'card';
                const autoRenewing = isCard && sub.autoRenew;
                const canRenew = !autoRenewing && (sub.source === 'promptpay' || isCard);
                const cardLabel = isCard ? formatCardLabel(sub.cardBrand, sub.cardLastDigits) : null;
                // จาก API ต่อ subscription (ไม่อนุมานจากประวัติ ซึ่งแบ่งหน้าและอาจไม่มีรายการนั้น)
                const renewalFailed = !!sub.renewalFailedAt;
                const rowBusy = busy?.id === sub.id;
                return (
                  <li key={sub.id || sub.venueId} className={`${CARD} p-4 sm:p-5 flex flex-col min-w-0`} data-testid={`membership-${sub.venueKey || sub.venueId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 break-words">{sub.venueName || '-'}</p>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 break-words">{sub.planName || sub.planCode || '-'}</h3>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        ใช้งานอยู่
                      </span>
                    </div>
                    <dl className="mt-3 space-y-1.5 text-sm">
                      <div className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-gray-500 dark:text-gray-400">ใช้ได้ถึง</dt>
                        <dd className="text-gray-900 dark:text-gray-100 text-right">
                          {until ?? '-'}
                          {days != null && (
                            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                              ({days >= 1 ? `เหลือ ${days.toLocaleString('th-TH')} วัน` : 'เหลือไม่ถึง 1 วัน'})
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-gray-500 dark:text-gray-400">วิธีชำระ</dt>
                        <dd className="text-gray-900 dark:text-gray-100 text-right">
                          {isCard ? paymentMethodLabel('card') : subscriptionSourceLabel(sub.source)}
                        </dd>
                      </div>
                      {isCard && (
                        <div className="flex flex-wrap justify-between gap-x-3">
                          <dt className="text-gray-500 dark:text-gray-400">บัตร</dt>
                          <dd className="text-gray-900 dark:text-gray-100 text-right tabular-nums" data-testid="card-label">
                            {cardLabel ?? '-'}
                          </dd>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-gray-500 dark:text-gray-400">การต่ออายุ</dt>
                        <dd className="text-gray-900 dark:text-gray-100 text-right">
                          {autoRenewing
                            ? `อัตโนมัติ · ตัดบัตรครั้งถัดไป ${until ?? '-'}`
                            : isCard
                              ? renewalFailed
                                ? 'ปิดแล้ว (ตัดบัตรไม่สำเร็จ)'
                                : 'ยกเลิกการต่ออายุแล้ว'
                              : sub.source === 'promptpay'
                                ? 'ชำระทีละรอบ (กดต่ออายุเอง)'
                                : 'ไม่ต่ออายุอัตโนมัติ'}
                        </dd>
                      </div>
                    </dl>

                    {renewalFailed && (
                      <p
                        role="alert"
                        className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-300"
                      >
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        ตัดบัตรรอบต่ออายุไม่สำเร็จ การต่ออายุอัตโนมัติถูกปิดแล้ว สิทธิ์ใช้ได้ถึงวันหมดอายุ กด &quot;ต่ออายุ&quot; เพื่อชำระเองและใช้งานต่อ
                      </p>
                    )}
                    {isCard && !autoRenewing && !renewalFailed && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">สิทธิ์ใช้ได้ถึงวันหมดอายุ จะไม่ถูกตัดบัตรอีก</p>
                    )}

                    <div className="mt-auto pt-4 flex flex-wrap gap-2">
                      {canRenew && (
                        <Link href={checkoutHref(sub.planId)} className={BTN_PRIMARY}>
                          <RefreshCw className="w-4 h-4" aria-hidden="true" />
                          ต่ออายุ
                        </Link>
                      )}
                      {isCard && (
                        <button
                          type="button"
                          onClick={() => handleChangeCard(sub)}
                          disabled={!!busy || !publicKey || !sub.id}
                          title={!publicKey ? OMISE_NOT_READY_MESSAGE : undefined}
                          className={BTN_OUTLINE}
                        >
                          {rowBusy && busy?.action === 'card' ? (
                            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <CreditCard className="w-4 h-4" aria-hidden="true" />
                          )}
                          เปลี่ยนบัตร
                        </button>
                      )}
                      {autoRenewing && (
                        <button
                          type="button"
                          onClick={() => handleCancelRenewal(sub)}
                          disabled={!!busy || !sub.id}
                          className={BTN_DANGER}
                        >
                          {rowBusy && busy?.action === 'cancel' ? (
                            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <XCircle className="w-4 h-4" aria-hidden="true" />
                          )}
                          ยกเลิกการต่ออายุ
                        </button>
                      )}
                    </div>
                    {isCard && !publicKey && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">เปลี่ยนบัตร: {OMISE_NOT_READY_MESSAGE}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ประวัติการชำระ */}
        <section aria-labelledby="my-payments-title" className={`${CARD} overflow-hidden`}>
          <h2 id="my-payments-title" className="px-4 sm:px-5 pt-4 sm:pt-5 text-lg font-semibold text-gray-900 dark:text-gray-100">
            ประวัติการชำระเงิน
          </h2>
          {paymentsLoading ? (
            <div className="p-8 text-center" role="status">
              <Loader2 className="w-7 h-7 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400 mx-auto" aria-hidden="true" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
            </div>
          ) : !payments ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">โหลดประวัติการชำระเงินไม่สำเร็จ</p>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={`${BTN_OUTLINE} mt-3`}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            </div>
          ) : payments.items.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-gray-600 dark:text-gray-400">ยังไม่มีประวัติการชำระเงิน</p>
            </div>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
                {payments.items.map((p) => (
                  <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 break-words">
                        {[p.venue?.name, p.plan?.name].filter(Boolean).join(' · ') || '-'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatThaiDate(p.paidAt ?? p.createdAt) ?? '-'} · {paymentMethodLabel(p.method)}
                        {p.isRenewal ? ' · ต่ออายุอัตโนมัติ' : ''}
                      </p>
                      {p.status === 'failed' && p.failureMessage && (
                        <p className="mt-0.5 text-xs text-red-700 dark:text-red-300 break-words">{p.failureMessage}</p>
                      )}
                      {p.refundRequired && (
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">รายการนี้อยู่ระหว่างดำเนินการคืนเงิน</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 sm:flex-shrink-0">
                      <span className="text-right">
                        <span className="block font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatSatang(p.totalSatang)}</span>
                        {p.vatSatang > 0 && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">รวม VAT {formatSatang(p.vatSatang)}</span>
                        )}
                      </span>
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentStatusClass(p.status)}`}>
                        {paymentStatusLabel(p.status)}
                      </span>
                      {p.status === 'pending' && (
                        <Link
                          href={resultHref(p.id, p.plan?.id || null)}
                          className={`text-xs font-medium text-indigo-700 dark:text-indigo-300 underline underline-offset-2 rounded ${FOCUS_RING}`}
                        >
                          ดูรายการ
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <nav aria-label="เลือกหน้าประวัติการชำระเงิน" className="px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    หน้า {page.toLocaleString('th-TH')} จาก {totalPages.toLocaleString('th-TH')}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={BTN_OUTLINE}>
                      ก่อนหน้า
                    </button>
                    <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={BTN_OUTLINE}>
                      ถัดไป
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </FadeIn>
  );
}
