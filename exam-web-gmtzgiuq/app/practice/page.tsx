'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronDown,
  PlayCircle,
  Loader2,
  BookOpen,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getPublicExams, type Exam } from '@/lib/api/exams';
import { getCategories, type Category } from '@/lib/api/categories';

// ── Category banner gradients ───────────────────────────────
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
      <circle cx="230" cy="20"  r="55" fill="white" fillOpacity="0.08" />
      <circle cx="260" cy="90"  r="38" fill="white" fillOpacity="0.06" />
      <circle cx="20"  cy="110" r="30" fill="white" fillOpacity="0.06" />
      <circle cx="-10" cy="20"  r="40" fill="white" fillOpacity="0.07" />
    </svg>
  );
}

// ── Exam card ───────────────────────────────────────────────
function ExamCard({ exam, categories }: { exam: Exam; categories: Category[] }) {
  const router = useRouter();
  const [from, to] = getBannerGradient(exam.category);
  const catName = categories.find((c) => c.slug === exam.category)?.name ?? exam.category;
  const createdDate = new Date(exam.createdAt).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });

  function handleStart(e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/practice/exam/${exam.id}`);
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Gradient banner */}
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

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-semibold text-gray-800 text-sm truncate">
          {catName}: {exam.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">
          {exam.questionCount} ข้อ · {createdDate}
        </p>
        <div className="mt-auto">
          <button
            onClick={handleStart}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full transition"
          >
            <PlayCircle className="w-4 h-4" />
            เริ่มทำข้อสอบ
          </button>
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
    { value: '', label: 'ทุกหมวดหมู่' },
    ...categories.map((c) => ({ value: c.slug, label: c.name })),
  ];
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? 'ทุกหมวดหมู่';

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
const LIMIT = 12;

export default function PublicPracticePage() {
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

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
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
    <div className="min-h-screen bg-gray-50">
      {/* Hero banner */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">ฝึกทำข้อสอบ</h1>
          <p className="text-indigo-200 text-sm md:text-base">
            เลือกชุดข้อสอบที่ต้องการฝึก · เข้าสู่ระบบเพื่อบันทึกคะแนนและติดตามพัฒนาการของคุณ
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <FadeIn>
          {/* Toolbar */}
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาข้อสอบ..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-11 pr-5 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                />
              </div>
              <CategoryDropdown value={category} onChange={handleCategory} categories={categories} />
            </div>

            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-gray-400">
                {data ? (
                  <>ข้อสอบทั้งหมด <span className="font-semibold text-gray-600">{data.total}</span> ชุด</>
                ) : null}
              </span>
              {(search || category) && (
                <button
                  onClick={() => { setSearch(''); setCategory(''); setPage(1); }}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="py-32 text-center">
              <BookOpen className="w-14 h-14 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">ไม่พบข้อสอบที่ตรงกับการค้นหา</p>
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
                &lt; ก่อนหน้า
              </button>
              {paginationPages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                    page === p
                      ? 'bg-indigo-600 text-white shadow-sm'
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
                ถัดไป &gt;
              </button>
            </div>
          )}
        </FadeIn>
      </div>
    </div>
  );
}
