'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Eye, Search } from 'lucide-react';

interface Blog {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  viewCount: number;
  createdAt: string;
  author: {
    firstName: string;
    lastName: string;
  };
}

// Mock data for static export
const mockBlogs: Blog[] = [
  {
    id: '1',
    title: 'Getting Started with Exam Preparation',
    slug: 'getting-started-exam-preparation',
    status: 'published',
    viewCount: 150,
    createdAt: '2024-01-15',
    author: { firstName: 'Admin', lastName: 'User' },
  },
  {
    id: '2',
    title: 'Top 10 Study Tips for Success',
    slug: 'top-10-study-tips',
    status: 'published',
    viewCount: 230,
    createdAt: '2024-01-10',
    author: { firstName: 'Admin', lastName: 'User' },
  },
  {
    id: '3',
    title: 'How to Manage Exam Stress',
    slug: 'manage-exam-stress',
    status: 'draft',
    viewCount: 0,
    createdAt: '2024-01-20',
    author: { firstName: 'Admin', lastName: 'User' },
  },
];

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>(mockBlogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  const filteredBlogs = blogs.filter((blog) => {
    const matchesSearch = blog.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || blog.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this blog?')) {
      setBlogs(blogs.filter((blog) => blog.id !== id));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Blogs</h1>
          <p className="text-gray-600">Manage your blog posts</p>
        </div>
        <Link
          href="/admin/blogs/new"
          className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Blog
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search blogs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Blog List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Views
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredBlogs.map((blog) => (
              <tr key={blog.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{blog.title}</p>
                    <p className="text-sm text-gray-500">/blogs/{blog.slug}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      blog.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {blog.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">{blog.viewCount}</td>
                <td className="px-6 py-4 text-gray-600">
                  {new Date(blog.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end space-x-2">
                    <Link
                      href={`/blogs/${blog.slug}`}
                      className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/admin/blogs/${blog.id}`}
                      className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(blog.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBlogs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No blogs found</p>
          </div>
        )}
      </div>
    </div>
  );
}
