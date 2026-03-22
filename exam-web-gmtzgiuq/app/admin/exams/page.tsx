'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  FileQuestion,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  BookOpen,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminExams,
  getExamStats,
  deleteExam,
  updateExam,
  type Exam,
  type PaginatedExams,
  type ExamStats,
} from '@/lib/api/exams';
import {
  categoryIcons,
  type QuestionCategory,
  type QuestionStatus,
} from '@/lib/api/questions';
import { getCategories, type Category } from '@/lib/api/categories';
import { toast } from 'react-toastify';

export default function AdminExamsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedExams | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [apiCategories, setApiCategories] = useState<Category[]>([]);

  useEffect(() => {
    getCategories().then(setApiCategories).catch(console.error);
    getExamStats().then(setStats).catch(console.error);
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminExams({
        page: currentPage,
        limit: 10,
        status: selectedStatus === 'all' ? undefined : (selectedStatus as QuestionStatus),
        category: selectedCategory === 'all' ? undefined : (selectedCategory as QuestionCategory),
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedStatus, selectedCategory, debouncedSearch]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบชุดข้อสอบนี้?')) return;
    setDeleting(id);
    try {
      await deleteExam(id);
      toast.success('ลบชุดข้อสอบสำเร็จ');
      fetchExams();
      getExamStats().then(setStats).catch(console.error);
    } catch (err) {
      console.error('Failed to delete exam:', err);
      toast.error('ไม่สามารถลบชุดข้อสอบได้');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    setToggling(id);
    try {
      const newStatus = currentStatus === 'published' ? 'draft' : 'published';
      await updateExam(id, { status: newStatus as QuestionStatus });
      toast.success(`เปลี่ยนสถานะเป็น${newStatus === 'published' ? 'เผยแพร่' : 'แบบร่าง'}สำเร็จ`);
      fetchExams();
      getExamStats().then(setStats).catch(console.error);
    } catch (err) {
      console.error('Failed to toggle status:', err);
      toast.error('ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      setToggling(null);
    }
  };

  const categories = [
    { id: 'all', name: 'ทั้งหมด', icon: FileQuestion, count: stats?.total || 0 },
    ...apiCategories.map((cat) => ({
      id: cat.slug,
      name: cat.name,
      icon: BookOpen,
      count: stats?.byCategory.find((c) => c.category === cat.slug)?.count || 0,
    })),
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <FadeIn>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">จัดการชุดข้อสอบ</h1>
              <p className="text-gray-500 mt-1">
                ทั้งหมด {stats?.total || 0} ชุด | เผยแพร่ {stats?.published || 0} | แบบร่าง {stats?.draft || 0}
              </p>
            </div>
            <Link
              href="/admin/exams/new"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus className="w-5 h-5" />
              <span>สร้างชุดข้อสอบ</span>
            </Link>
          </div>

          <div className="flex gap-6">
            {/* Sidebar - Category filter */}
            <div className="w-56 flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm p-3">
                <h3 className="text-sm font-medium text-gray-500 px-3 mb-2">หมวดหมู่</h3>
                <nav className="space-y-1">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setCurrentPage(1);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                          selectedCategory === cat.id
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {cat.id !== 'all' && <span>{categoryIcons[cat.id as QuestionCategory]}</span>}
                          {cat.id === 'all' && <Icon className="w-4 h-4" />}
                          <span>{cat.name}</span>
                        </span>
                        <span className="text-xs text-gray-400">{cat.count}</span>
                      </button>
                    );
                  })}
                </nav>

                <div className="border-t border-gray-200 mt-3 pt-3">
                  <h3 className="text-sm font-medium text-gray-500 px-3 mb-2">สถานะ</h3>
                  {['all', 'published', 'draft'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setSelectedStatus(status);
                        setCurrentPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        selectedStatus === status
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {status === 'all' ? 'ทั้งหมด' : status === 'published' ? 'เผยแพร่' : 'แบบร่าง'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1">
              {/* Search */}
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาชุดข้อสอบ..."
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
                    ไม่พบชุดข้อสอบ
                  </div>
                ) : (
                  <>
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">ชื่อชุดข้อสอบ</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">หมวดหมู่</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">จำนวนข้อ</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.items.map((exam) => (
                          <tr key={exam.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <div className="font-medium text-gray-900">{exam.title}</div>
                              {exam.description && (
                                <div className="text-sm text-gray-500 mt-0.5 line-clamp-1">{exam.description}</div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-gray-600">
                                {categoryIcons[exam.category as QuestionCategory]}{' '}
                                {apiCategories.find((c) => c.slug === exam.category)?.name ?? exam.category}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-gray-600">{exam.questionCount} ข้อ</span>
                            </td>
                            <td className="px-4 py-4">
                              <button
                                onClick={() => handleToggleStatus(exam.id, exam.status)}
                                disabled={toggling === exam.id}
                                className="flex items-center text-xs cursor-pointer hover:opacity-70 transition disabled:opacity-50"
                                title={exam.status === 'published' ? 'คลิกเพื่อเปลี่ยนเป็นแบบร่าง' : 'คลิกเพื่อเผยแพร่'}
                              >
                                {toggling === exam.id ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : exam.status === 'published' ? (
                                  <>
                                    <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                                    <span className="text-green-600">เผยแพร่</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3 h-3 mr-1 text-gray-500" />
                                    <span className="text-gray-500">แบบร่าง</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end space-x-1">
                                <Link
                                  href={`/admin/exams/${exam.id}/edit`}
                                  className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                >
                                  <Edit className="w-4 h-4" />
                                </Link>
                                <button
                                  onClick={() => handleDelete(exam.id)}
                                  disabled={deleting === exam.id}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                >
                                  {deleting === exam.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    {data.totalPages > 1 && (
                      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                          หน้า {data.page} จาก {data.totalPages} (ทั้งหมด {data.total} ชุด)
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
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
