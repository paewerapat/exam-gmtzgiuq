'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen,
  User,
  Settings,
  ChevronLeft,
  LogOut,
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard/practice', label: 'ฝึกทำข้อสอบ', icon: BookOpen },
  { href: '/dashboard/profile', label: 'โปรไฟล์', icon: User },
  { href: '/admin', label: 'จัดการระบบ', icon: Settings, adminOnly: true },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-gray-900 min-h-screen text-white flex flex-col">
      <div className="p-6 flex-1">
        <Link href="/" className="flex items-center text-gray-400 hover:text-white mb-8">
          <ChevronLeft className="w-4 h-4 mr-2" />
          กลับหน้าเว็บ
        </Link>

        {/* User info */}
        <div className="mb-8 pb-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt="avatar"
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-medium">
                {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium truncate">
                {user?.firstName || user?.email?.split('@')[0]}
              </div>
              <div className="text-gray-400 text-sm truncate">{user?.email}</div>
            </div>
          </div>
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            // Skip admin-only items for non-admins
            // For now, show to all logged-in users
            // if (item.adminOnly && user?.role !== 'admin') return null;

            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout button at bottom */}
      <div className="p-6 border-t border-gray-700">
        <button
          onClick={logout}
          className="flex items-center w-full px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition"
        >
          <LogOut className="w-5 h-5 mr-3" />
          ออกจากระบบ
        </button>
      </div>
    </aside>
  );
}
