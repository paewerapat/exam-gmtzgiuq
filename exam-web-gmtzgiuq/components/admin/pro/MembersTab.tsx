'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw, Search, UserPlus, UserX, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_PRIMARY_BUTTON, AdminPagination } from '@/components/admin/unlock-codes/shared';
import {
  getProSubscriptions,
  revokeProSubscription,
  type ProAdminSubscription,
  type ProAdminVenue,
  type ProSubscriptionPage,
} from '@/lib/api/pro';
import {
  DELETED_USER_LABEL,
  displayUserName,
  proErrorMessage,
  effectiveSubscriptionStatus,
  SUBSCRIPTION_STATUS_CLASSES,
  subscriptionSourceLabel,
  subscriptionStatusLabel,
} from '@/lib/pro';
import { formatThaiDate } from '@/lib/unlock-codes';
import { confirmRevoke } from './confirm';
import GrantModal from './GrantModal';

const LIMIT = 20;
type StatusFilter = '' | 'active' | 'expired' | 'revoked';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const SELECT = `${ADMIN_INPUT} dark:[color-scheme:dark]`;

/** แท็บ "สมาชิก": ตาราง + ตัวกรอง (สนาม แพ็กเกจ สถานะ ค้นหา) + ให้สิทธิ์ + ถอนสิทธิ์ (ยืนยันก่อน) */
export default function MembersTab({ venues }: { venues: ProAdminVenue[] }) {
  const [venueId, setVenueId] = useState('');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const requestKey = `${venueId}|${planId}|${status}|${search}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: ProSubscriptionPage | null } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;

  const planOptions = (venueId ? venues.filter((v) => v.id === venueId) : venues).flatMap((v) =>
    v.plans.map((p) => ({ id: p.id, label: venueId ? p.name : `${v.name} · ${p.name}` })),
  );

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
    getProSubscriptions(
      {
        page,
        limit: LIMIT,
        venueId: venueId || undefined,
        planId: planId || undefined,
        status: status || undefined,
        search: search || undefined,
      },
      controller.signal,
    )
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load subscriptions:', err);
        setResult({ key: requestKey, data: null });
      });
    return () => controller.abort();
  }, [requestKey, page, venueId, planId, status, search]);

  async function handleRevoke(sub: ProAdminSubscription) {
    const who = sub.user?.email || displayUserName(sub.user);
    const what = [sub.venue?.name, sub.plan?.name].filter(Boolean).join(' · ');
    const answer = await confirmRevoke(`${who}${what ? ` — ${what}` : ''} จะใช้สิทธิ์นี้ไม่ได้ทันที`);
    if (!answer) return;
    setRevoking(sub.id);
    try {
      await revokeProSubscription(sub.id, answer.note);
      toast.success('ถอนสิทธิ์แล้ว');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(proErrorMessage(err, 'ถอนสิทธิ์ไม่สำเร็จ'));
    } finally {
      setRevoking(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const filtered = !!(venueId || planId || status || search);

  return (
    <div className="space-y-4">
      <div className={`${ADMIN_CARD} p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
          <div>
            <label htmlFor="member-venue" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              สนาม
            </label>
            <select
              id="member-venue"
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setPlanId('');
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
            <label htmlFor="member-plan" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              แพ็กเกจ
            </label>
            <select
              id="member-plan"
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทุกแพ็กเกจ</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="member-status" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              สถานะ
            </label>
            <select
              id="member-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">ทุกสถานะ</option>
              <option value="active">ใช้งานอยู่</option>
              <option value="expired">หมดอายุ</option>
              <option value="revoked">ถอนสิทธิ์แล้ว</option>
            </select>
          </div>
          <div>
            <label htmlFor="member-search" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              ค้นหา
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="member-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="อีเมลหรือชื่อ..."
                className={`${ADMIN_INPUT} pl-9`}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            {data ? `ทั้งหมด ${data.total.toLocaleString('th-TH')} รายการ` : ''}
          </p>
          <button type="button" onClick={() => setGranting(true)} className={ADMIN_PRIMARY_BUTTON}>
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            ให้สิทธิ์
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
            <p className="text-gray-600 dark:text-gray-400">โหลดรายชื่อสมาชิกไม่สำเร็จ</p>
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
            <Users className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              {filtered ? 'ไม่พบสมาชิกตามตัวกรอง' : 'ยังไม่มีสมาชิก'}
            </p>
          </div>
        ) : (
          <>
            {/* จอแคบ: ตาราง scroll แนวนอนในกรอบนี้ ไม่ดันทั้งหน้า — relative: ให้ sr-only (absolute) อยู่ในกรอบ scroll ไม่หลุดไปขยายหน้า */}
            <div className="relative overflow-x-auto" data-testid="members-scroll">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['ผู้สมัคร', 'สนาม', 'แพ็กเกจ', 'สถานะ', 'เริ่ม – หมดอายุ', 'ที่มา / ต่ออายุ', 'หมายเหตุ', ''].map((h, i) => (
                      <th key={h || i} scope="col" className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {h || <span className="sr-only">จัดการ</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.items.map((sub) => {
                    const st = effectiveSubscriptionStatus(sub);
                    return (
                      <tr key={sub.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 max-w-[16rem]">
                          {sub.user ? (
                            <>
                              <span className="block font-medium text-gray-900 dark:text-gray-100 break-words">{displayUserName(sub.user)}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400 break-all">{sub.user.email}</span>
                            </>
                          ) : (
                            <span className="block italic text-gray-500 dark:text-gray-400">{DELETED_USER_LABEL}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{sub.venue?.name ?? '-'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{sub.plan?.name ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              SUBSCRIPTION_STATUS_CLASSES[st] ?? SUBSCRIPTION_STATUS_CLASSES.revoked
                            }`}
                          >
                            {subscriptionStatusLabel(st)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {formatThaiDate(sub.currentPeriodStart) ?? '-'}
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            ถึง {formatThaiDate(sub.currentPeriodEnd) ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {subscriptionSourceLabel(sub.source)}
                          {(sub.source === 'card' || sub.source === 'promptpay') && (
                            <span
                              className={`block text-xs ${
                                sub.autoRenew ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {sub.autoRenew ? 'ต่ออายุอัตโนมัติ' : 'ไม่ต่ออายุอัตโนมัติ'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[14rem] text-xs text-gray-600 dark:text-gray-400 break-words">{sub.note ?? '-'}</td>
                        <td className="px-4 py-2">
                          {st === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(sub)}
                              disabled={revoking === sub.id}
                              className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/30 transition disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                              {revoking === sub.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              ถอนสิทธิ์
                              <span className="sr-only">{sub.user?.email ?? DELETED_USER_LABEL}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPagination page={page} totalPages={totalPages} total={data.total} unit="รายการ" onPage={setPage} />
          </>
        )}
      </div>

      {granting && (
        <GrantModal
          venues={venues}
          onClose={() => setGranting(false)}
          onGranted={(sub) => {
            setGranting(false);
            const what = [sub.venue?.name, sub.plan?.name].filter(Boolean).join(' · ');
            toast.success(`ให้สิทธิ์${what ? ` ${what}` : ''} แล้ว`);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
