'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Search,
  Loader2,
  Clock,
  Users,
  BookOpen,
  Trophy,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminAttempts,
  getAttemptStats,
  type PaginatedAttempts,
  type AttemptStats,
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

export default function AdminAttemptsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedAttempts | null>(null);
  const [stats, setStats] = useState<AttemptStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminAttempts({
        page: currentPage,
        limit: 15,
        category: selectedCategory === 'all' ? undefined : (selectedCategory as QuestionCategory),
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch attempts:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedCategory, debouncedSearch]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  useEffect(() => {
    getAttemptStats().then(setStats).catch(console.error);
  }, []);

  const categories = [
    { id: 'all', name: 'ทั้งหมด' },
    ...Object.entries(categoryDisplayNames).map(([key, name]) => ({
      id: key,
      name,
    })),
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <FadeIn>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-indigo-600" />
              ประวัติการสอบทั้งหมด
            </h1>
            <p className="text-gray-500 mt-1">ดูผลการทำข้อสอบของผู้ใช้ทุกคน</p>
          </div>

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm text-gray-500">ทำข้อสอบทั้งหมด</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.totalAttempts}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm text-gray-500">คะแนนเฉลี่ย</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.averageScore.toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-500">ผู้ใช้ที่เข้าสอบ</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.uniqueUsers}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-500">หมวดหมู่</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.byCategory.length}
                </div>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-4">
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

          {/* Search */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาตามชื่อผู้ใช้, อีเมล, หรือชื่อข้อสอบ..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            />
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-gray-500">กำลังโหลด...</p>
              </div>
            ) : !data || data.items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                ไม่พบประวัติการสอบ
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          ผู้สอบ
                        </th>
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
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {attempt.user?.name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {attempt.user?.email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-800">
                              {attempt.examTitle}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {categoryIcons[attempt.category as QuestionCategory]}{' '}
                              {categoryDisplayNames[attempt.category as QuestionCategory] || attempt.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getScoreBadge(Number(attempt.score))}`}>
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
                </div>

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
      </div>
    </div>
  );
}
