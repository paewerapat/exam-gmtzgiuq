'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ADMIN_INPUT, ADMIN_PRIMARY_BUTTON, ADMIN_SECONDARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import type { ProAdminVenue } from '@/lib/api/pro';
import { proErrorMessage, validateVenueInput, VENUE_LIMITS } from '@/lib/pro';
import AdminModal from './AdminModal';

export interface VenueFormValues {
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface VenueFormModalProps {
  /** null = เพิ่มสนามใหม่ */
  venue: ProAdminVenue | null;
  otherKeys: string[];
  onClose: () => void;
  onSubmit: (values: VenueFormValues) => Promise<void>;
}

const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400';

/** ฟอร์มเพิ่ม/แก้สนาม (key, ชื่อ, ข้อความใต้ "เลือกสนามที่จะสมัคร", เปิด/ปิด) */
export default function VenueFormModal({ venue, otherKeys, onClose, onSubmit }: VenueFormModalProps) {
  const [key, setKey] = useState(venue?.key ?? '');
  const [name, setName] = useState(venue?.name ?? '');
  const [description, setDescription] = useState(venue?.description ?? '');
  const [isActive, setIsActive] = useState(venue?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const values: VenueFormValues = {
      key: key.trim(),
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      isActive,
    };
    const message = validateVenueInput(values, otherKeys);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(proErrorMessage(err, 'บันทึกสนามไม่สำเร็จ'));
      setSaving(false);
    }
  }

  return (
    <AdminModal
      title={venue ? `แก้สนาม ${venue.name}` : 'เพิ่มสนาม'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
            ยกเลิก
          </button>
          <button type="submit" form="pro-venue-form" disabled={saving} className={ADMIN_PRIMARY_BUTTON}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            บันทึกสนาม
          </button>
        </>
      }
    >
      <form id="pro-venue-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="venue-name" className={LABEL}>
            ชื่อสนาม
          </label>
          <input
            id="venue-name"
            type="text"
            value={name}
            maxLength={VENUE_LIMITS.name}
            onChange={(e) => setName(e.target.value)}
            className={ADMIN_INPUT}
          />
        </div>
        <div>
          <label htmlFor="venue-key" className={LABEL}>
            key
          </label>
          <input
            id="venue-key"
            type="text"
            value={key}
            maxLength={30}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            aria-describedby="venue-key-hint"
            className={`${ADMIN_INPUT} font-mono`}
          />
          <p id="venue-key-hint" className={HINT}>
            ใช้ในลิงก์ /upgrade?venue=&lt;key&gt; เช่น netsat (a-z 0-9 - _)
          </p>
        </div>
        <div>
          <label htmlFor="venue-description" className={LABEL}>
            ข้อความใต้หัวข้อเลือกสนาม
          </label>
          <textarea
            id="venue-description"
            rows={3}
            value={description}
            maxLength={VENUE_LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby="venue-description-hint"
            className={ADMIN_INPUT}
          />
          <p id="venue-description-hint" className={HINT}>
            แสดงเมื่อเลือกสนามนี้ เช่น &quot;สมัครแล้วใช้ได้เฉพาะสนามที่เลือก&quot;
          </p>
        </div>
        <label className="flex items-center gap-3 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 accent-indigo-600"
          />
          <span className="text-sm text-gray-800 dark:text-gray-200">เปิดใช้งาน (แสดงบนหน้า Upgrade)</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
