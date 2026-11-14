import Link from 'next/link';
import type { MockExamSummary } from '@/lib/api/exams';
import { formatMockMeta } from '@/lib/mock-exam';
import {
  bannerColor,
  CAMPAIGN_STATUS_LABELS,
  campaignDateSegments,
  campaignStatusOf,
  cardContextLine,
  detailHref,
  getMockCardAction,
  progressInfo,
  type CardActionVariant,
  type TextSegment,
} from '@/lib/free-mock';

const STATUS_CLASS = {
  open: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  upcoming: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  ended: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
} as const;

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

const ACTION_CLASS: Record<CardActionVariant, string> = {
  primary:
    'bg-gray-900 text-white hover:bg-gray-700 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500',
  outline:
    'border-2 border-indigo-500 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-900/30',
  text: 'text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-2 dark:text-emerald-400 dark:hover:text-emerald-300',
};

function Segments({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.strong ? (
          // ส่วนตัวหนาสั้น ๆ (วันที่+เวลา / จำนวนวัน) ไม่ตัดกลางคำเมื่อการ์ดแคบ (4 คอลัมน์)
          <strong key={i} className="font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** แบนเนอร์สีตามวิชา (หรือรูปที่แอดมินอัป) + ป้าย FREE ซ้ายบน / CAMPAIGN ขวาบน */
function CardBanner({ exam }: { exam: MockExamSummary }) {
  const isCampaign = exam.accessType === 'code';
  const isFree = exam.accessType !== 'purchase';
  return (
    <div
      className="relative h-36 overflow-hidden"
      style={exam.bannerImage ? undefined : { backgroundColor: bannerColor(exam) }}
      aria-hidden="true"
    >
      {exam.bannerImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={exam.bannerImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-black/0 via-white/5 to-white/30" />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 280 140"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
          >
            <circle cx="215" cy="80" r="70" fill="white" fillOpacity="0.12" />
            <circle cx="270" cy="10" r="45" fill="white" fillOpacity="0.1" />
          </svg>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-4 pt-10 [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
            <p className="text-white font-extrabold text-lg leading-tight uppercase line-clamp-2 break-words">
              {exam.title}
            </p>
            {(exam.subjectLabel ?? exam.subjectName) && (
              <p className="mt-1 text-white/90 text-xs font-medium truncate" title={exam.subjectLabel ?? exam.subjectName ?? undefined}>
                {exam.subjectLabel ?? exam.subjectName}
              </p>
            )}
          </div>
        </>
      )}
      {isFree && (
        <span className="absolute top-0 left-0 px-3 py-1 rounded-br-xl bg-white text-emerald-700 dark:bg-gray-900 dark:text-emerald-300 text-[11px] font-bold tracking-wider">
          FREE
        </span>
      )}
      {isCampaign && (
        <span className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl bg-gray-900 text-white dark:bg-gray-950 text-[11px] font-bold tracking-widest">
          CAMPAIGN
        </span>
      )}
      {exam.accessType === 'purchase' && (
        <span className="absolute top-0 left-0 px-3 py-1 rounded-br-xl bg-amber-400 text-amber-950 dark:bg-amber-500 text-[11px] font-bold tracking-wider">
          PRO
        </span>
      )}
    </div>
  );
}

/** การ์ดชุดใน Free Mock Exam (ดีไซน์ภาพ 4): แบนเนอร์ / หมวด / ชื่อ / ข้อ·นาที / สถานะ / วันที่ / ความคืบหน้า / ปุ่ม */
export default function MockExamCard({ exam }: { exam: MockExamSummary }) {
  const status = campaignStatusOf(exam);
  const dates = campaignDateSegments(exam.campaign);
  const progress = progressInfo(exam.myProgress);
  const action = getMockCardAction(exam);
  const titleId = `mock-card-title-${exam.id}`;
  const contextLine = cardContextLine(exam);

  return (
    <article
      aria-labelledby={titleId}
      data-testid="mock-exam-card"
      className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0"
    >
      <CardBanner exam={exam} />

      <div className="px-5 pt-4 pb-4 flex flex-col flex-1 min-w-0 gap-1.5">
        {/* ตัดด้วย ellipsis → title ให้เห็นชื่อเต็มตอน hover */}
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={contextLine}>
          {contextLine}
        </p>
        <h3 id={titleId} className="font-bold text-gray-900 dark:text-gray-100 leading-snug break-words">
          <Link
            href={detailHref(exam.id)}
            className={`rounded hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors ${FOCUS}`}
          >
            {exam.title}
          </Link>
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{formatMockMeta(exam.questionCount, exam.durationMinutes)}</p>

        {status && (
          <p className="mt-1">
            <span
              data-testid="campaign-status"
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[status]}`}
            >
              {status === 'open' && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />}
              {CAMPAIGN_STATUS_LABELS[status]}
            </span>
          </p>
        )}
        {dates && (
          <p className="text-xs text-gray-600 dark:text-gray-400" data-testid="campaign-dates">
            <Segments segments={dates} />
          </p>
        )}
        {progress && (
          <div className="text-xs text-gray-600 dark:text-gray-400" data-testid="mock-progress">
            <p>
              <Segments segments={progress.segments} />
            </p>
            {progress.barPercent != null && (
              <div
                role="progressbar"
                aria-label="ความคืบหน้าของชุดนี้"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.barPercent}
                className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-sky-500 dark:bg-sky-400"
                  style={{ width: `${progress.barPercent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 min-h-[3.75rem]">
        {exam.accessType === 'purchase' ? (
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">Pro</span>
        ) : (
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Free</span>
        )}
        {action.kind === 'link' ? (
          <Link
            href={action.href}
            aria-label={`${action.label} ${exam.title}`}
            className={`inline-flex items-center justify-center min-h-10 px-4 rounded-xl text-sm font-semibold whitespace-nowrap transition ${ACTION_CLASS[action.variant]} ${FOCUS}`}
          >
            {action.label}
          </Link>
        ) : (
          <span
            data-testid="mock-card-note"
            className="inline-flex items-center min-h-10 px-3 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 whitespace-nowrap"
          >
            {action.label}
          </span>
        )}
      </div>
    </article>
  );
}
