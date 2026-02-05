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
  let gradeColor = 'text-red-600';
  let gradeBg = 'bg-red-100';
  let gradeText = 'ต้องพยายามต่อไป';

  if (score >= 80) {
    gradeColor = 'text-green-600';
    gradeBg = 'bg-green-100';
    gradeText = 'ยอดเยี่ยม!';
  } else if (score >= 60) {
    gradeColor = 'text-blue-600';
    gradeBg = 'bg-blue-100';
    gradeText = 'ดีมาก';
  } else if (score >= 40) {
    gradeColor = 'text-yellow-600';
    gradeBg = 'bg-yellow-100';
    gradeText = 'พอใช้';
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Header with score */}
      <div className={`${gradeBg} p-6 text-center`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className={`w-8 h-8 ${gradeColor}`} />
          <span className={`text-lg font-medium ${gradeColor}`}>{gradeText}</span>
        </div>
        <div className={`text-5xl font-bold ${gradeColor}`}>
          {score.toFixed(1)}%
        </div>
        <div className="text-gray-600 mt-1">
          {correctAnswers} จาก {totalQuestions} ข้อ
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Correct */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <Target className="w-5 h-5" />
              <span className="font-medium">ถูกต้อง</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{correctAnswers}</div>
          </div>

          {/* Incorrect */}
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">ไม่ถูกต้อง</span>
            </div>
            <div className="text-2xl font-bold text-red-700">{incorrectAnswers}</div>
          </div>

          {/* Unanswered */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <span className="w-5 h-5 rounded-full border-2 border-gray-400" />
              <span className="font-medium">ไม่ได้ตอบ</span>
            </div>
            <div className="text-2xl font-bold text-gray-700">{unanswered}</div>
          </div>

          {/* Time */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Clock className="w-5 h-5" />
              <span className="font-medium">เวลาที่ใช้</span>
            </div>
            <div className="text-lg font-bold text-blue-700">
              {formatTimeReadable(totalTime)}
            </div>
          </div>
        </div>

        {/* Marked for review */}
        {markedForReview.length > 0 && (
          <div className="mt-4 bg-orange-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-700 mb-1">
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
