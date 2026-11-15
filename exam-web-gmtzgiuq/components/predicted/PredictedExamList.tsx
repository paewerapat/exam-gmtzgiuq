'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Crown, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { getPredicted, type PredictedPageData, type PredictedSeries } from '@/lib/api/predicted';
import { getMyPro } from '@/lib/api/pro';
import {
  PREDICTED_PAGE_HREF,
  setAction,
  setBadges,
  setSubLine,
  upgradeHref,
  type PredictedSetSummary,
  type SetActionVariant,
} from '@/lib/predicted';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0F2F7] dark:focus-visible:ring-offset-gray-900';

const VENUE_TAB =
  'flex-shrink-0 min-h-11 px-5 rounded-full text-sm sm:text-base font-semibold border transition ' + FOCUS_RING;
const SUBJECT_CHIP = 'flex-shrink-0 min-h-10 px-4 rounded-xl text-sm font-medium border transition ' + FOCUS_RING;

const ACTION_CLASS: Record<SetActionVariant, string> = {
  dark: 'bg-gray-900 text-white hover:bg-gray-700 border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white dark:border-gray-100',
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:border-indigo-500',
  outline:
    'bg-white text-gray-800 hover:bg-gray-50 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:border-gray-600',
  unlock:
    'bg-white text-indigo-700 hover:bg-indigo-50 border-indigo-600 dark:bg-gray-800 dark:text-indigo-300 dark:hover:bg-indigo-900/30 dark:border-indigo-400',
};

/**
 * ผู้ใช้มีแพ็กเกจที่ยังใช้ได้ในสนามนี้ไหม (GET /pro/me) — guest / ล้ม → false
 * enabled = false (เช่น API บอก viewerHasPaidPlan มาแล้ว) → ไม่เรียก /pro/me
 */
function useHasPlanInVenue(userId: string | null, venueKey: string | null, enabled: boolean): boolean {
  const [state, setState] = useState<{ userId: string; venues: string[] } | null>(null);
  const fetchedFor = state?.userId ?? null;
  useEffect(() => {
    if (!userId || !enabled || fetchedFor === userId) return;
    const controller = new AbortController();
    getMyPro(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        const venues = items
          .filter((i) => i.status !== 'expired' && i.status !== 'revoked')
          .map((i) => i.venueKey);
        setState({ userId, venues });
      })
      .catch(() => {
        // เช็กไม่ได้ → แสดงแถบ Upgrade ไว้ก่อน
      });
    return () => controller.abort();
  }, [userId, enabled, fetchedFor]);
  return !!userId && !!venueKey && state?.userId === userId && state.venues.includes(venueKey);
}

