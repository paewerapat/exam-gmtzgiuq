'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExamSession } from '@/types/exam';

interface QuestionNavigationProps {
  session: ExamSession;
  onJumpTo: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export default function QuestionNavigation({
  session,
  onJumpTo,
  onPrev,
  onNext,
  className = '',
}: QuestionNavigationProps) {
  const { questionIds, currentIndex, answers, markedForReview } = session;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questionIds.length - 1;

  return (
    <div className={`${className}`}>
      {/* Navigation grid */}
      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-2">เลือกข้อ</div>
        <div className="grid grid-cols-5 gap-2">
          {questionIds.map((qId, index) => {
            const isAnswered = !!answers[qId];
            const isMarked = markedForReview.includes(qId);
            const isCurrent = index === currentIndex;

            let bgColor = 'bg-gray-100 hover:bg-gray-200 text-gray-600';
            if (isAnswered) {
              bgColor = 'bg-green-100 hover:bg-green-200 text-green-700';
            }
            if (isMarked) {
              bgColor = 'bg-orange-100 hover:bg-orange-200 text-orange-700';
            }
            if (isCurrent) {
              bgColor = 'bg-indigo-600 text-white';
            }

            return (
              <button
                key={qId}
                type="button"
                onClick={() => onJumpTo(index)}
                className={`
                  relative w-full aspect-square flex items-center justify-center
                  rounded-lg font-medium text-sm transition-colors
                  ${bgColor}
                  ${isCurrent ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}
                `}
              >
                {index + 1}
                {isMarked && !isCurrent && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-4">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-200" />
          <span>ยังไม่ตอบ</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-200" />
          <span>ตอบแล้ว</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-200" />
          <span>ทำเครื่องหมาย</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-indigo-600" />
          <span>ปัจจุบัน</span>
        </div>
      </div>

      {/* Prev/Next buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          className={`
            flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg
            border border-gray-300 transition-colors
            ${
              isFirst
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:border-gray-400'
            }
          `}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>ก่อนหน้า</span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          className={`
            flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg
            bg-indigo-600 text-white transition-colors
            ${
              isLast
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-indigo-700'
            }
          `}
        >
          <span>ถัดไป</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
