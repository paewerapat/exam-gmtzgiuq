'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import type { Question } from '@/lib/api/questions';
import { getChoiceLetter, getCorrectChoiceId } from '@/lib/exam-utils';
import LatexRenderer from '@/components/latex/LatexRenderer';
import LatexText from '@/components/latex/LatexText';

interface QuestionReviewProps {
  question: Question;
  userAnswer: string | undefined;
  questionNumber: number;
  className?: string;
}

export default function QuestionReview({
  question,
  userAnswer,
  questionNumber,
  className = '',
}: QuestionReviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const correctChoiceId = getCorrectChoiceId(question);
  const isCorrect = userAnswer === correctChoiceId;
  const isUnanswered = !userAnswer;

  return (
    <div
      className={`
        border rounded-lg overflow-hidden transition-all
        ${isCorrect ? 'border-green-200' : isUnanswered ? 'border-gray-200' : 'border-red-200'}
        ${className}
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center justify-between p-4 text-left
          ${isCorrect ? 'bg-green-50' : isUnanswered ? 'bg-gray-50' : 'bg-red-50'}
        `}
      >
        <div className="flex items-center gap-3">
          <span
            className={`
              flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
              ${isCorrect ? 'bg-green-200 text-green-700' : isUnanswered ? 'bg-gray-200 text-gray-600' : 'bg-red-200 text-red-700'}
            `}
          >
            {questionNumber}
          </span>
          <div className="flex items-center gap-2">
            {isCorrect ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : isUnanswered ? (
              <span className="text-gray-500 text-sm">ไม่ได้ตอบ</span>
            ) : (
              <X className="w-5 h-5 text-red-600" />
            )}
            <span
              className={`text-sm font-medium ${
                isCorrect ? 'text-green-700' : isUnanswered ? 'text-gray-600' : 'text-red-700'
              }`}
            >
              {isCorrect ? 'ถูกต้อง' : isUnanswered ? 'ไม่ได้ตอบ' : 'ไม่ถูกต้อง'}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 bg-white">
          {/* Question */}
          <div className="prose prose-sm max-w-none mb-4">
            <LatexRenderer content={question.question} />
          </div>

          {/* Question image */}
          {question.questionImage && (
            <div className="mb-4">
              <img
                src={question.questionImage}
                alt="Question"
                className="max-w-full h-auto rounded-lg border border-gray-200"
              />
            </div>
          )}

          {/* Choices */}
          <div className="space-y-2 mb-4">
            {question.choices.map((choice, index) => {
              const isUserAnswer = choice.id === userAnswer;
              const isCorrectAnswer = choice.id === correctChoiceId;

              let bgColor = 'bg-gray-50';
              let textColor = 'text-gray-700';
              let icon = null;

              if (isCorrectAnswer) {
                bgColor = 'bg-green-100';
                textColor = 'text-green-700';
                icon = <Check className="w-4 h-4 text-green-600" />;
              } else if (isUserAnswer && !isCorrectAnswer) {
                bgColor = 'bg-red-100';
                textColor = 'text-red-700';
                icon = <X className="w-4 h-4 text-red-600" />;
              }

              return (
                <div
                  key={choice.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${bgColor}`}
                >
                  <span
                    className={`
                      flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full
                      text-xs font-medium
                      ${isCorrectAnswer ? 'bg-green-600 text-white' : isUserAnswer ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-600'}
                    `}
                  >
                    {getChoiceLetter(index)}
                  </span>
                  <span className={`flex-1 ${textColor}`}>
                    <LatexText text={choice.text} />
                  </span>
                  {icon}
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          {question.explanation && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="font-medium text-blue-800 mb-2">คำอธิบาย</div>
              <div className="text-blue-700 prose prose-sm max-w-none">
                <LatexRenderer content={question.explanation} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
