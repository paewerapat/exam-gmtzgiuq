import Link from 'next/link';
import { Crown, Lock } from 'lucide-react';
import { upgradeHref } from '@/lib/question-bank';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50 dark:focus-visible:ring-offset-gray-900';

/** แถบ "เฉพาะ Pro" ของ Challenge Questions เมื่อยังไม่มีสิทธิ์ของสนามนี้ — ปุ่ม Upgrade เลือกสนามไว้ให้ */
export default function ChallengeProNotice({ venueKey, venueName }: { venueKey: string; venueName: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-400 dark:bg-amber-500 text-amber-950 dark:text-amber-950 text-xs font-bold">
              เฉพาะ Pro
            </span>
            ข้อ Challenge ของ {venueName}
          </p>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            ดูจำนวนข้อได้ทุกคน สมัคร Pro ของสนามนี้เพื่อทำข้อ Challenge ได้ไม่จำกัด
          </p>
        </div>
      </div>
      <Link
        href={upgradeHref(venueKey)}
        className={`inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-semibold transition flex-shrink-0 ${FOCUS_RING}`}
      >
        <Crown className="w-4 h-4" aria-hidden="true" />
        Upgrade
      </Link>
    </div>
  );
}
