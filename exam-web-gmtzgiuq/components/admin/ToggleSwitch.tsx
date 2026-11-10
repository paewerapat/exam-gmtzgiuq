'use client';

import { Loader2 } from 'lucide-react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** ชื่อที่ screen reader อ่าน เช่น "เปิดใช้งานโค้ด ABCD" */
  label: string;
  disabled?: boolean;
  /** กำลังบันทึก (กดซ้ำไม่ได้ + แสดง spinner) */
  loading?: boolean;
  /** แสดงข้อความ "เปิด/ปิด" ข้างสวิตช์ (สีไม่ใช่ตัวบอกสถานะอย่างเดียว) */
  showText?: boolean;
}

/** สวิตช์เปิด/ปิด (role=switch) ใช้ในหน้าแอดมินโค้ด Unlock */
export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  loading = false,
  showText = true,
}: ToggleSwitchProps) {
  const inactive = disabled || loading;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={inactive}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 min-h-11 px-1 rounded-lg disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
        } ${inactive ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none text-gray-500" />}
        </span>
      </span>
      {showText && (
        <span
          aria-hidden="true"
          className={`text-sm font-medium ${
            checked ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {checked ? 'เปิด' : 'ปิด'}
        </span>
      )}
    </button>
  );
}
