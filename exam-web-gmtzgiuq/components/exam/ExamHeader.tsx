'use client';

import { ChevronLeft, Timer, Pause } from 'lucide-react';
import Link from 'next/link';
import { formatTime } from '@/lib/exam-utils';

interface ExamHeaderProps {
  timer: number;
  answeredCount: number;
  totalQuestions: number;
  onPause?: () => void;
  backUrl?: string;
  className?: string;
}

export default function ExamHeader({
  timer,
  answeredCount,
  totalQuestions,
  onPause,
  backUrl = '/dashboard/practice',
  className = '',
}: ExamHeaderProps) {
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className={`bg-white sticky top-0 z-20 ${className}`}>
      {/* Top bar */}
      <div className="flex items-center px-6 py-3">
        {/* Back link */}
        <Link
          href={backUrl}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition text-sm font-medium min-w-[90px]"
        >
          <ChevronLeft className="w-4 h-4" />
          Go back
        </Link>

        {/* Center: timer + pause */}
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-gray-600" />
            <span className="font-bold text-gray-900 text-2xl tabular-nums tracking-tight">
              {formatTime(timer)}
            </span>
          </div>
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition text-xs mt-0.5"
            >
              <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center flex-shrink-0">
                <Pause className="w-2 h-2" />
              </span>
              หยุดชั่วคราว
            </button>
          )}
        </div>

        {/* Right spacer to balance */}
        <div className="min-w-[90px]" />
      </div>

      {/* Green progress bar */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
