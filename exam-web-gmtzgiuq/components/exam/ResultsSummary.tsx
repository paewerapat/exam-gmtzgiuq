'use client';

import { Trophy, Clock, Target, AlertTriangle, Bookmark } from 'lucide-react';
import type { ExamResult } from '@/types/exam';
import { formatTimeReadable } from '@/lib/exam-utils';

interface ResultsSummaryProps {
  result: ExamResult;
  className?: string;
}

export default function ResultsSummary({ result, className = '' }: ResultsSummaryProps) {
  const {
    totalQuestions,
    correctAnswers,
    incorrectAnswers,
    unanswered,
    score,
    totalTime,
    markedForReview,
  } = result;

  // Determine grade color
  let gradeColor = 'text-red-600 dark:text-red-400';
  let gradeBg = 'bg-red-100';
  let gradeText = 'ต้องพยายามต่อไป';

  if (score >= 80) {
    gradeColor = 'text-green-600 dark:text-green-400';
    gradeBg = 'bg-green-100';
    gradeText = 'ยอดเยี่ยม!';
  } else if (score >= 60) {
    gradeColor = 'text-blue-600 dark:text-blue-400';
    gradeBg = 'bg-blue-100';
    gradeText = 'ดีมาก';
  } else if (score >= 40) {
    gradeColor = 'text-yellow-600 dark:text-yellow-400';
    gradeBg = 'bg-yellow-100';
    gradeText = 'พอใช้';
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Header with score */}
      <div className={`${gradeBg} p-6 text-center`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className={`w-8 h-8 ${gradeColor}`} />
          <span className={`text-lg font-medium ${gradeColor}`}>{gradeText}</span>
        </div>
        <div className={`text-5xl font-bold ${gradeColor}`}>
          {score.toFixed(1)}%
        </div>
        <div className="text-gray-600 dark:text-gray-400 mt-1">
          {correctAnswers} จาก {totalQuestions} ข้อ
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Correct */}
          <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
              <Target className="w-5 h-5" />
              <span className="font-medium">ถูกต้อง</span>
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{correctAnswers}</div>
          </div>

          {/* Incorrect */}
          <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-1">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">ไม่ถูกต้อง</span>
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{incorrectAnswers}</div>
          </div>

          {/* Unanswered */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-1">
              <span className="w-5 h-5 rounded-full border-2 border-gray-400" />
              <span className="font-medium">ไม่ได้ตอบ</span>
            </div>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{unanswered}</div>
          </div>

          {/* Time */}
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-1">
              <Clock className="w-5 h-5" />
              <span className="font-medium">เวลาที่ใช้</span>
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {formatTimeReadable(totalTime)}
            </div>
          </div>
        </div>

        {/* Marked for review */}
        {markedForReview.length > 0 && (
          <div className="mt-4 bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-1">
              <Bookmark className="w-5 h-5" />
              <span className="font-medium">
                ทำเครื่องหมายไว้ {markedForReview.length} ข้อ
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
