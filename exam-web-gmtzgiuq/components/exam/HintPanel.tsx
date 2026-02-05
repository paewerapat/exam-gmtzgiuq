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
          bg-yellow-50 text-yellow-700 border border-yellow-200
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
        relative p-4 rounded-lg bg-yellow-50 border border-yellow-200
        ${className}
      `}
    >
      <button
        type="button"
        onClick={onHide}
        className="absolute top-2 right-2 p-1 rounded hover:bg-yellow-100"
      >
        <X className="w-4 h-4 text-yellow-700" />
      </button>
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-yellow-800 mb-1">คำใบ้</div>
          <div className="text-yellow-700">
            <LatexText text={hint} />
          </div>
        </div>
      </div>
    </div>
  );
}
