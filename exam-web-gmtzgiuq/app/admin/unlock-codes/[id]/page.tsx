'use client';

import { use } from 'react';
import UnlockBatchDetail from '@/components/admin/unlock-codes/UnlockBatchDetail';

/** /admin/unlock-codes/[id] — layout แอดมินตรวจ role แล้ว (SEC-8) */
export default function UnlockBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // key: เปลี่ยนแคมเปญแล้วเริ่ม state ใหม่ทั้งหมด
  return <UnlockBatchDetail key={id} id={id} />;
}
