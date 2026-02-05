'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getPublicQuestions,
  categoryDisplayNames,
  categoryIcons,
  difficultyDisplayNames,
  difficultyColors,
  type Question,
  type QuestionCategory,
  type QuestionDifficulty,
} from '@/lib/api/questions';
import {
  generateSessionId,
  shuffleArray,
  saveExamSession,
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

const difficulties: (QuestionDifficulty | 'all')[] = ['all', 'easy', 'medium', 'hard'];

export default function PracticePage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | 'all'>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<QuestionDifficulty | 'all'>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Check for existing session
  const [existingSession, setExistingSession] = useState<ExamSession | null>(null);

  useEffect(() => {
    const { session } = loadExamSession();
    if (session && session.status === 'in_progress') {
      setExistingSession(session);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof getPublicQuestions>[0] = {
        page,
        limit,
        search: search || undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        difficulty: selectedDifficulty === 'all' ? undefined : selectedDifficulty,
      };

      const result = await getPublicQuestions(params);
      setQuestions(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, selectedDifficulty]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, selectedDifficulty]);

  const handleStartExam = async (category: QuestionCategory) => {
    setStarting(category);
    try {
      const questionsForExam = await getPublicQuestions({
        category,
        limit: 50,
      });

      if (questionsForExam.items.length === 0) {
        alert('ไม่พบโจทย์ในหมวดหมู่นี้');
        setStarting(null);
        return;
      }

      const shuffled = shuffleArray(questionsForExam.items);
      const questionIds = shuffled.map((q) => q.id);

      const session: ExamSession = {
        id: generateSessionId(),
        category,
        questionIds,
        currentIndex: 0,
        answers: {},
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        status: 'in_progress',
      };

      saveExamSession(session, shuffled);
      router.push(`/practice/${category}/exam`);
    } catch (error) {
      console.error('Failed to start exam:', error);
      alert('ไม่สามารถเริ่มทำข้อสอบได้');
      setStarting(null);
    }
  };

  const handleResumeExam = () => {
    if (existingSession) {
      router.push(`/practice/${existingSession.category}/exam`);
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
                มีข้อสอบค้างอยู่ - {categoryDisplayNames[existingSession.category]}
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

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาโจทย์..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as QuestionCategory | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">ทุกหมวดหมู่</option>
              {categories.filter((c) => c !== 'all').map((cat) => (
                <option key={cat} value={cat}>
                  {categoryDisplayNames[cat as QuestionCategory]}
                </option>
              ))}
            </select>
          </div>

          {/* Difficulty filter */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value as QuestionDifficulty | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">ทุกระดับ</option>
            {difficulties.filter((d) => d !== 'all').map((diff) => (
              <option key={diff} value={diff}>
                {difficultyDisplayNames[diff as QuestionDifficulty]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick start buttons by category */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h3 className="font-medium text-gray-700 mb-3">เริ่มทำข้อสอบด่วน</h3>
        <div className="flex flex-wrap gap-2">
          {categories.filter((c) => c !== 'all').map((cat) => (
            <button
              key={cat}
              onClick={() => handleStartExam(cat as QuestionCategory)}
              disabled={starting !== null}
              className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition
                ${starting === cat
                  ? 'bg-indigo-100 border-indigo-300'
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                }
              `}
            >
              {starting === cat ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>{categoryIcons[cat as QuestionCategory]}</span>
              )}
              <span>{categoryDisplayNames[cat as QuestionCategory]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Questions list */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700">
              โจทย์ทั้งหมด ({total} ข้อ)
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-gray-500">กำลังโหลด...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            ไม่พบโจทย์ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {questions.map((question, index) => (
                <div key={question.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    <div className="text-sm text-gray-400 w-8">
                      {(page - 1) * limit + index + 1}.
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 mb-2 line-clamp-2">
                        <LatexText text={question.question} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-gray-100 rounded text-gray-600">
                          {categoryIcons[question.category]} {categoryDisplayNames[question.category]}
                        </span>
                        <span className={`px-2 py-1 rounded ${difficultyColors[question.difficulty]}`}>
                          {difficultyDisplayNames[question.difficulty]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  หน้า {page} จาก {totalPages}
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
    </div>
  );
}
