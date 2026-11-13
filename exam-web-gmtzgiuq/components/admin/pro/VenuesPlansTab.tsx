'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { ADMIN_CARD, ADMIN_PRIMARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import {
  createProPlan,
  createProVenue,
  deleteProPlan,
  deleteProVenue,
  updateProPlan,
  updateProVenue,
  type ProAdminPlan,
  type ProAdminVenue,
  type ProPlanInput,
  type ProVenueInput,
} from '@/lib/api/pro';
import { formatSatang, moveItem, proErrorMessage } from '@/lib/pro';
import { confirmDanger } from './confirm';
import PlanFormModal from './PlanFormModal';
import VenueFormModal, { type VenueFormValues } from './VenueFormModal';

export type VenuesUpdater = (venues: ProAdminVenue[]) => ProAdminVenue[];

interface VenuesPlansTabProps {
  venues: ProAdminVenue[];
  selectedVenueId: string | null;
  onSelectVenue: (id: string) => void;
  onChange: (updater: VenuesUpdater) => void;
  /** โหลด config ใหม่ทั้งหมด (เรียงลำดับไม่สำเร็จบางรายการ → state ในหน้าอาจไม่ตรงกับ DB) */
  onReload: () => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const ICON_BTN_DANGER =
  'inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500';

export function venueToInput(v: ProAdminVenue): ProVenueInput {
  return { key: v.key, name: v.name, description: v.description, sortOrder: v.sortOrder, isActive: v.isActive };
}

export function planToInput(p: ProAdminPlan): ProPlanInput {
  return {
    code: p.code,
    rank: p.rank,
    name: p.name,
    tagline: p.tagline,
    priceSatang: p.priceSatang,
    priceUnit: p.priceUnit,
    priceNote: p.priceNote,
    periodDays: p.periodDays,
    buttonText: p.buttonText,
    badge: p.badge,
    highlight: p.highlight,
    sortOrder: p.sortOrder,
    isVisible: p.isVisible,
    isPurchasable: p.isPurchasable,
    entitlements: p.entitlements,
  };
}

const errorMessage = proErrorMessage;

/** แท็บ "สนามและแพ็กเกจ": รายการสนาม (เพิ่ม/แก้/ปิด/เรียง/ลบ) → แพ็กเกจของสนามที่เลือก (เพิ่ม/แก้/ซ่อน/เรียง/ลบ) */
export default function VenuesPlansTab({ venues, selectedVenueId, onSelectVenue, onChange, onReload }: VenuesPlansTabProps) {
  const [venueModal, setVenueModal] = useState<{ venue: ProAdminVenue | null } | null>(null);
  const [planModal, setPlanModal] = useState<{ plan: ProAdminPlan | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const venue = venues.find((v) => v.id === selectedVenueId) ?? venues[0] ?? null;

  // ── สนาม ──
  async function saveVenue(values: VenueFormValues) {
    const editing = venueModal?.venue ?? null;
    if (editing) {
      const updated = await updateProVenue(editing.id, { ...venueToInput(editing), ...values });
      // comparison/แพ็กเกจคงของเดิม (ฟอร์มนี้ไม่ได้แก้)
      onChange((list) =>
        list.map((v) =>
          v.id === editing.id
            ? { ...v, key: updated.key || values.key, name: updated.name || values.name, description: values.description, isActive: values.isActive }
            : v,
        ),
      );
      toast.success('บันทึกสนามแล้ว');
    } else {
      const sortOrder = venues.reduce((m, v) => Math.max(m, v.sortOrder + 1), 0);
      const created = await createProVenue({ ...values, sortOrder });
      onChange((list) => [...list, { ...created, plans: [], sortOrder: created.sortOrder || sortOrder }]);
      onSelectVenue(created.id);
      toast.success('เพิ่มสนามแล้ว');
    }
    setVenueModal(null);
  }

  async function toggleVenue(v: ProAdminVenue) {
    setBusy(`venue-active-${v.id}`);
    try {
      await updateProVenue(v.id, { ...venueToInput(v), isActive: !v.isActive });
      onChange((list) => list.map((x) => (x.id === v.id ? { ...x, isActive: !v.isActive } : x)));
      toast.success(v.isActive ? `ปิดสนาม ${v.name} แล้ว (ไม่แสดงบนหน้า Upgrade)` : `เปิดสนาม ${v.name} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err, 'เปลี่ยนสถานะสนามไม่สำเร็จ'));
    } finally {
      setBusy(null);
    }
  }

  async function moveVenue(index: number, dir: -1 | 1) {
    const next = moveItem(venues, index, dir);
    if (next === venues) return;
    setBusy('venue-order');
    // ส่งเฉพาะ sortOrder ของรายการที่เปลี่ยน (DTO รับบางฟิลด์ได้)
    const changes = next.map((v, i) => ({ v, i })).filter(({ v, i }) => v.sortOrder !== i);
    const results = await Promise.allSettled(changes.map(({ v, i }) => updateProVenue(v.id, { sortOrder: i })));
    setBusy(null);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      toast.error(errorMessage(failed.reason, 'เรียงสนามไม่สำเร็จ โหลดข้อมูลล่าสุดใหม่แล้ว'));
      onReload();
      return;
    }
    onChange(() => next.map((v, i) => ({ ...v, sortOrder: i })));
  }

  async function removeVenue(v: ProAdminVenue) {
    const ok = await confirmDanger(
      `ลบสนาม ${v.name}?`,
      'แพ็กเกจและตารางเปรียบเทียบของสนามนี้จะถูกลบด้วย ถ้ามีผู้สมัครอยู่จะลบไม่ได้ (ให้ปิดสนามแทน)',
      'ลบสนาม',
    );
    if (!ok) return;
    setBusy(`venue-del-${v.id}`);
    try {
      await deleteProVenue(v.id);
      onChange((list) => list.filter((x) => x.id !== v.id));
      toast.success(`ลบสนาม ${v.name} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err, 'ลบสนามไม่สำเร็จ'));
    } finally {
      setBusy(null);
    }
  }

  // ── แพ็กเกจ ──
  const plans = venue?.plans ?? [];

  function setPlans(venueId: string, fn: (plans: ProAdminPlan[]) => ProAdminPlan[]) {
    onChange((list) => list.map((v) => (v.id === venueId ? { ...v, plans: fn(v.plans) } : v)));
  }

  async function savePlan(input: ProPlanInput) {
    if (!venue) return;
    const editing = planModal?.plan ?? null;
    if (editing) {
      const updated = await updateProPlan(editing.id, input);
      setPlans(venue.id, (list) =>
        list.map((p) => (p.id === editing.id ? { ...p, ...input, ...(updated.id ? updated : {}), venueId: venue.id } : p)),
      );
      toast.success('บันทึกแพ็กเกจแล้ว');
    } else {
      const created = await createProPlan(venue.id, input);
      setPlans(venue.id, (list) => [...list, { ...created, venueId: venue.id }]);
      toast.success('เพิ่มแพ็กเกจแล้ว');
    }
    setPlanModal(null);
  }

  async function togglePlanVisible(p: ProAdminPlan) {
    if (!venue) return;
    setBusy(`plan-visible-${p.id}`);
    try {
      await updateProPlan(p.id, { ...planToInput(p), isVisible: !p.isVisible });
      setPlans(venue.id, (list) => list.map((x) => (x.id === p.id ? { ...x, isVisible: !p.isVisible } : x)));
      toast.success(p.isVisible ? `ซ่อน ${p.name} แล้ว` : `แสดง ${p.name} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err, 'เปลี่ยนการแสดงผลไม่สำเร็จ'));
    } finally {
      setBusy(null);
    }
  }

  async function movePlan(index: number, dir: -1 | 1) {
    if (!venue) return;
    const next = moveItem(plans, index, dir);
    if (next === plans) return;
    setBusy('plan-order');
    const changes = next.map((p, i) => ({ p, i })).filter(({ p, i }) => p.sortOrder !== i);
    const results = await Promise.allSettled(changes.map(({ p, i }) => updateProPlan(p.id, { sortOrder: i })));
    setBusy(null);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      toast.error(errorMessage(failed.reason, 'เรียงแพ็กเกจไม่สำเร็จ โหลดข้อมูลล่าสุดใหม่แล้ว'));
      onReload();
      return;
    }
    setPlans(venue.id, () => next.map((p, i) => ({ ...p, sortOrder: i })));
  }

  async function removePlan(p: ProAdminPlan) {
    if (!venue) return;
    const ok = await confirmDanger(
      `ลบแพ็กเกจ ${p.name}?`,
      'ถ้ามีผู้สมัครแพ็กเกจนี้อยู่จะลบไม่ได้ (ให้ซ่อนแทน) ช่องในตารางเปรียบเทียบของแพ็กเกจนี้จะไม่แสดงอีก',
      'ลบแพ็กเกจ',
    );
    if (!ok) return;
    setBusy(`plan-del-${p.id}`);
    try {
      await deleteProPlan(p.id);
      setPlans(venue.id, (list) => list.filter((x) => x.id !== p.id));
      toast.success(`ลบแพ็กเกจ ${p.name} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err, 'ลบแพ็กเกจไม่สำเร็จ'));
    } finally {
      setBusy(null);
    }
  }

