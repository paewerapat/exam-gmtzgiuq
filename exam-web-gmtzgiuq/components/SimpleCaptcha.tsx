'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { RefreshCw } from 'lucide-react';

interface SimpleCaptchaProps {
  onVerify: (isValid: boolean) => void;
}

export default function SimpleCaptcha({ onVerify }: SimpleCaptchaProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [operator, setOperator] = useState<'+' | '-'>('+');
  const [userAnswer, setUserAnswer] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const questionId = `${baseId}-question`;
  const resultId = `${baseId}-result`;

  const generateCaptcha = useCallback(() => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    const op = Math.random() > 0.5 ? '+' : '-';

    // ให้ num1 มากกว่า num2 เสมอถ้าเป็นการลบ (ไม่ให้ติดลบ)
    if (op === '-' && n2 > n1) {
      setNum1(n2);
      setNum2(n1);
    } else {
      setNum1(n1);
      setNum2(n2);
    }
    setOperator(op);
    setUserAnswer('');
    setIsVerified(false);
    onVerify(false);
  }, [onVerify]);

  useEffect(() => {
    generateCaptcha();
  }, [generateCaptcha]);

  const correctAnswer = operator === '+' ? num1 + num2 : num1 - num2;

  const handleChange = (value: string) => {
    setUserAnswer(value);

    if (value === '') {
      setIsVerified(false);
      onVerify(false);
      return;
    }

    const isCorrect = parseInt(value, 10) === correctAnswer;
    setIsVerified(isCorrect);
    onVerify(isCorrect);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span id={labelId} className="text-sm font-medium text-gray-700 dark:text-gray-300">ยืนยันว่าคุณไม่ใช่บอท</span>
        <button
          type="button"
          onClick={generateCaptcha}
          className="w-11 h-11 -my-2 -mr-2 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400"
          title="สร้างโจทย์ใหม่"
          aria-label="สร้างโจทย์ใหม่"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          id={questionId}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 font-mono text-lg font-bold text-gray-800 dark:text-gray-200 select-none"
        >
          {num1} {operator} {num2} = ?
        </div>

        <input
          type="number"
          inputMode="numeric"
          value={userAnswer}
          onChange={(e) => handleChange(e.target.value)}
          aria-labelledby={`${labelId} ${questionId}`}
          aria-describedby={userAnswer ? resultId : undefined}
          aria-invalid={userAnswer && !isVerified ? true : undefined}
          className={`w-20 min-h-11 px-3 py-2 border rounded-lg text-center font-mono text-lg text-gray-900 dark:text-gray-100 focus:ring-2! focus:ring-indigo-500 dark:focus:ring-indigo-400 ${
            userAnswer && isVerified
              ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
              : userAnswer && !isVerified
              ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
          }`}
          placeholder="?"
        />

        <span aria-live="polite" id={resultId}>
          {userAnswer && (
            <span className={`text-sm font-medium ${isVerified ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {isVerified ? '✓ ถูกต้อง' : '✗ ไม่ถูกต้อง'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
