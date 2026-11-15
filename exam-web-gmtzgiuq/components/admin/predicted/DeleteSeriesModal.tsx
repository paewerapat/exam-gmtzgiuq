'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import AdminModal from '@/components/admin/pro/AdminModal';
import { ADMIN_SECONDARY_BUTTON } from '@/components/admin/unlock-codes/shared';
import { deletePredictedSeries } from '@/lib/api/predicted';
import { predictedErrorMessage } from '@/lib/predicted';

/** ยืนยันลบซีรีส์ (modal ของแอป ไม่ใช่ window.confirm) — ชุดข้อสอบในซีรีส์กลับเป็นชุดปกติ ไม่ถูกลบ */
export default function DeleteSeriesModal({
  series,
  onClose,
  onDeleted,
}: {
  series: { id: string; title: string; setCount: number };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deletePredictedSeries(series.id);
      toast.success('ลบซีรีส์แล้ว');
      onDeleted();
    } catch (err) {
      setError(predictedErrorMessage(err, 'ลบซีรีส์ไม่สำเร็จ'));
      setBusy(false);
    }
  }

  return (
    <AdminModal
      title="ลบซีรีส์?"
      onClose={onClose}
      busy={busy}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={ADMIN_SECONDARY_BUTTON} data-autofocus>
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            )}
            ลบซีรีส์
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
        ลบซีรีส์ <span className="font-semibold">{series.title || '(ไม่มีชื่อ)'}</span>
        {series.setCount > 0 ? ` และเอา ${series.setCount.toLocaleString('th-TH')} ชุดออกจากซีรีส์` : ''}
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        ชุดข้อสอบจะไม่ถูกลบ แต่จะกลับเป็นชุดปกติ (แสดงในรายการชุดข้อสอบ/หน้าฝึกตามสถานะของชุด) ย้อนกลับไม่ได้
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </AdminModal>
  );
}
