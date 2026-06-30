'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Loader2, User } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getAdminFeedback, type PaginatedFeedback } from '@/lib/api/feedback';

function userLabel(user: PaginatedFeedback['items'][number]['user']) {
  if (!user) return 'ผู้ใช้ที่ไม่ระบุตัวตน (Guest)';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}

export default function AdminFeedbackPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PaginatedFeedback | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminFeedback(currentPage, 20);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch feedback:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <FadeIn>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              Feedback จากผู้ใช้
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {data ? `ทั้งหมด ${data.total} รายการ` : 'ความคิดเห็นที่ผู้ใช้ส่งเข้ามาผ่านปุ่ม Feedback'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
              </div>
            ) : !data || data.items.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">ยังไม่มี feedback</div>
            ) : (
              <>
                <ul className="divide-y divide-gray-200">
                  {data.items.map((fb) => (
                    <li key={fb.id} className="p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          {userLabel(fb.user)}
                          {fb.age != null && (
                            <span className="text-gray-400 dark:text-gray-500">· อายุ {fb.age}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(fb.createdAt).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-900 dark:text-gray-100">{fb.message}</p>
                      {fb.details && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{fb.details}</p>
                      )}
                      {fb.examId && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">เกี่ยวกับข้อสอบ: {fb.examId}</p>
                      )}
                    </li>
                  ))}
                </ul>

                {data.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      หน้า {data.page} จาก {data.totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                        disabled={currentPage === data.totalPages}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
