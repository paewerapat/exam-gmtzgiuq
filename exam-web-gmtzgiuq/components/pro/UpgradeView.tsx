'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2, PackageOpen, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { getProUpgrade, type ProPublicPlan, type ProUpgradeData } from '@/lib/api/pro';
import { findLiveSubscription } from '@/lib/pro';
import { checkoutHref, loginHref } from '@/lib/pro-payments';
import PlanCard from './PlanCard';
import ComparisonTable from './ComparisonTable';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

/** หน้า Upgrade (/upgrade) — เลือกสนาม การ์ดแพ็กเกจ ตารางเปรียบเทียบ ข้อความทั้งหมดมาจาก API (ภาพ 5) */
export default function UpgradeView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueParam = searchParams.get('venue');

  const [reloadKey, setReloadKey] = useState(0);
  // `my` ขึ้นกับบัญชี → โหลดใหม่เมื่อผู้ใช้เปลี่ยน
  const requestKey = `${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: ProUpgradeData | null; error: boolean } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;

  useEffect(() => {
    const controller = new AbortController();
    getProUpgrade(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load upgrade page:', err);
        setResult({ key: requestKey, data: null, error: true });
      });
    return () => controller.abort();
  }, [requestKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32" role="status" aria-label="กำลังโหลด">
        <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-6 py-16 text-center max-w-xl mx-auto mt-8">
        <AlertCircle className="w-14 h-14 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">โหลดข้อมูลแพ็กเกจไม่สำเร็จ</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">กรุณาลองใหม่อีกครั้ง</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className={`mt-6 inline-flex items-center gap-2 min-h-11 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition ${FOCUS_RING}`}
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          ลองใหม่
        </button>
      </div>
    );
  }

  const { page, venues, my } = data;
  const venue = venues.find((v) => v.key === venueParam) ?? venues[0] ?? null;
  const live = venue ? findLiveSubscription(my, venue.id) : null;

  function selectVenue(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('venue', key);
    router.replace(`${pathname || '/upgrade'}?${params.toString()}`, { scroll: false });
  }

  // สมัคร / ต่ออายุ → หน้า checkout ของแพ็กเกจ (ยังไม่ login → login แล้วกลับมาที่ checkout)
  function handleSubscribe(plan: ProPublicPlan) {
    const target = checkoutHref(plan.id);
    router.push(userId ? target : loginHref(target));
  }

  const plans = venue?.plans ?? [];

  return (
    <FadeIn>
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 lg:p-8">
        {venues.length === 0 || !venue ? (
          <div className="py-16 text-center">
            <PackageOpen className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
            {page.title && (
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 break-words">{page.title}</h1>
            )}
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ยังไม่มีแพ็กเกจให้สมัครในตอนนี้</p>
          </div>
        ) : (
          <>
            {/* เลือกสนาม */}
            <section
              aria-labelledby="venue-picker-title"
              className="rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-500/40 bg-indigo-50/40 dark:bg-indigo-500/5 p-4 sm:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <h2 id="venue-picker-title" className="font-bold text-gray-900 dark:text-gray-100 break-words">
                  {page.venuePickerTitle}
                </h2>
                {venue.description && (
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400 break-words">{venue.description}</p>
                )}
              </div>
              <div role="group" aria-labelledby="venue-picker-title" className="flex flex-wrap gap-2 lg:justify-end">
                {venues.map((v) => {
                  const selected = v.id === venue.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectVenue(v.key)}
                      className={`min-h-11 px-4 py-2 rounded-full text-sm font-semibold transition ${FOCUS_RING} ${
                        selected
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                          : 'bg-white text-gray-800 border border-gray-300 hover:border-indigo-400 hover:text-indigo-700 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600 dark:hover:border-indigo-400 dark:hover:text-indigo-300'
                      }`}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* หัวหน้า + การ์ดแพ็กเกจ — จอ xl คอลัมน์ตรงกับตารางเปรียบเทียบด้านล่าง */}
            <div
              className="mt-8 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-[14rem_repeat(var(--plan-cols),minmax(0,1fr))] xl:gap-x-3"
              style={{ '--plan-cols': Math.max(1, plans.length) } as React.CSSProperties}
            >
              <div className="min-w-0 sm:col-span-2 xl:col-span-1 xl:self-center">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 break-words">
                  {page.title}
                </h1>
                {page.subtitle && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 break-words">{page.subtitle}</p>
                )}
              </div>
              {plans.length === 0 ? (
                <p className="sm:col-span-2 xl:col-span-1 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  สนามนี้ยังไม่มีแพ็กเกจ
                </p>
              ) : (
                plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    current={live && (live.planId === plan.id || live.planCode === plan.code) ? live : null}
                    isLoggedIn={!!userId}
                    onSubscribe={handleSubscribe}
                  />
                ))
              )}
            </div>

            <div className="mt-4">
              <ComparisonTable
                comparison={venue.comparison}
                plans={plans}
                venueName={venue.name}
                alignedWithCards
              />
            </div>
          </>
        )}

        {page.footerNote && (
          <p className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs leading-relaxed text-gray-500 dark:text-gray-400 break-words whitespace-pre-line">
            {page.footerNote}
          </p>
        )}
      </div>
    </FadeIn>
  );
}
