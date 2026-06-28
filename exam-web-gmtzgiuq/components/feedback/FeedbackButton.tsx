'use client';

import React, { useState } from 'react';
import FeedbackModal from './FeedbackModal';
import { MessageSquare } from 'lucide-react';

export default function FeedbackButton({ examId }: { examId?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 bottom-6 z-40 bg-white shadow-md rounded-full p-3 flex items-center gap-2 hover:shadow-lg transition"
        aria-label="Feedback"
      >
        <MessageSquare className="w-5 h-5 text-rose-600" />
        <span className="hidden sm:inline text-sm text-rose-600 font-medium">Feedback</span>
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} examId={examId} />
    </>
  );
}
