'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ListChecks, Loader2, Pencil, Plus, RotateCcw, Search, Tag } from 'lucide-react';
import { toast } from 'react-toastify';
import ToggleSwitch from '@/components/admin/ToggleSwitch';
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_PRIMARY_BUTTON, AdminPagination } from '@/components/admin/unlock-codes/shared';
import {
  getProDiscountCodes,
  updateProDiscountCode,
  type ProAdminVenue,
  type ProDiscountCode,
  type ProDiscountCodePage,
} from '@/lib/api/pro';
import { proErrorMessage } from '@/lib/pro';
import {
  DISCOUNT_STATE_CLASSES,
  DISCOUNT_STATE_LABELS,
  DISCOUNT_TYPE_LABELS,
  discountCodeState,
  discountScopeLabel,
  formatDiscountPeriod,
  formatDiscountUsage,
  formatDiscountValue,
} from '@/lib/pro-discounts';
import { confirmDanger } from './confirm';
import DiscountCodeFormModal from './DiscountCodeFormModal';
import DiscountRedemptionsModal from './DiscountRedemptionsModal';

const LIMIT = 20;
const SELECT = `${ADMIN_INPUT} dark:[color-scheme:dark]`;
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';
const ROW_BUTTON =
  'inline-flex items-center gap-1 min-h-11 px-2.5 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap';

