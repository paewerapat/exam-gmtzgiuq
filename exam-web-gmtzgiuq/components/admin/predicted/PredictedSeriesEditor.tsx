'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getAdminPredictedSeriesById, type AdminPredictedSeries } from '@/lib/api/predicted';
import { getProAdminConfig, type ProAdminVenue } from '@/lib/api/pro';
import { getAdminCurriculumTree, type Subject } from '@/lib/api/curriculum';
import { predictedErrorMessage } from '@/lib/predicted';
import PredictedSeriesForm from './PredictedSeriesForm';
import DeleteSeriesModal from './DeleteSeriesModal';

const LIST_HREF = '/admin/predicted';

interface Loaded {
  venues: ProAdminVenue[];
  subjects: Subject[];
  series: AdminPredictedSeries | null;
}

/** หน้าสร้าง (id ไม่มี) / แก้ไขซีรีส์ — โหลดสนาม วิชา และซีรีส์ แล้วแสดงฟอร์ม (task 22) */
export default function PredictedSeriesEditor({ id }: { id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultVenueId = searchParams?.get('venueId') ?? '';
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ key: number; data: Loaded | null; error: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loading = state?.key !== reloadKey;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getProAdminConfig(controller.signal),
      // วิชา (ผูกสนามด้วย venueId) — โหลดไม่ได้ยังสร้างซีรีส์แบบไม่ระบุวิชาได้
      getAdminCurriculumTree().catch(() => [] as Subject[]),
      id ? getAdminPredictedSeriesById(id, controller.signal) : Promise.resolve(null),
    ])
      .then(([config, subjects, series]) => {
        if (controller.signal.aborted) return;
        setState({ key: reloadKey, data: { venues: config.venues, subjects, series }, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('Failed to load predicted series form:', err);
        setState({ key: reloadKey, data: null, error: predictedErrorMessage(err, 'โหลดข้อมูลซีรีส์ไม่สำเร็จ') });
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  const data = loading ? null : state.data;
  const title = id ? 'แก้ไขซีรีส์' : 'สร้างซีรีส์';

  return (
    <div className="max-w-5xl mx-auto">
      <FadeIn>
        <Link
          href={LIST_HREF}
          className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          กลับรายการซีรีส์
        </Link>
        <div className="mb-6 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0" aria-hidden="true" />
            {title}
          </h1>
          {data?.series?.title && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-words">{data.series.title}</p>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
          </div>
        ) : !data ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-300 dark:text-red-700 mx-auto mb-2" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-400">{state?.error ?? 'โหลดข้อมูลซีรีส์ไม่สำเร็จ'}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : (
          <PredictedSeriesForm
            key={data.series?.id ?? 'new'}
            series={data.series}
            venues={data.venues}
            subjects={data.subjects}
            defaultVenueId={defaultVenueId}
            onSaved={(saved) => {
              if (!id && saved?.id) router.replace(`${LIST_HREF}/${encodeURIComponent(saved.id)}`);
              else if (!id) router.push(LIST_HREF);
              else setReloadKey((k) => k + 1);
            }}
            onCancel={() => router.push(LIST_HREF)}
            onDelete={data.series ? () => setDeleting(true) : undefined}
          />
        )}
      </FadeIn>

      {deleting && data?.series && (
        <DeleteSeriesModal
          series={{ id: data.series.id, title: data.series.title, setCount: data.series.sets.length }}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push(LIST_HREF)}
        />
      )}
    </div>
  );
}
