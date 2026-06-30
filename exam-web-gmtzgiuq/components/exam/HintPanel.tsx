'use client';

import { Lightbulb, X } from 'lucide-react';
import LatexText from '@/components/latex/LatexText';

interface HintPanelProps {
  hint: string | null | undefined;
  isVisible: boolean;
  onShow: () => void;
  onHide: () => void;
  className?: string;
}

export default function HintPanel({
  hint,
  isVisible,
  onShow,
  onHide,
  className = '',
}: HintPanelProps) {
  if (!hint) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={onShow}
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg
          bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/50
          hover:bg-yellow-100 transition-colors
          ${className}
        `}
      >
        <Lightbulb className="w-4 h-4" />
        <span>ดูคำใบ้</span>
      </button>
    );
  }

  return (
    <div
      className={`
        relative p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800/50
        ${className}
      `}
    >
      <button
        type="button"
        onClick={onHide}
        className="absolute top-2 right-2 p-1 rounded hover:bg-yellow-100"
      >
        <X className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
      </button>
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-yellow-800 dark:text-yellow-300 mb-1">คำใบ้</div>
          <div className="text-yellow-700 dark:text-yellow-300">
            <LatexText text={hint} />
          </div>
        </div>
      </div>
    </div>
  );
}
