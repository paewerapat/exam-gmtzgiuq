'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Loader2,
  Shield,
  Mail,
  UserCheck,
  Chrome,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminUsers,
  getAdminUserStats,
  type PaginatedUsers,
  type UserStats,
} from '@/lib/api/users';

function getRoleBadge(role: string) {
  if (role?.toLowerCase() === 'admin') {
    return 'bg-purple-100 text-purple-700';
  }
  return 'bg-gray-100 text-gray-600';
}

function getProviderBadge(provider: string) {
  if (provider === 'google') {
    return 'bg-blue-50 text-blue-600';
  }
  return 'bg-gray-50 text-gray-500';
}

export default function AdminUsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminUsers({
        page: currentPage,
        limit: 15,
        search: debouncedSearch || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    getAdminUserStats().then(setStats).catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <FadeIn>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-7 h-7 text-indigo-600" />
              จัดการผู้ใช้งาน
            </h1>
            <p className="text-gray-500 mt-1">
              ดูข้อมูลและสถิติผู้ใช้งานทั้งหมด
            </p>
          </div>

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm text-gray-500">ผู้ใช้ทั้งหมด</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.totalUsers}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-500">ใช้งานอยู่</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.activeUsers}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-gray-500">แอดมิน</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.adminUsers}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Chrome className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-500">
                    เข้าด้วย Google
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.googleUsers}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาตามชื่อ หรืออีเมล..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              />
            </div>
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'admin', label: 'แอดมิน' },
                { id: 'user', label: 'ผู้ใช้ทั่วไป' },
              ].map((role) => (
                <button
                  key={role.id}
                  onClick={() => {
                    setRoleFilter(role.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-2 text-sm rounded-lg transition ${
                    roleFilter === role.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-gray-500">กำลังโหลด...</p>
              </div>
            ) : !data || data.items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                ไม่พบผู้ใช้งาน
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          ผู้ใช้
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          บทบาท
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          วิธีเข้าสู่ระบบ
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          ยืนยันอีเมล
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          สมัครเมื่อ
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          ดูสถิติ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.items.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt=""
                                  className="w-9 h-9 rounded-full"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-sm">
                                  {user.firstName?.[0] ||
                                    user.email[0].toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {user.firstName
                                    ? `${user.firstName} ${user.lastName || ''}`
                                    : user.email.split('@')[0]}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {user.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}
                            >
                              {user.role?.toLowerCase() === 'admin'
                                ? 'Admin'
                                : 'User'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getProviderBadge(user.provider)}`}
                            >
                              {user.provider === 'google'
                                ? 'Google'
                                : 'Email'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {user.isEmailVerified ? (
                              <Mail className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <Mail className="w-4 h-4 text-gray-300 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString(
                                'th-TH',
                                {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                },
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link
                              href={`/admin/users/${user.id}`}
                              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              ดูสถิติ
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      หน้า {data.page} จาก {data.totalPages} (ทั้งหมด{' '}
                      {data.total} คน)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        onClick={() =>
                          setCurrentPage((p) =>
                            Math.min(data.totalPages, p + 1),
                          )
                        }
                        disabled={currentPage === data.totalPages}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
