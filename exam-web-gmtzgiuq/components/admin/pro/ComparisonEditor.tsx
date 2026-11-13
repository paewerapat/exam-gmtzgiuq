'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_PRIMARY_BUTTON,
  ADMIN_SECONDARY_BUTTON,
} from '@/components/admin/unlock-codes/shared';
import ComparisonTable from '@/components/pro/ComparisonTable';
import { toComparisonPayload, updateProVenue, type Comparison, type ComparisonCell, type ProAdminVenue } from '@/lib/api/pro';
import {
  addGroup,
  addRow,
  changeCellType,
  COMPARISON_LIMITS,
  moveGroup,
  moveRow,
  removeGroup,
  removeRow,
  setCell,
  updateGroupTitle,
  proErrorMessage,
  updateRow,
  validateComparison,
  withEditorIds,
} from '@/lib/pro';
import AdminModal from './AdminModal';
import { confirmDanger } from './confirm';
import { venueToInput } from './VenuesPlansTab';

interface ComparisonEditorProps {
  venue: ProAdminVenue;
  /** บันทึกสำเร็จ → comparison ใหม่ของสนาม */
  onSaved: (comparison: Comparison) => void;
  /** มีการแก้ที่ยังไม่บันทึกหรือไม่ (ใช้เตือนตอนเปลี่ยนสนาม) */
  onDirtyChange?: (dirty: boolean) => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const ICON_BTN_DANGER =
  'inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500';
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';
const ADD_BTN =
  'inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

const CELL_OPTIONS: { value: ComparisonCell['type'] | 'none'; label: string; symbol: string }[] = [
  { value: 'check', label: 'มี', symbol: '✓' },
  { value: 'cross', label: 'ไม่มี', symbol: '✕' },
  { value: 'text', label: 'ข้อความ', symbol: 'Aa' },
  { value: 'none', label: 'ว่าง', symbol: '–' },
];

const serialize = (c: Comparison) => JSON.stringify(toComparisonPayload(c));

/** editor ตารางเปรียบเทียบของสนาม: กลุ่ม/แถว (เพิ่ม/ลบ/เลื่อน) + ช่องต่อแพ็กเกจ ✓/✕/ข้อความ + ดูตัวอย่าง */
export default function ComparisonEditor({ venue, onSaved, onDirtyChange }: ComparisonEditorProps) {
  const [comparison, setComparisonState] = useState<Comparison>(() => withEditorIds(venue.comparison));
  const [baseline, setBaseline] = useState(() => serialize(venue.comparison));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const plans = venue.plans;
  const visiblePlans = useMemo(() => plans.filter((p) => p.isVisible), [plans]);

  function update(next: Comparison) {
    setComparisonState(next);
    setError(null);
    onDirtyChange?.(serialize(next) !== baseline);
  }

  async function handleRemoveGroup(gi: number) {
    const g = comparison.groups[gi];
    if (
      g.rows.length > 0 &&
      !(await confirmDanger(
        `ลบกลุ่ม "${g.title || `กลุ่มที่ ${gi + 1}`}"?`,
        `แถวในกลุ่มนี้ ${g.rows.length.toLocaleString('th-TH')} แถวจะถูกลบด้วย (มีผลเมื่อกดบันทึก)`,
        'ลบกลุ่ม',
      ))
    )
      return;
    update(removeGroup(comparison, gi));
  }

  async function handleSave() {
    const message = validateComparison(comparison);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toComparisonPayload(comparison);
      const updated = await updateProVenue(venue.id, { ...venueToInput(venue), comparison: payload });
      const saved = updated.id ? updated.comparison : payload;
      onSaved(saved);
      setComparisonState(withEditorIds(saved));
      const s = serialize(saved);
      setBaseline(s);
      onDirtyChange?.(false);
      toast.success(`บันทึกตารางเปรียบเทียบของ ${venue.name} แล้ว`);
    } catch (err) {
      setError(proErrorMessage(err, 'บันทึกตารางเปรียบเทียบไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  const dirty = serialize(comparison) !== baseline;
  const groupsFull = comparison.groups.length >= COMPARISON_LIMITS.groups;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setPreview(true)} className={ADMIN_SECONDARY_BUTTON}>
        <Eye className="w-4 h-4" aria-hidden="true" />
        ดูตัวอย่าง
      </button>
      <button type="button" onClick={handleSave} disabled={saving || !dirty} className={ADMIN_PRIMARY_BUTTON}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
        บันทึกตาราง
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={`${ADMIN_CARD} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 break-words">ตารางเปรียบเทียบของ {venue.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {comparison.groups.length.toLocaleString('th-TH')} กลุ่ม · ข้อความเป็นตัวอักษรธรรมดา (ไม่รองรับ HTML)
            {dirty && <span className="ml-1 font-medium text-amber-700 dark:text-amber-300">· ยังไม่ได้บันทึก</span>}
          </p>
        </div>
        {actions}
      </div>

      {plans.length === 0 && (
        <p className="rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800/50">
          สนามนี้ยังไม่มีแพ็กเกจ เพิ่มแพ็กเกจในแท็บ &quot;สนามและแพ็กเกจ&quot; ก่อนจึงตั้งช่องของแต่ละแพ็กเกจได้
        </p>
      )}

      {comparison.groups.length === 0 && (
        <p className={`${ADMIN_CARD} p-6 text-center text-sm text-gray-500 dark:text-gray-400`}>
          ยังไม่มีกลุ่ม กด &quot;เพิ่มกลุ่ม&quot; เพื่อเริ่ม
        </p>
      )}

      {comparison.groups.map((group, gi) => {
        const gNo = gi + 1;
        const rowsFull = group.rows.length >= COMPARISON_LIMITS.rowsPerGroup;
        return (
          <section key={group.id ?? gi} aria-label={`กลุ่มที่ ${gNo}`} className={`${ADMIN_CARD} p-4 space-y-3`} data-testid="comparison-group">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[12rem]">
                <label htmlFor={`group-title-${group.id}`} className={LABEL}>
                  ชื่อกลุ่มที่ {gNo}
                </label>
                <input
                  id={`group-title-${group.id}`}
                  type="text"
                  value={group.title}
                  maxLength={COMPARISON_LIMITS.groupTitle}
                  placeholder="เช่น PREDICTED EXAM"
                  onChange={(e) => update(updateGroupTitle(comparison, gi, e.target.value))}
                  className={`${ADMIN_INPUT} font-semibold`}
                />
              </div>
              <div className="flex items-center">
                <button type="button" onClick={() => update(moveGroup(comparison, gi, -1))} disabled={gi === 0} aria-label={`เลื่อนกลุ่มที่ ${gNo} ขึ้น`} className={ICON_BTN}>
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => update(moveGroup(comparison, gi, 1))} disabled={gi === comparison.groups.length - 1} aria-label={`เลื่อนกลุ่มที่ ${gNo} ลง`} className={ICON_BTN}>
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => handleRemoveGroup(gi)} aria-label={`ลบกลุ่มที่ ${gNo}`} className={ICON_BTN_DANGER}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {group.rows.map((row, ri) => {
              const rName = `กลุ่มที่ ${gNo} แถวที่ ${ri + 1}`;
              return (
                <div key={row.id ?? ri} data-testid="comparison-row" className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[12rem]">
                      <label htmlFor={`row-label-${row.id}`} className={LABEL}>
                        ชื่อแถว ({rName})
                      </label>
                      <input
                        id={`row-label-${row.id}`}
                        type="text"
                        value={row.label}
                        maxLength={COMPARISON_LIMITS.label}
                        onChange={(e) => update(updateRow(comparison, gi, ri, { label: e.target.value }))}
                        className={ADMIN_INPUT}
                      />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <label htmlFor={`row-sub-${row.id}`} className={LABEL}>
                        คำอธิบายใต้ชื่อแถว ({rName})
                      </label>
                      <input
                        id={`row-sub-${row.id}`}
                        type="text"
                        value={row.sublabel ?? ''}
                        maxLength={COMPARISON_LIMITS.sublabel}
                        onChange={(e) => update(updateRow(comparison, gi, ri, { sublabel: e.target.value }))}
                        className={ADMIN_INPUT}
                      />
                    </div>
                    <div className="flex items-center">
                      <button type="button" onClick={() => update(moveRow(comparison, gi, ri, -1))} disabled={ri === 0} aria-label={`เลื่อน${rName}ขึ้น`} className={ICON_BTN}>
                        <ArrowUp className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => update(moveRow(comparison, gi, ri, 1))}
                        disabled={ri === group.rows.length - 1}
                        aria-label={`เลื่อน${rName}ลง`}
                        className={ICON_BTN}
                      >
                        <ArrowDown className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => update(removeRow(comparison, gi, ri))} aria-label={`ลบ${rName}`} className={ICON_BTN_DANGER}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {plans.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {plans.map((plan) => {
                        const cell = row.cells[plan.code];
                        const current = cell?.type ?? 'none';
                        const base = `cell-${row.id}-${plan.code}`;
                        return (
                          <fieldset key={plan.code} className="rounded-lg bg-gray-50 dark:bg-gray-900/50 p-2.5 min-w-0">
                            <legend className="sr-only">
                              ช่องของ {plan.name} ({rName})
                            </legend>
                            <p aria-hidden="true" className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 truncate">
                              {plan.name} <span className="font-mono font-normal text-gray-500 dark:text-gray-400">{plan.code}</span>
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {CELL_OPTIONS.map((opt) => {
                                const id = `${base}-type-${opt.value}`;
                                const checked = current === opt.value;
                                return (
                                  <label
                                    key={opt.value}
                                    htmlFor={id}
                                    className={`inline-flex items-center gap-1 min-h-9 px-2.5 rounded-full border text-xs font-medium cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                                      checked
                                        ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                                        : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                                    }`}
                                  >
                                    <input
                                      id={id}
                                      type="radio"
                                      name={base}
                                      value={opt.value}
                                      checked={checked}
                                      onChange={() => update(changeCellType(comparison, gi, ri, plan.code, opt.value))}
                                      className="sr-only"
                                    />
                                    <span aria-hidden="true">{opt.symbol}</span>
                                    {opt.label}
                                  </label>
                                );
                              })}
                            </div>
                            {cell?.type === 'text' && (
                              <div className="mt-2 grid gap-2">
                                <div>
                                  <label htmlFor={`${base}-input-text`} className={LABEL}>
                                    ข้อความในช่อง
                                  </label>
                                  <input
                                    id={`${base}-input-text`}
                                    type="text"
                                    value={cell.text ?? ''}
                                    maxLength={COMPARISON_LIMITS.text}
                                    placeholder="เช่น 2 ชุด"
                                    onChange={(e) => update(setCell(comparison, gi, ri, plan.code, { ...cell, text: e.target.value }))}
                                    className={ADMIN_INPUT}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`${base}-input-subtext`} className={LABEL}>
                                    ข้อความรอง
                                  </label>
                                  <input
                                    id={`${base}-input-subtext`}
                                    type="text"
                                    value={cell.subtext ?? ''}
                                    maxLength={COMPARISON_LIMITS.subtext}
                                    placeholder="เช่น ต่อ 1 วิชา"
                                    onChange={(e) => update(setCell(comparison, gi, ri, plan.code, { ...cell, subtext: e.target.value }))}
                                    className={ADMIN_INPUT}
                                  />
                                </div>
                              </div>
                            )}
                          </fieldset>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <button type="button" onClick={() => update(addRow(comparison, gi))} disabled={rowsFull} className={ADD_BTN}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              เพิ่มแถวในกลุ่มที่ {gNo}
            </button>
            {rowsFull && (
              <p className="text-xs text-gray-500 dark:text-gray-400">ครบ {COMPARISON_LIMITS.rowsPerGroup} แถวแล้ว</p>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => update(addGroup(comparison))} disabled={groupsFull} className={ADD_BTN}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          เพิ่มกลุ่ม
        </button>
        {actions}
      </div>
      {groupsFull && (
        <p className="text-xs text-gray-500 dark:text-gray-400">ครบ {COMPARISON_LIMITS.groups} กลุ่มแล้ว</p>
      )}

      {error && (
        <p role="alert" className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50">
          {error}
        </p>
      )}

      {preview && (
        <AdminModal title={`ตัวอย่างตารางเปรียบเทียบ ${venue.name}`} onClose={() => setPreview(false)} size="5xl">
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            แสดงตามที่แก้อยู่ (ยังไม่บันทึกก็ดูได้) เฉพาะแพ็กเกจที่แสดงบนหน้า Upgrade
          </p>
          {visiblePlans.length === 0 || comparison.groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลให้แสดง</p>
          ) : (
            <div data-testid="comparison-preview">
              <ComparisonTable comparison={comparison} plans={visiblePlans} venueName={venue.name} />
            </div>
          )}
        </AdminModal>
      )}
    </div>
  );
}
