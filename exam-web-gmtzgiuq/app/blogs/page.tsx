'use client';

import { BookOpen, Calendar, Clock } from 'lucide-react';
import Link from 'next/link';

export default function BlogsPage() {
  // Mock blog data - ในอนาคตจะดึงจาก API
  const blogs = [
    {
      id: 1,
      title: 'Top 10 Study Tips for Exam Success',
      excerpt: 'Discover proven strategies to maximize your study sessions and ace your exams.',
      image: '/blog-1.jpg',
      category: 'Study Tips',
      date: '2025-01-20',
      readTime: '5 min read',
    },
    {
      id: 2,
      title: 'How to Manage Exam Stress Effectively',
      excerpt: 'Learn practical techniques to stay calm and focused during your exam preparation.',
      image: '/blog-2.jpg',
      category: 'Mental Health',
      date: '2025-01-18',
      readTime: '4 min read',
    },
    {
      id: 3,
      title: 'Creating the Perfect Study Schedule',
      excerpt: 'A comprehensive guide to organizing your time for maximum learning efficiency.',
      image: '/blog-3.jpg',
      category: 'Study Planning',
      date: '2025-01-15',
      readTime: '6 min read',
    },
    {
      id: 4,
      title: 'Understanding Different Question Types',
      excerpt: 'Master the art of answering multiple choice, essay, and problem-solving questions.',
      image: '/blog-4.jpg',
      category: 'Exam Strategies',
      date: '2025-01-12',
      readTime: '7 min read',
    },
    {
      id: 5,
      title: 'The Science of Memory and Retention',
      excerpt: 'Explore evidence-based techniques to improve your memory and recall abilities.',
      image: '/blog-5.jpg',
      category: 'Learning Science',
      date: '2025-01-10',
      readTime: '8 min read',
    },
    {
      id: 6,
      title: 'Last-Minute Exam Preparation Guide',
      excerpt: 'What to do when you have limited time before an important exam.',
      image: '/blog-6.jpg',
      category: 'Quick Tips',
      date: '2025-01-08',
      readTime: '5 min read',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Learning Resources</h1>
          <p className="text-xl text-indigo-100 max-w-2xl">
            Expert tips, guides, and insights to help you succeed in your exams
          </p>
        </div>
      </div>

      {/* Blog Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogs.map((blog) => (
            <article
              key={blog.id}
              className="bg-white rounded-xl shadow-md hover:shadow-xl transition overflow-hidden group"
            >
              {/* Image Placeholder */}
              <div className="h-48 bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center">
                <BookOpen className="w-16 h-16 text-white opacity-50" />
              </div>

              <div className="p-6">
                {/* Category Badge */}
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-600 text-sm font-medium rounded-full mb-3">
                  {blog.category}
                </span>

                {/* Title */}
                <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition">
                  {blog.title}
                </h2>

                {/* Excerpt */}
                <p className="text-gray-600 mb-4 line-clamp-2">{blog.excerpt}</p>

                {/* Meta Info */}
                <div className="flex items-center text-sm text-gray-500 space-x-4">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {new Date(blog.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {blog.readTime}
                  </div>
                </div>

                {/* Read More Link */}
                <Link
                  href={`/blogs/${blog.id}`}
                  className="inline-block mt-4 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Read More →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-indigo-600 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Start Practicing?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            Join thousands of students improving their exam performance
          </p>
          <Link
            href="/register"
            className="inline-block bg-white text-indigo-600 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-100 transition"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </div>
  );
}