  const reordering = busy === 'venue-order' || busy === 'plan-order';

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      {/* สนาม */}
      <section aria-labelledby="pro-venues-heading" className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="pro-venues-heading" className="font-semibold text-gray-900 dark:text-gray-100">
            สนาม ({venues.length.toLocaleString('th-TH')})
          </h2>
          <button
            type="button"
            onClick={() => setVenueModal({ venue: null })}
            className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            เพิ่มสนาม
          </button>
        </div>
        {venues.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">ยังไม่มีสนาม</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {venues.map((v, i) => {
              const selected = venue?.id === v.id;
              return (
                <li key={v.id} className={selected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectVenue(v.id)}
                      aria-pressed={selected}
                      className="flex-1 min-w-0 min-h-11 px-2 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`font-medium truncate ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}`}>
                          {v.name}
                        </span>
                        {!v.isActive && (
                          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            ปิดอยู่
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                        {v.key} · {v.plans.length.toLocaleString('th-TH')} แพ็กเกจ
                      </span>
                    </button>
                    <button type="button" onClick={() => moveVenue(i, -1)} disabled={i === 0 || reordering} aria-label={`เลื่อนสนาม ${v.name} ขึ้น`} className={ICON_BTN}>
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => moveVenue(i, 1)} disabled={i === venues.length - 1 || reordering} aria-label={`เลื่อนสนาม ${v.name} ลง`} className={ICON_BTN}>
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 px-4 pb-2">
                    <button
                      type="button"
                      onClick={() => toggleVenue(v)}
                      disabled={busy === `venue-active-${v.id}`}
                      className="inline-flex items-center gap-1 min-h-9 px-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {busy === `venue-active-${v.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : v.isActive ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {v.isActive ? 'ปิดสนาม' : 'เปิดสนาม'}
                      <span className="sr-only">{v.name}</span>
                    </button>
                    <button type="button" onClick={() => setVenueModal({ venue: v })} aria-label={`แก้สนาม ${v.name}`} className={ICON_BTN}>
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeVenue(v)}
                      disabled={busy === `venue-del-${v.id}`}
                      aria-label={`ลบสนาม ${v.name}`}
                      className={ICON_BTN_DANGER}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* แพ็กเกจของสนามที่เลือก */}
      <section aria-labelledby="pro-plans-heading" className={`${ADMIN_CARD} min-w-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="pro-plans-heading" className="font-semibold text-gray-900 dark:text-gray-100 min-w-0 break-words">
            {venue ? `แพ็กเกจของ ${venue.name}` : 'แพ็กเกจ'}
          </h2>
          {venue && (
            <button type="button" onClick={() => setPlanModal({ plan: null })} className={ADMIN_PRIMARY_BUTTON}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              เพิ่มแพ็กเกจ
            </button>
          )}
        </div>
        {!venue ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">เพิ่มสนามก่อน แล้วจึงเพิ่มแพ็กเกจ</p>
        ) : plans.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">สนามนี้ยังไม่มีแพ็กเกจ</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['แพ็กเกจ', 'ระดับ', 'ราคา', 'สิทธิ์จริง', 'สถานะ', 'จัดการ'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {plans.map((p, i) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-900 dark:text-gray-100 break-words">{p.name}</span>
                      <span className="block text-xs font-mono text-gray-500 dark:text-gray-400">{p.code}</span>
                      {p.badge && (
                        <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          {p.badge}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{p.rank}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {formatSatang(p.priceSatang)}
                      {p.priceUnit && <span className="text-xs text-gray-500 dark:text-gray-400"> {p.priceUnit}</span>}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{p.periodDays.toLocaleString('th-TH')} วัน/รอบ</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <EntitlementSummary plan={p} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            p.isVisible
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {p.isVisible ? 'แสดงอยู่' : 'ซ่อนอยู่'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {p.rank === 0 ? 'ฟรี' : p.isPurchasable ? 'เปิดให้ซื้อ' : 'ปิดการซื้อ'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => movePlan(i, -1)} disabled={i === 0 || reordering} aria-label={`เลื่อน ${p.name} ขึ้น`} className={ICON_BTN}>
                          <ArrowUp className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => movePlan(i, 1)} disabled={i === plans.length - 1 || reordering} aria-label={`เลื่อน ${p.name} ลง`} className={ICON_BTN}>
                          <ArrowDown className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePlanVisible(p)}
                          disabled={busy === `plan-visible-${p.id}`}
                          aria-label={p.isVisible ? `ซ่อน ${p.name}` : `แสดง ${p.name}`}
                          className={ICON_BTN}
                        >
                          {p.isVisible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={() => setPlanModal({ plan: p })} aria-label={`แก้ ${p.name}`} className={ICON_BTN}>
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePlan(p)}
                          disabled={busy === `plan-del-${p.id}`}
                          aria-label={`ลบ ${p.name}`}
                          className={ICON_BTN_DANGER}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {venueModal && (
        <VenueFormModal
          venue={venueModal.venue}
          otherKeys={venues.filter((v) => v.id !== venueModal.venue?.id).map((v) => v.key)}
          onClose={() => setVenueModal(null)}
          onSubmit={saveVenue}
        />
      )}
      {planModal && venue && (
        <PlanFormModal
          venueName={venue.name}
          plan={planModal.plan}
          otherCodes={plans.filter((p) => p.id !== planModal.plan?.id).map((p) => p.code)}
          otherFreePlanExists={plans.some((p) => p.id !== planModal.plan?.id && p.rank === 0)}
          nextSortOrder={plans.reduce((m, p) => Math.max(m, p.sortOrder + 1), 0)}
          onClose={() => setPlanModal(null)}
          onSubmit={savePlan}
        />
      )}
    </div>
  );
}

/** สรุปสิทธิ์จริงในตาราง (อ่านอย่างเดียว) */
function EntitlementSummary({ plan }: { plan: ProAdminPlan }) {
  const e = plan.entitlements;
  const on = [
    e.challenge && 'Challenge',
    e.beyond && 'Beyond',
    e.solutions && 'เฉลย',
    e.analytics && 'Analytics',
    e.mockPurchase && 'Mock ซื้อ',
  ].filter(Boolean) as string[];
  return (
    <div className="text-xs text-gray-700 dark:text-gray-300">
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
        Predicted: {e.predictedSets === null ? 'ทุกชุด' : `${e.predictedSets.toLocaleString('th-TH')} ชุด/วิชา`}
      </span>
      <span className="block mt-0.5 text-gray-500 dark:text-gray-400">{on.length > 0 ? on.join(' · ') : 'ไม่มีสิทธิ์เพิ่ม'}</span>
    </div>
  );
}
