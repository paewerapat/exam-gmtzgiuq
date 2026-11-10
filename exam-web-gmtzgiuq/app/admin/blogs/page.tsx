'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Eye, Search, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAdminBlogs, deleteBlog, getBlogCategoryLabel, type Blog } from '@/lib/api/blogs';

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  const fetchBlogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminBlogs({
        page: 1,
        limit: 50,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchTerm || undefined,
      });
      setBlogs(data.items);
      setTotal(data.total);
    } catch {
      toast.error('โหลดบทความไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(fetchBlogs, 300);
    return () => clearTimeout(timer);
  }, [fetchBlogs]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`ลบบทความ "${title}" ใช่หรือไม่?`)) return;
    try {
      await deleteBlog(id);
      toast.success('ลบบทความสำเร็จ');
      setBlogs((prev) => prev.filter((b) => b.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      toast.error('ลบบทความไม่สำเร็จ');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">บทความ</h1>
          <p className="text-gray-600 dark:text-gray-400">จัดการบทความ ({total} บทความ)</p>
        </div>
        <Link
          href="/admin/blogs/new"
          className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          เขียนบทความ
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ค้นหาบทความ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="published">เผยแพร่</option>
            <option value="draft">แบบร่าง</option>
          </select>
        </div>
      </div>

      {/* Blog List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          </div>
        ) : (
          // จอแคบ: ตาราง scroll แนวนอนในกรอบนี้ ไม่ดันทั้งหน้า
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] lg:min-w-0">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ชื่อบทความ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  หมวดหมู่
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  สถานะ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ยอดเข้าชม
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  วันที่สร้าง
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {blogs.map((blog) => (
                <tr key={blog.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{blog.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">/blogs/{blog.slug}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      blog.category === 'notes'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {getBlogCategoryLabel(blog.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        blog.status === 'published'
                          ? 'bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-900/40'
                          : 'bg-yellow-100 text-yellow-800 dark:text-yellow-300 dark:bg-yellow-900/40'
                      }`}
                    >
                      {blog.status === 'published' ? 'เผยแพร่' : 'แบบร่าง'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{blog.viewCount}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    {new Date(blog.createdAt).toLocaleDateString('th-TH')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <Link
                        href={`/blogs/${blog.slug}`}
                        target="_blank"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded dark:hover:text-indigo-300 dark:hover:bg-gray-700"
                        title="ดูบทความ"
                        aria-label={`ดูบทความ ${blog.title}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/admin/blogs/${blog.id}`}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded dark:hover:text-indigo-300 dark:hover:bg-gray-700"
                        title="แก้ไข"
                        aria-label={`แก้ไข ${blog.title}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(blog.id, blog.title)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded dark:hover:text-red-300 dark:hover:bg-gray-700"
                        title="ลบ"
                        aria-label={`ลบ ${blog.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {!loading && blogs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">ยังไม่มีบทความ</p>
          </div>
        )}
      </div>
    </div>
  );
}
