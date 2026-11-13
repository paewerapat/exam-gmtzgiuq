'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, KeyRound, Loader2, Plus, RotateCcw, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import ToggleSwitch from '@/components/admin/ToggleSwitch';
import {
  AdminPagination,
  BatchExamsSummary,
  BatchKindBadge,
  CodeExpiry,
  confirmDisableBatch,
  UsageBar,
} from '@/components/admin/unlock-codes/shared';
import { getUnlockBatches, updateUnlockBatch, type Paginated, type UnlockBatch } from '@/lib/api/unlockCodes';
import { formatReleaseDate } from '@/lib/release-date';

const LIMIT = 20;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** /admin/unlock-codes — รายการแคมเปญโค้ด Unlock (layout แอดมินตรวจ role แล้ว — SEC-8) */
export default function AdminUnlockCodesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${search}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    data: Paginated<UnlockBatch> | null;
    error: boolean;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;
  const error = !loading && result.error;
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
    getUnlockBatches({ page, limit: LIMIT, search: search || undefined }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load unlock batches:', err);
        setResult({ key: requestKey, data: null, error: true });
      });
    return () => controller.abort();
  }, [page, search, requestKey]);

  async function handleToggle(batch: UnlockBatch, next: boolean) {
    if (!next && !(await confirmDisableBatch(batch.name))) return;
    setToggling(batch.id);
    try {
      const updated = await updateUnlockBatch(batch.id, { isActive: next });
      setResult((prev) =>
        prev?.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                items: prev.data.items.map((b) => (b.id === batch.id ? { ...b, isActive: updated.isActive } : b)),
              },
            }
          : prev,
      );
      toast.success(next ? 'เปิดแคมเปญแล้ว' : 'ปิดแคมเปญแล้ว โค้ดของแคมเปญนี้กรอกไม่ได้ทันที');
    } catch (err) {
      console.error('Failed to toggle batch:', err);
      toast.error('เปลี่ยนสถานะแคมเปญไม่สำเร็จ');
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              โค้ด Unlock
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              สร้างโค้ดเป็นแคมเปญ ผู้ใช้กรอกโค้ดในหน้ารายละเอียดชุด Mock Exam เพื่อ Unlock หรือกรอกในหน้า Upgrade
              เพื่อรับแพ็กเกจ Pro
            </p>
          </div>
          <Link
            href="/admin/unlock-codes/new"
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            สร้างโค้ด
          </Link>
        </div>

        <div className="mb-4 relative">
          <label htmlFor="unlock-batch-search" className="sr-only">
            ค้นหาแคมเปญ
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
          <input
            id="unlock-batch-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อแคมเปญ..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400">โหลดรายการแคมเปญไม่สำเร็จ</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-10 text-center">
              <KeyRound className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {search ? 'ไม่พบแคมเปญที่ค้นหา' : 'ยังไม่มีแคมเปญโค้ด'}
              </p>
              {!search && (
                <Link
                  href="/admin/unlock-codes/new"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  สร้างแคมเปญแรก
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* จอแคบ: ตาราง scroll แนวนอนในกรอบนี้ ไม่ดันทั้งหน้า */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {['ชื่อแคมเปญ', 'ประเภท / สิ่งที่ได้', 'ใช้แล้ว / ทั้งหมด', 'อายุสิทธิ์', 'โค้ดหมดอายุ', 'สถานะ'].map(
                        (h) => (
                          <th
                            key={h}
                            scope="col"
                            className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.items.map((batch) => (
                      <tr key={batch.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                        <td className="px-4 py-3 min-w-[12rem] max-w-[16rem]">
                          <Link
                            href={`/admin/unlock-codes/${batch.id}`}
                            className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline underline-offset-2 break-words"
                          >
                            {batch.name}
                          </Link>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            สร้าง {formatReleaseDate(batch.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3 max-w-[16rem]">
                          <BatchKindBadge kind={batch.kind} />
                          <div className="mt-1.5">
                            <BatchExamsSummary batch={batch} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <UsageBar used={batch.usedCount} total={batch.codeCount} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {batch.accessDays.toLocaleString('th-TH')} วัน
                        </td>
                        <td className="px-4 py-3">
                          <CodeExpiry value={batch.codeExpiresAt} />
                        </td>
                        <td className="px-4 py-1.5">
                          <ToggleSwitch
                            checked={batch.isActive}
                            onChange={(next) => handleToggle(batch, next)}
                            loading={toggling === batch.id}
                            label={`เปิดใช้งานแคมเปญ ${batch.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                unit="แคมเปญ"
                onPage={setPage}
              />
            </>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
