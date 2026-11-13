'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import ToggleSwitch from '@/components/admin/ToggleSwitch';
import {
  ADMIN_INPUT,
  ADMIN_INPUT_INVALID,
  ADMIN_PRIMARY_BUTTON,
  ADMIN_SECONDARY_BUTTON,
} from '@/components/admin/unlock-codes/shared';
import { ApiError } from '@/lib/api/apiError';
import {
  createProDiscountCode,
  updateProDiscountCode,
  type ProAdminVenue,
  type ProDiscountCode,
  type ProDiscountType,
} from '@/lib/api/pro';
import { proErrorMessage } from '@/lib/pro';
import {
  createDiscountForm,
  diffDiscountInput,
  DISCOUNT_LIMITS,
  DISCOUNT_TYPE_LABELS,
  discountFormToInput,
  firstDiscountErrorField,
  formatDiscountCodeInput,
  validateDiscountForm,
  type DiscountCodeForm,
  type DiscountFormErrors,
  type DiscountFormField,
} from '@/lib/pro-discounts';
import { bangkokInputToIso } from '@/lib/release-date';
import AdminModal from './AdminModal';

interface DiscountCodeFormModalProps {
  venues: ProAdminVenue[];
  /** null = สร้างใหม่ */
  code: ProDiscountCode | null;
  onClose: () => void;
  onSaved: (code: ProDiscountCode, created: boolean) => void;
}

const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
const SELECT_DARK = 'dark:[color-scheme:dark]';

const FIELD_IDS: Record<DiscountFormField, string> = {
  code: 'discount-code',
  description: 'discount-description',
  value: 'discount-value',
  startsAt: 'discount-starts',
  endsAt: 'discount-ends',
  maxRedemptions: 'discount-max',
  perUserLimit: 'discount-per-user',
};

