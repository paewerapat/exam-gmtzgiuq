'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, Loader2, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold text-indigo-600">
              ExamPrep
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <Link href="/blogs" className="text-gray-700 hover:text-indigo-600 transition">
              บทความ
            </Link>

            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            ) : user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                <LayoutDashboard className="w-4 h-4" />
                เมนูหลัก
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-gray-700 hover:text-indigo-600 transition"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                  สมัครสมาชิก
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 hover:text-indigo-600"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link
              href="/blogs"
              className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              บทความ
            </Link>
            {loading ? (
              <div className="px-3 py-2 flex items-center">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              </div>
            ) : user ? (
              <Link
                href="/dashboard"
                className="block px-3 py-2 text-indigo-600 hover:bg-gray-100 rounded-md font-medium flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <LayoutDashboard className="w-4 h-4" />
                เมนูหลัก
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="block px-3 py-2 text-indigo-600 hover:bg-gray-100 rounded-md font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  สมัครสมาชิก
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
