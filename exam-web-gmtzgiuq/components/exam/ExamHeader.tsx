'use client';

import { ChevronLeft, Timer, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { formatTime } from '@/lib/exam-utils';

interface ExamHeaderProps {
  timer: number;
  answeredCount: number;
  totalQuestions: number;
  backUrl?: string;
  className?: string;
  hasDuration?: boolean;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

export default function ExamHeader({
  timer,
  answeredCount,
  totalQuestions,
  backUrl = '/dashboard/practice',
  className = '',
  hasDuration = false,
  isPaused = false,
  onPause,
  onResume,
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

        {/* Center: timer + pause button */}
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Timer className={`w-5 h-5 ${isPaused ? 'text-orange-400' : 'text-gray-600 dark:text-gray-400'}`} />
            <span className={`font-bold text-2xl tabular-nums tracking-tight ${isPaused ? 'text-orange-500' : 'text-gray-900 dark:text-gray-100'}`}>
              {formatTime(timer)}
            </span>
            {hasDuration && (
              <button
                type="button"
                onClick={isPaused ? onResume : onPause}
                title={isPaused ? 'ทำต่อ' : 'หยุดชั่วคราว'}
                className={`ml-1 p-1.5 rounded-full transition ${
                  isPaused
                    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {isPaused
                  ? <Play className="w-4 h-4" fill="currentColor" />
                  : <Pause className="w-4 h-4" />}
              </button>
            )}
          </div>
          {isPaused && (
            <span className="text-xs text-orange-500 font-medium mt-0.5">หยุดชั่วคราว</span>
          )}
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
