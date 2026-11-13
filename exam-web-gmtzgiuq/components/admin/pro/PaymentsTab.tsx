'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Receipt, RotateCcw, Search } from 'lucide-react';
import { ADMIN_CARD, ADMIN_INPUT, AdminPagination } from '@/components/admin/unlock-codes/shared';
import {
  getProAdminPayments,
  type ProAdminPaymentPage,
  type ProAdminVenue,
  type ProPaymentMethod,
  type ProPaymentStatusFilter,
} from '@/lib/api/pro';
import { DELETED_USER_LABEL, displayUserName, formatSatang } from '@/lib/pro';
import { paymentMethodLabel, paymentStatusClass, paymentStatusLabel } from '@/lib/pro-payments';
import { formatReleaseDate } from '@/lib/release-date';

const LIMIT = 20;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const SELECT = `${ADMIN_INPUT} dark:[color-scheme:dark]`;
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

/** แท็บ "การชำระเงิน" (task 18): ทุก payment + ตัวกรอง (สถานะ วิธี สนาม ค้นหา) ยอด VAT รหัสอ้างอิงของ Opn */
export default function PaymentsTab({ venues }: { venues: ProAdminVenue[] }) {
  const [status, setStatus] = useState<'' | ProPaymentStatusFilter>('');
  const [method, setMethod] = useState<'' | ProPaymentMethod>('');
  const [venueId, setVenueId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = `${status}|${method}|${venueId}|${search}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: ProAdminPaymentPage | null } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;

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
    getProAdminPayments(
      {
        page,
        limit: LIMIT,
        status: status || undefined,
        method: method || undefined,
        venueId: venueId || undefined,
        search: search || undefined,
      },
      controller.signal,
    )
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load payments:', err);
        setResult({ key: requestKey, data: null });
      });
    return () => controller.abort();
  }, [requestKey, page, status, method, venueId, search]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const filtered = !!(status || method || venueId || search);

  return (
    <div className="space-y-4">
      <div className={`${ADMIN_CARD} p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
          <div>
            <label htmlFor="payment-status" className={LABEL}>
              สถานะ
            </label>
            <select
              id="payment-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | ProPaymentStatusFilter);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทุกสถานะ</option>
              <option value="successful">สำเร็จ</option>
              <option value="pending">รอชำระ</option>
              <option value="failed">ไม่สำเร็จ</option>
              <option value="expired">หมดอายุ</option>
            </select>
          </div>
          <div>
            <label htmlFor="payment-method" className={LABEL}>
              วิธีชำระ
            </label>
            <select
              id="payment-method"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as '' | ProPaymentMethod);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทุกวิธี</option>
              <option value="card">บัตรเครดิต/เดบิต</option>
              <option value="promptpay">PromptPay</option>
            </select>
          </div>
          <div>
            <label htmlFor="payment-venue" className={LABEL}>
              สนาม
            </label>
            <select
              id="payment-venue"
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทุกสนาม</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="payment-search" className={LABEL}>
              ค้นหา
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <input
                id="payment-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="อีเมล ชื่อ หรือรหัสอ้างอิง..."
                className={`${ADMIN_INPUT} pl-9`}
              />
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          {data ? `ทั้งหมด ${data.total.toLocaleString('th-TH')} รายการ` : ''}
        </p>
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
            <p className="text-gray-600 dark:text-gray-400">โหลดรายการชำระเงินไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              {filtered ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีการชำระเงิน'}
            </p>
          </div>
        ) : (
          <>
            {/* จอแคบ: ตาราง scroll แนวนอนในกรอบนี้ ไม่ดันทั้งหน้า */}
            <div className="relative overflow-x-auto" data-testid="payments-scroll">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['วันที่', 'ผู้ชำระ', 'สนาม · แพ็กเกจ', 'วิธีชำระ', 'ยอด', 'สถานะ', 'รหัสอ้างอิง'].map((h) => (
                      <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.items.map((p) => (
                    <tr key={p.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {formatReleaseDate(p.createdAt) || '-'}
                        {p.paidAt && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">ชำระ {formatReleaseDate(p.paidAt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[16rem]">
                        {p.user ? (
                          <>
                            <span className="block font-medium text-gray-900 dark:text-gray-100 break-words">{displayUserName(p.user)}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 break-all">{p.user.email}</span>
                          </>
                        ) : (
                          <span className="block italic text-gray-500 dark:text-gray-400">{DELETED_USER_LABEL}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {p.venue?.name ?? '-'}
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{p.plan?.name ?? '-'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {paymentMethodLabel(p.method)}
                        {p.isRenewal && (
                          <span className="block text-xs text-indigo-700 dark:text-indigo-300">ต่ออายุอัตโนมัติ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                        <span className="block font-semibold text-gray-900 dark:text-gray-100">{formatSatang(p.totalSatang)}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {p.vatSatang > 0 ? `VAT ${formatSatang(p.vatSatang)}` : 'ไม่มี VAT'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[14rem]">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentStatusClass(p.status)}`}>
                          {paymentStatusLabel(p.status)}
                        </span>
                        {p.refundRequired && (
                          <span
                            data-testid="refund-required"
                            className="mt-1 inline-block whitespace-nowrap rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-red-500 dark:text-white"
                          >
                            ต้องคืนเงินใน Opn
                          </span>
                        )}
                        {p.failureMessage && (
                          <span className="block mt-1 text-xs text-red-700 dark:text-red-300 break-words">{p.failureMessage}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 break-all max-w-[14rem]">
                        {p.omiseChargeId ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={page} totalPages={totalPages} total={data.total} unit="รายการ" onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
