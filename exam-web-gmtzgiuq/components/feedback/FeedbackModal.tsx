'use client';

import React, { useState } from 'react';
import { toast } from 'react-toastify';
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
      toast.error(err?.message || 'ไม่สามารถส่ง feedback ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full p-6 z-10">
        <h3 className="text-lg font-semibold mb-2">Feedback</h3>
        <p className="text-sm text-gray-500 mb-4">We'd love to hear your thoughts! Share your feedback and help us improve.</p>

        <label className="block text-sm font-medium text-gray-700">What would you like to see on OnePrep?</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-2 w-full border rounded-md p-2 min-h-[80px]"
        />

        <label className="block text-sm font-medium text-gray-700 mt-3">Anything else you want us to know? (Optional)</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="mt-2 w-full border rounded-md p-2 min-h-[60px]"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">อายุ</label>
            <select
              value={age as any}
              onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
              className="ml-2 border rounded-md p-1"
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
              className="px-4 py-2 rounded-md border text-sm"
              disabled={loading}
            >
              Close
            </button>
            <button
              onClick={handleSend}
              className="px-4 py-2 rounded-md bg-black text-white text-sm"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
