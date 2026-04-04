'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Clock,
  Trophy,
  BookOpen,
  TrendingUp,
  Target,
  Loader2,
} from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import FadeIn from '@/components/animations/FadeIn';
import { getAdminUser, type UserProfile } from '@/lib/api/users';
import {
  getAdminUserAttempts,
  type PaginatedAttempts,
} from '@/lib/api/attempts';
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

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [attempts, setAttempts] = useState<PaginatedAttempts | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInitial() {
      try {
        const [u, a] = await Promise.all([
          getAdminUser(userId).catch(() => null),
          getAdminUserAttempts(userId, { page: 1, limit: 15 }).catch(
            () => null,
          ),
        ]);
        setUser(u);
        setAttempts(a);
      } catch (err) {
        console.error('Failed to load user data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [userId]);

  const fetchAttempts = useCallback(async () => {
    try {
      const result = await getAdminUserAttempts(userId, {
        page: currentPage,
        limit: 15,
      });
      setAttempts(result);
    } catch (err) {
      console.error('Failed to fetch attempts:', err);
    }
  }, [userId, currentPage]);

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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center py-20">
          <p className="text-gray-500">ไม่พบผู้ใช้</p>
          <Link
            href="/admin/users"
            className="text-indigo-600 hover:underline mt-2 inline-block"
          >
            กลับไปรายชื่อผู้ใช้
          </Link>
        </div>
      </div>
    );
  }

  // Calculate stats from attempts
  const allAttempts = attempts?.items || [];
  const totalAttempts = attempts?.total || 0;
  const avgScore =
    allAttempts.length > 0
      ? allAttempts.reduce((sum, a) => sum + Number(a.score), 0) /
        allAttempts.length
      : 0;
  const bestScore =
    allAttempts.length > 0
      ? Math.max(...allAttempts.map((a) => Number(a.score)))
      : 0;
  const totalTime = allAttempts.reduce((sum, a) => sum + (a.totalTime || 0), 0);

  // Category breakdown from visible attempts
  const categoryMap = new Map<
    string,
    { attempts: number; totalScore: number }
  >();
  allAttempts.forEach((a) => {
    const existing = categoryMap.get(a.category) || {
      attempts: 0,
      totalScore: 0,
    };
    existing.attempts++;
    existing.totalScore += Number(a.score);
    categoryMap.set(a.category, existing);
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <FadeIn>
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปรายชื่อผู้ใช้
            </Link>
          </div>

          {/* User Profile Card */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-start gap-4">
              <UserAvatar avatar={user.avatar} name={user.firstName} email={user.email} size={64} />
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900">
                  {user.firstName
                    ? `${user.firstName} ${user.lastName || ''}`
                    : user.email.split('@')[0]}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {user.email}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      user.role?.toLowerCase() === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    {user.role?.toLowerCase() === 'admin' ? 'Admin' : 'User'}
                  </span>
                  <span className="text-xs text-gray-400">
                    สมัคร{' '}
                    {new Date(user.createdAt).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${user.provider === 'google' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}
                  >
                    {user.provider === 'google'
                      ? 'Google'
                      : 'Email'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-sm text-gray-500">ทำข้อสอบ</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {totalAttempts}{' '}
                <span className="text-sm font-normal text-gray-500">ครั้ง</span>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-yellow-600" />
                </div>
                <span className="text-sm text-gray-500">คะแนนเฉลี่ย</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {avgScore.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Trophy className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-sm text-gray-500">คะแนนสูงสุด</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {bestScore.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-500">เวลารวม</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTimeReadable(totalTime)}
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          {categoryMap.size > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                สถิติแยกหมวดหมู่
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from(categoryMap.entries()).map(([cat, data]) => (
                  <div
                    key={cat}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span>
                        {categoryIcons[cat as QuestionCategory]}
                      </span>
                      <span className="text-sm font-medium text-gray-700">
                        {categoryDisplayNames[cat as QuestionCategory] || cat}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">
                        {data.attempts} ครั้ง
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getScoreBadge(data.totalScore / data.attempts)}`}
                      >
                        {(data.totalScore / data.attempts).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attempts Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                ประวัติการสอบ
              </h2>
            </div>

            {!attempts || attempts.items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                ยังไม่มีประวัติการสอบ
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
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
                      {attempts.items.map((attempt) => (
                        <tr key={attempt.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {attempt.examId ? (
                              <Link
                                href={`/admin/attempts/exam/${attempt.examId}`}
                                className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                {attempt.examTitle}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-800">
                                {attempt.examTitle}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {categoryIcons[attempt.category as QuestionCategory]}{' '}
                              {categoryDisplayNames[
                                attempt.category as QuestionCategory
                              ] || attempt.category}
                            </span>
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
                              {new Date(
                                attempt.createdAt,
                              ).toLocaleDateString('th-TH', {
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
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
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
