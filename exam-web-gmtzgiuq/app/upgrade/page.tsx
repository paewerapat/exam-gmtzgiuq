'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import UpgradeView from '@/components/pro/UpgradeView';

// useSearchParams (?venue=) ต้องอยู่ใต้ Suspense ไม่งั้น next build ล้ม
export default function UpgradePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
        </div>
      }
    >
      <UpgradeView />
    </Suspense>
  );
}
