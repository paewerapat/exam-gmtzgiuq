'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Calendar, Clock, Eye, ArrowRight, FileText, PenTool, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getBlogs, formatDate, calculateReadTime, Blog, PaginatedBlogs } from '@/lib/api/blogs';

// Blog Card Component
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
          <div className="h-48 bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center">
            <BookOpen className="w-16 h-16 text-white opacity-50" />
          </div>
        )}

        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition line-clamp-2">
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

          <span className="inline-block mt-4 text-indigo-600 group-hover:text-indigo-700 font-medium">
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

function FeaturedPostSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden lg:flex animate-pulse">
      <div className="lg:w-1/2 h-64 lg:h-auto bg-gray-200" />
      <div className="lg:w-1/2 p-8">
        <div className="flex space-x-4 mb-4">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
        <div className="h-8 bg-gray-200 rounded mb-4" />
        <div className="h-4 bg-gray-200 rounded w-full mb-2" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
      </div>
    </div>
  );
}

// Section Component
function BlogSection({
  title,
  icon: Icon,
  blogs,
  viewAllLink,
  badgeColor = 'bg-indigo-600',
  loading = false,
}: {
  title: string;
  icon: React.ElementType;
  blogs: Blog[];
  viewAllLink: string;
  badgeColor?: string;
  loading?: boolean;
}) {
  const displayBlogs = blogs.slice(0, 3);

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <span className={`${badgeColor} text-white p-2 rounded-lg mr-3`}>
            <Icon className="w-5 h-5" />
          </span>
          {title}
        </h2>
        <Link
          href={viewAllLink}
          className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium transition"
        >
          ดูทั้งหมด
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          [...Array(3)].map((_, i) => <BlogCardSkeleton key={i} />)
        ) : displayBlogs.length > 0 ? (
          displayBlogs.map((blog) => <BlogCard key={blog.id} blog={blog} />)
        ) : (
          <div className="col-span-3 text-center py-8 text-gray-500">
            ยังไม่มีบทความในหมวดหมู่นี้
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlogsPage() {
  const [recentData, setRecentData] = useState<PaginatedBlogs | null>(null);
  const [notesData, setNotesData] = useState<PaginatedBlogs | null>(null);
  const [essaysData, setEssaysData] = useState<PaginatedBlogs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllBlogs = async () => {
      setLoading(true);
      try {
        const [recent, notes, essays] = await Promise.all([
          getBlogs({ page: 1, limit: 4 }),
          getBlogs({ page: 1, limit: 3, category: 'notes' }),
          getBlogs({ page: 1, limit: 3, category: 'essays' }),
        ]);
        setRecentData(recent);
        setNotesData(notes);
        setEssaysData(essays);
      } catch (err) {
        console.error('Failed to fetch blogs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllBlogs();
  }, []);

  const featuredPost = recentData?.items?.[0];
  const recentBlogs = recentData?.items?.slice(1) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">บทความและแหล่งความรู้</h1>
          <p className="text-xl text-indigo-100 max-w-2xl">
            เคล็ดลับ คำแนะนำ และข้อมูลเชิงลึกจากผู้เชี่ยวชาญเพื่อช่วยให้คุณประสบความสำเร็จในการสอบ
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Featured Post */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="bg-indigo-600 text-white text-sm px-3 py-1 rounded-full mr-3">ล่าสุด</span>
            บทความแนะนำ
          </h2>

          {loading ? (
            <FeaturedPostSkeleton />
          ) : featuredPost ? (
            <Link href={`/blogs/${featuredPost.slug}`} className="block group">
              <article className="bg-white rounded-2xl shadow-lg overflow-hidden lg:flex hover:shadow-xl transition">
                {/* Image */}
                <div className="lg:w-1/2 h-64 lg:h-auto overflow-hidden">
                  {featuredPost.featuredImage ? (
                    <img
                      src={featuredPost.featuredImage}
                      alt={featuredPost.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center min-h-[256px]">
                      <BookOpen className="w-20 h-20 text-white opacity-50" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="lg:w-1/2 p-8 flex flex-col justify-center">
                  <div className="flex items-center text-sm text-gray-500 mb-4 space-x-4">
                    <span className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {formatDate(featuredPost.publishedAt)}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {calculateReadTime(featuredPost.content)} นาที
                    </span>
                    <span className="flex items-center">
                      <Eye className="w-4 h-4 mr-1" />
                      {featuredPost.viewCount.toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4 group-hover:text-indigo-600 transition">
                    {featuredPost.title}
                  </h3>

                  <p className="text-gray-600 mb-6 line-clamp-3">
                    {featuredPost.excerpt}
                  </p>

                  <span className="inline-flex items-center text-indigo-600 font-semibold group-hover:text-indigo-700">
                    อ่านเพิ่มเติม
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition" />
                  </span>
                </div>
              </article>
            </Link>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center text-gray-500">
              ยังไม่มีบทความ
            </div>
          )}
        </div>

        {/* Recent Blogs Section */}
        <BlogSection
          title="บทความล่าสุด"
          icon={BookOpen}
          blogs={recentBlogs}
          viewAllLink="/blogs/recent"
          badgeColor="bg-indigo-600"
          loading={loading}
        />

        {/* Notes Section */}
        <BlogSection
          title="Notes"
          icon={FileText}
          blogs={notesData?.items || []}
          viewAllLink="/blogs/notes"
          badgeColor="bg-emerald-600"
          loading={loading}
        />

        {/* Essays Section */}
        <BlogSection
          title="Essays"
          icon={PenTool}
          blogs={essaysData?.items || []}
          viewAllLink="/blogs/essays"
          badgeColor="bg-amber-600"
          loading={loading}
        />
      </div>

      {/* CTA Section */}
      <div className="bg-indigo-600 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            พร้อมที่จะเริ่มฝึกสอบแล้วหรือยัง?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            เข้าร่วมกับนักเรียนหลายพันคนที่กำลังพัฒนาผลการสอบของตน
          </p>
          <Link
            href="/register"
            className="inline-block bg-white text-indigo-600 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-100 transition"
          >
            เริ่มต้นฟรี
          </Link>
        </div>
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
