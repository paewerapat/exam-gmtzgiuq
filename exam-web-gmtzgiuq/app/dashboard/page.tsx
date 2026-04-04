'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Trophy,
  Clock,
  Target,
  TrendingUp,
  ArrowRight,
  Loader2,
  History,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getMyStats,
  getMyAttempts,
  type UserAttemptStats,
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

export default function DashboardPage() {
  const [stats, setStats] = useState<UserAttemptStats | null>(null);
  const [recent, setRecent] = useState<PaginatedAttempts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('token');
    if (!hasToken) {
      setLoading(false);
      return;
    }
    async function loadData() {
      try {
        const [statsData, recentData] = await Promise.all([
          getMyStats(),
          getMyAttempts({ page: 1, limit: 5 }),
        ]);
        setStats(statsData);
        setRecent(recentData);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const hasData = stats && stats.totalAttempts > 0;

  return (
    <FadeIn>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">สรุปผลการเรียนรู้ของคุณ</p>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            ยังไม่มีประวัติการสอบ
          </h2>
          <p className="text-gray-500 mb-6">
            เริ่มทำข้อสอบเพื่อดูสถิติและผลการเรียนรู้ของคุณที่นี่
          </p>
          <Link
            href="/dashboard/practice"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <BookOpen className="w-5 h-5" />
            เริ่มฝึกทำข้อสอบ
          </Link>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-sm text-gray-500">ทำข้อสอบ</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {stats!.totalAttempts} <span className="text-sm font-normal text-gray-500">ครั้ง</span>
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
                {stats!.averageScore.toFixed(1)}%
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
                {stats!.bestScore.toFixed(1)}%
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
                {formatTimeReadable(stats!.totalTime)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category breakdown */}
            {stats!.byCategory.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  สถิติแยกหมวดหมู่
                </h2>
                <div className="space-y-3">
                  {stats!.byCategory.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span>{categoryIcons[cat.category as QuestionCategory]}</span>
                        <span className="text-sm font-medium text-gray-700">
                          {categoryDisplayNames[cat.category as QuestionCategory] || cat.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500">{cat.attempts} ครั้ง</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getScoreBadge(cat.averageScore)}`}>
                          {cat.averageScore.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent attempts */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  ทำข้อสอบล่าสุด
                </h2>
                <Link
                  href="/dashboard/history"
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  ดูทั้งหมด <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              {recent && recent.items.length > 0 ? (
                <div className="space-y-3">
                  {recent.items.map((attempt) => (
                    <Link
                      key={attempt.id}
                      href={`/dashboard/history/${attempt.id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {attempt.examTitle}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(attempt.createdAt).toLocaleDateString('th-TH', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-semibold ${getScoreBadge(Number(attempt.score))}`}>
                        {Number(attempt.score).toFixed(1)}%
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">ยังไม่มีประวัติ</p>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/practice"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              <BookOpen className="w-4 h-4" />
              ฝึกทำข้อสอบ
            </Link>
            <Link
              href="/dashboard/history"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
            >
              <History className="w-4 h-4" />
              ดูประวัติทั้งหมด
            </Link>
          </div>
        </>
      )}
    </FadeIn>
  );
}
