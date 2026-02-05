'use client';

import { useState } from 'react';
import type { Question } from '@/lib/api/questions';
import LatexRenderer from '@/components/latex/LatexRenderer';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  className?: string;
}

export default function QuestionCard({
  question,
  questionNumber,
  className = '',
}: QuestionCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className={`bg-white rounded-lg ${className}`}>
      {/* Question number */}
      <div className="text-sm text-gray-500 mb-2">ข้อที่ {questionNumber}</div>

      {/* Question text with LaTeX support */}
      <div className="prose prose-lg max-w-none mb-4">
        <LatexRenderer content={question.question} />
      </div>

      {/* Question image if exists */}
      {question.questionImage && !imageError && (
        <div className="mt-4 mb-4">
          <img
            src={question.questionImage}
            alt="Question image"
            className="max-w-full h-auto rounded-lg border border-gray-200"
            onError={() => setImageError(true)}
          />
        </div>
      )}
    </div>
  );
}