type ActiveFilter = '' | 'true' | 'false';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** แท็บ "โค้ดส่วนลด" (task 19): รายการ + ตัวกรอง, สร้าง/แก้, เปิด/ปิด, ดูรายการที่ใช้ */
export default function DiscountCodesTab({ venues }: { venues: ProAdminVenue[] }) {
  const [active, setActive] = useState<ActiveFilter>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = `${active}|${search}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: ProDiscountCodePage | null } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;

  const [editing, setEditing] = useState<ProDiscountCode | 'new' | null>(null);
  const [viewing, setViewing] = useState<ProDiscountCode | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // ค้นหาแบบ debounce → กลับหน้า 1
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    getProDiscountCodes(
      {
        page,
        limit: LIMIT,
        search: search || undefined,
        isActive: active === '' ? undefined : active === 'true',
      },
      controller.signal,
    )
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load discount codes:', err);
        setResult({ key: requestKey, data: null });
      });
    return () => controller.abort();
  }, [requestKey, page, search, active]);

  function replaceItem(updated: ProDiscountCode) {
    setResult((prev) =>
      prev?.data
        ? { ...prev, data: { ...prev.data, items: prev.data.items.map((c) => (c.id === updated.id ? updated : c)) } }
        : prev,
    );
  }

  async function handleToggle(code: ProDiscountCode, next: boolean) {
    if (
      !next &&
      !(await confirmDanger('ปิดโค้ดส่วนลดนี้?', `${code.code} — ผู้ใช้จะใช้โค้ดนี้ตอนชำระเงินไม่ได้ทันที`, 'ปิดโค้ด'))
    ) {
      return;
    }
    setToggling(code.id);
    try {
      replaceItem(await updateProDiscountCode(code.id, { isActive: next }));
      toast.success(next ? `เปิดโค้ด ${code.code} แล้ว` : `ปิดโค้ด ${code.code} แล้ว`);
    } catch (err) {
      toast.error(proErrorMessage(err, 'เปลี่ยนสถานะโค้ดไม่สำเร็จ'));
    } finally {
      setToggling(null);
    }
  }

  function handleSaved(code: ProDiscountCode, created: boolean) {
    setEditing(null);
    if (created) {
      toast.success(`สร้างโค้ด ${code.code} แล้ว`);
      // โหลดหน้าแรกใหม่ให้เห็นโค้ดที่เพิ่งสร้าง (ลำดับตาม API)
      setPage(1);
      setReloadKey((k) => k + 1);
    } else {
      toast.success(`บันทึกโค้ด ${code.code} แล้ว`);
      replaceItem(code);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const filtered = !!(active || search);

  return (
    <div className="space-y-4">
      <div className={`${ADMIN_CARD} p-4`}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <div>
            <label htmlFor="discount-filter-active" className={LABEL}>
              สถานะ
            </label>
            <select
              id="discount-filter-active"
              value={active}
              onChange={(e) => {
                setActive(e.target.value as ActiveFilter);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทั้งหมด</option>
              <option value="true">เปิดอยู่</option>
              <option value="false">ปิดอยู่</option>
            </select>
          </div>
          <div>
            <label htmlFor="discount-search" className={LABEL}>
              ค้นหา
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <input
                id="discount-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="โค้ดหรือคำอธิบาย..."
                className={`${ADMIN_INPUT} pl-9`}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            {data ? `ทั้งหมด ${data.total.toLocaleString('th-TH')} โค้ด` : ''}
          </p>
          <button type="button" onClick={() => setEditing('new')} className={ADMIN_PRIMARY_BUTTON}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            สร้างโค้ดส่วนลด
          </button>
        </div>
      </div>

      <div className={`${ADMIN_CARD} overflow-hidden`}>
        {loading ? (
          <div className="p-8 text-center" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
          </div>
        ) : !data ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400">โหลดโค้ดส่วนลดไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-10 text-center">
            <Tag className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              {filtered ? 'ไม่พบโค้ดตามตัวกรอง' : 'ยังไม่มีโค้ดส่วนลด'}
            </p>
          </div>
        ) : (
          <>
            {/* จอแคบ: ตาราง scroll แนวนอนในกรอบนี้ ไม่ดันทั้งหน้า — 1280px (เนื้อหา ~950px) พอดีไม่ต้อง scroll
                คอลัมน์จัดการติดขวา (sticky) จึงเห็นปุ่มแก้ไข/รายการที่ใช้เสมอแม้ต้อง scroll */}
            <div className="relative overflow-x-auto" data-testid="discounts-scroll">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['โค้ด', 'ส่วนลด', 'ขอบเขต', 'ช่วงเวลา', 'ใช้แล้ว / สูงสุด', 'สถานะ'].map((h) => (
                      <th key={h} scope="col" className="text-left px-3 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="sticky right-0 z-10 px-3 py-3 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
                    >
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.items.map((c) => {
                    const state = discountCodeState(c);
                    return (
                      <tr key={c.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-3 max-w-[12rem]">
                          <span className="block font-mono font-semibold text-gray-900 dark:text-gray-100 break-all">{c.code}</span>
                          {c.description && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">{c.description}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="block font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                            {formatDiscountValue(c.discountType, c.discountValue)}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{DISCOUNT_TYPE_LABELS[c.discountType]}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300 max-w-[10rem] break-words">
                          {discountScopeLabel(c, venues)}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[11rem]">
                          {formatDiscountPeriod(c.startsAt, c.endsAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 tabular-nums" data-testid="discount-usage">
                          {formatDiscountUsage(c.redeemedCount, c.reservedCount, c.maxRedemptions)}
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            บัญชีละ {c.perUserLimit.toLocaleString('th-TH')} ครั้ง
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`mt-1.5 inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${DISCOUNT_STATE_CLASSES[state]}`}>
                            {DISCOUNT_STATE_LABELS[state]}
                          </span>
                          <div>
                            <ToggleSwitch
                              checked={c.isActive}
                              onChange={(next) => handleToggle(c, next)}
                              loading={toggling === c.id}
                              label={`เปิดใช้งานโค้ด ${c.code}`}
                            />
                          </div>
                        </td>
                        <td
                          className="sticky right-0 px-2 py-1.5 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
                          data-testid="discount-actions"
                        >
                          <div className="flex flex-col items-start">
                            <button type="button" onClick={() => setEditing(c)} className={ROW_BUTTON} aria-label={`แก้โค้ด ${c.code}`}>
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewing(c)}
                              className={ROW_BUTTON}
                              aria-label={`ดูรายการที่ใช้โค้ด ${c.code}`}
                            >
                              <ListChecks className="w-4 h-4" aria-hidden="true" />
                              รายการที่ใช้
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPagination page={page} totalPages={totalPages} total={data.total} unit="โค้ด" onPage={setPage} />
          </>
        )}
      </div>

      {editing && (
        <DiscountCodeFormModal
          venues={venues}
          code={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
      {viewing && <DiscountRedemptionsModal code={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
