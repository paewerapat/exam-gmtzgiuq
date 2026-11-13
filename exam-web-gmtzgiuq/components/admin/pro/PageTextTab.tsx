'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_PRIMARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import { updateProPage, type ProPageSettings, type ProPageText } from '@/lib/api/pro';
import { proErrorMessage } from '@/lib/pro';

const FIELDS: { key: keyof ProPageText; label: string; hint: string; multiline?: boolean }[] = [
  { key: 'title', label: 'หัวข้อหน้า', hint: 'เช่น "แพ็กเกจ LUMO"' },
  { key: 'subtitle', label: 'คำอธิบายใต้หัวข้อ', hint: 'เช่น "เลือกแพ็กเกจที่เหมาะกับการเตรียมสอบของคุณ"', multiline: true },
  { key: 'venuePickerTitle', label: 'หัวข้อกล่องเลือกสนาม', hint: 'เช่น "เลือกสนามที่จะสมัคร" (ข้อความใต้หัวข้อตั้งแยกต่อสนามในแท็บสนามและแพ็กเกจ)' },
  { key: 'footerNote', label: 'หมายเหตุท้ายหน้า', hint: 'ข้อความเล็กด้านล่างสุดของหน้า', multiline: true },
];

interface PageTextTabProps {
  page: ProPageSettings;
  onSaved: (page: ProPageSettings) => void;
}

/** แท็บ "หน้า Upgrade": แก้ข้อความระดับหน้า + เปิด/ปิด VAT 7% (task 18) */
export default function PageTextTab({ page, onSaved }: PageTextTabProps) {
  const [form, setForm] = useState<ProPageSettings>(page);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('กรุณากรอกหัวข้อหน้า');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await updateProPage(form);
      onSaved(saved);
      setForm(saved);
      toast.success('บันทึกการตั้งค่าหน้า Upgrade แล้ว');
    } catch (err) {
      setError(proErrorMessage(err, 'บันทึกไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={`${ADMIN_CARD} p-4 sm:p-6 max-w-3xl`}>
      <div className="space-y-5">
        {FIELDS.map((f) => {
          const id = `pro-page-${f.key}`;
          const hintId = `${id}-hint`;
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  id={id}
                  rows={3}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  aria-describedby={hintId}
                  className={ADMIN_INPUT}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  aria-describedby={hintId}
                  className={ADMIN_INPUT}
                />
              )}
              <p id={hintId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {f.hint}
              </p>
            </div>
          );
        })}
      </div>
      <fieldset className="mt-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-gray-100">ภาษีมูลค่าเพิ่ม</legend>
        <label className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
          <input
            type="checkbox"
            role="switch"
            checked={form.vatEnabled}
            onChange={(e) => setForm((prev) => ({ ...prev, vatEnabled: e.target.checked }))}
            aria-describedby="pro-page-vat-hint"
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 dark:border-gray-600 accent-indigo-600"
          />
          <span className="text-sm text-gray-800 dark:text-gray-200">
            คิด VAT 7% เพิ่มจากราคาแพ็กเกจ
            <span id="pro-page-vat-hint" className="block text-xs text-gray-500 dark:text-gray-400">
              มีผลกับการชำระครั้งใหม่เท่านั้น ไม่กระทบรอบต่ออายุอัตโนมัติที่ตั้งไว้แล้ว (ตัดยอดเดิม) — ราคาบนการ์ดยังเป็นราคาก่อน VAT
              หน้าชำระเงินแสดง ราคา / VAT 7% / ยอดรวม
            </span>
          </span>
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={ADMIN_PRIMARY_BUTTON}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          บันทึก
        </button>
        <Link
          href="/upgrade"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          เปิดหน้า Upgrade
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">(แท็บใหม่)</span>
        </Link>
      </div>
    </form>
  );
}
