'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Play, Loader2, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import {
  categoryDisplayNames,
  categoryIcons,
  type QuestionCategory,
} from '@/lib/api/questions';
import { getPublicExams, type Exam } from '@/lib/api/exams';
import {
  loadExamSession,
  clearExamSession,
} from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';
import LatexText from '@/components/latex/LatexText';

const categories: (QuestionCategory | 'all')[] = [
  'all',
  'general_knowledge',
  'kor_por',
  'toeic',
  'gat_pat',
  'o_net',
  'mathematics',
  'english',
  'science',
  'driving_license',
];

export default function PracticePage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | 'all'>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;

  // Existing session
  const [existingSession, setExistingSession] = useState<ExamSession | null>(null);

  useEffect(() => {
    const { session } = loadExamSession();
    if (session && session.status === 'in_progress') {
      setExistingSession(session);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPublicExams({
        page,
        limit,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: debouncedSearch || undefined,
      });
      setExams(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedCategory]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategory]);

  const handleStartExam = (exam: Exam) => {
    router.push(`/practice/exam/${exam.id}`);
  };

  const handleResumeExam = () => {
    if (existingSession) {
      router.push(`/practice/exam/${existingSession.examId}`);
    }
  };

  const handleClearSession = () => {
    clearExamSession();
    setExistingSession(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ฝึกทำข้อสอบ</h1>

      {/* Resume session banner */}
      {existingSession && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-yellow-800">
                มีข้อสอบค้างอยู่ — <LatexText text={existingSession.examTitle} />
              </h3>
              <p className="text-sm text-yellow-700">
                ทำไปแล้ว {Object.keys(existingSession.answers).length} / {existingSession.questionIds.length} ข้อ
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleResumeExam}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                ทำต่อ
              </button>
              <button
                onClick={handleClearSession}
                className="px-4 py-2 border border-yellow-600 text-yellow-700 rounded-lg hover:bg-yellow-100"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Category filter */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชุดข้อสอบ..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'all' ? 'ทั้งหมด' : `${categoryIcons[cat]} ${categoryDisplayNames[cat]}`}
            </button>
          ))}
        </div>
      </div>

      {/* Exam cards */}
      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-gray-500">กำลังโหลด...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow-sm">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>ไม่พบชุดข้อสอบ</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {categoryIcons[exam.category as QuestionCategory]}{' '}
                      {categoryDisplayNames[exam.category as QuestionCategory] || exam.category}
                    </span>
                    <span className="text-xs text-gray-400">{exam.questionCount} ข้อ</span>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition">
                    <LatexText text={exam.title} />
                  </h3>

                  {exam.description && (
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                      <LatexText text={exam.description} />
                    </p>
                  )}

                  <button
                    onClick={() => handleStartExam(exam)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm"
                  >
                    <Play className="w-4 h-4" />
                    เริ่มทำข้อสอบ
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-500">
                หน้า {page} จาก {totalPages} (ทั้งหมด {total} ชุด)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
