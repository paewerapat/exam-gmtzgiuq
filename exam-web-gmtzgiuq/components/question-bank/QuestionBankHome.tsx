'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, BarChart3, ChevronRight, Database, LogIn, Loader2, Mountain, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import {
  getQbVenueOverview,
  getQbVenues,
  type QbMode,
  type QbStats,
  type QbSubjectCard,
  type QbVenue,
  type QbVenueOverview,
} from '@/lib/api/question-bank';
import { QB_MODE_CONFIG, cardTextTone, lighten } from '@/lib/question-bank';
import { loginHref } from '@/lib/pro-payments';
import ChallengeProNotice from './ChallengeProNotice';
import WeeklyTrendChart from './WeeklyTrendChart';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0F2F7] dark:focus-visible:ring-offset-gray-900';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function CardShapes() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 400 200"
      fill="none"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
    >
      <circle cx="340" cy="60" r="90" fill="white" fillOpacity="0.12" />
      <rect x="250" y="110" width="130" height="130" rx="32" transform="rotate(20 315 175)" fill="white" fillOpacity="0.12" />
    </svg>
  );
}

function SubjectCard({ subject, href }: { subject: QbSubjectCard; href: string }) {
  const tone = cardTextTone(subject.color);
  const text = tone === 'light' ? 'text-white' : 'text-gray-900';
  const subText = tone === 'light' ? 'text-white/90' : 'text-gray-800';
  const track = tone === 'light' ? 'bg-white/30' : 'bg-gray-900/15';
  const fill = tone === 'light' ? 'bg-white' : 'bg-gray-900';
  const percent = Math.max(0, Math.min(100, Math.round(subject.percent)));
  return (
    <article
      className="relative overflow-hidden rounded-2xl p-5 sm:p-6 shadow-sm"
      style={{ background: `linear-gradient(120deg, ${subject.color}, ${lighten(subject.color)})` }}
    >
      <CardShapes />
      <div className="relative z-10 max-w-sm">
        <h3 className={`text-2xl font-extrabold break-words ${text}`}>{subject.label}</h3>
        <div className={`mt-3 flex items-center justify-between gap-3 text-sm font-medium ${subText}`}>
          <span>
            ทำแล้ว {subject.answered.toLocaleString('th-TH')} จาก {subject.total.toLocaleString('th-TH')} ข้อ
          </span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={`ความคืบหน้า ${subject.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={`mt-2 h-1.5 rounded-full overflow-hidden ${track}`}
        >
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
        </div>
        <Link
          href={href}
          aria-label={`เปิด ${subject.label}`}
          className="mt-5 inline-flex items-center gap-1 min-h-11 px-5 rounded-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-semibold shadow-sm hover:shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          เปิด
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function StatTiles({ stats, answeredLabel }: { stats: QbStats; answeredLabel: string }) {
  const tiles = [
    { label: answeredLabel, value: stats.answered.toLocaleString('th-TH') },
    { label: 'ความแม่นยำปัจจุบัน', value: stats.accuracy === null ? '-' : `${Math.round(stats.accuracy)}%` },
    { label: 'วันเรียนต่อเนื่อง', value: `${stats.streakDays.toLocaleString('th-TH')} วัน` },
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-700">
      {tiles.map((t) => (
        <div key={t.label} className="px-5 py-4 sm:py-5 min-w-0">
          <dt className="text-sm text-gray-500 dark:text-gray-400">{t.label}</dt>
          <dd className="mt-1 text-3xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** หน้า 1 ของ Question Bank / Challenge Questions: แท็บสนาม การ์ดวิชา และ Question Analytics (?venue=) */
export default function QuestionBankHome({ mode }: { mode: QbMode }) {
  const config = QB_MODE_CONFIG[mode];
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueParam = searchParams?.get('venue') ?? '';

  const [venuesReload, setVenuesReload] = useState(0);
  const venuesKey = `${mode}|${venuesReload}`;
  const [venuesResult, setVenuesResult] = useState<{ key: string; venues: QbVenue[] | null } | null>(null);
  const venuesLoading = venuesResult?.key !== venuesKey;
  const venues = venuesLoading ? null : venuesResult.venues;

  useEffect(() => {
    const controller = new AbortController();
    getQbVenues(mode, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setVenuesResult({ key: venuesKey, venues: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load question bank venues:', err);
        setVenuesResult({ key: venuesKey, venues: null });
      });
    return () => controller.abort();
  }, [mode, venuesKey]);

  const venue = venues ? (venues.find((v) => v.key === venueParam) ?? venues[0] ?? null) : null;
  const venueKey = venue?.key ?? '';

  // สถิติขึ้นกับบัญชี → โหลดใหม่เมื่อผู้ใช้เปลี่ยน
  const [overviewReload, setOverviewReload] = useState(0);
  const overviewKey = `${mode}|${venueKey}|${userId ?? ''}|${overviewReload}`;
  const [overviewResult, setOverviewResult] = useState<{ key: string; data: QbVenueOverview | null } | null>(null);
  const overviewLoading = !!venueKey && overviewResult?.key !== overviewKey;
  const overview = overviewResult?.key === overviewKey ? overviewResult.data : null;

  useEffect(() => {
    if (!venueKey) return;
    const controller = new AbortController();
    getQbVenueOverview(venueKey, mode, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setOverviewResult({ key: overviewKey, data: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load question bank venue:', err);
        setOverviewResult({ key: overviewKey, data: null });
      });
    return () => controller.abort();
  }, [mode, venueKey, overviewKey]);

  function selectVenue(key: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('venue', key);
    router.replace(`${pathname || config.basePath}?${params.toString()}`, { scroll: false });
  }

  const Icon = mode === 'challenge' ? Mountain : Database;
  const loginTarget = venueKey ? `${config.basePath}?venue=${encodeURIComponent(venueKey)}` : config.basePath;

  return (
    <FadeIn>
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 break-words">
              {config.title}
            </h1>
          </div>
          <p className="mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">{config.description}</p>
        </header>

        {venuesLoading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="กำลังโหลด">
            <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          </div>
        ) : venues === null ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-16 px-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">โหลดรายการสนามสอบไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => setVenuesReload((k) => k + 1)}
              className={`mt-4 inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition ${FOCUS_RING}`}
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : !venue ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-16 px-6 text-center">
            <Icon className="w-14 h-14 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">ยังไม่มีสนามสอบที่เปิดใน {config.title}</p>
          </div>
        ) : (
          <>
            {/* แท็บสนาม */}
            <div role="group" aria-label="เลือกสนามสอบ" className="flex flex-wrap gap-2 mb-5">
              {venues.map((v) => {
                const selected = v.key === venue.key;
                return (
                  <button
                    key={v.id || v.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectVenue(v.key)}
                    className={`min-h-11 px-5 rounded-full text-sm font-semibold transition ${FOCUS_RING} ${
                      selected
                        ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                        : 'bg-white text-gray-800 border border-gray-300 hover:border-indigo-400 hover:text-indigo-700 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:border-indigo-400 dark:hover:text-indigo-300'
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>

            {overviewLoading ? (
              <div className="flex items-center justify-center py-24" role="status" aria-label="กำลังโหลด">
                <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
              </div>
            ) : !overview ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-16 px-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
                <p className="text-gray-600 dark:text-gray-400 font-medium">โหลดข้อมูลสนาม {venue.name} ไม่สำเร็จ</p>
                <button
                  type="button"
                  onClick={() => setOverviewReload((k) => k + 1)}
                  className={`mt-4 inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition ${FOCUS_RING}`}
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  ลองใหม่
                </button>
              </div>
            ) : (
              <>
                {mode === 'challenge' && !overview.challengeUnlocked && (
                  <div className="mb-5">
                    <ChallengeProNotice venueKey={venue.key} venueName={overview.venue.name || venue.name} />
                  </div>
                )}

                {overview.subjects.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-16 px-6 text-center">
                    <Icon className="w-14 h-14 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">ยังไม่มีวิชาในสนามนี้</p>
                  </div>
                ) : (
                  <section aria-label={`วิชาใน ${venue.name}`} className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {overview.subjects.map((s) => (
                      <SubjectCard key={s.id} subject={s} href={`${config.basePath}/${s.id}`} />
                    ))}
                  </section>
                )}

                {/* Question Analytics */}
                <section aria-labelledby="qb-analytics-title" className="mt-10">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                      <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                    </span>
                    <h2 id="qb-analytics-title" className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-gray-100">
                      Question Analytics
                    </h2>
                  </div>

                  {overview.stats ? (
                    <div className="space-y-4">
                      <StatTiles stats={overview.stats} answeredLabel={config.answeredLabel} />
                      <WeeklyTrendChart weekly={overview.stats.weekly} />
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-6 py-10 text-center">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">เข้าสู่ระบบเพื่อดูสถิติการทำข้อของคุณ</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        ข้อที่ทำแล้ว ความแม่นยำ วันเรียนต่อเนื่อง และแนวโน้มรายสัปดาห์
                      </p>
                      <Link
                        href={loginHref(loginTarget)}
                        className={`mt-5 inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition ${FOCUS_RING}`}
                      >
                        <LogIn className="w-4 h-4" aria-hidden="true" />
                        เข้าสู่ระบบ
                      </Link>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </FadeIn>
  );
}
