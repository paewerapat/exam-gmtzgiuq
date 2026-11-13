'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ADMIN_INPUT, ADMIN_PRIMARY_BUTTON, ADMIN_SECONDARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import { grantProSubscription, type ProAdminSubscription, type ProAdminVenue } from '@/lib/api/pro';
import { proErrorMessage } from '@/lib/pro';
import AdminModal from './AdminModal';

interface GrantModalProps {
  venues: ProAdminVenue[];
  onClose: () => void;
  onGranted: (sub: ProAdminSubscription) => void;
}

const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
const MAX_DAYS = 3650;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ให้สิทธิ์สมาชิกเอง: อีเมล + แพ็กเกจ (เฉพาะที่ไม่ฟรี) + จำนวนวัน + หมายเหตุ */
export default function GrantModal({ venues, onClose, onGranted }: GrantModalProps) {
  // แพ็กเกจที่ให้ได้ = rank > 0 (API ตอบ 400 ถ้าเป็นแพ็กเกจฟรี) รวมที่ซ่อน/ปิดซื้อ
  const options = venues
    .map((v) => ({ venue: v, plans: v.plans.filter((p) => p.rank > 0) }))
    .filter((o) => o.plans.length > 0);
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState(options[0]?.plans[0]?.id ?? '');
  const [days, setDays] = useState(String(options[0]?.plans[0]?.periodDays ?? 30));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ email?: string; planId?: string; days?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  function handlePlanChange(id: string) {
    setPlanId(id);
    // ตั้งจำนวนวันตามอายุรอบของแพ็กเกจที่เลือก
    const plan = venues.flatMap((v) => v.plans).find((p) => p.id === id);
    if (plan) setDays(String(plan.periodDays));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'กรุณากรอกอีเมลให้ถูกต้อง';
    if (!planId) next.planId = 'กรุณาเลือกแพ็กเกจ';
    const d = /^\d+$/.test(days.trim()) ? Number(days.trim()) : Number.NaN;
    if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) next.days = `จำนวนวันต้องอยู่ระหว่าง 1–${MAX_DAYS.toLocaleString('th-TH')}`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const sub = await grantProSubscription({ email, planId, days: d, note });
      onGranted(sub);
    } catch (err) {
      setErrors({ form: proErrorMessage(err, 'ให้สิทธิ์ไม่สำเร็จ') });
      setSaving(false);
    }
  }

  return (
    <AdminModal
      title="ให้สิทธิ์สมาชิก"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
            ยกเลิก
          </button>
          <button type="submit" form="pro-grant-form" disabled={saving || options.length === 0} className={ADMIN_PRIMARY_BUTTON}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            ให้สิทธิ์
          </button>
        </>
      }
    >
      <form id="pro-grant-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="grant-email" className={LABEL}>
            อีเมลผู้ใช้
          </label>
          <input
            id="grant-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'grant-email-error' : undefined}
            className={ADMIN_INPUT}
          />
          {errors.email && (
            <p id="grant-email-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="grant-plan" className={LABEL}>
            สนามและแพ็กเกจ
          </label>
          {options.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">ยังไม่มีแพ็กเกจที่ไม่ฟรีให้เลือก</p>
          ) : (
            <select
              id="grant-plan"
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
              aria-invalid={errors.planId ? true : undefined}
              aria-describedby="grant-plan-hint"
              className={`${ADMIN_INPUT} dark:[color-scheme:dark]`}
            >
              {options.map(({ venue, plans }) => (
                <optgroup key={venue.id} label={venue.name}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {venue.name} · {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <p id="grant-plan-hint" className={HINT}>
            ถ้าผู้ใช้มีแพ็กเกจของสนามนี้อยู่แล้ว ของเดิมจะถูกแทนที่ (เริ่มนับวันใหม่จากวันนี้)
          </p>
          {errors.planId && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.planId}</p>}
        </div>
        <div>
          <label htmlFor="grant-days" className={LABEL}>
            จำนวนวัน
          </label>
          <input
            id="grant-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DAYS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={errors.days ? true : undefined}
            aria-describedby={errors.days ? 'grant-days-error' : undefined}
            className={`${ADMIN_INPUT} sm:w-40`}
          />
          {errors.days && (
            <p id="grant-days-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.days}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="grant-note" className={LABEL}>
            หมายเหตุ (ไม่บังคับ)
          </label>
          <input
            id="grant-note"
            type="text"
            maxLength={255}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={ADMIN_INPUT}
          />
        </div>
        {errors.form && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.form}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
