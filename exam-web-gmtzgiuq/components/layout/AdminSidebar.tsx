'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  ChevronLeft,
  BookOpen,
  ClipboardList,
  Tag,
  LayoutGrid,
} from 'lucide-react';

const menuItems = [
  { href: '/admin', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/admin/curriculum', label: 'หลักสูตร', icon: BookOpen },
  { href: '/admin/exams', label: 'ชุดข้อสอบ', icon: ClipboardList },
  { href: '/admin/categories', label: 'หมวดหมู่', icon: Tag },
  { href: '/admin/blogs', label: 'บทความ', icon: FileText },
  { href: '/admin/users', label: 'ผู้ใช้งาน', icon: Users },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 text-white sticky top-0 h-screen overflow-y-auto flex-shrink-0 flex flex-col">
      <div className="p-6 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-white mb-6">จัดการระบบ</h2>

        <nav className="space-y-1 flex-1">
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

        {/* Back to main dashboard */}
        <div className="pt-4 border-t border-gray-700 mt-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <LayoutGrid className="w-5 h-5" />
            กลับเมนูหลัก
          </Link>
        </div>
      </div>
    </aside>
  );
}
