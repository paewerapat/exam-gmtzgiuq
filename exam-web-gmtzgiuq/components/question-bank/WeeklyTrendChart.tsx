'use client';

import { useId } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { QbWeek } from '@/lib/api/question-bank';
import { formatWeekLabel, weeklySummary } from '@/lib/question-bank';

// สีถูก/ผิดผ่าน validator ของ dataviz ทั้ง light (#fff) และ dark (#1f2937): ΔE CVD 9.6, contrast ≥ 3:1
// ใช้ค่าเดียวกันทั้งสองโหมด — ตัวตนของสีมีป้ายกำกับ + ลำดับคงที่ (ถูกล่าง/ผิดบน) + ตาราง ไม่พึ่งสีอย่างเดียว
const CORRECT_COLOR = '#059669';
const WRONG_COLOR = '#ef4444';

interface ChartRow {
  label: string;
  correct: number;
  wrong: number;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">สัปดาห์เริ่ม {row.label}</p>
      <p className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CORRECT_COLOR }} aria-hidden="true" />
        ตอบถูก {row.correct} ข้อ
      </p>
      <p className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: WRONG_COLOR }} aria-hidden="true" />
        ตอบผิด {row.wrong} ข้อ
      </p>
    </div>
  );
}

/** กราฟแนวโน้มรายสัปดาห์ (แท่งซ้อน: เขียว = ถูก ล่าง / แดง = ผิด บน) + ข้อความสรุปและตารางสำหรับ screen reader */
export default function WeeklyTrendChart({ weekly }: { weekly: QbWeek[] }) {
  const titleId = useId();
  const summaryId = useId();
  const rows: ChartRow[] = weekly.map((w) => ({
    label: formatWeekLabel(w.weekStart),
    correct: w.correct,
    wrong: w.wrong,
  }));
  const hasData = rows.some((r) => r.correct + r.wrong > 0);
  const summary = weeklySummary(weekly);

  return (
    <figure
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6"
    >
      <h3 id={titleId} className="text-lg font-bold text-gray-900 dark:text-gray-100">
        แนวโน้มการทำข้อสอบ
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        สีเขียว = ตอบถูก สีแดง = ตอบผิด แต่ละแท่งคือหนึ่งสัปดาห์
      </p>

      {/* legend (สีคู่กับข้อความเสมอ) */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CORRECT_COLOR }} aria-hidden="true" />
          ตอบถูก
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: WRONG_COLOR }} aria-hidden="true" />
          ตอบผิด
        </span>
      </div>

      <p id={summaryId} className="sr-only">
        {summary}
      </p>

      {hasData ? (
        // กราฟเป็นภาพประกอบ — ข้อมูลเดียวกันอยู่ในข้อความสรุปและตารางด้านล่าง
        <div
          aria-hidden="true"
          className="mt-3 h-48 sm:h-56 min-w-0 [&_.recharts-bar-rectangle_path]:stroke-white [&_.recharts-bar-rectangle_path]:stroke-2 dark:[&_.recharts-bar-rectangle_path]:stroke-gray-800"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.25} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(148,163,184,0.15)' }} />
              <Bar dataKey="correct" name="ตอบถูก" stackId="week" fill={CORRECT_COLOR} maxBarSize={28} isAnimationActive={false} />
              <Bar
                dataKey="wrong"
                name="ตอบผิด"
                stackId="week"
                fill={WRONG_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{summary}</p>
      )}

      {hasData && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
            ดูข้อมูลเป็นตาราง
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <caption className="sr-only">จำนวนข้อที่ตอบถูกและผิดรายสัปดาห์</caption>
              <thead className="text-gray-500 dark:text-gray-400">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">สัปดาห์เริ่ม</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium text-right">ถูก</th>
                  <th scope="col" className="py-1.5 font-medium text-right">ผิด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-gray-700 dark:text-gray-300">
                {rows.map((r, i) => (
                  <tr key={`${r.label}-${i}`}>
                    <th scope="row" className="py-1.5 pr-3 font-normal">{r.label}</th>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.correct}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.wrong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
