'use client';

import Link from 'next/link';
import Swal from 'sweetalert2';
import type { UnlockBatch } from '@/lib/api/unlockCodes';
import { formatReleaseDate } from '@/lib/release-date';
import { BATCH_KIND_LABELS } from '@/lib/unlock-codes';

/** ป้ายประเภทแคมเปญ (task 19): Unlock ชุดข้อสอบ / ให้แพ็กเกจ Pro */
export function BatchKindBadge({ kind }: { kind: UnlockBatch['kind'] }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
        kind === 'pro'
          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
      }`}
    >
      {BATCH_KIND_LABELS[kind === 'pro' ? 'pro' : 'exam']}
    </span>
  );
}

/**
 * สิ่งที่แคมเปญให้: "ทุกชุด Mock Exam" หรือรายชื่อชุด (ยาวเกิน → +N)
 * แคมเปญแบบให้แพ็กเกจ Pro (task 19) → "สนาม · แพ็กเกจ"
 */
export function BatchExamsSummary({
  batch,
  max = 2,
  linkExams = false,
}: {
  batch: Pick<UnlockBatch, 'allMock' | 'exams'> & Partial<Pick<UnlockBatch, 'kind' | 'proPlan'>>;
  max?: number;
  /** ลิงก์ไปหน้าแก้ชุดข้อสอบ (หน้ารายละเอียดแคมเปญ) */
  linkExams?: boolean;
}) {
  if (batch.kind === 'pro') {
    const plan = batch.proPlan;
    if (!plan) return <span className="text-sm text-gray-500 dark:text-gray-400">แพ็กเกจที่ถูกลบ</span>;
    return (
      <span className="text-sm text-gray-700 dark:text-gray-300 break-words">
        {[plan.venue.name, plan.name].filter(Boolean).join(' · ') || '-'}
      </span>
    );
  }
  if (batch.allMock) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold whitespace-nowrap">
        ทุกชุด Mock Exam
      </span>
    );
  }
  if (batch.exams.length === 0) return <span className="text-sm text-gray-500 dark:text-gray-400">-</span>;
  const shown = batch.exams.slice(0, max);
  const rest = batch.exams.length - shown.length;
  return (
    <ul className="space-y-0.5 text-sm text-gray-700 dark:text-gray-300 min-w-0">
      {shown.map((e) => (
        <li key={e.id} className="truncate">
          {linkExams ? (
            <Link
              href={`/admin/exams/${e.id}/edit`}
              className="text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
            >
              {e.title || e.id}
            </Link>
          ) : (
            e.title || e.id
          )}
        </li>
      ))}
      {rest > 0 && <li className="text-xs text-gray-500 dark:text-gray-400">และอีก {rest} ชุด</li>}
    </ul>
  );
}

/** วันหมดอายุโค้ด: ไม่กำหนด / วันเวลาไทย (เลยแล้ว → ป้าย "หมดอายุแล้ว") */
export function CodeExpiry({ value, now = new Date() }: { value: string | null; now?: Date }) {
  if (!value) return <span className="text-sm text-gray-500 dark:text-gray-400">ไม่กำหนด</span>;
  const expired = new Date(value).getTime() <= now.getTime();
  return (
    <span className="text-sm whitespace-nowrap">
      <span className={expired ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}>
        {formatReleaseDate(value)}
      </span>
      {expired && (
        <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium">
          หมดอายุแล้ว
        </span>
      )}
    </span>
  );
}

/** ใช้แล้ว/ทั้งหมด + แถบสัดส่วน */
export function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="min-w-[7rem]">
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        <span className="font-semibold text-gray-900 dark:text-gray-100">{used.toLocaleString('th-TH')}</span> /{' '}
        {total.toLocaleString('th-TH')}
      </p>
      <div
        className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`ใช้แล้ว ${pct}%`}
      >
        <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** ยืนยันก่อนปิดแคมเปญ (เปิดไม่ต้องยืนยัน) — ชื่อแคมเปญแสดงแบบ text ไม่ผ่าน HTML */
export async function confirmDisableBatch(name: string): Promise<boolean> {
  const result = await Swal.fire({
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    title: 'ปิดแคมเปญนี้?',
    text: `"${name}" — โค้ดทั้งแคมเปญจะกรอกไม่ได้ทันที สิทธิ์ที่ผู้ใช้ได้ไปแล้วยังใช้ได้จนหมดอายุ`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ปิดแคมเปญ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b7280',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}

export const ADMIN_CARD = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm';
export const ADMIN_INPUT =
  'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60 dark:[color-scheme:dark]';
export const ADMIN_INPUT_INVALID =
  'w-full px-3 py-2.5 border border-red-500 dark:border-red-400 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-60 dark:[color-scheme:dark]';
export const ADMIN_PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';
export const ADMIN_SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

/** แถบแบ่งหน้าใต้ตาราง (แบบหน้า /admin/exams) */
export function AdminPagination({
  page,
  totalPages,
  total,
  unit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  /** หน่วยที่นับ เช่น "แคมเปญ" / "โค้ด" */
  unit: string;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const btn =
    'min-h-11 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition';
  return (
    <nav
      aria-label="เลือกหน้า"
      className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2"
    >
      <p className="text-sm text-gray-500 dark:text-gray-400">
        หน้า {page.toLocaleString('th-TH')} จาก {totalPages.toLocaleString('th-TH')} (ทั้งหมด{' '}
        {total.toLocaleString('th-TH')} {unit})
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className={btn}>
          ก่อนหน้า
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={btn}
        >
          ถัดไป
        </button>
      </div>
    </nav>
  );
}
