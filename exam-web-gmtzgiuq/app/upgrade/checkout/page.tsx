'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import CheckoutView from '@/components/pro/CheckoutView';

// useSearchParams (?plan=) ต้องอยู่ใต้ Suspense ไม่งั้น next build ล้ม — layout มาจาก /upgrade (sidebar + drawer)
export default function UpgradeCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
        </div>
      }
    >
      <CheckoutView />
    </Suspense>
  );
}
