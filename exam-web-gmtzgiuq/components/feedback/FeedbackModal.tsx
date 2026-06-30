'use client';

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { MessageSquareHeart, Sparkles, MessageCircle, User, X, Loader2, Send } from 'lucide-react';
import { sendFeedback, FeedbackInput } from '@/lib/api/feedback';
import { trackEvent } from '@/lib/api/analytics';

export default function FeedbackModal({ open, onClose, examId }: { open: boolean; onClose: () => void; examId?: string | null; }) {
  const [age, setAge] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSend() {
    if (!message.trim()) {
      toast.error('โปรดกรอกข้อความสั้น ๆ ที่ต้องการให้เห็น');
      return;
    }

    const payload: FeedbackInput = {
      examId: examId ?? null,
      age: typeof age === 'number' ? age : null,
      message: message.trim(),
      details: details.trim() || null,
    };

    try {
      setLoading(true);
      await sendFeedback(payload);
      trackEvent('feedback_submit', {
        hasDetails: details.trim().length > 0,
        age: typeof age === 'number' ? age : null,
        examId: examId ?? null,
      });
      toast.success('ขอบคุณสำหรับความคิดเห็นของคุณ');
      onClose();
    } catch (err: any) {
      console.error('Failed to send feedback', err);
      toast.error(err?.message || 'ไม่สามารถส่งความคิดเห็นได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 z-10 border border-gray-100 dark:border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <MessageSquareHeart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ส่งความคิดเห็น</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">เราอยากรับฟังความคิดเห็นของคุณ! ช่วยบอกเราเพื่อพัฒนา ExamPrep ให้ดีขึ้น</p>

        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          คุณอยากเห็นอะไรเพิ่มเติมใน ExamPrep?
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="พิมพ์ความคิดเห็นของคุณที่นี่..."
          className="mt-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg p-3 min-h-[80px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
        />

        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mt-4">
          <MessageCircle className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          มีอะไรอื่นที่อยากให้เรารู้อีกไหม (ไม่บังคับ)
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="รายละเอียดเพิ่มเติม..."
          className="mt-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg p-3 min-h-[60px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <select
              value={age as any}
              onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="">เลือกอายุ</option>
              {Array.from({ length: 10 }).map((_, i) => {
                const a = 11 + i;
                return (
                  <option key={a} value={a}>{a}</option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              disabled={loading}
            >
              ปิด
            </button>
            <button
              onClick={handleSend}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  ส่ง
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
