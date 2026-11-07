'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

// พื้นหลัง + การ์ดที่หน้า auth ทั้งชุดใช้ร่วมกัน (login / register / forgot / reset / verify)
// light: gradient indigo→purple อ่อนแบบเดิม / dark: โทนเทาเข้มแบบ dashboard (gray-900) ไล่ไป indigo-950 เพื่อคงสีแบรนด์

export const authPageClass =
  'min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950';

export const authCardClass =
  'bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-black/40 border border-transparent dark:border-gray-700 p-6 sm:p-8';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

export const authLabelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';

export const authPrimaryButtonClass = `w-full min-h-11 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 ${focusRing}`;

export const authSecondaryButtonClass = `w-full min-h-11 inline-flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${focusRing}`;

export const authLinkClass = `text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline underline-offset-2 font-medium rounded ${focusRing}`;

export const authIconClass = 'h-5 w-5 text-gray-400';

// globals.css มี `input:focus { box-shadow: 0 0 0 2px ... }` (+ `html.dark input:focus`) แบบ unlayered ซึ่งชนะ utility ของ Tailwind
// จึงใช้ `focus:ring-2!` (important) ให้ ring ของ Tailwind ใช้ได้ทั้งสองโหมด
// ช่องปกติ ring สี indigo / ช่อง invalid ring สีแดง (ขอบแดงตอน focus คุมใน globals.css ด้วย `[aria-invalid="true"]:focus`)
export function authInputClass({
  icon = true,
  trailing = false,
  invalid = false,
}: { icon?: boolean; trailing?: boolean; invalid?: boolean } = {}) {
  return [
    'block w-full min-h-11 py-2.5 rounded-lg border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
    'focus:ring-2! transition-colors',
    invalid ? 'focus:ring-red-500 dark:focus:ring-red-400' : 'focus:ring-indigo-500 dark:focus:ring-indigo-400',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    icon ? 'pl-10' : 'pl-3',
    trailing ? 'pr-11' : 'pr-3',
    invalid ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600',
  ].join(' ');
}

export function AuthShell({
  children,
  cardClassName = '',
}: {
  children: React.ReactNode;
  cardClassName?: string;
}) {
  return (
    <div className={authPageClass}>
      <div className="max-w-md w-full min-w-0">
        <div className={`${authCardClass} ${cardClassName}`}>{children}</div>
      </div>
    </div>
  );
}

export function AuthPageLoading({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className={authPageClass} role="status" aria-live="polite">
      <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4 text-sm text-red-800 dark:text-red-300"
    >
      {message}
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  error?: string;
  describedBy?: string;
  placeholder?: string;
}

// ช่องรหัสผ่าน + ปุ่มแสดง/ซ่อน (aria-label/aria-pressed) — error ผูก aria-describedby
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  required = true,
  error,
  describedBy,
  placeholder = '••••••••',
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const describedByIds = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Lock className={authIconClass} aria-hidden="true" />
        </div>
        <input
          id={id}
          name={name ?? id}
          type={visible ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds}
          className={authInputClass({ trailing: true, invalid: !!error })}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center rounded-r-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </>
  );
}

const GOOGLE_MAX = 350; // ความกว้างเดิมบนจอใหญ่
const GOOGLE_MIN = 200; // ค่าต่ำสุดที่ Google รองรับ

export type GoogleButtonTheme = 'outline' | 'filled_black';

// กรอบรอบปุ่ม Google: วัดความกว้างที่มีจริงแล้วส่งให้ปุ่ม (iframe ของ Google ไม่ยืดตาม CSS) กันล้นที่ 375px
// และส่ง theme ของปุ่ม: light = 'outline' (ค่าเดิมของ Google) / dark = 'filled_black'
export function GoogleButtonSlot({
  children,
}: {
  children: (width: number, theme: GoogleButtonTheme) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(GOOGLE_MAX);
  const { theme } = useTheme();
  const buttonTheme: GoogleButtonTheme = theme === 'dark' ? 'filled_black' : 'outline';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (!w) return; // jsdom / ยังไม่ layout
      const next = Math.max(GOOGLE_MIN, Math.min(GOOGLE_MAX, w));
      setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full min-h-11 flex justify-center overflow-hidden">
      {children(width, buttonTheme)}
    </div>
  );
}
