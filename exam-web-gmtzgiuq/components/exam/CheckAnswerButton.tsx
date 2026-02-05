'use client';

import { CheckCircle, XCircle } from 'lucide-react';

interface CheckAnswerButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isChecked: boolean;
  isCorrect: boolean | null;
  className?: string;
}

export default function CheckAnswerButton({
  onClick,
  disabled = false,
  isChecked,
  isCorrect,
  className = '',
}: CheckAnswerButtonProps) {
  if (isChecked) {
    return (
      <div
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium
          ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          ${className}
        `}
      >
        {isCorrect ? (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>ถูกต้อง!</span>
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5" />
            <span>ไม่ถูกต้อง</span>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium
        bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <CheckCircle className="w-5 h-5" />
      <span>ตรวจคำตอบ</span>
    </button>
  );
}
