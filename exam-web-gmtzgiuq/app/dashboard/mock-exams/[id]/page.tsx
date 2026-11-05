'use client';

import { use } from 'react';
import MockExamDetail from '@/components/mock-exam/MockExamDetail';

export default function MockExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // key: เปลี่ยนชุดแล้วเริ่ม state ใหม่ทั้งหมด
  return <MockExamDetail key={id} id={id} />;
}
