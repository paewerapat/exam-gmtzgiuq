'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, User, Eye, Clock } from 'lucide-react';

// Mock data for demo
const mockBlogs: Record<string, {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  status: string;
  author: { name: string };
  viewCount: number;
  createdAt: string;
  publishedAt: string;
}> = {
  'getting-started-exam-platform': {
    id: '1',
    title: 'Getting Started with Our Exam Platform',
    slug: 'getting-started-exam-platform',
    excerpt: 'Learn how to make the most of our exam preparation platform...',
    content: `# Getting Started with Our Exam Platform

Welcome to our comprehensive exam preparation platform! This guide will walk you through all the features and help you get started on your learning journey.

## Creating Your Account

First, you'll need to create an account to access all the features. Click the "Register" button and fill in your details.

## Exploring Practice Exams

Once logged in, you can browse through our extensive library of practice exams. Each exam is carefully curated to match the format and difficulty of real exams.

## Tracking Your Progress

Our platform provides detailed analytics to help you understand your strengths and areas for improvement. You can view:

- **Overall Score**: Your average score across all exams
- **Topic Breakdown**: Performance by subject area
- **Time Analysis**: How long you spend on each question
- **Progress Over Time**: Charts showing your improvement

## Tips for Success

1. **Take practice exams regularly** - Consistency is key to improvement
2. **Review your incorrect answers** - Learn from your mistakes
3. **Focus on weak areas** - Use our analytics to identify and strengthen weak points
4. **Stay consistent with your study schedule** - Set a routine and stick to it

## Getting Help

If you need any assistance, don't hesitate to reach out to our support team. We're here to help you succeed!

Happy studying!`,
    featuredImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    status: 'published',
    author: { name: 'Admin' },
    viewCount: 1234,
    createdAt: '2024-01-15T10:00:00Z',
    publishedAt: '2024-01-15T10:00:00Z',
  },
  '10-tips-effective-exam-preparation': {
    id: '2',
    title: '10 Tips for Effective Exam Preparation',
    slug: '10-tips-effective-exam-preparation',
    excerpt: 'Discover proven strategies to boost your exam scores...',
    content: `# 10 Tips for Effective Exam Preparation

Preparing for exams can be challenging, but with the right strategies, you can maximize your chances of success. Here are 10 proven tips to help you prepare effectively.

## 1. Start Early

Don't wait until the last minute. Begin your preparation well in advance to avoid stress and cramming.

## 2. Create a Study Schedule

Plan your study sessions and stick to them consistently. A well-organized schedule helps you cover all topics systematically.

## 3. Use Active Learning Techniques

Engage with the material through:
- Practice questions
- Group discussions
- Teaching concepts to others
- Creating flashcards

## 4. Take Regular Breaks

The Pomodoro technique works well:
- Study for 25 minutes
- Take a 5-minute break
- After 4 sessions, take a longer 15-30 minute break

## 5. Get Enough Sleep

Rest is crucial for memory consolidation. Aim for 7-8 hours of sleep, especially the night before the exam.

## 6. Stay Hydrated and Eat Well

Your brain needs proper nutrition to function optimally. Drink plenty of water and eat balanced meals.

## 7. Practice with Past Papers

Familiarize yourself with the exam format by practicing with previous years' papers or sample questions.

## 8. Create a Distraction-Free Environment

Find a quiet place to study where you won't be interrupted. Turn off notifications on your devices.

## 9. Use Multiple Resources

Don't rely on a single textbook. Use various resources like online courses, videos, and study guides.

## 10. Stay Positive

Maintain a positive mindset. Believe in your abilities and visualize your success.

Good luck with your exams!`,
    featuredImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
    status: 'published',
    author: { name: 'Admin' },
    viewCount: 856,
    createdAt: '2024-01-20T14:30:00Z',
    publishedAt: '2024-01-20T14:30:00Z',
  },
  'understanding-question-patterns': {
    id: '3',
    title: 'Understanding Question Patterns',
    slug: 'understanding-question-patterns',
    excerpt: 'Learn to recognize and master different question patterns...',
    content: `# Understanding Question Patterns

Recognizing question patterns is a valuable skill that can help you answer questions more efficiently and accurately.

## Multiple Choice Questions

Multiple choice questions test your ability to recognize correct answers among distractors.

### Tips for MCQs:
- Read all options before selecting
- Eliminate obviously wrong answers
- Look for absolute words like "always" or "never"
- Trust your first instinct if unsure

## Short Answer Questions

Short answer questions require concise and accurate responses.

### Tips for Short Answers:
- Answer directly without unnecessary elaboration
- Include key terms and concepts
- Check for required format or word limits

## Essay Questions

Essay questions assess your ability to analyze, synthesize, and present information coherently.

### Tips for Essays:
- Plan your answer before writing
- Use a clear structure with introduction, body, and conclusion
- Support arguments with evidence
- Manage your time effectively

## Problem-Solving Questions

These questions test your ability to apply concepts to real-world scenarios.

### Tips for Problem-Solving:
- Read the problem carefully
- Identify what's being asked
- Show your work step by step
- Check your answer if time permits`,
    featuredImage: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800',
    status: 'published',
    author: { name: 'Admin' },
    viewCount: 543,
    createdAt: '2024-02-01T09:00:00Z',
    publishedAt: '2024-02-01T09:00:00Z',
  },
};

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
    // Headers
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
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      flushList();
      const match = line.match(/^\d+\.\s(.+)/);
      if (match) {
        // Process bold text
        const text = match[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        elements.push(
          <p key={index} className="mb-2 text-gray-700" dangerouslySetInnerHTML={{ __html: text }} />
        );
      }
    }
    // Bullet list
    else if (line.startsWith('- ')) {
      inList = true;
      const text = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      listItems.push(text);
    }
    // Empty line
    else if (line.trim() === '') {
      flushList();
    }
    // Regular paragraph
    else if (line.trim()) {
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function calculateReadTime(content: string) {
  const words = content.split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return minutes;
}

interface BlogDetailClientProps {
  slug: string;
}

export default function BlogDetailClient({ slug }: BlogDetailClientProps) {
  const [blog, setBlog] = useState<typeof mockBlogs[string] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // In production, fetch blog data from API
    const foundBlog = mockBlogs[slug];
    if (foundBlog && foundBlog.status === 'published') {
      setBlog(foundBlog);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Blog Not Found</h1>
          <p className="text-gray-600 mb-8">The article you are looking for does not exist or has been removed.</p>
          <Link
            href="/blogs"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Blogs
          </Link>
        </div>
      </div>
    );
  }

  const readTime = calculateReadTime(blog.content);

  return (
    <div className="min-h-screen bg-gray-50">
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
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link
          href="/blogs"
          className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Blogs
        </Link>

        <article>
          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 mb-6">{blog.title}</h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-8 pb-8 border-b">
            <div className="flex items-center">
              <User className="w-4 h-4 mr-2" />
              <span>{blog.author.name}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(blog.publishedAt)}</span>
            </div>
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              <span>{readTime} min read</span>
            </div>
            <div className="flex items-center">
              <Eye className="w-4 h-4 mr-2" />
              <span>{blog.viewCount.toLocaleString()} views</span>
            </div>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none">
            {renderMarkdown(blog.content)}
          </div>
        </article>

        {/* Share & Navigation */}
        <div className="mt-12 pt-8 border-t">
          <div className="flex justify-between items-center">
            <Link
              href="/blogs"
              className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blogs
            </Link>
          </div>
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
