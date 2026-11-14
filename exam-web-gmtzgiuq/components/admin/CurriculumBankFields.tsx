'use client';

import { useId, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import type { Subject, Topic } from '@/lib/api/curriculum';

// ฟิลด์ Question Bank ในหน้าแอดมินหลักสูตร (task 20): วิชา → สนาม + ชื่อบนการ์ด / บท → ชั้น + เทอม

export interface BankVenueOption {
  id: string;
  name: string;
  isActive: boolean;
}

export const GRADE_OPTIONS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
export const MAX_BANK_LABEL = 60;
export const MAX_GRADE_LABEL = 30;
const OTHER = '__other';

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60';

/** "ม.4 · เทอม 1" / "ม.4" / "เทอม 2" / '' */
export function topicGradeText(topic: Pick<Topic, 'gradeLabel' | 'term'>): string {
  const parts: string[] = [];
  if (topic.gradeLabel?.trim()) parts.push(topic.gradeLabel.trim());
  if (topic.term === 1 || topic.term === 2) parts.push(`เทอม ${topic.term}`);
  return parts.join(' · ');
}

/** ป้ายสนาม + ชื่อบนการ์ดข้างชื่อวิชา */
export function SubjectBankChips({ subject, venues }: { subject: Subject; venues: BankVenueOption[] | null }) {
  const venueName = subject.venueId ? (venues?.find((v) => v.id === subject.venueId)?.name ?? 'สนามที่ไม่พบ') : null;
  if (!venueName && !subject.bankLabel) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {venueName && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
          <Database className="w-3 h-3" aria-hidden="true" />
          {venueName}
        </span>
      )}
      {subject.bankLabel && (
        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium">
          การ์ด: {subject.bankLabel}
        </span>
      )}
    </span>
  );
}

function FormButtons({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        บันทึก
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-60"
      >
        ยกเลิก
      </button>
    </div>
  );
}

/** ตั้งสนามของวิชา + ชื่อบนการ์ด Question Bank */
export function SubjectBankForm({
  subject,
  venues,
  venuesError,
  onSave,
  onCancel,
}: {
  subject: Subject;
  /** null = กำลังโหลด */
  venues: BankVenueOption[] | null;
  venuesError: boolean;
  onSave: (data: { venueId: string | null; bankLabel: string | null }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const id = useId();
  const [venueId, setVenueId] = useState(subject.venueId ?? '');
  const [bankLabel, setBankLabel] = useState(subject.bankLabel ?? '');
  const [saving, setSaving] = useState(false);
  // สนามที่ผูกอยู่แต่ไม่อยู่ในรายการ (ถูกลบ) ยังต้องแสดงให้เห็น
  const missing = !!subject.venueId && !!venues && !venues.some((v) => v.id === subject.venueId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ venueId: venueId || null, bankLabel: bankLabel.trim() || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`ตั้งค่า Question Bank ของ ${subject.name}`}
      className="px-4 sm:pl-8 py-4 bg-indigo-50/60 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-900/40 space-y-3"
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Question Bank</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-venue`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            สนามสอบ
          </label>
          <select
            id={`${id}-venue`}
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            disabled={venues === null || saving}
            className={INPUT_CLASS}
          >
            <option value="">— ไม่ผูกสนาม (ไม่แสดงใน Question Bank) —</option>
            {missing && <option value={subject.venueId ?? ''}>สนามที่ไม่พบ ({subject.venueId})</option>}
            {(venues ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.isActive ? '' : ' (ปิดอยู่)'}
              </option>
            ))}
          </select>
          {venuesError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">โหลดรายการสนามไม่สำเร็จ (ตั้งสนามได้ในหน้า Pro)</p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-label`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            ชื่อบนการ์ด
          </label>
          <input
            id={`${id}-label`}
            value={bankLabel}
            onChange={(e) => setBankLabel(e.target.value)}
            maxLength={MAX_BANK_LABEL}
            placeholder={`เช่น ชีวะ (ว่าง = ${subject.name})`}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        ข้อของวิชานี้จะแสดงใน Question Bank ของสนามที่เลือก เมื่อข้อผูกหัวข้อ (บท) และอยู่ในชุดที่เผยแพร่และไม่ใช่ Mock
      </p>
      <FormButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}

/** ตั้งชั้น (ม.1–ม.6 / อื่น ๆ พิมพ์เอง) + เทอมของบท */
export function TopicGradeForm({
  topic,
  onSave,
  onCancel,
}: {
  topic: Topic;
  onSave: (data: { gradeLabel: string | null; term: number | null }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const id = useId();
  const initial = topic.gradeLabel?.trim() ?? '';
  const [grade, setGrade] = useState(initial === '' ? '' : GRADE_OPTIONS.includes(initial) ? initial : OTHER);
  const [otherGrade, setOtherGrade] = useState(initial !== '' && !GRADE_OPTIONS.includes(initial) ? initial : '');
  const [term, setTerm] = useState(topic.term === 1 || topic.term === 2 ? String(topic.term) : '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const gradeLabel = grade === OTHER ? otherGrade.trim() || null : grade || null;
    setSaving(true);
    try {
      await onSave({ gradeLabel, term: term ? Number(term) : null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`ชั้นและเทอมของ ${topic.name}`}
      className="pl-8 pr-4 py-3 bg-emerald-50/60 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-900/40 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${id}-grade`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            ชั้น
          </label>
          <select
            id={`${id}-grade`}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            disabled={saving}
            className={INPUT_CLASS}
          >
            <option value="">ไม่ระบุ</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={OTHER}>อื่น ๆ (พิมพ์เอง)</option>
          </select>
        </div>
        {grade === OTHER && (
          <div>
            <label htmlFor={`${id}-other`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              ชื่อชั้น
            </label>
            <input
              id={`${id}-other`}
              value={otherGrade}
              onChange={(e) => setOtherGrade(e.target.value)}
              maxLength={MAX_GRADE_LABEL}
              placeholder="เช่น ปวช.1"
              disabled={saving}
              className={INPUT_CLASS}
            />
          </div>
        )}
        <div>
          <label htmlFor={`${id}-term`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            เทอม
          </label>
          <select
            id={`${id}-term`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            disabled={saving}
            className={INPUT_CLASS}
          >
            <option value="">ไม่ระบุ</option>
            <option value="1">เทอม 1</option>
            <option value="2">เทอม 2</option>
          </select>
        </div>
      </div>
      <FormButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}
