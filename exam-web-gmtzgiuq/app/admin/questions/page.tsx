'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  FileQuestion,
  CheckCircle,
  XCircle,
  BookOpen,
  Calculator,
  Globe,
  FlaskConical,
  Car,
  GraduationCap,
  FileText,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import LatexRenderer from '@/components/latex/LatexRenderer';
import {
  getAdminQuestions,
  getQuestionStats,
  deleteQuestion,
  categoryDisplayNames,
  difficultyDisplayNames,
  difficultyColors,
  statusDisplayNames,
  type QuestionCategory,
  type QuestionDifficulty,
  type QuestionStatus,
  type PaginatedQuestions,
  type QuestionStats,
} from '@/lib/api/questions';

const ITEMS_PER_PAGE = 10;

const categoryIcons: Record<string, React.ElementType> = {
  general_knowledge: BookOpen,
  kor_por: GraduationCap,
  toeic: Globe,
  gat_pat: FileText,
  o_net: HelpCircle,
  mathematics: Calculator,
  english: Globe,
  science: FlaskConical,
  driving_license: Car,
};

const difficulties = [
  { id: 'all', name: 'ทุกระดับ' },
  { id: 'easy', name: 'ง่าย' },
  { id: 'medium', name: 'ปานกลาง' },
  { id: 'hard', name: 'ยาก' },
];

const statuses = [
  { id: 'all', name: 'ทุกสถานะ' },
  { id: 'published', name: 'เผยแพร่' },
  { id: 'draft', name: 'แบบร่าง' },
];

export default function QuestionsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedQuestions | null>(null);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedDifficulty, selectedStatus]);

  // Fetch stats
  useEffect(() => {
    getQuestionStats()
      .then(setStats)
      .catch((err) => console.error('Failed to fetch stats:', err));
  }, []);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminQuestions({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        category: selectedCategory !== 'all' ? (selectedCategory as QuestionCategory) : undefined,
        difficulty: selectedDifficulty !== 'all' ? (selectedDifficulty as QuestionDifficulty) : undefined,
        status: selectedStatus !== 'all' ? (selectedStatus as QuestionStatus) : undefined,
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedCategory, selectedDifficulty, selectedStatus, debouncedSearch]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('คุณต้องการลบโจทย์นี้ใช่ไหม?')) return;
    setDeleting(id);
    try {
      await deleteQuestion(id);
      fetchQuestions();
      // Refresh stats
      getQuestionStats().then(setStats).catch(console.error);
    } catch (err) {
      console.error('Failed to delete question:', err);
      alert('ไม่สามารถลบโจทย์ได้');
    } finally {
      setDeleting(null);
    }
  };

  // Build categories list from stats
  const categories = [
    {
      id: 'all',
      name: 'ทั้งหมด',
      icon: FileQuestion,
      count: stats?.total || 0,
    },
    ...Object.entries(categoryDisplayNames).map(([key, name]) => ({
      id: key,
      name,
      icon: categoryIcons[key] || FileQuestion,
      count: stats?.byCategory.find((c) => c.category === key)?.count || 0,
    })),
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar Filters */}
      <FadeIn className="w-64 flex-shrink-0">
        <div className="bg-white rounded-xl shadow-sm p-4 sticky top-4">
          {/* Categories */}
          <h3 className="font-semibold text-gray-900 mb-3">หมวดหมู่</h3>
          <div className="space-y-1 mb-6">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="w-4 h-4 mr-2" />
                    <span>{cat.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-indigo-200' : 'bg-gray-200'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Difficulty */}
          <h3 className="font-semibold text-gray-900 mb-3">ระดับความยาก</h3>
          <div className="space-y-1 mb-6">
            {difficulties.map((diff) => {
              const isSelected = selectedDifficulty === diff.id;
              return (
                <button
                  key={diff.id}
                  onClick={() => setSelectedDifficulty(diff.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {diff.name}
                </button>
              );
            })}
          </div>

          {/* Status */}
          <h3 className="font-semibold text-gray-900 mb-3">สถานะ</h3>
          <div className="space-y-1">
            {statuses.map((status) => {
              const isSelected = selectedStatus === status.id;
              return (
                <button
                  key={status.id}
                  onClick={() => setSelectedStatus(status.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {status.name}
                </button>
              );
            })}
          </div>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedDifficulty('all');
              setSelectedStatus('all');
              setSearchTerm('');
            }}
            className="w-full mt-6 px-3 py-2 text-sm text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </FadeIn>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <FadeIn>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">จัดการโจทย์สอบ</h1>
              <p className="text-gray-600 text-sm mt-1">
                {loading ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    กำลังโหลด...
                  </span>
                ) : (
                  <>
                    ทั้งหมด {stats?.total || 0} โจทย์ • แสดง {data?.total || 0} รายการ
                  </>
                )}
              </p>
            </div>
            <Link
              href="/admin/questions/new"
              className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              สร้างโจทย์ใหม่
            </Link>
          </div>
        </FadeIn>

        {/* Search */}
        <FadeIn delay={0.1}>
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ค้นหาโจทย์..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </FadeIn>

        {/* Questions List */}
        <FadeIn delay={0.2}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <>
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        โจทย์
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        หมวดหมู่
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ระดับ
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        สถานะ
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data?.items.map((question, index) => (
                      <motion.tr
                        key={question.id}
                        className="hover:bg-gray-50"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 line-clamp-1 max-w-sm">
                            <LatexRenderer content={question.question} />
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {formatDate(question.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                            {categoryDisplayNames[question.category] || question.category}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${difficultyColors[question.difficulty]}`}
                          >
                            {difficultyDisplayNames[question.difficulty]}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {question.status === 'published' ? (
                            <span className="flex items-center text-green-600 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              เผยแพร่
                            </span>
                          ) : (
                            <span className="flex items-center text-gray-500 text-xs">
                              <XCircle className="w-3 h-3 mr-1" />
                              แบบร่าง
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end space-x-1">
                            <Link
                              href={`/admin/questions/${question.id}/edit`}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(question.id)}
                              disabled={deleting === question.id}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                            >
                              {deleting === question.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>

                {data && data.items.length === 0 && (
                  <div className="text-center py-12">
                    <FileQuestion className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">ไม่พบโจทย์ที่ค้นหา</p>
                    <button
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedDifficulty('all');
                        setSelectedStatus('all');
                        setSearchTerm('');
                      }}
                      className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm"
                    >
                      ล้างตัวกรอง
                    </button>
                  </div>
                )}

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                      หน้า {data.page} จาก {data.totalPages}
                    </p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                        disabled={currentPage === data.totalPages}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronRight className="w-4 h-4" />
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
