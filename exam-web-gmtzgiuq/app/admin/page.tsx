'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Users,
  Trophy,
  TrendingUp,
  BarChart3,
  ClipboardList,
  Plus,
  Loader2,
  ArrowRight,
  Clock,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAttemptStats,
  getAdminAttempts,
  type AttemptStats,
  type PaginatedAttempts,
} from '@/lib/api/attempts';
import { getExamStats, type ExamStats } from '@/lib/api/exams';
import {
  categoryDisplayNames,
  categoryIcons,
  type QuestionCategory,
} from '@/lib/api/questions';

function getScoreBadge(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function AdminDashboard() {
  const [attemptStats, setAttemptStats] = useState<AttemptStats | null>(null);
  const [examStats, setExamStats] = useState<ExamStats | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<PaginatedAttempts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [aStats, eStats, recent] = await Promise.all([
          getAttemptStats().catch(() => null),
          getExamStats().catch(() => null),
          getAdminAttempts({ page: 1, limit: 10 }).catch(() => null),
        ]);
        setAttemptStats(aStats);
        setExamStats(eStats);
        setRecentAttempts(recent);
      } catch (err) {
        console.error('Failed to load admin data:', err);
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

  return (
    <FadeIn>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">ภาพรวมระบบข้อสอบ</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">สอบทั้งหมด</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {attemptStats?.totalAttempts || 0} <span className="text-sm font-normal text-gray-500">ครั้ง</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
            <span className="text-sm text-gray-500">คะแนนเฉลี่ย</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(attemptStats?.averageScore || 0).toFixed(1)}%
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">ผู้ใช้ที่สอบ</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {attemptStats?.uniqueUsers || 0} <span className="text-sm font-normal text-gray-500">คน</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">ชุดข้อสอบ</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {examStats?.total || 0} <span className="text-sm font-normal text-gray-500">ชุด</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            เผยแพร่ {examStats?.published || 0} | แบบร่าง {examStats?.draft || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Category stats */}
        {attemptStats && attemptStats.byCategory.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              สถิติแยกหมวดหมู่
            </h2>
            <div className="space-y-3">
              {attemptStats.byCategory.map((cat) => (
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
                      เฉลี่ย {cat.averageScore.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/admin/exams/new"
              className="flex items-center p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
            >
              <Plus className="w-8 h-8 text-indigo-600 mr-4" />
              <div>
                <p className="font-medium text-gray-900">สร้างชุดข้อสอบ</p>
                <p className="text-sm text-gray-600">สร้างชุดข้อสอบใหม่พร้อมคำถาม</p>
              </div>
            </Link>
            <Link
              href="/admin/exams"
              className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition"
            >
              <ClipboardList className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <p className="font-medium text-gray-900">จัดการข้อสอบ</p>
                <p className="text-sm text-gray-600">แก้ไข เผยแพร่ หรือลบชุดข้อสอบ</p>
              </div>
            </Link>
            <Link
              href="/admin/attempts"
              className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
            >
              <BarChart3 className="w-8 h-8 text-purple-600 mr-4" />
              <div>
                <p className="font-medium text-gray-900">ดูประวัติการสอบ</p>
                <p className="text-sm text-gray-600">ดูผลการทำข้อสอบของผู้ใช้ทุกคน</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent attempts */}
      {recentAttempts && recentAttempts.items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              การสอบล่าสุด
            </h2>
            <Link
              href="/admin/attempts"
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              ดูทั้งหมด <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">ผู้สอบ</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">ชุดข้อสอบ</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">คะแนน</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">ผลลัพธ์</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentAttempts.items.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{attempt.user?.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{attempt.user?.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {attempt.examId ? (
                        <Link
                          href={`/admin/attempts/exam/${attempt.examId}`}
                          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {attempt.examTitle}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-800">{attempt.examTitle}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getScoreBadge(Number(attempt.score))}`}>
                        {Number(attempt.score).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">{attempt.correctAnswers}/{attempt.totalQuestions}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">
                        {new Date(attempt.createdAt).toLocaleDateString('th-TH', {
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
        </div>
      )}
    </FadeIn>
  );
}
