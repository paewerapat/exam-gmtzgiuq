'use client';

import { FileText, Users, Eye, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const stats = [
  { label: 'Total Blogs', value: '0', icon: FileText, color: 'bg-blue-500' },
  { label: 'Published', value: '0', icon: Eye, color: 'bg-green-500' },
  { label: 'Total Users', value: '0', icon: Users, color: 'bg-purple-500' },
  { label: 'Total Views', value: '0', icon: TrendingUp, color: 'bg-orange-500' },
];

export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to your admin dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/admin/blogs/new"
            className="flex items-center p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
          >
            <FileText className="w-8 h-8 text-indigo-600 mr-4" />
            <div>
              <p className="font-medium text-gray-900">Create New Blog</p>
              <p className="text-sm text-gray-600">Write a new blog post</p>
            </div>
          </Link>

          <Link
            href="/admin/blogs"
            className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition"
          >
            <Eye className="w-8 h-8 text-green-600 mr-4" />
            <div>
              <p className="font-medium text-gray-900">Manage Blogs</p>
              <p className="text-sm text-gray-600">View and edit blog posts</p>
            </div>
          </Link>

          <Link
            href="/blogs"
            className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
          >
            <TrendingUp className="w-8 h-8 text-purple-600 mr-4" />
            <div>
              <p className="font-medium text-gray-900">View Public Site</p>
              <p className="text-sm text-gray-600">See how your site looks</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
