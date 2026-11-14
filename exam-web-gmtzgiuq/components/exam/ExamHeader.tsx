'use client';

import { ChevronLeft, Timer, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
  /** แทนนาฬิกาตรงกลาง (โหมดฝึก: ปุ่มตั้งค่าเวลา — task 21) ไม่ส่ง = นาฬิกาแบบเดิม */
  timerSlot?: ReactNode;
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
  timerSlot,
}: ExamHeaderProps) {
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className={`bg-white dark:bg-gray-800 sticky top-0 z-20 ${className}`}>
      {/* Top bar */}
      <div className={`flex items-center py-3 ${timerSlot ? 'px-3 sm:px-6' : 'px-6'}`}>
        {/* Back link — มีปุ่มตั้งค่าเวลา: จอแคบเหลือแค่ลูกศร ให้ปุ่มกลางพอดีจอ 375px */}
        <Link
          href={backUrl}
          aria-label={timerSlot ? 'Go back' : undefined}
          className={`flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition text-sm font-medium dark:hover:text-gray-200 ${
            timerSlot ? 'min-w-11 min-h-11 sm:min-w-[90px]' : 'min-w-[90px]'
          }`}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden={timerSlot ? true : undefined} />
          <span className={timerSlot ? 'hidden sm:inline' : undefined}>Go back</span>
        </Link>

        {/* Center: timer + pause button */}
        {timerSlot ? (
          <div className="flex-1 min-w-0 flex justify-center">{timerSlot}</div>
        ) : (
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Timer className={`w-5 h-5 ${isPaused ? 'text-orange-400' : 'text-gray-600 dark:text-gray-400'}`} />
            <span className={`font-bold text-2xl tabular-nums tracking-tight ${isPaused ? 'text-orange-500 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {formatTime(timer)}
            </span>
            {hasDuration && (
              <button
                type="button"
                onClick={isPaused ? onResume : onPause}
                title={isPaused ? 'ทำต่อ' : 'หยุดชั่วคราว'}
                className={`ml-1 p-1.5 rounded-full transition ${
                  isPaused
                    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:hover:bg-orange-800/50'
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
            <span className="text-xs text-orange-500 font-medium mt-0.5 dark:text-orange-400">หยุดชั่วคราว</span>
          )}
        </div>
        )}

        {/* Right spacer to balance */}
        <div className={timerSlot ? 'min-w-11 sm:min-w-[90px]' : 'min-w-[90px]'} />
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
