import { ExternalLink, Info } from 'lucide-react';
import { isAllowedStepLinkUrl, type CodeInstructions } from '@/lib/mock-exam';

interface CodeInstructionsViewProps {
  instructions: CodeInstructions;
  /** id ของหัวข้อ (ใช้ aria-labelledby ของ section) */
  headingId?: string;
  className?: string;
}

/**
 * กล่อง "วิธีรับโค้ด" บนหน้ารายละเอียดชุดโค้ด: ขั้นตอนเป็นการ์ดมีเลขลำดับ (+ ปุ่มลิงก์) และหมายเหตุ
 * ใช้ทั้งหน้าจริงและ preview ในฟอร์มแอดมิน — ข้อความแสดงเป็นข้อความธรรมดา (React escape ให้) ไม่ผ่าน HTML
 */
export default function CodeInstructionsView({
  instructions,
  headingId = 'code-instructions-heading',
  className = '',
}: CodeInstructionsViewProps) {
  const { steps, note } = instructions;
  return (
    <section
      aria-labelledby={headingId}
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6 ${className}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 id={headingId} className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
          วิธีรับโค้ด
        </h2>
        {steps.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ทำตาม {steps.length.toLocaleString('th-TH')} ขั้นตอน
          </p>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3" data-testid="code-steps">
          {steps.map((step, i) => {
            const hasLink = !!step.linkUrl && isAllowedStepLinkUrl(step.linkUrl);
            return (
              <li
                key={i}
                className="flex flex-col min-w-0 rounded-xl bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 p-4"
              >
                <span
                  aria-hidden="true"
                  className="w-7 h-7 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0"
                >
                  {i + 1}
                </span>
                <h3 className="mt-2 font-semibold text-gray-900 dark:text-gray-100 leading-snug break-words">
                  <span className="sr-only">ขั้นที่ {i + 1}: </span>
                  {step.title}
                </h3>
                {step.description && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line break-words">
                    {step.description}
                  </p>
                )}
                {hasLink && (
                  <a
                    href={step.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 self-start inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 transition max-w-full"
                  >
                    <span className="truncate">{step.linkLabel?.trim() || 'เปิดลิงก์'}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="sr-only">(เปิดในแท็บใหม่)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {note && (
        <p
          className={`${steps.length > 0 ? 'mt-4' : ''} flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line break-words`}
        >
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0">{note}</span>
        </p>
      )}
    </section>
  );
}
