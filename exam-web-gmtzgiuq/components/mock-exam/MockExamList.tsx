'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronDown, ClipboardCheck, Crown, Loader2, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { getAllMockExams, MOCK_EXAM_SORTS, type MockExamSort, type MockExamSummary } from '@/lib/api/exams';
import { getProUpgrade } from '@/lib/api/pro';
import { formatFreeMockSummary, groupMockExams, SORT_LABELS } from '@/lib/free-mock';
import MockExamCard from './MockExamCard';

const DEFAULT_SORT: MockExamSort = 'recommended';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function parseSort(value: string | null | undefined): MockExamSort {
  return MOCK_EXAM_SORTS.includes(value as MockExamSort) ? (value as MockExamSort) : DEFAULT_SORT;
}

interface VenueTab {
  key: string;
  name: string;
}

const PILL_BASE =
  'flex-shrink-0 min-h-11 px-5 rounded-full text-sm font-semibold border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0F2F7] dark:focus-visible:ring-offset-gray-900';

function GroupSection({
  id,
  title,
  description,
  items,
}: {
  id: string;
  title: string;
  description: string;
  items: MockExamSummary[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 id={`${id}-heading`} className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5" data-testid={`${id}-grid`}>
        {items.map((exam) => (
          <MockExamCard key={exam.id} exam={exam} />
        ))}
      </div>
    </section>
  );
}

/** หน้ารายการ Free Mock Exam (/dashboard/mock-exams) — สนามเก็บใน ?venue= ตัวเรียงใน ?sort= (task 21) */
export default function MockExamList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venue = searchParams?.get('venue') ?? '';
  const sort = parseSort(searchParams?.get('sort'));
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [venues, setVenues] = useState<VenueTab[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // myProgress / access ขึ้นกับบัญชี จึงโหลดใหม่เมื่อผู้ใช้เปลี่ยน — key ไม่ตรง = กำลังโหลด
  const requestKey = `${venue}|${sort}|${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; items: MockExamSummary[] | null; error: boolean } | null>(
    null,
  );
  const loading = result?.key !== requestKey;
  const items = loading ? null : result.items;
  const error = !loading && result.error;

  // แท็บสนาม = สนามที่เปิดอยู่บนหน้า /upgrade (ชุดมี venueKey เฉพาะสนามที่ active) โหลดครั้งเดียว
  useEffect(() => {
    const controller = new AbortController();
    getProUpgrade(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setVenues(data.venues.map((v) => ({ key: v.key, name: v.name })));
      })
      .catch((err) => {
        if (!isAbortError(err)) console.error('Failed to load venues:', err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAllMockExams({ sort, venue: venue || undefined }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, items: res, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load mock exams:', err);
        setResult({ key: requestKey, items: null, error: true });
      });
    return () => controller.abort();
  }, [venue, sort, requestKey]);

  function updateQuery(next: { venue?: string; sort?: MockExamSort }) {
    const params = new URLSearchParams();
    const v = next.venue ?? venue;
    const s = next.sort ?? sort;
    if (v) params.set('venue', v);
    if (s !== DEFAULT_SORT) params.set('sort', s);
    const query = params.toString();
    router.replace(`${pathname ?? '/dashboard/mock-exams'}${query ? `?${query}` : ''}`, { scroll: false });
  }

  // สนามใน URL ที่ไม่อยู่ในรายการ (ลิงก์เก่า / โหลดสนามไม่สำเร็จ) ยังต้องมีแท็บ
  const tabs: VenueTab[] = [...venues];
  if (venue && !tabs.some((t) => t.key === venue)) tabs.push({ key: venue, name: venue.toUpperCase() });

  const groups = items ? groupMockExams(items) : null;
  const isEmpty = !!groups && groups.campaigns.length + groups.free.length === 0;

  return (
    <FadeIn>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Dashboard / <span className="text-gray-700 dark:text-gray-300 font-medium">Free Mock Exam</span>
      </p>

      <div className="mb-5 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardCheck className="w-7 h-7 text-indigo-600 dark:text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100">Free Mock Exam</h1>
        </div>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          ข้อสอบจำลองฟรี จัดทำโดยทีมวิชาการ LUMO EXAM
        </p>
      </div>

      {/* แท็บสนาม — มือถือเลื่อนแนวนอนในกล่องตัวเอง (หน้าไม่ล้น) */}
      <div
        role="group"
        aria-label="เลือกสนามสอบ"
        className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-2 md:flex-wrap"
      >
        {[{ key: '', name: 'ทั้งหมด' }, ...tabs].map((t) => {
          const active = venue === t.key;
          return (
            <button
              key={t.key || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => updateQuery({ venue: t.key })}
              className={`${PILL_BASE} ${
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

      <div className="mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite" data-testid="mock-summary">
          {groups ? formatFreeMockSummary(groups) : ' '}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="mock-exam-sort" className="text-sm text-gray-600 dark:text-gray-400">
            เรียงโดย
          </label>
          <div className="relative">
            <select
              id="mock-exam-sort"
              value={sort}
              onChange={(e) => updateQuery({ sort: parseSort(e.target.value) })}
              className="appearance-none min-h-11 pl-4 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-full text-sm text-gray-800 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 transition cursor-pointer"
            >
              {MOCK_EXAM_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24" role="status" aria-label="กำลังโหลด">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" />
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-20 px-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">โหลดชุด Free Mock Exam ไม่สำเร็จ</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            ลองใหม่
          </button>
        </div>
      ) : isEmpty || !groups ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-20 px-4 text-center">
          <ClipboardCheck className="w-14 h-14 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            {venue ? 'ยังไม่มีชุด Free Mock Exam ในสนามสอบนี้' : 'ยังไม่มีชุด Free Mock Exam'}
          </p>
          {venue && (
            <button
              type="button"
              onClick={() => updateQuery({ venue: '' })}
              className="mt-3 min-h-11 px-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ดูทุกสนามสอบ
            </button>
          )}
        </div>
      ) : (
        <>
          <GroupSection
            id="mock-campaigns"
            title="แคมเปญ"
            description="ชุดฟรีที่เปิดเป็นช่วงเวลา สถานะ: กำลังเปิด / เร็ว ๆ นี้ / จบแล้ว"
            items={groups.campaigns}
          />
          <GroupSection
            id="mock-free"
            title="ชุดฟรีทั่วไป"
            description="ทำได้ตลอด ไม่จำกัดช่วงเวลา"
            items={groups.free}
          />
        </>
      )}

      {/* แถบล่าง: ชวนดูชุดเพิ่มในหน้า Predicted Exam (task 22) */}
      <aside
        aria-label="ชุดข้อสอบเพิ่มเติม"
        className="mt-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
      >
        <p className="flex items-start gap-2 text-sm sm:text-base text-indigo-900 dark:text-indigo-100 min-w-0">
          <Crown className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
          <span>อยากได้ชุดเพิ่มทุกชุด ทุกวิชา? ลองชุด Predicted Exam ข้อสอบจำลองตามแนวข้อสอบรอบหน้า</span>
        </p>
        <Link
          href="/dashboard/predicted"
          className="flex-shrink-0 inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          ดู Predicted Exam
        </Link>
      </aside>
    </FadeIn>
  );
}
