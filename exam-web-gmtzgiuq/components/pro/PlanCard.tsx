import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import type { ProMySubscription, ProPublicPlan } from '@/lib/api/pro';
import { formatSatang } from '@/lib/pro';
import { formatThaiDate } from '@/lib/unlock-codes';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';
const BTN_BASE = `flex items-center justify-center w-full min-h-12 px-4 py-2.5 rounded-xl font-semibold transition ${FOCUS_RING}`;
const BTN_FILLED = `${BTN_BASE} bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-400`;
const BTN_OUTLINE = `${BTN_BASE} border-2 border-indigo-600 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-500/10`;
const BTN_DISABLED = `${BTN_BASE} border-2 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed dark:border-gray-700 dark:bg-gray-700/60 dark:text-gray-400`;

interface PlanCardProps {
  plan: ProPublicPlan;
  /** สิทธิ์ที่ยังใช้ได้ของแพ็กเกจนี้ (null = ไม่ใช่แพ็กเกจปัจจุบัน) */
  current: ProMySubscription | null;
  isLoggedIn: boolean;
  /** กดปุ่มสมัครของแพ็กเกจที่ต้องจ่าย */
  onSubscribe: (plan: ProPublicPlan) => void;
}

/** การ์ดแพ็กเกจในหน้า Upgrade — ข้อความทั้งหมดมาจาก API (แสดงเป็น text) */
export default function PlanCard({ plan, current, isLoggedIn, onSubscribe }: PlanCardProps) {
  const isFree = plan.rank === 0;
  const headingId = `plan-${plan.id || plan.code}-name`;
  const label = plan.buttonText || (isFree ? 'เริ่มใช้งาน' : 'สมัคร');
  const until = current ? formatThaiDate(current.currentPeriodEnd) : null;

  let action: React.ReactNode;
  if (current) {
    action = (
      <p
        data-testid="current-plan"
        className="flex items-center justify-center gap-1.5 w-full min-h-12 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-semibold dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/60"
      >
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span>
          แพ็กเกจปัจจุบัน{until ? ` · ใช้ได้ถึง ${until}` : ''}
        </span>
      </p>
    );
  } else if (isFree) {
    action = (
      <Link href={isLoggedIn ? '/dashboard/practice' : '/register'} className={plan.highlight ? BTN_FILLED : BTN_OUTLINE}>
        {label}
      </Link>
    );
  } else if (!plan.isPurchasable) {
    action = (
      <button type="button" disabled className={BTN_DISABLED}>
        {label}
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => onSubscribe(plan)} className={plan.highlight ? BTN_FILLED : BTN_OUTLINE}>
        {label}
      </button>
    );
  }

  return (
    <article
      aria-labelledby={headingId}
      data-testid={`plan-card-${plan.code}`}
      className={`relative flex flex-col min-w-0 rounded-2xl p-5 text-center ${
        plan.highlight
          ? 'border-2 border-indigo-600 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-500/10 shadow-lg shadow-indigo-100 dark:shadow-none'
          : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      {plan.badge && (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 max-w-[90%] truncate rounded-full px-3 py-0.5 text-xs font-semibold ${
            plan.isPurchasable || isFree
              ? 'bg-indigo-600 text-white dark:bg-indigo-500'
              : 'bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-100'
          }`}
        >
          {plan.badge}
        </span>
      )}
      <h3 id={headingId} className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 break-words">
        {plan.name}
      </h3>
      {plan.tagline && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 break-words">{plan.tagline}</p>
      )}
      <p className="mt-4 flex flex-wrap items-baseline justify-center gap-x-1.5">
        <span className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
          {formatSatang(plan.priceSatang)}
        </span>
        {plan.priceUnit && <span className="text-sm text-gray-600 dark:text-gray-400">{plan.priceUnit}</span>}
      </p>
      {plan.priceNote && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">{plan.priceNote}</p>
      )}
      <div className="mt-auto pt-5">{action}</div>
    </article>
  );
}
