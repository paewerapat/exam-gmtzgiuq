'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Receipt, RotateCcw } from 'lucide-react';
import { ADMIN_SECONDARY_BUTTON, AdminPagination } from '@/components/admin/unlock-codes/shared';
import { getProDiscountRedemptions, type ProDiscountCode, type ProDiscountRedemptionPage } from '@/lib/api/pro';
import { DELETED_USER_LABEL, displayUserName, formatSatang } from '@/lib/pro';
import { redemptionStatusClass, redemptionStatusLabel } from '@/lib/pro-discounts';
import { formatReleaseDate } from '@/lib/release-date';
import AdminModal from './AdminModal';

const LIMIT = 20;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** รายการที่ใช้โค้ดส่วนลด (task 19): ผู้ใช้ payment ยอดลด สถานะ (รอชำระ/ใช้แล้ว/คืนสิทธิ์) วันที่ */
export default function DiscountRedemptionsModal({ code, onClose }: { code: ProDiscountCode; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${code.id}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: ProDiscountRedemptionPage | null } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;

  useEffect(() => {
    const controller = new AbortController();
    getProDiscountRedemptions(code.id, { page, limit: LIMIT }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load discount redemptions:', err);
        setResult({ key: requestKey, data: null });
      });
    return () => controller.abort();
  }, [code.id, page, requestKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <AdminModal
      title={`รายการที่ใช้โค้ด ${code.code}`}
      onClose={onClose}
      size="5xl"
      footer={
        <button type="button" onClick={onClose} className={ADMIN_SECONDARY_BUTTON}>
          ปิด
        </button>
      }
    >
      {loading ? (
        <div className="p-8 text-center" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
        </div>
      ) : !data ? (
        <div className="p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400">โหลดรายการที่ใช้โค้ดไม่สำเร็จ</p>
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
          <Receipt className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">ยังไม่มีการใช้โค้ดนี้</p>
        </div>
      ) : (
        <div className="-mx-4 sm:-mx-6">
          <div className="relative overflow-x-auto" data-testid="redemptions-scroll">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700">
                <tr>
                  {['วันที่', 'ผู้ใช้', 'ยอดที่ลด', 'สถานะ', 'รหัส payment'].map((h) => (
                    <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((r) => (
                  <tr key={`${r.paymentId}-${r.createdAt}`} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{formatReleaseDate(r.createdAt)}</td>
                    <td className="px-4 py-3 max-w-[16rem]">
                      {r.user ? (
                        <>
                          <span className="block font-medium text-gray-900 dark:text-gray-100 break-words">{displayUserName(r.user)}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 break-all">{r.user.email}</span>
                        </>
                      ) : (
                        <span className="block italic text-gray-500 dark:text-gray-400">{DELETED_USER_LABEL}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                      −{formatSatang(r.amountSatang)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${redemptionStatusClass(r.status)}`}>
                        {redemptionStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 break-all max-w-[16rem]">{r.paymentId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page} totalPages={totalPages} total={data.total} unit="รายการ" onPage={setPage} />
        </div>
      )}
    </AdminModal>
  );
}
