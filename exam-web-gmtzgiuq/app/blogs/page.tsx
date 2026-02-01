'use client';

import { BookOpen, Calendar, Clock, Eye, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Mock data - matches the blog detail page
const mockBlogs = [
  {
    id: '1',
    title: 'Getting Started with Our Exam Platform',
    slug: 'getting-started-exam-platform',
    excerpt: 'Learn how to make the most of our exam preparation platform with this comprehensive guide. Discover all the features and tools available to help you succeed.',
    featuredImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    author: { name: 'Admin' },
    viewCount: 1234,
    createdAt: '2024-01-15T10:00:00Z',
    publishedAt: '2024-02-25T10:00:00Z',
  },
  {
    id: '2',
    title: '10 Tips for Effective Exam Preparation',
    slug: '10-tips-effective-exam-preparation',
    excerpt: 'Discover proven strategies to boost your exam scores with these essential preparation tips.',
    featuredImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
    author: { name: 'Admin' },
    viewCount: 856,
    createdAt: '2024-01-20T14:30:00Z',
    publishedAt: '2024-02-20T14:30:00Z',
  },
  {
    id: '3',
    title: 'Understanding Question Patterns',
    slug: 'understanding-question-patterns',
    excerpt: 'Learn to recognize and master different question patterns to improve your answering strategy.',
    featuredImage: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800',
    author: { name: 'Admin' },
    viewCount: 543,
    createdAt: '2024-02-01T09:00:00Z',
    publishedAt: '2024-02-15T09:00:00Z',
  },
  {
    id: '4',
    title: 'How to Manage Exam Stress Effectively',
    slug: 'how-to-manage-exam-stress',
    excerpt: 'Learn practical techniques to stay calm and focused during your exam preparation and on exam day.',
    featuredImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    author: { name: 'Admin' },
    viewCount: 721,
    createdAt: '2024-02-10T11:00:00Z',
    publishedAt: '2024-02-10T11:00:00Z',
  },
  {
    id: '5',
    title: 'The Science of Memory and Retention',
    slug: 'science-of-memory-retention',
    excerpt: 'Explore evidence-based techniques to improve your memory and recall abilities during exams.',
    featuredImage: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=800',
    author: { name: 'Admin' },
    viewCount: 634,
    createdAt: '2024-02-15T08:00:00Z',
    publishedAt: '2024-02-05T08:00:00Z',
  },
  {
    id: '6',
    title: 'Creating the Perfect Study Schedule',
    slug: 'creating-perfect-study-schedule',
    excerpt: 'A comprehensive guide to organizing your time for maximum learning efficiency and productivity.',
    featuredImage: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800',
    author: { name: 'Admin' },
    viewCount: 489,
    createdAt: '2024-02-20T10:00:00Z',
    publishedAt: '2024-02-01T10:00:00Z',
  },
];

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function calculateReadTime(index: number) {
  const times = [5, 7, 6, 4, 8, 5];
  return times[index % times.length];
}

export default function BlogsPage() {
  // Sort by publishedAt (newest first) and get featured post
  const sortedBlogs = [...mockBlogs].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  const featuredPost = sortedBlogs[0];
  const otherPosts = sortedBlogs.slice(1);

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
                  <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center">
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
                    {calculateReadTime(0)} นาที
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
        </div>

        {/* Other Posts Grid */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">บทความทั้งหมด</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {otherPosts.map((blog, index) => (
              <Link
                key={blog.id}
                href={`/blogs/${blog.slug}`}
                className="block"
              >
                <article className="bg-white rounded-xl shadow-md hover:shadow-xl transition overflow-hidden group h-full">
                  {/* Image */}
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
                    {/* Title */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition line-clamp-2">
                      {blog.title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-gray-600 mb-4 line-clamp-2">{blog.excerpt}</p>

                    {/* Meta Info */}
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(blog.publishedAt)}
                        </div>
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {calculateReadTime(index + 1)} นาที
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Eye className="w-4 h-4 mr-1" />
                        {blog.viewCount.toLocaleString()}
                      </div>
                    </div>

                    {/* Read More */}
                    <span className="inline-block mt-4 text-indigo-600 group-hover:text-indigo-700 font-medium">
                      อ่านเพิ่มเติม →
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
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
