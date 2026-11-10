import { getMockAccessBadge, type MockBadgeTone, type MockExamAccess } from '@/lib/mock-exam';

const TONE_CLASS: Record<MockBadgeTone, string> = {
  free: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
  campaign: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  price: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50',
  unlocked: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/50',
};

interface MockAccessBadgeProps {
  exam: Parameters<typeof getMockAccessBadge>[0];
  /** สิทธิ์ของบัญชี (`access` จาก API — task 15) */
  access?: MockExamAccess | null;
  className?: string;
}

export default function MockAccessBadge({ exam, access, className = '' }: MockAccessBadgeProps) {
  const badge = getMockAccessBadge(exam, access);
  return (
    <span
      data-testid="mock-access-badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${TONE_CLASS[badge.tone]} ${className}`}
    >
      {badge.label}
    </span>
  );
}
