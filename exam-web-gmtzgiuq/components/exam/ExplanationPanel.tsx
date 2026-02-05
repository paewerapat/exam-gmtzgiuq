'use client';

import { BookOpen, X } from 'lucide-react';
import LatexRenderer from '@/components/latex/LatexRenderer';

interface ExplanationPanelProps {
  explanation: string | null | undefined;
  isVisible: boolean;
  onShow: () => void;
  onHide: () => void;
  disabled?: boolean;
  className?: string;
}

export default function ExplanationPanel({
  explanation,
  isVisible,
  onShow,
  onHide,
  disabled = false,
  className = '',
}: ExplanationPanelProps) {
  if (!explanation) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={onShow}
        disabled={disabled}
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg
          bg-blue-50 text-blue-700 border border-blue-200
          hover:bg-blue-100 transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
      >
        <BookOpen className="w-4 h-4" />
        <span>ดูเฉลย</span>
      </button>
    );
  }

  return (
    <div
      className={`
        relative p-4 rounded-lg bg-blue-50 border border-blue-200
        ${className}
      `}
    >
      <button
        type="button"
        onClick={onHide}
        className="absolute top-2 right-2 p-1 rounded hover:bg-blue-100"
      >
        <X className="w-4 h-4 text-blue-700" />
      </button>
      <div className="flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-blue-800 mb-2">คำอธิบาย</div>
          <div className="text-blue-700 prose prose-sm max-w-none">
            <LatexRenderer content={explanation} />
          </div>
        </div>
      </div>
    </div>
  );
}
