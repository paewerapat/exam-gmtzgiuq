'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import PredictedSeriesEditor from '@/components/admin/predicted/PredictedSeriesEditor';

/** /admin/predicted/new (?venueId= เลือกสนามไว้ก่อน) — useSearchParams ต้องอยู่ใต้ Suspense */
export default function NewPredictedSeriesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
        </div>
      }
    >
      <PredictedSeriesEditor />
    </Suspense>
  );
}
