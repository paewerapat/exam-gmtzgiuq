'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, User, Eye, Clock, Loader2 } from 'lucide-react';
import { getBlogBySlug, formatDate, calculateReadTime, type Blog } from '@/lib/api/blogs';

// Simple markdown renderer
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4 text-gray-700">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  lines.forEach((line, index) => {
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={index} className="text-3xl font-bold text-gray-900 mb-4 mt-8 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={index} className="text-2xl font-bold text-gray-900 mb-3 mt-6">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={index} className="text-xl font-semibold text-gray-900 mb-2 mt-4">
          {line.slice(4)}
        </h3>
      );
    } else if (/^\d+\.\s/.test(line)) {
      flushList();
      const match = line.match(/^\d+\.\s(.+)/);
      if (match) {
        const text = match[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        elements.push(
          <p key={index} className="mb-2 text-gray-700" dangerouslySetInnerHTML={{ __html: text }} />
        );
      }
    } else if (line.startsWith('- ')) {
      inList = true;
      const text = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      listItems.push(text);
    } else if (line.trim() === '') {
      flushList();
    } else if (line.trim()) {
      flushList();
      const text = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      elements.push(
        <p key={index} className="mb-4 text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
      );
    }
  });

  flushList();
  return elements;
}

interface BlogDetailClientProps {
  slug: string;
}

export default function BlogDetailClient({ slug }: BlogDetailClientProps) {
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getBlogBySlug(slug)
      .then((data) => setBlog(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">ไม่พบบทความ</h1>
          <p className="text-gray-600 mb-8">บทความที่คุณค้นหาไม่มีอยู่หรือถูกลบออกแล้ว</p>
          <Link
            href="/blogs"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับหน้าบทความ
          </Link>
        </div>
      </div>
    );
  }

  const readTime = calculateReadTime(blog.content);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hero Section */}
      {blog.featuredImage && (
        <div className="relative h-96 bg-gray-900">
          <img
            src={blog.featuredImage}
            alt={blog.title}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <Link
          href="/blogs"
          className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับหน้าบทความ
        </Link>

        <article>
          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 mb-6">{blog.title}</h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-8 pb-8 border-b">
            <div className="flex items-center">
              <User className="w-4 h-4 mr-2" />
              <span>{blog.author.firstName} {blog.author.lastName}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(blog.publishedAt || blog.createdAt)}</span>
            </div>
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              <span>{readTime} นาที</span>
            </div>
            <div className="flex items-center">
              <Eye className="w-4 h-4 mr-2" />
              <span>{blog.viewCount.toLocaleString()} ครั้ง</span>
            </div>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none">
            {renderMarkdown(blog.content)}
          </div>
        </article>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t">
          <Link
            href="/blogs"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับหน้าบทความ
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>&copy; 2024 ExamPrep. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
