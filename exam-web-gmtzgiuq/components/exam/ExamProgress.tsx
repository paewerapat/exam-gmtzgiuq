'use client';

interface ExamProgressProps {
  current: number;
  total: number;
  answeredCount: number;
  className?: string;
}

export default function ExamProgress({
  current,
  total,
  answeredCount,
  className = '',
}: ExamProgressProps) {
  const progress = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          ข้อที่ <span className="font-semibold text-indigo-600">{current}</span> จาก{' '}
          <span className="font-semibold">{total}</span>
        </span>
        <span>
          ตอบแล้ว{' '}
          <span className="font-semibold text-green-600">{answeredCount}</span> ข้อ ({progress}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
