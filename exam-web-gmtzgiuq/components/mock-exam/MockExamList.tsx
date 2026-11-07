'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronDown, ClipboardCheck, Loader2, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getMockExamCategories,
  getMockExams,
  type MockExamCategory,
  type PaginatedMockExams,
} from '@/lib/api/exams';
import MockExamCard from './MockExamCard';

const LIMIT = 12;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** หน้ารายการ Mock Exam (/dashboard/mock-exams) — สนามสอบที่เลือกเก็บใน ?category= */
export default function MockExamList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams?.get('category') ?? '';

  const [mockCategories, setMockCategories] = useState<MockExamCategory[]>([]);
  // หน้าผูกกับสนามสอบ: เปลี่ยนสนามสอบ (รวมกด back/forward) → กลับหน้า 1
  const [pageState, setPageState] = useState({ category, page: 1 });
  const page = pageState.category === category ? pageState.page : 1;
  const [reloadKey, setReloadKey] = useState(0);
  // ผลของคำขอล่าสุด ผูกกับ key ของคำขอ — key ไม่ตรง = กำลังโหลด
  const requestKey = `${category}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    data: PaginatedMockExams | null;
    error: boolean;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;
  const error = !loading && result.error;

  // รายชื่อสนามสอบ (name แสดง / slug ใช้กรอง) โหลดครั้งเดียว
  useEffect(() => {
    const controller = new AbortController();
    getMockExamCategories(controller.signal)
      .then(setMockCategories)
      .catch((err) => {
        if (!isAbortError(err)) console.error('Failed to load mock categories:', err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMockExams({ category: category || undefined, page, limit: LIMIT }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load mock exams:', err);
        setResult({ key: requestKey, data: null, error: true });
      });
    return () => controller.abort();
  }, [category, page, requestKey]);

  function handleCategoryChange(value: string) {
    setPageState({ category: value, page: 1 });
    const query = value ? `?category=${encodeURIComponent(value)}` : '';
    router.replace(`${pathname ?? '/dashboard/mock-exams'}${query}`, { scroll: false });
  }

  // สนามสอบใน URL ที่ไม่อยู่ในรายการ (เช่นลิงก์เก่า) ยังต้องแสดงในดรอปดาวน์
  const options = [...mockCategories];
  if (category && !options.some((c) => c.slug === category)) {
    options.push({ name: category, slug: category, count: 0 });
  }

  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const paginationPages: number[] = [];
  const rangeStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const rangeEnd = Math.min(totalPages, rangeStart + 4);
  for (let i = rangeStart; i <= rangeEnd; i++) paginationPages.push(i);
  const goToPage = (p: number) => setPageState({ category, page: p });

  return (
    <FadeIn>
      <p className="text-sm text-gray-400 mb-6">
        Dashboard / <span className="text-gray-600 dark:text-gray-400 font-medium">Mock Exam</span>
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <ClipboardCheck className="w-7 h-7 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Mock Exam</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ชุดข้อสอบเสมือนจริง จับเวลาเหมือนวันสอบ เลือกสนามสอบที่ต้องการได้เลย
          </p>
        </div>

        <div className="w-full sm:w-auto sm:min-w-56">
          <label htmlFor="mock-exam-category" className="sr-only">
            เลือกสนามสอบ
          </label>
          <div className="relative">
            <select
              id="mock-exam-category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full appearance-none pl-5 pr-10 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 transition cursor-pointer"
            >
              <option value="">เลือกสนามสอบ: ทั้งหมด</option>
              {options.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {`${c.name}${c.count > 0 ? ` (${c.count})` : ''}`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
        {!loading && !error && data && data.items.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            ทั้งหมด <span className="font-semibold text-gray-700 dark:text-gray-300">{data.total}</span> ชุด
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="กำลังโหลด">
            <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" />
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">โหลดชุด Mock Exam ไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition"
            >
              <RotateCcw className="w-4 h-4" />
              ลองใหม่
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardCheck className="w-14 h-14 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              {category ? 'ยังไม่มีชุด Mock Exam ในสนามสอบนี้' : 'ยังไม่มีชุด Mock Exam'}
            </p>
            {category && (
              <button
                type="button"
                onClick={() => handleCategoryChange('')}
                className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                ดูทุกสนามสอบ
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-testid="mock-exam-grid">
            {data.items.map((exam) => (
              <MockExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        )}

        {!loading && !error && data && totalPages > 1 && (
          <nav aria-label="เลือกหน้า" className="flex flex-wrap items-center justify-center gap-1 pt-6">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 sm:px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              &lt; ก่อนหน้า
            </button>
            {paginationPages.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => goToPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                  page === p
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 sm:px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ถัดไป &gt;
            </button>
          </nav>
        )}
      </div>
    </FadeIn>
  );
}
