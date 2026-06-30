'use client';

import { ChevronLeft, Timer } from 'lucide-react';
import Link from 'next/link';
import { formatTime } from '@/lib/exam-utils';

interface ExamHeaderProps {
  timer: number;
  answeredCount: number;
  totalQuestions: number;
  backUrl?: string;
  className?: string;
}

export default function ExamHeader({
  timer,
  answeredCount,
  totalQuestions,
  backUrl = '/dashboard/practice',
  className = '',
}: ExamHeaderProps) {
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className={`bg-white dark:bg-gray-800 sticky top-0 z-20 ${className}`}>
      {/* Top bar */}
      <div className="flex items-center px-6 py-3">
        {/* Back link */}
        <Link
          href={backUrl}
          className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 transition text-sm font-medium min-w-[90px]"
        >
          <ChevronLeft className="w-4 h-4" />
          Go back
        </Link>

        {/* Center: timer */}
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <span className="font-bold text-gray-900 dark:text-gray-100 text-2xl tabular-nums tracking-tight">
              {formatTime(timer)}
            </span>
          </div>
        </div>

        {/* Right spacer to balance */}
        <div className="min-w-[90px]" />
      </div>

      {/* Green progress bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
