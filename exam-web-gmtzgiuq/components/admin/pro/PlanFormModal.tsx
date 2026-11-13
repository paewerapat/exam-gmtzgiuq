'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { ADMIN_INPUT, ADMIN_PRIMARY_BUTTON, ADMIN_SECONDARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import type { ProAdminPlan, ProEntitlements, ProPlanInput } from '@/lib/api/pro';
import {
  bahtToSatang,
  DEFAULT_ENTITLEMENTS,
  ENTITLEMENT_TOGGLES,
  MAX_PREDICTED_SETS,
  PLAN_LIMITS,
  PRO_ERROR_MESSAGES,
  proErrorMessage,
  satangToBahtInput,
  validatePlanInput,
} from '@/lib/pro';
import AdminModal from './AdminModal';

interface PlanFormModalProps {
  venueName: string;
  /** null = เพิ่มแพ็กเกจใหม่ */
  plan: ProAdminPlan | null;
  /** รหัสของแพ็กเกจอื่นในสนามนี้ (กันซ้ำ) */
  otherCodes: string[];
  /** สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อื่นอยู่แล้ว — มีได้สนามละ 1 แพ็กเกจ */
  otherFreePlanExists?: boolean;
  /** sortOrder ของแพ็กเกจใหม่ */
  nextSortOrder: number;
  onClose: () => void;
  /** บันทึก (โยน error ได้ — แสดงในฟอร์ม) */
  onSubmit: (input: ProPlanInput) => Promise<void>;
}

interface FormState {
  code: string;
  rank: string;
  price: string;
  periodDays: string;
  name: string;
  tagline: string;
  priceUnit: string;
  priceNote: string;
  buttonText: string;
  badge: string;
  highlight: boolean;
  isVisible: boolean;
  isPurchasable: boolean;
  entitlements: ProEntitlements;
  predictedSets: string;
  predictedAll: boolean;
}

function toForm(plan: ProAdminPlan | null): FormState {
  const ent = plan?.entitlements ?? DEFAULT_ENTITLEMENTS;
  return {
    code: plan?.code ?? '',
    rank: String(plan?.rank ?? 1),
    price: plan ? satangToBahtInput(plan.priceSatang) : '',
    periodDays: String(plan?.periodDays ?? 30),
    name: plan?.name ?? '',
    tagline: plan?.tagline ?? '',
    priceUnit: plan?.priceUnit ?? '/ เดือน',
    priceNote: plan?.priceNote ?? '',
    buttonText: plan?.buttonText ?? '',
    badge: plan?.badge ?? '',
    highlight: plan?.highlight ?? false,
    isVisible: plan?.isVisible ?? true,
    isPurchasable: plan?.isPurchasable ?? true,
    entitlements: { ...ent },
    predictedSets: ent.predictedSets === null ? '' : String(ent.predictedSets),
    predictedAll: ent.predictedSets === null,
  };
}

const intOrNaN = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
const textOrNull = (v: string) => (v.trim() ? v.trim() : null);

const BOX = 'rounded-xl border p-4 space-y-4';
const LEGEND = 'px-1 text-sm font-semibold';
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
const CHECK_ROW = 'flex items-start gap-3 min-h-11 py-1 cursor-pointer';
const CHECKBOX = 'mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 dark:border-gray-600 accent-indigo-600';

