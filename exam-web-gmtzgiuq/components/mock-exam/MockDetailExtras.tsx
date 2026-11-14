import { CheckCircle2 } from 'lucide-react';
import type { MockTopicBreakdownItem } from '@/lib/api/exams';

const BOX_CLASS =
  'bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6 min-w-0';

/**
 * กล่อง "เนื้อหาที่ออก" (task 21): แถบแนวนอนต่อบท ยาวตามสัดส่วนของบทที่มีข้อมากสุด
 * ตัวเลข "N ข้อ" เป็นข้อความจริงในแต่ละแถว (แถบเป็นภาพประกอบ aria-hidden) จึงอ่านได้ทั้งตาและ screen reader
 */
export function TopicBreakdownBox({ items, total }: { items: MockTopicBreakdownItem[]; total: number }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <section aria-labelledby="mock-topics-heading" className={BOX_CLASS} data-testid="mock-topic-breakdown">
      <h2 id="mock-topics-heading" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
        เนื้อหาที่ออก
      </h2>
      <p className="mt-0.5 mb-4 text-xs text-gray-500 dark:text-gray-400">
        จำนวนข้อต่อบทจากทั้งหมด {total.toLocaleString('th-TH')} ข้อ
      </p>
      <ul className="space-y-3">
        {items.map((item) => {
          const percent = Math.max(4, Math.round((item.count / max) * 100));
          return (
            <li
              key={item.topicId ?? `other-${item.name}`}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="text-sm text-gray-800 dark:text-gray-200 truncate" title={item.name}>
                {item.name}
              </span>
              <span aria-hidden="true" className="h-2 rounded-full bg-indigo-50 dark:bg-gray-700 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {item.count.toLocaleString('th-TH')} ข้อ
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const AFTER_EXAM_ITEMS = [
  'คะแนนรวมและคะแนนรายบท',
  'เฉลยพร้อมวิธีทำทุกข้อ',
  'บันทึกใน "ประวัติการสอบ" ของคุณ',
  'เทียบกับชุด Predicted Exam (Pro) เพื่อฝึกต่อ',
] as const;

/** กล่อง "สิ่งที่ได้หลังทำ" (ชุดฟรีทั่วไป + แคมเปญ) */
export function AfterExamBox() {
  return (
    <section aria-labelledby="mock-after-heading" className={BOX_CLASS} data-testid="mock-after-exam">
      <h2 id="mock-after-heading" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        สิ่งที่ได้หลังทำ
      </h2>
      <ul className="space-y-2.5">
        {AFTER_EXAM_ITEMS.map((text) => (
          <li key={text} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
