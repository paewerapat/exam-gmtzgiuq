import Link from 'next/link';
import { BookOpen, Clock } from 'lucide-react';
import type { MockExamSummary } from '@/lib/api/exams';
import { formatMockContext, formatMockMeta, mockCategoryLabel, type MockExamAccess } from '@/lib/mock-exam';
import MockExamBanner from './MockExamBanner';
import MockAccessBadge from './MockAccessBadge';

interface MockExamCardProps {
  exam: MockExamSummary;
  /** สิทธิ์ของบัญชี (งานที่ 2) */
  access?: MockExamAccess | null;
}

/** การ์ดชุด Mock Exam: แบนเนอร์ / สนามสอบ · วิชา / ชื่อชุด / จำนวนข้อ · เวลา / ป้าย — คลิกทั้งใบไปหน้ารายละเอียด */
export default function MockExamCard({ exam, access }: MockExamCardProps) {
  return (
    <Link
      href={`/dashboard/mock-exams/${exam.id}`}
      className="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <MockExamBanner
        title={exam.title}
        category={exam.category}
        categoryLabel={mockCategoryLabel(exam)}
        bannerImage={exam.bannerImage}
      />
      <div className="p-4 flex flex-col flex-1 min-w-0">
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{formatMockContext(exam)}</span>
        </p>
        <h3 className="mt-1 font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 break-words group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
          {exam.title}
        </h3>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 min-w-0">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{formatMockMeta(exam.questionCount, exam.durationMinutes)}</span>
          </span>
          <MockAccessBadge exam={exam} access={access} />
        </div>
      </div>
    </Link>
  );
}
