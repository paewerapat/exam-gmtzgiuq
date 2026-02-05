'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Calendar, CheckCircle, XCircle } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      });
    }
  }, [user]);

  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">โปรไฟล์</h1>

      {/* Profile Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center space-x-6">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt="avatar"
              className="w-20 h-20 rounded-full"
            />
          ) : (
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.email?.split('@')[0]}
            </h2>
            <div className="flex items-center mt-1 text-gray-600">
              <Mail className="w-4 h-4 mr-2" />
              {user.email}
            </div>
            <div className="flex items-center mt-1 text-sm">
              {user.isEmailVerified ? (
                <span className="flex items-center text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  ยืนยันอีเมลแล้ว
                </span>
              ) : (
                <span className="flex items-center text-yellow-600">
                  <XCircle className="w-4 h-4 mr-1" />
                  ยังไม่ได้ยืนยันอีเมล
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลส่วนตัว</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อ
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="ชื่อ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                นามสกุล
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="นามสกุล"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              อีเมล
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              ไม่สามารถเปลี่ยนอีเมลได้
            </p>
          </div>

          {user.createdAt && (
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-2" />
              สมาชิกตั้งแต่ {new Date(user.createdAt).toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              บันทึก
            </button>
            <button
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl font-bold text-indigo-600">0</div>
          <div className="text-gray-600 mt-1">ข้อสอบที่ทำ</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl font-bold text-green-600">0%</div>
          <div className="text-gray-600 mt-1">คะแนนเฉลี่ย</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="text-3xl font-bold text-purple-600">0</div>
          <div className="text-gray-600 mt-1">ชั่วโมงฝึกฝน</div>
        </div>
      </div>
    </div>
  );
}
