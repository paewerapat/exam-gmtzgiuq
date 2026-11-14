import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { CAMPAIGN_CLOSED_MESSAGES, type CampaignClosedCode } from '@/lib/api/apiError';

/**
 * หน้าจอเมื่อเริ่มทำชุดแคมเปญนอกช่วงเวลา (API ตอบ 403 CAMPAIGN_NOT_OPEN / CAMPAIGN_ENDED — task 21)
 * หยุดไว้ตรงนี้แทนการให้ทำต่อโดยไม่มี attempt (คะแนนจะไม่ถูกบันทึก)
 */
export default function CampaignClosedScreen({ code, detailHref }: { code: CampaignClosedCode; detailHref: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div role="alert" className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalendarClock className="w-8 h-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {code === 'CAMPAIGN_NOT_OPEN' ? 'แคมเปญยังไม่เปิด' : 'แคมเปญจบแล้ว'}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{CAMPAIGN_CLOSED_MESSAGES[code]}</p>
        <Link
          href={detailHref}
          className="inline-flex items-center justify-center w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
        >
          ไปหน้ารายละเอียดชุดข้อสอบ
        </Link>
      </div>
    </div>
  );
}
