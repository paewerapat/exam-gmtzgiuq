'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Users,
  Trophy,
  TrendingDown,
  Clock,
  Loader2,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminExamAttemptStats,
  getAdminAttempts,
  type ExamAttemptStats,
  type PaginatedAttempts,
} from '@/lib/api/attempts';
import { getAdminExam, type Exam } from '@/lib/api/exams';
import {
  categoryDisplayNames,
  categoryIcons,
  type QuestionCategory,
} from '@/lib/api/questions';
import { formatTimeReadable } from '@/lib/exam-utils';

function getScoreBadge(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function ExamAttemptStatsPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [exam, setExam] = useState<Exam | null>(null);
  const [stats, setStats] = useState<ExamAttemptStats | null>(null);
  const [attempts, setAttempts] = useState<PaginatedAttempts | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInitial() {
      try {
        const [e, s, a] = await Promise.all([
          getAdminExam(examId).catch(() => null),
          getAdminExamAttemptStats(examId).catch(() => null),
          getAdminAttempts({ examId, page: 1, limit: 15 }).catch(() => null),
        ]);
        setExam(e);
        setStats(s);
        setAttempts(a);
      } catch (err) {
        console.error('Failed to load exam stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [examId]);

  const fetchAttempts = useCallback(async () => {
    try {
      const result = await getAdminAttempts({
        examId,
        page: currentPage,
        limit: 15,
      });
      setAttempts(result);
    } catch (err) {
      console.error('Failed to fetch attempts:', err);
    }
  }, [examId, currentPage]);

  useEffect(() => {
    if (currentPage > 1) {
      fetchAttempts();
    }
  }, [currentPage, fetchAttempts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <FadeIn>
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/admin/attempts"
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปประวัติการสอบ
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {exam?.title || 'ข้อสอบ'}
            </h1>
            {exam && (
              <p className="text-gray-500 mt-1 flex items-center gap-2">
                <span>{categoryIcons[exam.category as QuestionCategory]}</span>
                {categoryDisplayNames[exam.category as QuestionCategory] || exam.category}
                {' '}&middot;{' '}
                {exam.questionCount || exam.questions?.length || 0} ข้อ
              </p>
            )}
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-500">ทำข้อสอบ</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {stats.totalAttempts} <span className="text-xs font-normal text-gray-400">ครั้ง</span>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-xs text-gray-500">ผู้เข้าสอบ</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {stats.uniqueUsers} <span className="text-xs font-normal text-gray-400">คน</span>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs text-gray-500">คะแนนเฉลี่ย</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {stats.averageScore.toFixed(1)}%
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-500">สูงสุด</span>
                </div>
                <div className="text-xl font-bold text-green-600">
                  {stats.highestScore.toFixed(1)}%
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-500">ต่ำสุด</span>
                </div>
                <div className="text-xl font-bold text-red-500">
                  {stats.lowestScore.toFixed(1)}%
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-gray-500">เวลาเฉลี่ย</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {formatTimeReadable(stats.averageTime)}
                </div>
              </div>
            </div>
          )}

          {/* Attempts Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">รายชื่อผู้เข้าสอบ</h2>
            </div>

            {!attempts || attempts.items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                ยังไม่มีผู้เข้าสอบ
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          #
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          ผู้สอบ
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
                      {attempts.items.map((attempt, index) => (
                        <tr key={attempt.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {(attempts.page - 1) * attempts.limit + index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {attempt.user?.name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {attempt.user?.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getScoreBadge(Number(attempt.score))}`}
                            >
                              {Number(attempt.score).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-600">
                              {attempt.correctAnswers}/{attempt.totalQuestions}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-gray-500 flex items-center justify-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeReadable(attempt.totalTime)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-500">
                              {new Date(attempt.createdAt).toLocaleDateString(
                                'th-TH',
                                {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {attempts.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      หน้า {attempts.page} จาก {attempts.totalPages} (ทั้งหมด{' '}
                      {attempts.total} รายการ)
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
                        onClick={() =>
                          setCurrentPage((p) =>
                            Math.min(attempts.totalPages, p + 1),
                          )
                        }
                        disabled={currentPage === attempts.totalPages}
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
      </div>
    </div>
  );
}
