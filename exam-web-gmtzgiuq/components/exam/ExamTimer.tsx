'use client';

import { Clock } from 'lucide-react';
import { formatTime } from '@/lib/exam-utils';

interface ExamTimerProps {
  seconds: number;
  className?: string;
}

export default function ExamTimer({ seconds, className = '' }: ExamTimerProps) {
  return (
    <div className={`flex items-center gap-2 text-gray-700 ${className}`}>
      <Clock className="w-5 h-5" />
      <span className="font-mono text-lg font-semibold">{formatTime(seconds)}</span>
    </div>
  );
}
