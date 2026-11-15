'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getAdminPredictedSeries, type AdminPredictedSeries } from '@/lib/api/predicted';
import { getProAdminConfig, type ProAdminVenue } from '@/lib/api/pro';
import { predictedErrorMessage } from '@/lib/predicted';
import DeleteSeriesModal from './DeleteSeriesModal';

const LIST_HREF = '/admin/predicted';

/** เรียงตามลำดับสนาม → sortOrder → ชื่อ (ตรงกับหน้าเว็บผู้ใช้) */
export function sortSeries(items: AdminPredictedSeries[], venues: ProAdminVenue[]): AdminPredictedSeries[] {
  const venueRank = new Map(venues.map((v, i) => [v.id, i]));
  return [...items].sort(
    (a, b) =>
      (venueRank.get(a.venueId) ?? Number.MAX_SAFE_INTEGER) - (venueRank.get(b.venueId) ?? Number.MAX_SAFE_INTEGER) ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title, 'th'),
  );
}

/** /admin/predicted — รายการซีรีส์ Predicted Exam กรองตามสนาม (layout แอดมินตรวจ role แล้ว — SEC-8) */
export default function PredictedSeriesList() {
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{
    key: number;
    series: AdminPredictedSeries[] | null;
    venues: ProAdminVenue[];
    error: string | null;
  } | null>(null);
  const [venueFilter, setVenueFilter] = useState('');
  const [deleting, setDeleting] = useState<AdminPredictedSeries | null>(null);
  const loading = result?.key !== reloadKey;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getAdminPredictedSeries(controller.signal),
      // ชื่อสนามสำหรับแท็บกรอง — โหลดไม่ได้ยังแสดงรายการได้ (ใช้ชื่อสนามจากซีรีส์)
      getProAdminConfig(controller.signal).then((c) => c.venues).catch(() => [] as ProAdminVenue[]),
    ])
      .then(([series, venues]) => {
        if (!controller.signal.aborted) setResult({ key: reloadKey, series, venues, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('Failed to load predicted series:', err);
        setResult({
          key: reloadKey,
          series: null,
          venues: [],
          error: predictedErrorMessage(err, 'โหลดรายการซีรีส์ไม่สำเร็จ'),
        });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const venues = result?.venues ?? [];
  const allSeries = !loading && result?.series ? sortSeries(result.series, venues) : null;
  // แท็บกรอง: สนามจาก config + สนามที่มีในซีรีส์แต่ config ไม่มี
  const tabs: { id: string; name: string }[] = venues.map((v) => ({ id: v.id, name: v.name }));
  for (const s of allSeries ?? []) {
    if (s.venueId && !tabs.some((t) => t.id === s.venueId)) {
      tabs.push({ id: s.venueId, name: s.venueName ?? s.venueKey ?? 'สนามอื่น' });
    }
  }
  const venueName = (s: AdminPredictedSeries) =>
    venues.find((v) => v.id === s.venueId)?.name ?? s.venueName ?? s.venueKey ?? '-';
  const shown = allSeries?.filter((s) => !venueFilter || s.venueId === venueFilter) ?? null;
  const newHref = venueFilter ? `${LIST_HREF}/new?venueId=${encodeURIComponent(venueFilter)}` : `${LIST_HREF}/new`;

  return (
    <div className="max-w-7xl mx-auto">
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              Predicted Exam
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              จัดซีรีส์และชุดในซีรีส์ พร้อมสิทธิ์ต่อชุด (ฟรี/Pro) และจำนวนข้อ Preview — ชุดที่อยู่ในซีรีส์จะไม่แสดงในรายการชุดข้อสอบอื่น
            </p>
          </div>
          <Link
            href={newHref}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            สร้างซีรีส์
          </Link>
        </div>

        {tabs.length > 0 && (
          <div role="group" aria-label="กรองตามสนามสอบ" className="flex gap-2 overflow-x-auto pb-2 mb-4 sm:flex-wrap">
            {[{ id: '', name: 'ทุกสนาม' }, ...tabs].map((t) => {
              const active = venueFilter === t.id;
              return (
                <button
                  key={t.id || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setVenueFilter(t.id)}
                  className={`flex-shrink-0 min-h-10 px-4 rounded-lg text-sm font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
            </div>
          ) : !shown ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400">{result?.error ?? 'โหลดรายการซีรีส์ไม่สำเร็จ'}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            </div>
          ) : shown.length === 0 ? (
            <div className="p-10 text-center">
              <Sparkles className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {venueFilter ? 'ยังไม่มีซีรีส์ในสนามนี้' : 'ยังไม่มีซีรีส์'}
              </p>
              <Link
                href={newHref}
                className="mt-3 inline-flex items-center gap-1 min-h-11 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                สร้างซีรีส์
              </Link>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              {/* relative: sr-only ในหัวตาราง (absolute) ไม่ดันหน้าให้ล้นบนจอแคบ */}
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['ซีรีส์', 'สนาม', 'วิชา', 'ชุด', 'ลำดับ', 'สถานะ', ''].map((h, i) => (
                      <th
                        key={h || `col-${i}`}
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
                      >
                        {h || <span className="sr-only">จัดการ</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {shown.map((s) => {
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                        <td className="px-4 py-3 min-w-[14rem] max-w-[22rem]">
                          <div className="flex items-start gap-2">
                            <span
                              aria-hidden="true"
                              className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 bg-indigo-600 dark:bg-indigo-400"
                              style={s.color ? { backgroundColor: s.color } : undefined}
                            />
                            <div className="min-w-0">
                              <Link
                                href={`${LIST_HREF}/${encodeURIComponent(s.id)}`}
                                className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline underline-offset-2 break-words"
                              >
                                {s.title || '(ไม่มีชื่อ)'}
                              </Link>
                              {s.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{s.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{venueName(s)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.subjectName ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {s.setCount.toLocaleString('th-TH')} ชุด
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 tabular-nums">{s.sortOrder}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              s.isActive
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {s.isActive ? 'แสดงอยู่' : 'ปิดอยู่'}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap text-right">
                          <Link
                            href={`${LIST_HREF}/${encodeURIComponent(s.id)}`}
                            aria-label={`แก้ไข ${s.title}`}
                            className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleting(s)}
                            aria-label={`ลบ ${s.title}`}
                            className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FadeIn>

      {deleting && (
        <DeleteSeriesModal
          series={{ id: deleting.id, title: deleting.title, setCount: deleting.setCount }}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
