'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X, ListChecks } from 'lucide-react';
import type { Question } from '@/lib/api/questions';
import {
  getChoiceLetter,
  getCorrectChoiceIds,
  getAnswerStatus,
  isMultiAnswer,
  parseChoiceAnswer,
  formatChoiceLetters,
} from '@/lib/exam-utils';
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
  const status = getAnswerStatus(question, userAnswer);
  const isCorrect = status === 'correct';
  const isUnanswered = status === 'unanswered';
  const isMulti = isMultiAnswer(question);
  const correctChoiceIds = getCorrectChoiceIds(question);
  const selectedChoiceIds = question.type === 'short_answer' ? [] : parseChoiceAnswer(userAnswer);

  return (
    <div
      className={`
        border rounded-lg overflow-hidden transition-all
        ${isCorrect ? 'border-green-200 dark:border-green-800/50' : isUnanswered ? 'border-gray-200 dark:border-gray-700' : 'border-red-200 dark:border-red-800/50'}
        ${className}
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center justify-between p-4 text-left
          ${isCorrect ? 'bg-green-50 dark:bg-green-900/30' : isUnanswered ? 'bg-gray-50 dark:bg-gray-900' : 'bg-red-50 dark:bg-red-900/30'}
        `}
      >
        <div className="flex items-center gap-3">
          <span
            className={`
              flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
              ${isCorrect ? 'bg-green-200 text-green-700 dark:text-green-300' : isUnanswered ? 'bg-gray-200 text-gray-600 dark:text-gray-400' : 'bg-red-200 text-red-700 dark:text-red-300'}
            `}
          >
            {questionNumber}
          </span>
          <div className="flex items-center gap-2">
            {isCorrect ? (
              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : isUnanswered ? (
              <span className="text-gray-500 dark:text-gray-400 text-sm">ไม่ได้ตอบ</span>
            ) : (
              <X className="w-5 h-5 text-red-600 dark:text-red-400" />
            )}
            <span
              className={`text-sm font-medium ${
                isCorrect ? 'text-green-700 dark:text-green-300' : isUnanswered ? 'text-gray-600 dark:text-gray-400' : 'text-red-700 dark:text-red-300'
              }`}
            >
              {isCorrect ? 'ถูกต้อง' : isUnanswered ? 'ไม่ได้ตอบ' : 'ไม่ถูกต้อง'}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
              />
            </div>
          )}

          {/* ข้อหลายคำตอบ: บอกชุดที่เลือกและชุดที่ถูกเป็นตัวอักษร */}
          {isMulti && (
            <div className="mb-3 space-y-1 text-sm">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                <ListChecks className="w-3.5 h-3.5" />
                เลือกได้มากกว่า 1 ข้อ (ต้องเลือกครบทุกข้อที่ถูก)
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                คำตอบของคุณ:{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedChoiceIds.length > 0 ? formatChoiceLetters(question, selectedChoiceIds) : 'ไม่ได้ตอบ'}
                </span>
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                คำตอบที่ถูก:{' '}
                <span className="font-semibold text-green-700 dark:text-green-300">
                  {formatChoiceLetters(question, correctChoiceIds)}
                </span>
              </p>
            </div>
          )}

          {/* Choices */}
          <div className="space-y-2 mb-4">
            {question.choices.map((choice, index) => {
              const isUserAnswer = selectedChoiceIds.includes(choice.id);
              const isCorrectAnswer = correctChoiceIds.includes(choice.id);
              const isMissed = isMulti && isCorrectAnswer && !isUserAnswer;

              let bgColor = 'bg-gray-50 dark:bg-gray-900';
              let textColor = 'text-gray-700 dark:text-gray-300';
              let icon = null;

              if (isMissed) {
                bgColor = 'bg-white dark:bg-gray-800 border-2 border-dashed border-green-400 dark:border-green-600';
                textColor = 'text-green-700 dark:text-green-300';
                icon = (
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                    ข้อที่ถูก (ไม่ได้เลือก)
                  </span>
                );
              } else if (isCorrectAnswer) {
                bgColor = 'bg-green-100 dark:bg-green-900/30';
                textColor = 'text-green-700 dark:text-green-300';
                icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400" />;
              } else if (isUserAnswer && !isCorrectAnswer) {
                bgColor = 'bg-red-100 dark:bg-red-900/30';
                textColor = 'text-red-700 dark:text-red-300';
                icon = <X className="w-4 h-4 text-red-600 dark:text-red-400" />;
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
                      ${isCorrectAnswer ? 'bg-green-600 text-white' : isUserAnswer ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-600 dark:text-gray-400'}
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
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800/50">
              <div className="font-medium text-blue-800 dark:text-blue-300 mb-2">คำอธิบาย</div>
              <div className="text-blue-700 dark:text-blue-300 prose prose-sm max-w-none">
                <LatexRenderer content={question.explanation} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