/** ฟอร์มเพิ่ม/แก้แพ็กเกจ: ข้อมูลแพ็กเกจ · ข้อความที่แสดง · สิทธิ์ที่ใช้ได้จริง (กล่องแยก) */
export default function PlanFormModal({
  venueName,
  plan,
  otherCodes,
  otherFreePlanExists = false,
  nextSortOrder,
  onClose,
  onSubmit,
}: PlanFormModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(plan));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isFree = form.rank.trim() === '0';

  function buildInput(): ProPlanInput | string {
    const priceSatang = form.price.trim() === '' ? 0 : bahtToSatang(form.price);
    if (priceSatang === null) return 'ราคาต้องเป็นตัวเลข (ทศนิยมได้ไม่เกิน 2 ตำแหน่ง)';
    const predictedSets = form.predictedAll ? null : intOrNaN(form.predictedSets);
    if (predictedSets !== null && Number.isNaN(predictedSets))
      return `จำนวนชุด Predicted ต้องเป็นจำนวนเต็ม 0–${MAX_PREDICTED_SETS.toLocaleString('th-TH')} หรือเลือก "ทุกชุด"`;
    return {
      code: form.code.trim(),
      rank: intOrNaN(form.rank),
      name: form.name.trim(),
      tagline: textOrNull(form.tagline),
      priceSatang,
      priceUnit: textOrNull(form.priceUnit),
      priceNote: textOrNull(form.priceNote),
      periodDays: intOrNaN(form.periodDays),
      buttonText: form.buttonText.trim(),
      badge: textOrNull(form.badge),
      highlight: form.highlight,
      sortOrder: plan?.sortOrder ?? nextSortOrder,
      isVisible: form.isVisible,
      // แพ็กเกจระดับ 0 ซื้อไม่ได้เสมอ (ช่องถูกปิดไว้)
      isPurchasable: isFree ? false : form.isPurchasable,
      entitlements: { ...form.entitlements, predictedSets },
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = buildInput();
    const message = typeof input === 'string' ? input : validatePlanInput(input, otherCodes, otherFreePlanExists);
    if (message || typeof input === 'string') {
      setError(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(proErrorMessage(err, 'บันทึกแพ็กเกจไม่สำเร็จ'));
      setSaving(false);
    }
  }

  const text = (
    key: 'code' | 'name' | 'tagline' | 'priceUnit' | 'priceNote' | 'buttonText' | 'badge',
    label: string,
    hint?: string,
    max?: number,
  ) => (
    <div>
      <label htmlFor={`plan-${key}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`plan-${key}`}
        type="text"
        value={form[key]}
        maxLength={max}
        onChange={(e) => set(key, e.target.value)}
        aria-describedby={hint ? `plan-${key}-hint` : undefined}
        className={ADMIN_INPUT}
      />
      {hint && (
        <p id={`plan-${key}-hint`} className={HINT}>
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <AdminModal
      title={plan ? `แก้แพ็กเกจ ${plan.name} (${venueName})` : `เพิ่มแพ็กเกจ (${venueName})`}
      onClose={onClose}
      busy={saving}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
            ยกเลิก
          </button>
          <button type="submit" form="pro-plan-form" disabled={saving} className={ADMIN_PRIMARY_BUTTON}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            บันทึกแพ็กเกจ
          </button>
        </>
      }
    >
      <form id="pro-plan-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <fieldset className={`${BOX} border-gray-200 dark:border-gray-700`}>
          <legend className={`${LEGEND} text-gray-900 dark:text-gray-100`}>ข้อมูลแพ็กเกจ</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('code', 'รหัสแพ็กเกจ', 'a-z 0-9 - _ ไม่ซ้ำในสนาม ใช้อ้างช่องในตารางเปรียบเทียบ (เปลี่ยนแล้วช่องที่อ้างรหัสเดิมจะหาย)', PLAN_LIMITS.code)}
            <div>
              <label htmlFor="plan-rank" className={LABEL}>
                ระดับ (rank)
              </label>
              <input
                id="plan-rank"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.rank}
                onChange={(e) => set('rank', e.target.value)}
                aria-describedby="plan-rank-hint"
                className={ADMIN_INPUT}
              />
              <p id="plan-rank-hint" className={HINT}>
                0 = แพ็กเกจฟรี (ราคา 0 ซื้อไม่ได้) ยิ่งมากยิ่งสูง
              </p>
            </div>
            <div>
              <label htmlFor="plan-price" className={LABEL}>
                ราคา (บาท)
              </label>
              <input
                id="plan-price"
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                aria-describedby="plan-price-hint"
                className={ADMIN_INPUT}
              />
              <p id="plan-price-hint" className={HINT}>
                ราคาที่แสดง = ราคาที่ใช้ตัดเงินจริง
              </p>
            </div>
            <div>
              <label htmlFor="plan-period" className={LABEL}>
                อายุต่อรอบ (วัน)
              </label>
              <input
                id="plan-period"
                type="number"
                inputMode="numeric"
                min={1}
                max={PLAN_LIMITS.periodDaysMax}
                value={form.periodDays}
                onChange={(e) => set('periodDays', e.target.value)}
                className={ADMIN_INPUT}
              />
            </div>
          </div>
          <div className="grid gap-1 sm:grid-cols-3">
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={form.isVisible} onChange={(e) => set('isVisible', e.target.checked)} className={CHECKBOX} />
              <span className="text-sm text-gray-800 dark:text-gray-200">แสดงบนหน้า Upgrade</span>
            </label>
            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={form.isPurchasable && !isFree}
                disabled={isFree}
                onChange={(e) => set('isPurchasable', e.target.checked)}
                className={CHECKBOX}
              />
              <span className="text-sm text-gray-800 dark:text-gray-200">
                เปิดให้ซื้อ
                <span className="block text-xs text-gray-500 dark:text-gray-400">ปิด = ปุ่มกดไม่ได้ (เช่น เร็วๆ นี้)</span>
              </span>
            </label>
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={form.highlight} onChange={(e) => set('highlight', e.target.checked)} className={CHECKBOX} />
              <span className="text-sm text-gray-800 dark:text-gray-200">การ์ดเด่น (ขอบสี)</span>
            </label>
          </div>
        </fieldset>

        <fieldset className={`${BOX} border-gray-200 dark:border-gray-700`}>
          <legend className={`${LEGEND} text-gray-900 dark:text-gray-100`}>ข้อความที่แสดงบนหน้า Upgrade</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', 'ชื่อแพ็กเกจ', undefined, PLAN_LIMITS.name)}
            {text('buttonText', 'ข้อความปุ่ม', 'เช่น "สมัคร PRO"', PLAN_LIMITS.buttonText)}
            <div className="sm:col-span-2">{text('tagline', 'คำโปรย', undefined, PLAN_LIMITS.tagline)}</div>
            {text('priceUnit', 'หน่วยราคา', 'เช่น "/ เดือน" (ว่างได้)', PLAN_LIMITS.priceUnit)}
            {text('badge', 'ป้าย', 'เช่น "แนะนำ", "เร็วๆ นี้" (ว่าง = ไม่มีป้าย)', PLAN_LIMITS.badge)}
            <div className="sm:col-span-2">
              {text('priceNote', 'หมายเหตุราคา', 'เช่น "ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้"', PLAN_LIMITS.priceNote)}
            </div>
          </div>
        </fieldset>

        <fieldset className={`${BOX} border-emerald-300 bg-emerald-50/50 dark:border-emerald-700/60 dark:bg-emerald-900/10`}>
          <legend className={`${LEGEND} text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5`}>
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            สิทธิ์ที่ใช้ได้จริง
          </legend>
          <p className="text-xs text-emerald-900/80 dark:text-emerald-200/80">
            ระบบใช้ค่าชุดนี้ตัดสินว่าผู้สมัครเข้าอะไรได้บ้าง แยกจากข้อความในตารางเปรียบเทียบ
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {ENTITLEMENT_TOGGLES.map((t) => {
              const checked = form.entitlements[t.key] === true;
              // แพ็กเกจฟรีให้สิทธิ์ชุด Mock ที่ต้องซื้อไม่ได้ (API ตอบ 400 FREE_PLAN_MOCK_PURCHASE)
              // ติ๊กค้างอยู่ยังเอาออกได้ ส่วนที่ยังไม่ติ๊กกดไม่ได้
              const blocked = t.key === 'mockPurchase' && isFree;
              const hintId = blocked ? 'plan-mock-purchase-free-hint' : undefined;
              return (
                <label key={t.key} className={`${CHECK_ROW} ${blocked && !checked ? 'cursor-not-allowed opacity-70' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={blocked && !checked}
                    aria-describedby={hintId}
                    onChange={(e) => set('entitlements', { ...form.entitlements, [t.key]: e.target.checked })}
                    className={CHECKBOX}
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {t.label}
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{t.hint}</span>
                    {blocked && (
                      <span id={hintId} className="block text-xs text-amber-700 dark:text-amber-300">
                        {PRO_ERROR_MESSAGES.FREE_PLAN_MOCK_PURCHASE}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label htmlFor="plan-predicted" className={LABEL}>
                ชุด Predicted ต่อวิชา
              </label>
              <input
                id="plan-predicted"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PREDICTED_SETS}
                value={form.predictedAll ? '' : form.predictedSets}
                disabled={form.predictedAll}
                onChange={(e) => set('predictedSets', e.target.value)}
                className={ADMIN_INPUT}
              />
            </div>
            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={form.predictedAll}
                onChange={(e) => set('predictedAll', e.target.checked)}
                className={CHECKBOX}
              />
              <span className="text-sm text-gray-800 dark:text-gray-200">ทุกชุด</span>
            </label>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
