'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AdminSidebar from '@/components/layout/AdminSidebar';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// ตรงกับ breakpoint lg ของ Tailwind (sidebar ปกติแสดง / drawer เป็น lg:hidden)
const DESKTOP_QUERY = '(min-width: 1024px)';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // SEC-8: หน้าแอดมินเปิดได้เฉพาะ role admin (API กันข้อมูลอยู่แล้ว ส่วนนี้กันไม่ให้เห็น UI แอดมิน)
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // drawer มือถือ: Esc ปิด, เปิดแล้วย้าย focus เข้า drawer, Tab/Shift+Tab วนอยู่ใน drawer (focus trap),
  // ปิดแล้วคืน focus ให้ปุ่มเมนู
  useEffect(() => {
    if (sidebarOpen) {
      wasOpenRef.current = true;
      drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setSidebarOpen(false);
          return;
        }
        const drawer = drawerRef.current;
        if (e.key !== 'Tab' || !drawer) return;
        // drawer ถูกซ่อน (lg:hidden บนจอกว้าง) → ไม่ดัก Tab
        if (window.getComputedStyle(drawer).display === 'none') return;
        const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = !!active && drawer.contains(active);
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKeyDown);

      // ขยายหน้าต่างจน ≥ lg ระหว่าง drawer เปิด → ปิด drawer (จอกว้างใช้ sidebar ปกติ)
      const desktop =
        typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
      const onDesktopChange = (e: { matches: boolean }) => {
        if (e.matches) setSidebarOpen(false);
      };
      // (เปิด drawer ตอนจอ ≥ lg ไม่ได้ เพราะปุ่มเมนูเป็น lg:hidden — ถ้าเกิดขึ้น trap ข้ามเองด้วยเช็ก display ด้านบน)
      desktop?.addEventListener('change', onDesktopChange);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
        desktop?.removeEventListener('change', onDesktopChange);
      };
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // ไป login แล้วกลับมาหน้าเดิม (หน้า login ตรวจค่า redirect เองตาม SEC-13)
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/admin')}`);
    } else if (!isAdmin) {
      router.replace('/dashboard');
    }
  }, [user, loading, isAdmin, pathname, router]);

  // ระหว่างตรวจสิทธิ์หรือกำลังพาไปหน้าอื่น: ไม่ render เนื้อหาแอดมินเลย
  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar — ซ่อนบนจอ < lg (ใช้ drawer แทน) จอ ≥ lg เหมือนเดิม */}
      <div className="hidden lg:block flex-shrink-0">
        <AdminSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer — ปิดอยู่ = invisible (Tab/screen reader เข้าไม่ถึง)
          เปิด: visible ทันที (focus เข้าได้เลย) / ปิด: invisible หลังเลื่อนออกจบ (transition visibility เฉพาะตอนปิด) */}
      <div
        id="admin-mobile-drawer"
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 z-50 lg:hidden duration-300 ${
          sidebarOpen
            ? 'translate-x-0 visible transition-[transform,translate]'
            : '-translate-x-full invisible transition-[transform,translate,visibility]'
        }`}
      >
        <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* min-w-0: ให้เนื้อหาหดตามจอได้ ตารางกว้าง scroll ในกรอบของตัวเอง ไม่ดันทั้งหน้า */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-950 text-white border-b border-gray-800 dark:border-gray-700 sticky top-0 z-30">
          <button
            type="button"
            ref={menuButtonRef}
            onClick={() => setSidebarOpen(true)}
            aria-label="เปิดเมนูจัดการระบบ"
            aria-expanded={sidebarOpen}
            aria-controls="admin-mobile-drawer"
            className="p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold">จัดการระบบ</span>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
