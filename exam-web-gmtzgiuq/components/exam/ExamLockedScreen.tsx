import Link from 'next/link';
import { Lock } from 'lucide-react';
import { UNLOCK_TEXT } from '@/lib/unlock-codes';

// หน้าจอเมื่อชุด Mock ล็อก (API ตอบ 403 EXAM_LOCKED) — ใช้ทั้ง /exam/[examId] และ /practice/exam/[examId] (task 15)
/**
 * 'load' = เปิดหน้าแล้วไม่มีสิทธิ์ (กำลังพาไปหน้ารายละเอียด)
 * 'during' = สิทธิ์หมดระหว่างทำ (progress/complete ได้ 403) — แจ้งชัด ๆ ให้ผู้ใช้กดไปหน้ารายละเอียดเอง
 */
export type LockedState = 'load' | 'during';

export default function ExamLockedScreen({ kind, detailHref }: { kind: LockedState; detailHref: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div
        role={kind === 'during' ? 'alert' : 'status'}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center"
      >
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {kind === 'during' ? 'สิทธิ์ของชุดนี้หมดอายุ' : UNLOCK_TEXT.examLocked}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {kind === 'during'
            ? `${UNLOCK_TEXT.lockedDuringExam} คำตอบยังเก็บไว้ในเครื่องนี้ ถ้าได้สิทธิ์ใหม่กลับมาทำต่อได้`
            : 'กำลังพาไปหน้ารายละเอียดชุดข้อสอบ...'}
        </p>
        <Link
          href={detailHref}
          className="inline-flex items-center justify-center w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
        >
          ไปหน้ารายละเอียดชุดข้อสอบ
        </Link>
      </div>
    </div>
  );
}
