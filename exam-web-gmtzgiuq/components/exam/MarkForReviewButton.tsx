'use client';

import { Bookmark, BookmarkCheck } from 'lucide-react';

interface MarkForReviewButtonProps {
  isMarked: boolean;
  onClick: () => void;
  className?: string;
}

export default function MarkForReviewButton({
  isMarked,
  onClick,
  className = '',
}: MarkForReviewButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
        ${
          isMarked
            ? 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200'
            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
        }
        ${className}
      `}
    >
      {isMarked ? (
        <>
          <BookmarkCheck className="w-4 h-4" />
          <span>ยกเลิกเครื่องหมาย</span>
        </>
      ) : (
        <>
          <Bookmark className="w-4 h-4" />
          <span>ทำเครื่องหมาย</span>
        </>
      )}
    </button>
  );
}
