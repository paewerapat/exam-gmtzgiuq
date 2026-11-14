'use client';

import { useId } from 'react';
import { Database, Mountain } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';
import type { QuestionDifficulty } from '@/lib/api/questions';

// ฟิลด์ Question Bank ในฟอร์มสร้าง/แก้/นำเข้าชุดข้อสอบ (task 20)

/** isChallenge ที่ส่งเข้า API: ติดได้เฉพาะชุด bankOnly (ไม่งั้น API ตอบ 400) */
export function challengeForPayload(bankOnly: boolean, isChallenge: boolean | undefined): boolean {
  return bankOnly && isChallenge === true;
}

interface BankOnlySettingsProps {
  value: boolean;
  onChange: (next: boolean) => void;
  /** จำนวนข้อที่ติ๊ก Challenge ไว้ (แจ้งเตือนเมื่อปิด bankOnly) */
  challengeCount: number;
  disabled?: boolean;
}

/** กล่อง "ใช้เฉพาะ Question Bank" */
export function BankOnlySettings({ value, onChange, challengeCount, disabled = false }: BankOnlySettingsProps) {
  const descId = useId();
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Database className="w-4 h-4 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
            ใช้เฉพาะ Question Bank (ซ่อนจากรายการชุดข้อสอบ)
          </h2>
          <p id={descId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            ชุดนี้จะไม่แสดงในรายการชุดข้อสอบ/Mock Exam ของผู้ใช้ ข้อในชุดนี้ใช้ใน Question Bank และติดป้ายข้อ Challenge ได้
            (ข้อต้องผูกหัวข้อของวิชาที่ผูกสนามแล้ว และชุดต้องเผยแพร่)
          </p>
        </div>
        <div className="flex-shrink-0">
          <ToggleSwitch
            checked={value}
            onChange={onChange}
            label="ใช้เฉพาะ Question Bank"
            disabled={disabled}
          />
        </div>
      </div>
      {!value && challengeCount > 0 && (
        <p
          role="status"
          className="mt-3 px-3 py-2 rounded-lg border text-sm border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
        >
          มีข้อที่ติ๊ก Challenge ไว้ {challengeCount} ข้อ — ถ้าบันทึกโดยไม่เปิด &quot;ใช้เฉพาะ Question Bank&quot; ข้อเหล่านี้จะเป็นข้อปกติ
        </p>
      )}
    </div>
  );
}

interface ChallengeCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** ชุดเป็น bankOnly หรือไม่ (ไม่ใช่ = ติ๊กไม่ได้) */
  bankOnly: boolean;
  disabled?: boolean;
}

/** checkbox "ข้อ Challenge" ต่อข้อ — เปิดได้เฉพาะชุดที่ใช้เฉพาะ Question Bank */
export function ChallengeCheckbox({ checked, onChange, bankOnly, disabled = false }: ChallengeCheckboxProps) {
  const hintId = useId();
  const inactive = disabled || !bankOnly;
  return (
    <div>
      <label
        className={`inline-flex items-center gap-2 text-sm font-medium ${
          inactive ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-gray-700 dark:text-gray-300 cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={bankOnly && checked}
          disabled={inactive}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hintId}
          className="w-4 h-4 rounded accent-indigo-600 dark:accent-indigo-400"
        />
        <Mountain className="w-4 h-4 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
        ข้อ Challenge
      </label>
      <p id={hintId} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {bankOnly
          ? 'แสดงทั้งใน Question Bank (ระดับ Hard & Challenge) และ Challenge Questions — เฉพาะสมาชิก Pro ของสนามนั้นทำได้'
          : 'เปิดได้เมื่อชุดนี้ "ใช้เฉพาะ Question Bank"'}
      </p>
    </div>
  );
}

const DIFFICULTY_OPTIONS: { value: QuestionDifficulty; label: string }[] = [
  { value: 'easy', label: 'ง่าย' },
  { value: 'medium', label: 'ปานกลาง' },
  { value: 'hard', label: 'ยาก' },
];

/** ค่า difficulty จาก API → ค่าที่ฟอร์มใช้ (ข้อเก่า/ค่าแปลก = ปานกลาง) */
export function toDifficultyForm(value: unknown): QuestionDifficulty {
  return value === 'easy' || value === 'hard' ? value : 'medium';
}

interface DifficultySelectProps {
  value: QuestionDifficulty;
  onChange: (next: QuestionDifficulty) => void;
  disabled?: boolean;
}

/** ระดับความยากต่อข้อ (ใช้กับตัวกรอง Easy / Medium / Hard & Challenge ใน Question Bank) */
export function DifficultySelect({ value, onChange, disabled = false }: DifficultySelectProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        ระดับความยาก
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(toDifficultyForm(e.target.value))}
        disabled={disabled}
        className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60"
      >
        {DIFFICULTY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