function SetRow({
  set,
  displayNo,
  venueKey,
  seriesTitle,
}: {
  set: PredictedSetSummary;
  /** เลขที่ผู้ใช้เห็น = ลำดับในรายการที่แสดง (setNo อาจเว้นช่วงเมื่อมีชุดที่ไม่แสดงคั่น) */
  displayNo: number;
  venueKey: string | null;
  seriesTitle: string;
}) {
  const badges = setBadges(set);
  const action = setAction(set, venueKey);
  const draft = set.status === 'draft';
  const setLabel = `ชุดที่ ${displayNo.toLocaleString('th-TH')}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3.5" data-testid="predicted-set-row">
      <div className="flex-1 min-w-[8.5rem]">
        <p className="font-semibold text-gray-900 dark:text-gray-100" title={set.title || undefined}>
          {setLabel}
        </p>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{setSubLine(set)}</p>
      </div>
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        {draft && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            ฉบับร่าง
          </span>
        )}
        {badges.includes('preview') && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            Preview
          </span>
        )}
        {badges.includes('pro') && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <Crown className="w-3 h-3" aria-hidden="true" />
            Pro
          </span>
        )}
        {action && (
          <Link
            href={action.href}
            aria-label={`${action.label} ${seriesTitle} ${setLabel}`}
            className={`inline-flex items-center justify-center min-h-10 min-w-[5.5rem] px-4 rounded-xl border text-sm font-bold transition ${FOCUS_RING} ${ACTION_CLASS[action.variant]}`}
          >
            {action.label}
          </Link>
        )}
      </div>
    </li>
  );
}

function SeriesCard({ series, venueKey }: { series: PredictedSeries; venueKey: string | null }) {
  const headingId = `predicted-series-${series.id}`;
  const meta = [series.subject?.name, `${series.sets.length.toLocaleString('th-TH')} ชุด`].filter(Boolean).join(' · ');
  return (
    <article
      aria-labelledby={headingId}
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden min-w-0"
    >
      <header className="flex items-start gap-3 px-4 sm:px-6 py-4 sm:py-5 bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
        <span
          aria-hidden="true"
          className="mt-1.5 w-3 h-3 rounded-full flex-shrink-0 bg-indigo-600 dark:bg-indigo-400"
          style={series.color ? { backgroundColor: series.color } : undefined}
        />
        <div className="min-w-0">
          <h2 id={headingId} className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-gray-100 break-words">
            {series.title}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{meta}</p>
          {series.description && (
            <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{series.description}</p>
          )}
        </div>
      </header>
      {series.sets.length === 0 ? (
        <p className="px-4 sm:px-6 py-6 text-sm text-gray-500 dark:text-gray-400">ยังไม่มีชุดในซีรีส์นี้</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {series.sets.map((set, index) => (
            <SetRow key={set.examId} set={set} displayNo={index + 1} venueKey={venueKey} seriesTitle={series.title} />
          ))}
        </ul>
      )}
    </article>
  );
}

/** หน้า Predicted Exam (/dashboard/predicted) — สนามใน ?venue= วิชาใน ?subject= (task 22) */
export default function PredictedExamList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueParam = searchParams?.get('venue') ?? '';
  const subject = searchParams?.get('subject') ?? '';
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [reloadKey, setReloadKey] = useState(0);
  // viewerAccess / myProgress ขึ้นกับบัญชี จึงโหลดใหม่เมื่อผู้ใช้เปลี่ยน — key ไม่ตรง = กำลังโหลด
  const requestKey = `${venueParam}|${subject}|${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: PredictedPageData | null; error: boolean } | null>(null);
  // แท็บ/ชิปชุดล่าสุดที่โหลดได้ — คงไว้ระหว่างโหลดสนาม/วิชาใหม่ (แถบไม่กระพริบหาย)
  const [lastData, setLastData] = useState<PredictedPageData | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;
  const error = !loading && result.error;

  useEffect(() => {
    const controller = new AbortController();
    getPredicted({ venue: venueParam || undefined, subject: subject || undefined }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, data: res, error: false });
        setLastData(res);
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load predicted exams:', err);
        setResult({ key: requestKey, data: null, error: true });
      });
    return () => controller.abort();
  }, [venueParam, subject, requestKey]);

  const shown = data ?? lastData;
  const venues = shown?.venues ?? [];
  // สนามที่แสดงอยู่: ใน URL → ที่ API บอก → สนามของซีรีส์แรก → แท็บแรก
  const activeVenue =
    venueParam || shown?.venue || shown?.series.find((s) => s.venueKey)?.venueKey || venues[0]?.key || null;
  const tabs = [...venues];
  if (venueParam && !tabs.some((t) => t.key === venueParam)) tabs.push({ key: venueParam, name: venueParam.toUpperCase() });
  const subjects = shown?.subjects ?? [];
  // "ทั้งหมด N ชุด": total อาจเป็นจำนวนหลังกรองวิชา → ใช้ค่าที่มากกว่าระหว่าง total กับผลรวมของชิปวิชา
  const allCount = Math.max(shown?.total ?? 0, subjects.reduce((sum, s) => sum + s.count, 0));
  // API บอกสถานะแพ็กเกจมาแล้ว (boolean) → ไม่ต้องเรียก /pro/me ซ้ำ
  const hasPlan = useHasPlanInVenue(userId, activeVenue, !!data && typeof data.viewerHasPaidPlan !== 'boolean');
  const showUpgrade = !!data && data.series.length > 0 && !(data.viewerHasPaidPlan ?? hasPlan);

  function updateQuery(next: { venue?: string; subject?: string }) {
    const params = new URLSearchParams();
    const v = next.venue ?? venueParam;
    // เปลี่ยนสนาม → ล้างวิชา (วิชาเป็นของสนาม)
    const s = next.venue !== undefined ? next.subject ?? '' : next.subject ?? subject;
    if (v) params.set('venue', v);
    if (s) params.set('subject', s);
    const query = params.toString();
    router.replace(`${pathname ?? PREDICTED_PAGE_HREF}${query ? `?${query}` : ''}`, { scroll: false });
  }

  return (
    <FadeIn>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Dashboard / <span className="text-gray-700 dark:text-gray-300 font-medium">Predicted Exam</span>
      </p>

      <div className="mb-5 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100">Predicted Exam</h1>
        </div>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          ข้อสอบจำลองตามแนวข้อสอบรอบหน้า เลือกสนามสอบ จะเห็นทุกวิชาพร้อมกัน หรือกดเลือกวิชา
        </p>
      </div>

      {/* แท็บสนาม — มือถือเลื่อนแนวนอนในกล่องตัวเอง (หน้าไม่ล้น) */}
      {tabs.length > 0 && (
        <div
          role="group"
          aria-label="เลือกสนามสอบ"
          className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 sm:gap-3 overflow-x-auto pb-2 md:flex-wrap"
        >
          {tabs.map((t) => {
            const active = activeVenue === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => updateQuery({ venue: t.key })}
                className={`${VENUE_TAB} ${
                  active
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm dark:bg-indigo-500 dark:border-indigo-500'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:border-indigo-600'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ชิปวิชา */}
      {shown && (subjects.length > 0 || subject) && (
        <div
          role="group"
          aria-label="เลือกวิชา"
          className="-mx-4 px-4 md:mx-0 md:px-0 mt-3 flex gap-2 overflow-x-auto pb-2 md:flex-wrap"
        >
          {[{ id: '', name: 'ทั้งหมด', count: allCount }, ...subjects].map((s) => {
            const active = subject === s.id;
            return (
              <button
                key={s.id || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => updateQuery({ subject: s.id })}
                className={`${SUBJECT_CHIP} ${
                  active
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-400 dark:text-indigo-200'
                    : 'bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <span className="font-semibold">{s.name}</span>
                {!s.id && ' '}
                {!s.id && (
                  <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {s.count.toLocaleString('th-TH')} ชุด
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="กำลังโหลด">
            <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          </div>
        ) : error || !data ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-20 px-4 text-center">
            <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">โหลดชุด Predicted Exam ไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : data.series.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-20 px-4 text-center">
            <Sparkles className="w-14 h-14 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              {subject ? 'ยังไม่มีชุด Predicted Exam ของวิชานี้' : 'ยังไม่มีชุด Predicted Exam ในสนามสอบนี้'}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ทีมวิชาการกำลังเตรียมชุดใหม่ ลองดูสนามสอบอื่นก่อนได้</p>
            {subject && (
              <button
                type="button"
                onClick={() => updateQuery({ subject: '' })}
                className="mt-3 min-h-11 px-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                ดูทุกวิชา
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" data-testid="predicted-series-grid">
            {data.series.map((series) => (
              <SeriesCard key={series.id} series={series} venueKey={series.venueKey ?? activeVenue} />
            ))}
          </div>
        )}
      </div>

      {/* แถบล่าง: ชวน Upgrade — ซ่อนเมื่อผู้ใช้มีแพ็กเกจในสนามนี้แล้ว */}
      {showUpgrade && (
        <aside
          aria-label="Upgrade เป็น Pro"
          className="mt-8 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm sm:text-base text-indigo-900 dark:text-indigo-100 min-w-0">
            <Crown className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
            <span>Preview ดูได้บางส่วน Upgrade เป็น Pro เพื่อ Unlock ทำได้ทั้งชุด ทุกชุด ทุกสนามสอบ</span>
          </p>
          <Link
            href={upgradeHref(activeVenue)}
            className="flex-shrink-0 inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Upgrade เป็น Pro
          </Link>
        </aside>
      )}
    </FadeIn>
  );
}
