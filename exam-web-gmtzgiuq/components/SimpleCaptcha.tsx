'use client';

import { useState, useEffect, useCallback } from 'react';
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
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">ยืนยันว่าคุณไม่ใช่บอท</span>
        <button
          type="button"
          onClick={generateCaptcha}
          className="text-gray-500 hover:text-indigo-600 transition"
          title="สร้างโจทย์ใหม่"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-white border border-gray-300 rounded-lg px-4 py-2 font-mono text-lg font-bold text-gray-800 select-none">
          {num1} {operator} {num2} = ?
        </div>

        <input
          type="number"
          value={userAnswer}
          onChange={(e) => handleChange(e.target.value)}
          className={`w-20 px-3 py-2 border rounded-lg text-center font-mono text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
            userAnswer && isVerified
              ? 'border-green-500 bg-green-50'
              : userAnswer && !isVerified
              ? 'border-red-500 bg-red-50'
              : 'border-gray-300'
          }`}
          placeholder="?"
        />

        {userAnswer && (
          <span className={`text-sm font-medium ${isVerified ? 'text-green-600' : 'text-red-600'}`}>
            {isVerified ? '✓ ถูกต้อง' : '✗ ไม่ถูกต้อง'}
          </span>
        )}
      </div>
    </div>
  );
}
