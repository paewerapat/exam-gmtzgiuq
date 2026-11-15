import { Clock, ShieldAlert } from 'lucide-react';
import { COMING_SOON_LABEL, PAYMENTS_ADMIN_BYPASS_NOTICE, PAYMENTS_COMING_SOON_NOTICE } from '@/lib/pro-payments';

/**
 * ข้อความปุ่ม "เร็ว ๆ นี้" / "ต่ออายุ · เร็ว ๆ นี้" — ตัดบรรทัดได้เฉพาะหลัง "·" ไม่ตัดกลาง "เร็ว ๆ นี้" (QA task 23 รอบ 1)
 * ห่อด้วย span นอกอีกชั้นให้เป็น flex item เดียวในปุ่ม (ปุ่มเป็น flex) ข้อความข้างในจึงขึ้นบรรทัดใหม่ได้
 */
export function ComingSoonText({ prefix }: { prefix?: string }) {
  if (!prefix) return <span className="whitespace-nowrap">{COMING_SOON_LABEL}</span>;
  return (
    <span className="min-w-0">
      <span className="whitespace-nowrap">{prefix} ·</span> <span className="whitespace-nowrap">{COMING_SOON_LABEL}</span>
    </span>
  );
}

interface PaymentsClosedNoticeProps {
  /** ปิดรับชำระเงินอยู่ (paymentsOpen = false) — เปิดอยู่ไม่แสดงอะไร */
  closed: boolean;
  isAdmin: boolean;
  className?: string;
}

/**
 * แถบแจ้งเมื่อปิดรับชำระเงิน (task 23)
 * ผู้ใช้ทั่วไป: "เปิดให้สมัครสมาชิก Pro เร็ว ๆ นี้" (โทนกลาง ไม่ใช่ error) / แอดมิน: แถบเล็กว่าทดสอบจ่ายได้
 */
export default function PaymentsClosedNotice({ closed, isAdmin, className = '' }: PaymentsClosedNoticeProps) {
  if (!closed) return null;
  if (isAdmin) {
    return (
      <p
        role="note"
        data-testid="payments-admin-notice"
        className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200 ${className}`}
      >
        <ShieldAlert className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{PAYMENTS_ADMIN_BYPASS_NOTICE}</span>
      </p>
    );
  }
  return (
    <p
      role="status"
      data-testid="payments-coming-soon-notice"
      className={`flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-900/30 dark:text-indigo-200 ${className}`}
    >
      <Clock className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{PAYMENTS_COMING_SOON_NOTICE}</span>
    </p>
  );
}
