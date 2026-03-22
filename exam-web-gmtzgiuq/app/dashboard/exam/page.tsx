'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronDown,
  PlayCircle,
  Loader2,
  BookOpen,
  Clock,
  GraduationCap,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getPublicExams, type Exam } from '@/lib/api/exams';
import { getCategories, type Category } from '@/lib/api/categories';
import { getMyInProgressAttempts, type ExamAttempt } from '@/lib/api/attempts';

// ── Category banner gradients ────────────────────────────────
const categoryGradients: Record<string, [string, string]> = {
  mathematics:       ['#FF6B35', '#F7931E'],
  science:           ['#11998e', '#43e97b'],
  english:           ['#4776E6', '#8E54E9'],
  toeic:             ['#f093fb', '#f5576c'],
  gat_pat:           ['#4facfe', '#00f2fe'],
  o_net:             ['#43e97b', '#38f9d7'],
  kor_por:           ['#fa709a', '#fee140'],
  general_knowledge: ['#a18cd1', '#fbc2eb'],
  driving_license:   ['#fccb90', '#d57eeb'],
};
const defaultGradient: [string, string] = ['#667eea', '#764ba2'];

function getBannerGradient(category: string): [string, string] {
  return categoryGradients[category] ?? defaultGradient;
}

function BannerShapes() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 280 140"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <circle cx="230" cy="20" r="55" fill="white" fillOpacity="0.08" />
      <circle cx="260" cy="90" r="38" fill="white" fillOpacity="0.06" />
      <circle cx="20" cy="110" r="30" fill="white" fillOpacity="0.06" />
      <circle cx="-10" cy="20" r="40" fill="white" fillOpacity="0.07" />
    </svg>
  );
}

// ── In-progress banner (real exam mode) ─────────────────────
function InProgressBanner({ attempts }: { attempts: ExamAttempt[] }) {
  const examAttempts = attempts.filter((a) => a.mode === 'exam');
  if (examAttempts.length === 0) return null;
  return (
    <div className="mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        <p className="text-sm font-semibold text-rose-700">
          คุณมีข้อสอบจริงที่ยังทำค้างอยู่ {examAttempts.length} ชุด
        </p>
      </div>
      <div className="space-y-2">
        {examAttempts.map((attempt) => (
          <div
            key={attempt.id}
            className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {attempt.examTitle}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ทำถึงข้อที่{' '}
                <span className="font-semibold text-rose-600">
                  {attempt.currentIndex + 1}
                </span>{' '}
                / {attempt.totalQuestions} ข้อ
              </p>
            </div>
            {attempt.examId && (
              <Link
                href={`/exam/${attempt.examId}`}
                className="ml-4 flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-full transition flex-shrink-0"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                ทำต่อ
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Exam card (links to /exam/[id]) ─────────────────────────
function ExamCard({ exam, categories }: { exam: Exam; categories: Category[] }) {
  const [from, to] = getBannerGradient(exam.category);
  const catName = categories.find((c) => c.slug === exam.category)?.name ?? exam.category;
  const createdDate = new Date(exam.createdAt).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div
        className="relative h-36 p-4 flex flex-col justify-between overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <BannerShapes />
        <span className="relative z-10 text-[11px] font-bold text-white/80 uppercase tracking-widest">
          {catName}
        </span>
        <h3 className="relative z-10 text-white font-bold text-base leading-snug line-clamp-2">
          {exam.title}
        </h3>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="font-semibold text-gray-800 text-sm truncate">
          {catName}: {exam.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">
          {exam.questionCount} ข้อ · {createdDate}
        </p>
        <div className="mt-auto">
          <Link
            href={`/exam/${exam.id}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-full transition"
          >
            <PlayCircle className="w-4 h-4" />
            เริ่มสอบจริง
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Category dropdown ────────────────────────────────────────
function CategoryDropdown({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { value: '', label: 'เลือกหมวดหมู่' },
    ...categories.map((c) => ({ value: c.slug, label: c.name })),
  ];
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? 'เลือกหมวดหมู่';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white rounded-full text-sm text-gray-600 hover:border-indigo-300 transition whitespace-nowrap"
      >
        {selectedLabel}
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 min-w-48">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-gray-50 ${
                value === opt.value
                  ? 'text-indigo-600 font-semibold bg-indigo-50'
                  : 'text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────
const LIMIT = 8;

function isLoggedIn() {
  return typeof window !== 'undefined' && !!localStorage.getItem('token');
}

export default function RealExamPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: Exam[];
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inProgress, setInProgress] = useState<ExamAttempt[]>([]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    getMyInProgressAttempts()
      .then(setInProgress)
      .catch(() => {});
  }, []);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPublicExams({
        page,
        limit: LIMIT,
        search: search || undefined,
        category: category || undefined,
      });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => {
    const t = setTimeout(fetchExams, 300);
    return () => clearTimeout(t);
  }, [fetchExams]);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  function handleCategory(v: string) {
    setCategory(v);
    setPage(1);
  }

  const totalPages = data?.totalPages ?? 1;
  const paginationPages: number[] = [];
  const rangeStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const rangeEnd = Math.min(totalPages, rangeStart + 4);
  for (let i = rangeStart; i <= rangeEnd; i++) paginationPages.push(i);

  return (
    <FadeIn>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-400">
          Dashboard /{' '}
          <span className="text-gray-600 font-medium">ทำข้อสอบจริง</span>
        </p>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <GraduationCap className="w-7 h-7 text-rose-600" />
        <h1 className="text-3xl font-bold text-gray-900">ทำข้อสอบจริง</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        ไม่มีคำใบ้ ไม่มีการตรวจคำตอบระหว่างทำ เหมือนสอบจริง
      </p>

      {/* In-progress banner */}
      <InProgressBanner attempts={inProgress} />

      {/* White card container */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาข้อสอบ..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-11 pr-5 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent transition"
            />
          </div>
          <CategoryDropdown value={category} onChange={handleCategory} categories={categories} />
        </div>

        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-gray-500">
            {data ? (
              <>
                ข้อสอบทั้งหมด{' '}
                <span className="font-semibold text-gray-700">{data.total}</span>{' '}
                ชุด
              </>
            ) : null}
          </span>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-9 h-9 animate-spin text-rose-500" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">ไม่พบข้อสอบที่ตรงกับการค้นหา</p>
            {(search || category) && (
              <button
                onClick={() => {
                  setSearch('');
                  setCategory('');
                  setPage(1);
                }}
                className="mt-3 text-sm text-rose-600 hover:underline"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {data.items.map((exam) => (
              <ExamCard key={exam.id} exam={exam} categories={categories} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && totalPages > 1 && !loading && (
          <div className="flex items-center justify-center gap-1 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              &lt; Previous
            </button>
            {paginationPages.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                  page === p
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next &gt;
            </button>
          </div>
        )}
      </div>
    </FadeIn>
  );
}
