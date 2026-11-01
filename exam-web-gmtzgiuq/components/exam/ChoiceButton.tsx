'use client';

import { Check, X } from 'lucide-react';
import { getChoiceLetter } from '@/lib/exam-utils';
import ChoiceContent from './ChoiceContent';

interface ChoiceButtonProps {
  index: number;
  text: string;
  /** รูปของตัวเลือก (ข้อความว่างได้ถ้ามีรูป) */
  image?: string | null;
  isSelected: boolean;
  /** ตัวเลือกนี้อยู่ในชุดคำตอบที่ถูกหรือไม่ (ส่งเมื่อ showResult) */
  isCorrect?: boolean | null;
  showResult: boolean;
  disabled?: boolean;
  /** ข้อที่ตอบได้หลายตัว: แสดงเป็น checkbox (กดซ้ำ = ยกเลิก) */
  multi?: boolean;
  onClick: () => void;
}

export default function ChoiceButton({
  index,
  text,
  image,
  isSelected,
  isCorrect,
  showResult,
  disabled = false,
  multi = false,
  onClick,
}: ChoiceButtonProps) {
  const letter = getChoiceLetter(index);

  let cardStyle = 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20';
  let circleStyle = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  let icon: React.ReactNode = null;
  // ข้อหลายคำตอบ: ตัวที่ถูกแต่ไม่ได้เลือก ต้องแยกจากตัวที่เลือกถูก
  const isMissed = multi && showResult && isCorrect === true && !isSelected;

  if (isSelected && !showResult) {
    cardStyle = 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30';
    circleStyle = 'bg-indigo-600 text-white';
  } else if (showResult) {
    if (isMissed) {
      cardStyle = 'border-dashed border-green-400 dark:border-green-600 bg-white dark:bg-gray-800';
      circleStyle = 'bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 border-2 border-green-500';
    } else if (isCorrect === true) {
      cardStyle = 'border-green-400 bg-green-50 dark:bg-green-900/30';
      circleStyle = 'bg-green-600 text-white';
      icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
    } else if (isSelected && isCorrect === false) {
      cardStyle = 'border-red-400 bg-red-50 dark:bg-red-900/30';
      circleStyle = 'bg-red-600 text-white';
      icon = <X className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />;
    }
  }

  // สัญลักษณ์ checkbox ของข้อหลายคำตอบ (ข้อปกติไม่มี — วงกลมตัวอักษรทำหน้าที่แบบ radio)
  let checkboxStyle = 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800';
  if (isSelected) {
    checkboxStyle = !showResult
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : isCorrect
        ? 'border-green-600 bg-green-600 text-white'
        : 'border-red-600 bg-red-600 text-white';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || showResult}
      aria-pressed={isSelected}
      className={`
        w-full flex ${image ? 'items-start' : 'items-center'} gap-3 px-4 py-3 rounded-2xl border-2 transition-all
        ${cardStyle}
        ${disabled || showResult ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {multi && (
        <span
          aria-hidden="true"
          data-testid="choice-checkbox"
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md border-2 transition-colors ${checkboxStyle}`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        </span>
      )}
      <span
        className={`
          flex-shrink-0 w-8 h-8 flex items-center justify-center
          font-semibold text-sm transition-colors
          ${multi ? 'rounded-lg' : 'rounded-full'}
          ${circleStyle}
        `}
      >
        {letter}
      </span>
      <span className="flex-1 min-w-0 text-left text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
        <ChoiceContent text={text} image={image} letter={letter} />
        {isMissed && (
          <span className="block w-fit mt-1 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            ข้อที่ถูก (ไม่ได้เลือก)
          </span>
        )}
      </span>
      {icon}
    </button>
  );
}
