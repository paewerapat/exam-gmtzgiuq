'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, Eye } from 'lucide-react';
import { toast } from 'react-toastify';

// Mock data for demo
const mockBlogs: Record<string, {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  status: string;
  metaTitle: string;
  metaDescription: string;
}> = {
  '1': {
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

Our platform provides detailed analytics to help you understand your strengths and areas for improvement.

## Tips for Success

1. Take practice exams regularly
2. Review your incorrect answers
3. Focus on weak areas
4. Stay consistent with your study schedule`,
    featuredImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    status: 'published',
    metaTitle: 'Getting Started Guide - Exam Platform',
    metaDescription: 'Complete guide on how to use our exam preparation platform effectively.',
  },
  '2': {
    id: '2',
    title: '10 Tips for Effective Exam Preparation',
    slug: '10-tips-effective-exam-preparation',
    excerpt: 'Discover proven strategies to boost your exam scores...',
    content: `# 10 Tips for Effective Exam Preparation

Preparing for exams can be challenging, but with the right strategies, you can maximize your chances of success.

## 1. Start Early

Don't wait until the last minute. Begin your preparation well in advance.

## 2. Create a Study Schedule

Plan your study sessions and stick to them consistently.

## 3. Use Active Learning Techniques

Engage with the material through practice questions and discussions.

## 4. Take Regular Breaks

The Pomodoro technique (25 minutes study, 5 minutes break) works well.

## 5. Get Enough Sleep

Rest is crucial for memory consolidation.`,
    featuredImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
    status: 'published',
    metaTitle: '',
    metaDescription: '',
  },
  '3': {
    id: '3',
    title: 'Understanding Question Patterns',
    slug: 'understanding-question-patterns',
    excerpt: 'A draft article about question patterns...',
    content: `# Understanding Question Patterns

This is a draft article about recognizing and understanding different question patterns in exams.

## Multiple Choice Questions

Learn how to approach MCQs effectively.

## Short Answer Questions

Tips for concise and accurate answers.`,
    featuredImage: '',
    status: 'draft',
    metaTitle: '',
    metaDescription: '',
  },
};

interface EditBlogClientProps {
  blogId: string;
}

export default function EditBlogClient({ blogId }: EditBlogClientProps) {
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featuredImage: '',
    status: 'draft',
    metaTitle: '',
    metaDescription: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // In production, fetch blog data from API
    const blog = mockBlogs[blogId];
    if (blog) {
      setFormData({
        title: blog.title,
        slug: blog.slug,
        excerpt: blog.excerpt,
        content: blog.content,
        featuredImage: blog.featuredImage,
        status: blog.status,
        metaTitle: blog.metaTitle,
        metaDescription: blog.metaDescription,
      });
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [blogId]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData({
      ...formData,
      title,
      slug: generateSlug(title),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // In production, this would call the API
    console.log('Updating blog:', formData);

    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      toast.success('อัปเดตบทความสำเร็จ!');
    }, 1000);
  };

  const handleDelete = async () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบบทความนี้? การกระทำนี้ไม่สามารถยกเลิกได้')) {
      // In production, this would call the API
      console.log('Deleting blog:', blogId);
      toast.success('ลบบทความสำเร็จ!');
      router.push('/admin/blogs');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Blog Not Found</h2>
        <p className="text-gray-600 mb-6">The blog you are looking for does not exist.</p>
        <Link
          href="/admin/blogs"
          className="inline-flex items-center text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Blogs
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin/blogs"
            className="flex items-center text-gray-600 hover:text-indigo-600 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Blogs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Blog</h1>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href={`/blogs/${formData.slug}`}
            target="_blank"
            className="flex items-center text-gray-600 hover:text-indigo-600 px-4 py-2 border border-gray-300 rounded-lg"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center text-red-600 hover:text-red-700 px-4 py-2 border border-red-300 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Content</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={handleTitleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter blog title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="blog-url-slug"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Excerpt
                  </label>
                  <textarea
                    rows={3}
                    value={formData.excerpt}
                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Brief summary of the blog post"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Content *
                  </label>
                  <textarea
                    rows={15}
                    required
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                    placeholder="Write your blog content here... (Markdown supported)"
                  />
                </div>
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SEO Settings</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Title
                  </label>
                  <input
                    type="text"
                    value={formData.metaTitle}
                    onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="SEO title (leave empty to use blog title)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.metaDescription}
                    onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="SEO description (leave empty to use excerpt)"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Publish</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Update Blog'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Featured Image</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.featuredImage}
                  onChange={(e) => setFormData({ ...formData, featuredImage: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              {formData.featuredImage && (
                <div className="mt-4">
                  <img
                    src={formData.featuredImage}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
