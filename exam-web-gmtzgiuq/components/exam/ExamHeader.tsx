'use client';

import { ArrowLeft, Flag } from 'lucide-react';
import Link from 'next/link';
import { categoryDisplayNames, type QuestionCategory } from '@/lib/api/questions';
import ExamTimer from './ExamTimer';
import ExamProgress from './ExamProgress';

interface ExamHeaderProps {
  category: QuestionCategory;
  timer: number;
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  onFinish: () => void;
  backUrl?: string;
  className?: string;
}

export default function ExamHeader({
  category,
  timer,
  currentIndex,
  totalQuestions,
  answeredCount,
  onFinish,
  backUrl = '/dashboard/practice',
  className = '',
}: ExamHeaderProps) {
  const categoryName = categoryDisplayNames[category] || category;

  return (
    <div className={`bg-white border-b border-gray-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Top row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <Link
              href={backUrl}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">กลับ</span>
            </Link>
            <div className="text-lg font-semibold text-gray-900">{categoryName}</div>
          </div>

          <div className="flex items-center gap-4">
            <ExamTimer seconds={timer} />
            <button
              type="button"
              onClick={onFinish}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Flag className="w-4 h-4" />
              <span className="hidden sm:inline">ส่งข้อสอบ</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <ExamProgress
          current={currentIndex + 1}
          total={totalQuestions}
          answeredCount={answeredCount}
        />
      </div>
    </div>
  );
}
