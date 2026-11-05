'use client';

import { CalendarClock } from 'lucide-react';

interface ReleaseDateFieldProps {
  /** ค่า `datetime-local` เวลาไทย (`YYYY-MM-DDTHH:mm`) */
  value: string;
  onChange: (value: string) => void;
}

/** ช่อง "วันเผยแพร่" ในฟอร์มชุดข้อสอบของแอดมิน (แปลงเป็น ISO ด้วย lib/release-date ตอนบันทึก) */
export default function ReleaseDateField({ value, onChange }: ReleaseDateFieldProps) {
  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
        <CalendarClock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <label htmlFor="exam-release-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          วันเผยแพร่
        </label>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          (ใช้จัดลำดับบนหน้าเว็บ (ใหม่สุดอยู่บน) · เวลาไทย · ไม่ได้ซ่อนชุดข้อสอบก่อนถึงวัน)
        </span>
      </div>
      <input
        id="exam-release-date"
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark]"
      />
    </div>
  );
}
