'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import UserAvatar from '@/components/ui/UserAvatar';
import {
  LayoutDashboard,
  ClipboardList,
  Clock,
  BookOpen,
  User,
  Users,
  Settings,
  LogOut,
  LogIn,
  BarChart3,
  Library,
  GraduationCap,
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/practice', label: 'ฝึกทำข้อสอบ', icon: ClipboardList },
  { href: '/dashboard/library', label: 'คลังข้อสอบ', icon: Library },
  { href: '/dashboard/exam', label: 'ทำข้อสอบจริง', icon: GraduationCap },
  { href: '/dashboard/history', label: 'ประวัติการสอบ', icon: Clock },
  { href: '/blogs', label: 'บทความ', icon: BookOpen },
  { href: '/dashboard/profile', label: 'โปรไฟล์', icon: User },
  { href: '/admin/exams', label: 'จัดการข้อสอบ', icon: ClipboardList, adminOnly: true },
  { href: '/admin/users', label: 'จัดการผู้ใช้', icon: Users, adminOnly: true },
  { href: '/admin/attempts', label: 'ประวัติ (Admin)', icon: BarChart3, adminOnly: true },
  { href: '/admin', label: 'จัดการระบบ', icon: Settings, adminOnly: true, exact: true },
];

interface DashboardSidebarProps {
  onNavigate?: () => void;
}

export default function DashboardSidebar({ onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initial = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <aside className="w-64 bg-white min-h-screen flex flex-col border-r border-gray-100 flex-shrink-0">
      {/* Logo */}
      <div className="px-6 pt-7 pb-5">
        <Link href="/" className="text-2xl font-extrabold text-indigo-600 tracking-tight">
          ExamPrep
        </Link>
      </div>

      <div className="h-px bg-gray-100 mx-4" />

      {/* User info */}
      <div className="px-5 py-5 flex items-center gap-3">
        {user ? (
          <>
            <UserAvatar avatar={user.avatar} name={user.firstName} email={user.email} size={44} />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
                {user.firstName
                  ? `${user.firstName} ${user.lastName || ''}`.trim()
                  : user.email?.split('@')[0]}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-700 text-sm">ผู้เยี่ยมชม</p>
              <p className="text-xs text-gray-400 mt-0.5">ยังไม่ได้เข้าสู่ระบบ</p>
            </div>
          </>
        )}
      </div>

      <div className="h-px bg-gray-100 mx-4 mb-3" />

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          if (item.adminOnly && user?.role?.toLowerCase() !== 'admin') return null;

          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Login / Logout */}
      <div className="p-4 border-t border-gray-100">
        {user ? (
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all"
          >
            <LogOut className="w-5 h-5" />
            ออกจากระบบ
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <LogIn className="w-5 h-5" />
            เข้าสู่ระบบ
          </Link>
        )}
      </div>
    </aside>
  );
}
