'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterMenuProps {
  /** ข้อความบนปุ่ม เช่น "ระดับความยาก (1)" */
  label: string;
  /** มีการกรองอยู่ (ไฮไลต์ปุ่ม) */
  active?: boolean;
  /** หัวข้อในกล่อง (ใช้เป็นชื่อของกล่องด้วย) */
  title: string;
  children: ReactNode;
  align?: 'left' | 'right';
}

/**
 * ปุ่มตัวกรองแบบ dropdown (position: absolute ใต้ปุ่ม ไม่ใช่ overlay เต็มจอ)
 * ปิดเมื่อคลิกนอกกล่อง / กด Escape (โฟกัสกลับที่ปุ่ม)
 */
export default function FilterMenu({ label, active = false, title, children, align = 'left' }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    // จอแคบ: กล่องยึดกับแถวตัวกรอง (แถวต้องเป็น relative) ไม่ยึดกับปุ่ม — ปุ่มทางขวาจะได้ไม่ดันกล่องล้นจอ
    <div ref={rootRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-medium transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          active || open
            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
            : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:border-indigo-600'
        }`}
      >
        {label}
        <ChevronDown className={`w-4 h-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={title}
          className={`absolute top-full mt-2 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</p>
          {children}
        </div>
      )}
    </div>
  );
}
