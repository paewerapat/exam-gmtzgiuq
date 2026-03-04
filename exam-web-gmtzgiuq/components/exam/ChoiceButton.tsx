'use client';

import { Check, X } from 'lucide-react';
import { getChoiceLetter } from '@/lib/exam-utils';
import LatexText from '@/components/latex/LatexText';

interface ChoiceButtonProps {
  index: number;
  text: string;
  isSelected: boolean;
  isCorrect?: boolean | null;
  showResult: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function ChoiceButton({
  index,
  text,
  isSelected,
  isCorrect,
  showResult,
  disabled = false,
  onClick,
}: ChoiceButtonProps) {
  const letter = getChoiceLetter(index);

  let cardStyle = 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40';
  let circleStyle = 'bg-gray-100 text-gray-600';
  let icon: React.ReactNode = null;

  if (isSelected && !showResult) {
    cardStyle = 'border-indigo-400 bg-indigo-50';
    circleStyle = 'bg-indigo-600 text-white';
  } else if (showResult) {
    if (isCorrect === true) {
      cardStyle = 'border-green-400 bg-green-50';
      circleStyle = 'bg-green-600 text-white';
      icon = <Check className="w-4 h-4 text-green-600 flex-shrink-0" />;
    } else if (isSelected && isCorrect === false) {
      cardStyle = 'border-red-400 bg-red-50';
      circleStyle = 'bg-red-600 text-white';
      icon = <X className="w-4 h-4 text-red-600 flex-shrink-0" />;
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || showResult}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all
        ${cardStyle}
        ${disabled || showResult ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full
          font-semibold text-sm transition-colors
          ${circleStyle}
        `}
      >
        {letter}
      </span>
      <span className="flex-1 text-left text-gray-700 text-sm leading-relaxed">
        <LatexText text={text} />
      </span>
      {icon}
    </button>
  );
}
