'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import UserAvatar from '@/components/ui/UserAvatar';
import FeedbackModal from '@/components/feedback/FeedbackModal';
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
  MessageSquare,
  ClipboardCheck,
  Crown,
  Database,
  Mountain,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useHasPro } from '@/lib/use-has-pro';

type MenuLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** ป้ายภาพ (aria-hidden) + ข้อความสำหรับ screen reader */
  badge?: string;
  action?: undefined;
};
type MenuAction = { action: 'feedback'; label: string; icon: LucideIcon };
type MenuItem = MenuLink | MenuAction;

interface MenuGroup {
  id: string;
  /** ไม่มี = ไม่มีหัวกลุ่ม (Dashboard) */
  title?: string;
  adminOnly?: boolean;
  items: MenuItem[];
}

// task 21 (ดีไซน์ภาพ 1/4): Dashboard / ข้อสอบเก่า / LUMO'S EXAM / ของฉัน / เพิ่มเติม (+ ผู้ดูแลระบบ เฉพาะ admin)
// task 22: เปิดเมนู Predicted Exam ใต้ Free Mock Exam
const menuGroups: MenuGroup[] = [
  {
    id: 'main',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    id: 'past',
    title: 'ข้อสอบเก่า',
    items: [
      { href: '/dashboard/practice', label: 'ฝึกทำข้อสอบ', icon: ClipboardList },
      { href: '/dashboard/library', label: 'ทำข้อสอบแยกบท', icon: Library },
      { href: '/dashboard/exam', label: 'ฝึกทำข้อสอบ(จับเวลา)', icon: GraduationCap },
    ],
  },
  {
    id: 'lumo',
    title: "LUMO'S EXAM",
    items: [
      { href: '/dashboard/question-bank', label: 'Question Bank', icon: Database },
      { href: '/dashboard/challenge', label: 'Challenge Questions', icon: Mountain, badge: 'PRO' },
      { href: '/dashboard/mock-exams', label: 'Free Mock Exam', icon: ClipboardCheck },
      { href: '/dashboard/predicted', label: 'Predicted Exam', icon: Sparkles },
    ],
  },
  {
    id: 'mine',
    title: 'ของฉัน',
    items: [
      { href: '/dashboard/history', label: 'ประวัติการสอบ', icon: Clock },
      { href: '/dashboard/profile', label: 'โปรไฟล์', icon: User },
      { href: '/dashboard/membership', label: 'สมาชิกของฉัน', icon: Crown },
    ],
  },
  {
    id: 'more',
    title: 'เพิ่มเติม',
    items: [
      { href: '/blogs', label: 'บทความ', icon: BookOpen },
      { action: 'feedback', label: 'ส่งความคิดเห็น', icon: MessageSquare },
    ],
  },
  {
    id: 'admin',
    title: 'ผู้ดูแลระบบ',
    adminOnly: true,
    items: [
      { href: '/admin/exams', label: 'จัดการข้อสอบ', icon: ClipboardList },
      { href: '/admin/users', label: 'จัดการผู้ใช้', icon: Users },
      { href: '/admin/attempts', label: 'ประวัติ (Admin)', icon: BarChart3 },
      { href: '/admin', label: 'จัดการระบบ', icon: Settings, exact: true },
    ],
  },
];

const ITEM_BASE =
  'flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const ITEM_IDLE =
  'text-gray-500 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-800 dark:hover:bg-gray-700/50 dark:hover:text-gray-100';

interface DashboardSidebarProps {
  onNavigate?: () => void;
}

export default function DashboardSidebar({ onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const hasPro = useHasPro(user?.id);

  const initial = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 sticky top-0 h-screen overflow-y-auto flex flex-col border-r border-gray-100 dark:border-gray-700 flex-shrink-0">
      {/* Logo */}
      <div className="px-6 pt-7 pb-5">
        <Link href="/" className="flex items-center">
          <Image src="/logo-wordmark.png" alt="LUMO" width={110} height={33} priority />
        </Link>
      </div>

      <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

      {/* User info */}
      <div className="px-5 py-5 flex items-center gap-3">
        {user ? (
          <>
            <UserAvatar avatar={user.avatar} name={user.firstName} email={user.email} size={44} />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate leading-tight">
                {user.firstName
                  ? `${user.firstName} ${user.lastName || ''}`.trim()
                  : user.email?.split('@')[0]}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 dark:bg-gray-700">
              <User className="w-5 h-5 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">ผู้เยี่ยมชม</p>
              <p className="text-xs text-gray-400 mt-0.5">ยังไม่ได้เข้าสู่ระบบ</p>
            </div>
          </>
        )}
      </div>

      <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4 mb-3" />

      {/* Navigation */}
      <nav aria-label="เมนูหลัก" className="flex-1 px-3 pb-3 overflow-y-auto">
        {menuGroups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;
          const headingId = group.title ? `sidebar-group-${group.id}` : undefined;
          return (
            <div
              key={group.id}
              role={group.title ? 'group' : undefined}
              aria-labelledby={headingId}
              className={group.title ? 'mt-4' : undefined}
            >
              {group.title && (
                <p
                  id={headingId}
                  className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400"
                >
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.action === 'feedback') {
                    return (
                      <button
                        key="feedback"
                        type="button"
                        onClick={() => setFeedbackOpen(true)}
                        className={`${ITEM_BASE} ${ITEM_IDLE}`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                        {item.label}
                      </button>
                    );
                  }

                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname?.startsWith(item.href + '/');

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={`${ITEM_BASE} ${isActive ? 'bg-indigo-600 text-white shadow-sm' : ITEM_IDLE}`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                      {item.label}
                      {item.badge && (
                        <span
                          aria-hidden="true"
                          className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none tracking-wide ${
                            isActive
                              ? 'bg-white text-indigo-700 dark:bg-gray-900 dark:text-indigo-300'
                              : 'bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.badge && <span className="sr-only">เฉพาะ Pro</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* Upgrade / สมาชิก Pro + Login / Logout */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
        <Link
          href={hasPro ? '/dashboard/membership' : '/upgrade'}
          onClick={onNavigate}
          data-testid="sidebar-upgrade"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span
            aria-hidden="true"
            className="w-8 h-8 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center flex-shrink-0"
          >
            <Crown className="w-4 h-4 text-amber-950" />
          </span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{hasPro ? 'สมาชิก Pro' : 'Upgrade'}</span>
          {!hasPro && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-600 text-white dark:bg-indigo-500 text-xs font-bold">
              Pro
            </span>
          )}
        </Link>
        {user ? (
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-800 transition-all dark:hover:bg-gray-700/50 dark:hover:text-gray-100"
          >
            <LogOut className="w-5 h-5" />
            ออกจากระบบ
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 transition-all dark:hover:bg-indigo-900/30"
          >
            <LogIn className="w-5 h-5" />
            เข้าสู่ระบบ
          </Link>
        )}
      </div>
    </aside>
  );
}
