'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Eye, ArrowLeft, PenTool, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getBlogs, formatDate, calculateReadTime, Blog, PaginatedBlogs } from '@/lib/api/blogs';

const ITEMS_PER_PAGE = 6;

function BlogCard({ blog }: { blog: Blog }) {
  return (
    <Link href={`/blogs/${blog.slug}`} className="block">
      <article className="bg-white rounded-xl shadow-md hover:shadow-xl transition overflow-hidden group h-full">
        {blog.featuredImage ? (
          <div className="h-48 overflow-hidden">
            <img
              src={blog.featuredImage}
              alt={blog.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          </div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center">
            <PenTool className="w-16 h-16 text-white opacity-50" />
          </div>
        )}

        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-amber-600 transition line-clamp-2">
            {blog.title}
          </h3>

          <p className="text-gray-600 mb-4 line-clamp-2">{blog.excerpt}</p>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {formatDate(blog.publishedAt)}
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {calculateReadTime(blog.content)} นาที
              </div>
            </div>
            <div className="flex items-center">
              <Eye className="w-4 h-4 mr-1" />
              {blog.viewCount.toLocaleString()}
            </div>
          </div>

          <span className="inline-block mt-4 text-amber-600 group-hover:text-amber-700 font-medium">
            อ่านเพิ่มเติม →
          </span>
        </div>
      </article>
    </Link>
  );
}

function BlogCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-6">
        <div className="h-6 bg-gray-200 rounded mb-2" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
        <div className="flex justify-between">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-12" />
        </div>
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-center space-x-2 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {getVisiblePages().map((page, index) => (
        typeof page === 'number' ? (
          <button
            key={index}
            onClick={() => onPageChange(page)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              currentPage === page
                ? 'bg-amber-600 text-white'
                : 'border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {page}
          </button>
        ) : (
          <span key={index} className="px-2">...</span>
        )
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function EssaysBlogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedBlogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch blogs
  const fetchBlogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBlogs({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        category: 'essays',
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      setError('ไม่สามารถโหลดบทความได้ กรุณาลองใหม่อีกครั้ง');
      console.error('Failed to fetch blogs:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-amber-600 to-orange-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/blogs"
            className="inline-flex items-center text-amber-200 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับไปหน้าบทความ
          </Link>
          <div className="flex items-center mb-4">
            <span className="bg-white/20 text-white p-3 rounded-lg mr-4">
              <PenTool className="w-8 h-8" />
            </span>
            <h1 className="text-4xl md:text-5xl font-bold">Essays</h1>
          </div>
          <p className="text-xl text-amber-100 max-w-2xl">
            บทความเชิงลึกและการวิเคราะห์
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาบทความ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
            />
          </div>
        </div>

        {/* Blog Count */}
        <div className="mb-8">
          <p className="text-gray-600">
            {loading ? (
              <span className="inline-flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                กำลังโหลด...
              </span>
            ) : (
              <>
                แสดง <span className="font-semibold text-gray-900">{data?.total || 0}</span> บทความ
                {debouncedSearch && (
                  <span className="ml-2">
                    สำหรับ "<span className="font-medium">{debouncedSearch}</span>"
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="text-center py-16">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={fetchBlogs}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <BlogCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Blog Grid */}
        {!loading && !error && data && (
          <>
            {data.items.length > 0 ? (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {data.items.map((blog) => (
                    <BlogCard key={blog.id} blog={blog} />
                  ))}
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={data.totalPages}
                  onPageChange={setCurrentPage}
                />
              </>
            ) : (
              <div className="text-center py-16">
                <PenTool className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">
                  {debouncedSearch ? 'ไม่พบบทความ' : 'ยังไม่มี Essays'}
                </h3>
                <p className="text-gray-500">
                  {debouncedSearch ? 'ลองค้นหาด้วยคำอื่นดูนะครับ' : 'กลับมาดูใหม่ภายหลังนะครับ'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>&copy; 2024 ExamPrep. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
