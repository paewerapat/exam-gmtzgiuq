import { Check, X } from 'lucide-react';
import type { Comparison, ComparisonCell } from '@/lib/api/pro';

export interface ComparisonPlanColumn {
  code: string;
  name: string;
  highlight: boolean;
}

interface ComparisonTableProps {
  comparison: Comparison;
  plans: ComparisonPlanColumn[];
  /** ชื่อสนาม (ใช้ใน caption สำหรับ screen reader) */
  venueName: string;
  /**
   * true = จอ xl ขึ้นไปการ์ดแพ็กเกจด้านบนทำหน้าที่หัวคอลัมน์ (คอลัมน์ตรงกัน) จึงซ่อนแถวหัวตารางให้เหลือแค่ screen reader
   * false (เช่นตัวอย่างในหลังบ้าน) = แสดงหัวคอลัมน์ทุกขนาดจอ
   */
  alignedWithCards?: boolean;
}

/** ✓ / ✕ / ข้อความ ของแต่ละช่อง — ข้อความจาก API แสดงเป็น text เสมอ (ไม่ผ่าน HTML) */
export function ComparisonCellView({ cell }: { cell: ComparisonCell | undefined }) {
  if (!cell) return <span data-cell-type="empty" />;
  if (cell.type === 'check') {
    return (
      <span data-cell-type="check" className="inline-flex items-center justify-center">
        <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
        <span className="sr-only">มี</span>
      </span>
    );
  }
  if (cell.type === 'cross') {
    return (
      <span data-cell-type="cross" className="inline-flex items-center justify-center">
        <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
          <X className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="sr-only">ไม่มี</span>
      </span>
    );
  }
  return (
    <span data-cell-type="text" className="block break-words">
      <span className="block font-semibold text-gray-900 dark:text-gray-100">{cell.text}</span>
      {cell.subtext && (
        <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400">{cell.subtext}</span>
      )}
    </span>
  );
}

const HIGHLIGHT_CELL = 'bg-indigo-50/70 dark:bg-indigo-500/10';

/**
 * ตารางเปรียบเทียบแพ็กเกจ (ภาพ 5) — กลุ่ม / แถว / ช่องต่อแพ็กเกจ (อ้างด้วย plan code)
 * มือถือ: ตาราง scroll แนวนอนในกรอบของตัวเอง คอลัมน์ชื่อแถวติดซ้าย หน้าไม่ scroll แนวนอน
 * cell ของ code ที่ไม่มีแพ็กเกจถูกละไว้ / แพ็กเกจที่ไม่มี cell แสดงว่าง
 */
export default function ComparisonTable({
  comparison,
  plans,
  venueName,
  alignedWithCards = false,
}: ComparisonTableProps) {
  if (plans.length === 0 || comparison.groups.length === 0) return null;
  const headHidden = alignedWithCards ? 'xl:sr-only' : '';

  return (
    <div className={`relative overflow-x-auto overscroll-x-contain ${alignedWithCards ? 'xl:-mx-3' : ''}`} tabIndex={0} role="region" aria-label={`ตารางเปรียบเทียบแพ็กเกจ ${venueName}`}>
      <table
        className={`w-full table-fixed border-separate border-spacing-0 text-sm ${alignedWithCards ? 'xl:border-spacing-x-3' : ''}`}
        style={{ minWidth: `${10 + plans.length * 7.5}rem` }}
      >
        <caption className="sr-only">ตารางเปรียบเทียบแพ็กเกจ {venueName}</caption>
        <colgroup>
          <col className={`w-40 sm:w-52 ${alignedWithCards ? 'xl:w-56' : ''}`} />
          {plans.map((p) => (
            <col key={p.code} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-white dark:bg-gray-800 text-left">
              <span className="sr-only">รายการ</span>
            </th>
            {plans.map((p) => (
              <th
                key={p.code}
                scope="col"
                className={`px-2 py-2 text-center text-sm font-bold text-gray-900 dark:text-gray-100 break-words border-b border-gray-200 dark:border-gray-700 ${
                  p.highlight ? HIGHLIGHT_CELL : ''
                } ${alignedWithCards ? 'xl:p-0 xl:border-0' : ''}`}
              >
                <span className={headHidden}>{p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        {comparison.groups.map((group, gi) => (
          <tbody key={group.id ?? gi}>
            <tr>
              <th
                scope="colgroup"
                colSpan={plans.length + 1}
                className="pt-6 pb-2 px-2 text-left text-sm sm:text-base font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400"
              >
                <span className="inline-block sticky left-2 max-w-full break-words">{group.title}</span>
              </th>
            </tr>
            {group.rows.map((row, ri) => (
              <tr key={row.id ?? ri}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 py-3 text-left align-middle font-normal border-b border-gray-200 dark:border-gray-700"
                >
                  <span className="block text-gray-900 dark:text-gray-100 break-words">{row.label}</span>
                  {row.sublabel && (
                    <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400 break-words">{row.sublabel}</span>
                  )}
                </th>
                {plans.map((p) => (
                  <td
                    key={p.code}
                    className={`px-2 py-3 text-center align-middle border-b border-gray-200 dark:border-gray-700 ${
                      p.highlight ? HIGHLIGHT_CELL : ''
                    }`}
                  >
                    <ComparisonCellView cell={row.cells[p.code]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