/** สร้าง/แก้โค้ดส่วนลด (task 19) — แก้ไขส่งเฉพาะฟิลด์ที่เปลี่ยน, แก้โค้ด/ประเภท/มูลค่าหลังมีการใช้แล้ว API ตอบ 409 */
export default function DiscountCodeFormModal({ venues, code, onClose, onSaved }: DiscountCodeFormModalProps) {
  const editing = !!code;
  const [form, setForm] = useState<DiscountCodeForm>(() => createDiscountForm(code));
  const [errors, setErrors] = useState<DiscountFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const venue = venues.find((v) => v.id === form.venueId) ?? null;
  // แพ็กเกจที่ลดได้ = ไม่ใช่ระดับ 0 (ราคา 0 ลดไม่ได้)
  const planOptions = venue ? venue.plans.filter((p) => p.rank > 0) : [];
  const used = (code?.redeemedCount ?? 0) > 0;

  function set<K extends keyof DiscountCodeForm>(field: K, value: DiscountCodeForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    const errorField = (field === 'discountType' ? 'value' : field) as DiscountFormField;
    if (errors[errorField]) setErrors((prev) => ({ ...prev, [errorField]: undefined }));
  }

  const describedBy = (field: DiscountFormField, hintId?: string) =>
    [hintId, errors[field] ? `${FIELD_IDS[field]}-error` : null].filter(Boolean).join(' ') || undefined;

  const fieldError = (field: DiscountFormField) =>
    errors[field] ? (
      <p id={`${FIELD_IDS[field]}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
        {errors[field]}
      </p>
    ) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const found = validateDiscountForm(form, bangkokInputToIso);
    setErrors(found);
    setFormError(null);
    const first = firstDiscountErrorField(found);
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    const input = discountFormToInput(form, bangkokInputToIso);
    if (code) {
      const changes = diffDiscountInput(code, input);
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        onSaved(await updateProDiscountCode(code.id, changes), false);
      } catch (err) {
        handleError(err);
      }
      return;
    }
    setSaving(true);
    try {
      onSaved(await createProDiscountCode(input), true);
    } catch (err) {
      handleError(err);
    }
  }

  function handleError(err: unknown) {
    const message = proErrorMessage(err, editing ? 'บันทึกโค้ดส่วนลดไม่สำเร็จ' : 'สร้างโค้ดส่วนลดไม่สำเร็จ');
    if (err instanceof ApiError && err.errorCode === 'DISCOUNT_CODE_TAKEN') {
      setErrors((prev) => ({ ...prev, code: message }));
      document.getElementById(FIELD_IDS.code)?.focus();
    } else {
      // รวม 409 DISCOUNT_IN_USE (แก้โค้ด/ประเภท/มูลค่าหลังมีการใช้แล้ว)
      setFormError(message);
    }
    setSaving(false);
  }

  const valueSuffix = form.discountType === 'percent' ? '%' : 'บาท';

  return (
    <AdminModal
      title={code ? `แก้โค้ดส่วนลด ${code.code}` : 'สร้างโค้ดส่วนลด'}
      onClose={onClose}
      busy={saving}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
            ยกเลิก
          </button>
          <button type="submit" form="discount-code-form" disabled={saving} className={ADMIN_PRIMARY_BUTTON}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {editing ? 'บันทึก' : 'สร้างโค้ด'}
          </button>
        </>
      }
    >
      <form id="discount-code-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {used && (
          <p
            role="note"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-200"
          >
            โค้ดนี้มีการใช้แล้ว {code?.redeemedCount.toLocaleString('th-TH')} ครั้ง — แก้ตัวโค้ด ประเภท และมูลค่าส่วนลดไม่ได้
            (แก้ส่วนอื่นหรือเปิด/ปิดได้)
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={FIELD_IDS.code} className={LABEL}>
              โค้ด<span className="text-red-500 dark:text-red-400"> *</span>
            </label>
            <input
              id={FIELD_IDS.code}
              type="text"
              value={form.code}
              onChange={(e) => set('code', formatDiscountCodeInput(e.target.value))}
              maxLength={DISCOUNT_LIMITS.codeMax}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="เช่น NEWYEAR20"
              aria-invalid={errors.code ? true : undefined}
              aria-describedby={describedBy('code', 'discount-code-hint')}
              className={`${errors.code ? ADMIN_INPUT_INVALID : ADMIN_INPUT} font-mono uppercase placeholder:normal-case placeholder:font-sans`}
            />
            <p id="discount-code-hint" className={HINT}>
              A–Z 0–9 - และ _ ยาว {DISCOUNT_LIMITS.codeMin}–{DISCOUNT_LIMITS.codeMax} ตัว (เก็บเป็นตัวพิมพ์ใหญ่)
            </p>
            {fieldError('code')}
          </div>
          <div>
            <label htmlFor={FIELD_IDS.description} className={LABEL}>
              คำอธิบาย (ไม่บังคับ)
            </label>
            <input
              id={FIELD_IDS.description}
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={DISCOUNT_LIMITS.description}
              placeholder="เช่น โปรปีใหม่ 2570"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={describedBy('description')}
              className={errors.description ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            {fieldError('description')}
          </div>
        </div>

        <fieldset>
          <legend className={LABEL}>
            ส่วนลด<span className="text-red-500 dark:text-red-400"> *</span>
          </legend>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div role="radiogroup" aria-label="ประเภทส่วนลด" className="flex gap-2">
              {(['percent', 'amount'] as ProDiscountType[]).map((t) => {
                const checked = form.discountType === t;
                return (
                  <label
                    key={t}
                    className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-lg border text-sm cursor-pointer transition ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-200'
                        : 'border-gray-300 text-gray-700 hover:border-indigo-300 dark:border-gray-600 dark:text-gray-300 dark:hover:border-indigo-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="discount-type"
                      checked={checked}
                      onChange={() => set('discountType', t)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    {DISCOUNT_TYPE_LABELS[t]}
                  </label>
                );
              })}
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor={FIELD_IDS.value} className="sr-only">
                มูลค่าส่วนลด ({valueSuffix})
              </label>
              <div className="relative">
                <input
                  id={FIELD_IDS.value}
                  type="text"
                  inputMode="decimal"
                  value={form.value}
                  onChange={(e) => set('value', e.target.value)}
                  placeholder={form.discountType === 'percent' ? '1–100' : 'เช่น 50'}
                  aria-invalid={errors.value ? true : undefined}
                  aria-describedby={describedBy('value')}
                  className={`${errors.value ? ADMIN_INPUT_INVALID : ADMIN_INPUT} pr-14 tabular-nums`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500 dark:text-gray-400">
                  {valueSuffix}
                </span>
              </div>
              {fieldError('value')}
            </div>
          </div>
          <p className={HINT}>ส่วนลดใช้กับการชำระครั้งแรกเท่านั้น รอบต่ออายุอัตโนมัติคิดราคาเต็ม · ยอดหลังลดต้องไม่ต่ำกว่า 20 บาท</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discount-venue" className={LABEL}>
              สนาม
            </label>
            <select
              id="discount-venue"
              value={form.venueId}
              onChange={(e) => setForm((prev) => ({ ...prev, venueId: e.target.value, planId: '' }))}
              className={`${ADMIN_INPUT} ${SELECT_DARK}`}
            >
              <option value="">ทุกสนาม</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.isActive ? '' : ' (ปิดอยู่)'}
                </option>
              ))}
              {/* สนามที่ไม่อยู่ใน config แล้ว (ถูกลบ) — คงค่าเดิมไว้ */}
              {form.venueId && !venue && <option value={form.venueId}>{code?.venue?.name || 'สนามที่ถูกลบ'}</option>}
            </select>
          </div>
          <div>
            <label htmlFor="discount-plan" className={LABEL}>
              แพ็กเกจ
            </label>
            <select
              id="discount-plan"
              value={form.planId}
              onChange={(e) => set('planId', e.target.value)}
              disabled={!form.venueId}
              aria-describedby="discount-plan-hint"
              className={`${ADMIN_INPUT} ${SELECT_DARK}`}
            >
              <option value="">{form.venueId ? 'ทุกแพ็กเกจของสนามนี้' : 'ทุกแพ็กเกจ'}</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isPurchasable ? '' : ' (ปิดการขาย)'}
                </option>
              ))}
              {form.planId && !planOptions.some((p) => p.id === form.planId) && (
                <option value={form.planId}>{code?.plan?.name || 'แพ็กเกจที่ถูกลบ'}</option>
              )}
            </select>
            <p id="discount-plan-hint" className={HINT}>
              เลือกสนามก่อนจึงเลือกแพ็กเกจได้
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={FIELD_IDS.startsAt} className={LABEL}>
              เริ่มใช้ได้ (ไม่บังคับ)
            </label>
            <input
              id={FIELD_IDS.startsAt}
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
              aria-invalid={errors.startsAt ? true : undefined}
              aria-describedby={describedBy('startsAt')}
              className={errors.startsAt ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            {fieldError('startsAt')}
          </div>
          <div>
            <label htmlFor={FIELD_IDS.endsAt} className={LABEL}>
              ใช้ได้ถึง (ไม่บังคับ)
            </label>
            <input
              id={FIELD_IDS.endsAt}
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
              aria-invalid={errors.endsAt ? true : undefined}
              aria-describedby={describedBy('endsAt')}
              className={errors.endsAt ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            {fieldError('endsAt')}
          </div>
        </div>
        <p className={`${HINT} -mt-2`}>เวลาไทย · ว่าง = ไม่จำกัด</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={FIELD_IDS.maxRedemptions} className={LABEL}>
              ใช้ได้สูงสุด (ครั้ง)
            </label>
            <input
              id={FIELD_IDS.maxRedemptions}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.maxRedemptions}
              onChange={(e) => set('maxRedemptions', e.target.value)}
              placeholder="ไม่จำกัด"
              aria-invalid={errors.maxRedemptions ? true : undefined}
              aria-describedby={describedBy('maxRedemptions', 'discount-max-hint')}
              className={errors.maxRedemptions ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            <p id="discount-max-hint" className={HINT}>
              รวมทุกบัญชี (นับรายการที่รอชำระด้วย) · ว่าง = ไม่จำกัด
            </p>
            {fieldError('maxRedemptions')}
          </div>
          <div>
            <label htmlFor={FIELD_IDS.perUserLimit} className={LABEL}>
              ใช้ได้ต่อบัญชี (ครั้ง)<span className="text-red-500 dark:text-red-400"> *</span>
            </label>
            <input
              id={FIELD_IDS.perUserLimit}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.perUserLimit}
              onChange={(e) => set('perUserLimit', e.target.value)}
              aria-invalid={errors.perUserLimit ? true : undefined}
              aria-describedby={describedBy('perUserLimit')}
              className={errors.perUserLimit ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            {fieldError('perUserLimit')}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">เปิดใช้งาน</span>
          <ToggleSwitch checked={form.isActive} onChange={(next) => set('isActive', next)} label="เปิดใช้งานโค้ดส่วนลด" />
        </div>

        {formError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 break-words">
            {formError}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
