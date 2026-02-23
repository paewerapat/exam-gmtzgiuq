'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { History, Loader2, Clock, BookOpen, PlayCircle } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getMyAttempts,
  getMyInProgressAttempts,
  type PaginatedAttempts,
  type ExamAttempt,
} from '@/lib/api/attempts';
import {
  categoryDisplayNames,
  categoryIcons,
  type QuestionCategory,
} from '@/lib/api/questions';
import { formatTimeReadable } from '@/lib/exam-utils';

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getScoreBadge(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function HistoryPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedAttempts | null>(null);
  const [loading, setLoading] = useState(true);
  const [inProgress, setInProgress] = useState<ExamAttempt[]>([]);

  const fetchAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const [result, ipAttempts] = await Promise.all([
        getMyAttempts({
          page: currentPage,
          limit: 10,
          category: selectedCategory === 'all' ? undefined : (selectedCategory as QuestionCategory),
        }),
        getMyInProgressAttempts().catch(() => []),
      ]);
      setData(result);
      setInProgress(ipAttempts);
    } catch (err) {
      console.error('Failed to fetch attempts:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedCategory]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  const categories = [
    { id: 'all', name: 'ทั้งหมด' },
    ...Object.entries(categoryDisplayNames).map(([key, name]) => ({
      id: key,
      name,
    })),
  ];

  return (
    <FadeIn>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-7 h-7 text-indigo-600" />
          ประวัติการสอบ
        </h1>
        <p className="text-gray-500 mt-1">
          ดูผลการทำข้อสอบย้อนหลัง{data ? ` (${data.total} รายการ)` : ''}
        </p>
      </div>

      {/* In-progress section */}
      {inProgress.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <PlayCircle className="w-4 h-4 text-indigo-500" />
            ข้อสอบที่กำลังทำอยู่
          </h2>
          <div className="space-y-2">
            {inProgress.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {attempt.examTitle}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ทำถึงข้อที่{' '}
                    <span className="font-semibold text-indigo-600">
                      {attempt.currentIndex + 1}
                    </span>{' '}
                    / {attempt.totalQuestions} ข้อ
                    {' · '}
                    {new Date(attempt.updatedAt).toLocaleDateString('th-TH', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {attempt.examId && (
                  <Link
                    href={`/practice/exam/${attempt.examId}`}
                    className="ml-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition flex-shrink-0"
                  >
                    <PlayCircle className="w-4 h-4" />
                    ทำต่อ
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-full transition ${
              selectedCategory === cat.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {cat.id !== 'all' && (
              <span className="mr-1">{categoryIcons[cat.id as QuestionCategory]}</span>
            )}
            {cat.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-gray-500">กำลังโหลด...</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">ยังไม่มีประวัติการสอบ</p>
            <p className="text-gray-400 text-sm mt-1">เริ่มทำข้อสอบเพื่อดูผลที่นี่</p>
            <Link
              href="/dashboard/practice"
              className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              ไปฝึกทำข้อสอบ
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    ชุดข้อสอบ
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    หมวดหมู่
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    คะแนน
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    ผลลัพธ์
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    เวลา
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    วันที่
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <Link
                        href={`/dashboard/history/${attempt.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {attempt.examTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600">
                        {categoryIcons[attempt.category as QuestionCategory]}{' '}
                        {categoryDisplayNames[attempt.category as QuestionCategory] || attempt.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-sm font-semibold ${getScoreBadge(Number(attempt.score))}`}>
                        {Number(attempt.score).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-gray-600">
                        {attempt.correctAnswers}/{attempt.totalQuestions}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-gray-500 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeReadable(attempt.totalTime)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-500">
                        {new Date(attempt.createdAt).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  หน้า {data.page} จาก {data.totalPages} (ทั้งหมด {data.total} รายการ)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={currentPage === data.totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </FadeIn>
  );
}
