'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, Crown, Loader2, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import ComparisonEditor from '@/components/admin/pro/ComparisonEditor';
import MembersTab from '@/components/admin/pro/MembersTab';
import PageTextTab from '@/components/admin/pro/PageTextTab';
import VenuesPlansTab, { type VenuesUpdater } from '@/components/admin/pro/VenuesPlansTab';
import { confirmDanger } from '@/components/admin/pro/confirm';
import { getProAdminConfig, type ProAdminConfig } from '@/lib/api/pro';

const TABS = [
  { id: 'page', label: 'หน้า Upgrade' },
  { id: 'venues', label: 'สนามและแพ็กเกจ' },
  { id: 'comparison', label: 'ตารางเปรียบเทียบ' },
  { id: 'members', label: 'สมาชิก' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** /admin/pro — สมาชิก Pro (task 17) layout แอดมินตรวจ role แล้ว (SEC-8) API ตรวจ Jwt+Admin ซ้ำ */
export default function AdminProPage() {
  const [tab, setTab] = useState<TabId>('page');
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: number; config: ProAdminConfig | null } | null>(null);
  const loading = result?.key !== reloadKey;
  const config = loading ? null : result.config;
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [comparisonDirty, setComparisonDirty] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const controller = new AbortController();
    getProAdminConfig(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: reloadKey, config: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load pro config:', err);
        setResult({ key: reloadKey, config: null });
      });
    return () => controller.abort();
  }, [reloadKey]);

  function updateConfig(fn: (c: ProAdminConfig) => ProAdminConfig) {
    setResult((prev) => (prev?.config ? { ...prev, config: fn(prev.config) } : prev));
  }
  const updateVenues = (fn: VenuesUpdater) => updateConfig((c) => ({ ...c, venues: fn(c.venues) }));

  const venues = config?.venues ?? [];
  const venue = venues.find((v) => v.id === selectedVenueId) ?? venues[0] ?? null;

  async function leaveComparisonIfClean(): Promise<boolean> {
    if (!comparisonDirty) return true;
    const ok = await confirmDanger(
      'ทิ้งการแก้ตารางเปรียบเทียบ?',
      'ตารางเปรียบเทียบที่แก้ไว้ยังไม่ได้บันทึก',
      'ทิ้งการแก้',
    );
    if (ok) setComparisonDirty(false);
    return ok;
  }

  async function selectTab(next: TabId) {
    if (next === tab) return;
    if (tab === 'comparison' && !(await leaveComparisonIfClean())) return;
    setTab(next);
  }

  async function selectComparisonVenue(id: string) {
    if (id === venue?.id) return;
    if (!(await leaveComparisonIfClean())) return;
    setSelectedVenueId(id);
  }

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = -1;
    if (e.key === 'ArrowRight') target = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') target = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = TABS.length - 1;
    if (target < 0) return;
    e.preventDefault();
    tabRefs.current[TABS[target].id]?.focus();
    void selectTab(TABS[target].id);
  }

  return (
    <div className="max-w-7xl mx-auto">
      <FadeIn>
        <div className="mb-6 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Crown className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            สมาชิก Pro
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            ข้อความหน้า Upgrade, สนาม, แพ็กเกจ, สิทธิ์จริง, ตารางเปรียบเทียบ และรายชื่อสมาชิก
          </p>
        </div>

        <div
          role="tablist"
          aria-label="ส่วนของสมาชิก Pro"
          className="relative mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700"
        >
          {TABS.map((t, i) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={`pro-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`pro-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`flex-shrink-0 min-h-11 px-4 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                  selected
                    ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`pro-panel-${tab}`} aria-labelledby={`pro-tab-${tab}`} tabIndex={0} className="focus-visible:outline-none">
          {loading && tab !== 'members' ? (
            <div className="p-8 text-center" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
            </div>
          ) : !config && tab !== 'members' ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400">โหลดการตั้งค่าสมาชิก Pro ไม่สำเร็จ</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            </div>
          ) : tab === 'page' && config ? (
            <PageTextTab page={config.page} onSaved={(page) => updateConfig((c) => ({ ...c, page }))} />
          ) : tab === 'venues' && config ? (
            <VenuesPlansTab
              venues={config.venues}
              selectedVenueId={venue?.id ?? null}
              onSelectVenue={setSelectedVenueId}
              onChange={updateVenues}
              onReload={() => setReloadKey((k) => k + 1)}
            />
          ) : tab === 'comparison' && config ? (
            venue ? (
              <div className="space-y-4">
                <div role="group" aria-label="เลือกสนาม" className="flex flex-wrap gap-2">
                  {venues.map((v) => {
                    const selected = v.id === venue.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectComparisonVenue(v.id)}
                        className={`min-h-11 px-4 rounded-full text-sm font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          selected
                            ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {v.name}
                        {!v.isActive && <span className="ml-1 text-xs opacity-80">(ปิดอยู่)</span>}
                      </button>
                    );
                  })}
                </div>
                <ComparisonEditor
                  key={venue.id}
                  venue={venue}
                  onDirtyChange={setComparisonDirty}
                  onSaved={(comparison) =>
                    updateVenues((list) => list.map((v) => (v.id === venue.id ? { ...v, comparison } : v)))
                  }
                />
              </div>
            ) : (
              <p className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                ยังไม่มีสนาม เพิ่มสนามในแท็บ &quot;สนามและแพ็กเกจ&quot; ก่อน
              </p>
            )
          ) : tab === 'members' ? (
            <MembersTab venues={venues} />
          ) : null}
        </div>
      </FadeIn>
    </div>
  );
}
