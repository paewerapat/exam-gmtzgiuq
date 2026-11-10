import { BookOpen } from 'lucide-react';
import { getMockPriceLabel, normalizeAccessType, type MockAccessType, type MockExamAccess } from '@/lib/mock-exam';
import { formatThaiShortDate, UNLOCK_TEXT, UNLOCKED_WORD } from '@/lib/unlock-codes';

interface MockDetailHeroProps {
  title: string;
  /** "สนามสอบ · วิชา" */
  context: string;
  accessType: MockAccessType;
  price: number | null;
  questionCount: number;
  durationMinutes: number | null;
  access: MockExamAccess;
}

const PILL = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap';

type Pill = { label: string; className: string };

function heroPills(accessType: MockAccessType, price: number | null, access: MockExamAccess): Pill[] {
  if (accessType === 'free') {
    return [
      { label: 'FREE', className: 'bg-white text-emerald-700 dark:bg-gray-900 dark:text-emerald-300' },
      { label: 'ชุดฟรีทั่วไป', className: 'bg-white/20 text-white ring-1 ring-inset ring-white/30 dark:bg-white/10 dark:text-white dark:ring-white/20' },
    ];
  }
  const pills: Pill[] =
    accessType === 'code'
      ? [{ label: 'CAMPAIGN', className: 'bg-indigo-950 text-white tracking-wider dark:bg-gray-950 dark:text-white' }]
      : [{ label: getMockPriceLabel({ accessType, price }) ?? 'ต้องซื้อ', className: 'bg-white text-indigo-700 dark:bg-gray-900 dark:text-indigo-300' }];
  if (access.status === 'unlocked') {
    pills.push({ label: UNLOCKED_WORD, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200' });
  } else if (access.status === 'expired') {
    pills.push({ label: 'สิทธิ์หมดอายุ', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200' });
  } else if (accessType === 'code') {
    pills.push({ label: `Campaign · ${UNLOCK_TEXT.lockedStatus}`, className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200' });
  }
  return pills;
}

/** แถบหัวสีม่วงเต็มความกว้าง: ป้าย / ชื่อชุด / ตัวเลข "N ข้อ · M นาที" (+ วันหมดสิทธิ์ หรือ "ฟรี ทำได้ตลอด") */
export default function MockDetailHero({
  title,
  context,
  accessType: rawAccessType,
  price,
  questionCount,
  durationMinutes,
  access,
}: MockDetailHeroProps) {
  const accessType = normalizeAccessType(rawAccessType);
  const pills = heroPills(accessType, price, access);
  const stats: { value: string; label: string }[] = [{ value: questionCount.toLocaleString('th-TH'), label: 'ข้อ' }];
  // ไม่ตั้งเวลา → ไม่แสดงช่องนาที (กล่องรายละเอียดด้านล่างแสดง "ไม่จับเวลา")
  if (durationMinutes && durationMinutes > 0) {
    stats.push({ value: durationMinutes.toLocaleString('th-TH'), label: 'นาที' });
  }
  const until = access.status === 'unlocked' ? formatThaiShortDate(access.expiresAt) : null;
  if (until) stats.push({ value: until, label: 'ทำได้ถึง' });
  else if (accessType === 'free') stats.push({ value: 'ฟรี', label: 'ทำได้ตลอด' });

  return (
    <header
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-900 dark:to-violet-900 text-white px-5 py-6 sm:px-8 sm:py-7 shadow-sm"
      data-testid="mock-detail-hero"
    >
      {/* วงกลมตกแต่ง (ดีไซน์ภาพ 5–7) */}
      <svg
        className="absolute inset-y-0 right-0 h-full w-2/3 sm:w-1/2 pointer-events-none"
        viewBox="0 0 400 200"
        preserveAspectRatio="xMaxYMid slice"
        aria-hidden="true"
      >
        <circle cx="330" cy="40" r="120" fill="white" fillOpacity="0.08" />
        <circle cx="400" cy="190" r="90" fill="white" fillOpacity="0.07" />
        <circle cx="210" cy="230" r="70" fill="white" fillOpacity="0.05" />
      </svg>

      <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div className="min-w-0">
          <ul className="flex flex-wrap items-center gap-2" aria-label="สถานะชุดข้อสอบ">
            {pills.map((p) => (
              <li key={p.label} className={`${PILL} ${p.className}`}>
                {p.label}
              </li>
            ))}
          </ul>
          {context && (
            <p className="mt-3 text-sm font-medium text-white/90 flex items-center gap-1.5 min-w-0">
              <BookOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{context}</span>
            </p>
          )}
          <h1 className="mt-1 text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight break-words">{title}</h1>
        </div>

        <dl className="flex flex-shrink-0 gap-6 sm:gap-8" data-testid="mock-hero-stats">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse">
              <dt className="text-sm text-white/90">{s.label}</dt>
              <dd className="text-2xl font-extrabold leading-tight whitespace-nowrap">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}
