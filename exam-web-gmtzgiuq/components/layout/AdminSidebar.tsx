'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  FileQuestion,
  Users,
  Settings,
  ChevronLeft,
} from 'lucide-react';

const menuItems = [
  { href: '/admin', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/admin/blogs', label: 'บทความ', icon: FileText },
  { href: '/admin/questions', label: 'โจทย์สอบ', icon: FileQuestion },
  { href: '/admin/users', label: 'ผู้ใช้งาน', icon: Users },
  { href: '/admin/settings', label: 'ตั้งค่า', icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 min-h-screen text-white">
      <div className="p-6">
        <Link href="/" className="flex items-center text-gray-400 hover:text-white mb-8">
          <ChevronLeft className="w-4 h-4 mr-2" />
          กลับหน้าเว็บ
        </Link>
        <h2 className="text-xl font-bold text-white mb-8">จัดการระบบ</h2>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && pathname?.startsWith(item.href));

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
    </aside>
  );
}
