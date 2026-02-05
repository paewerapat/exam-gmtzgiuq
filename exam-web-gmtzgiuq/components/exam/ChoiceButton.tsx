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

  // Determine styles based on state
  let buttonStyles = 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50';
  let letterStyles = 'bg-gray-100 text-gray-600';
  let icon = null;

  if (isSelected && !showResult) {
    buttonStyles = 'border-indigo-500 bg-indigo-50';
    letterStyles = 'bg-indigo-600 text-white';
  } else if (showResult) {
    if (isCorrect === true) {
      // This is the correct answer
      buttonStyles = 'border-green-500 bg-green-50';
      letterStyles = 'bg-green-600 text-white';
      icon = <Check className="w-5 h-5 text-green-600" />;
    } else if (isSelected && isCorrect === false) {
      // User selected this but it's wrong
      buttonStyles = 'border-red-500 bg-red-50';
      letterStyles = 'bg-red-600 text-white';
      icon = <X className="w-5 h-5 text-red-600" />;
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || showResult}
      className={`
        w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all
        ${buttonStyles}
        ${disabled || showResult ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full
          font-semibold text-sm transition-colors
          ${letterStyles}
        `}
      >
        {letter}
      </span>
      <span className="flex-1 text-left text-gray-700">
        <LatexText text={text} />
      </span>
      {icon && <span className="flex-shrink-0">{icon}</span>}
    </button>
  );
}
