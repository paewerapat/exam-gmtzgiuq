import Link from 'next/link';
import { Crown, Eye, Lock } from 'lucide-react';
import { PREDICTED_PAGE_HREF, previewBarText, previewUpgradeText, upgradeHref } from '@/lib/predicted';

// ส่วนแสดงผลของชุด Predicted (task 22) บนหน้าทำข้อสอบ / หน้าผล — ใช้ทั้งโหมดฝึก (indigo) และสอบจริง (rose)

type ExamMode = 'practice' | 'exam';

const ACCENT: Record<ExamMode, string> = {
  practice:
    'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 focus-visible:ring-indigo-500',
  exam: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400 focus-visible:ring-rose-500',
};

/** แถบใต้หัวหน้าทำข้อสอบ: "Preview X จาก Y ข้อ" + ปุ่ม Upgrade */
export function PredictedPreviewBar({
  answerable,
  total,
  venueKey,
  mode = 'practice',
}: {
  answerable: number;
  total: number;
  venueKey: string | null;
  mode?: ExamMode;
}) {
  return (
    <div
      role="note"
      aria-label="ชุดนี้ทำได้บางส่วน"
      data-testid="predicted-preview-bar"
      className="bg-sky-50 dark:bg-sky-900/30 border-b border-sky-100 dark:border-sky-800/50"
    >
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 min-w-0 flex-1 text-sm text-sky-900 dark:text-sky-100">
          <Eye className="w-4 h-4 flex-shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          <span className="font-semibold">{previewBarText(answerable, total)}</span>
          <span className="hidden sm:inline text-sky-700 dark:text-sky-300">· Upgrade เป็น Pro เพื่อทำได้ทั้งชุด</span>
        </p>
        <Link
          href={upgradeHref(venueKey)}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-full text-white text-xs sm:text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${ACCENT[mode]}`}
        >
          <Crown className="w-4 h-4" aria-hidden="true" />
          Upgrade เป็น Pro
        </Link>
      </div>
    </div>
  );
}

/** หน้าจอเมื่อ API ตอบ 403 PREDICTED_LOCKED — ไม่ใช่ error ทั่วไป มีปุ่ม Unlock ไปหน้าแพ็กเกจของสนาม */
export function PredictedLockedScreen({ venueKey }: { venueKey: string | null }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div
        role="status"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center"
        data-testid="predicted-locked"
      >
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">ชุดนี้สำหรับสมาชิก Pro</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Upgrade เป็น Pro เพื่อ Unlock ทำได้ทั้งชุด ทุกชุด ทุกสนามสอบ
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href={upgradeHref(venueKey)}
            className="inline-flex items-center justify-center gap-2 w-full min-h-11 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            <Crown className="w-5 h-5" aria-hidden="true" />
            Unlock
          </Link>
          <Link
            href={PREDICTED_PAGE_HREF}
            className="inline-flex items-center justify-center w-full min-h-11 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            กลับหน้า Predicted Exam
          </Link>
        </div>
      </div>
    </div>
  );
}

/** กล่องในหน้าผลของชุดที่ทำแบบ Preview: "Upgrade เป็น Pro เพื่อทำครบ Y ข้อ" */
export function PredictedUpgradeBox({
  answered,
  total,
  venueKey,
  mode = 'practice',
  className = '',
}: {
  answered: number;
  total: number;
  venueKey: string | null;
  mode?: ExamMode;
  className?: string;
}) {
  return (
    <aside
      aria-label="ทำชุดนี้ให้ครบ"
      data-testid="predicted-upgrade-box"
      className={`rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Crown className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-indigo-900 dark:text-indigo-100">{previewUpgradeText(total)}</p>
          <p className="text-sm text-indigo-800/80 dark:text-indigo-200/80">
            ผลนี้มาจาก Preview {answered.toLocaleString('th-TH')} ข้อแรกของชุด
          </p>
        </div>
      </div>
      <Link
        href={upgradeHref(venueKey)}
        className={`flex-shrink-0 inline-flex items-center justify-center min-h-11 px-5 rounded-xl text-white text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${ACCENT[mode]}`}
      >
        Upgrade เป็น Pro
      </Link>
    </aside>
  );
}
