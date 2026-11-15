'use client';

import { Suspense, use } from 'react';
import { Loader2 } from 'lucide-react';
import PredictedSeriesEditor from '@/components/admin/predicted/PredictedSeriesEditor';

/** /admin/predicted/[id] — แก้ไขซีรีส์ (layout แอดมินตรวจ role แล้ว — SEC-8) */
export default function EditPredictedSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
        </div>
      }
    >
      {/* key: เปลี่ยนซีรีส์แล้วเริ่ม state ใหม่ทั้งหมด */}
      <PredictedSeriesEditor key={id} id={id} />
    </Suspense>
  );
}
