// หน้า Free Mock Exam (task 21 / lumo3 งานที่ 7): แบ่งกลุ่มชุด, ป้ายสถานะแคมเปญ, บรรทัดวันที่, ความคืบหน้า
// และปุ่มบนการ์ดตามสถานะ — pure functions (ทดสอบได้โดยไม่ render)
import type { MockCampaign, MockCampaignStatus, MockExamSort, MockExamSummary, MockProgress } from '@/lib/api/exams';
import { canStartMock, mockCategoryLabel } from '@/lib/mock-exam';
import { daysRemaining, formatThaiShortDate } from '@/lib/unlock-codes';

export const SORT_LABELS: Record<MockExamSort, string> = {
  recommended: 'แนะนำ',
  newest: 'ใหม่สุด',
  name: 'ชื่อ',
};

export const CAMPAIGN_STATUS_LABELS: Record<MockCampaignStatus, string> = {
  open: 'กำลังเปิด',
  upcoming: 'เร็ว ๆ นี้',
  ended: 'จบแล้ว',
};

// ── กลุ่ม ─────────────────────────────────────────────────

export interface MockExamGroups {
  /** accessType code */
  campaigns: MockExamSummary[];
  /** accessType free */
  free: MockExamSummary[];
  /** accessType purchase — กลุ่มชั่วคราวจนกว่างาน 8 จะย้ายไปหน้า Predicted Exam */
  pro: MockExamSummary[];
}

/** แบ่งกลุ่มตาม accessType โดยคงลำดับที่ API เรียงมา */
export function groupMockExams(items: MockExamSummary[]): MockExamGroups {
  const groups: MockExamGroups = { campaigns: [], free: [], pro: [] };
  for (const item of items) {
    if (item.accessType === 'code') groups.campaigns.push(item);
    else if (item.accessType === 'free') groups.free.push(item);
    else groups.pro.push(item);
  }
  return groups;
}

/** "6 ชุด · 4 แคมเปญ" — นับเฉพาะชุดฟรี (แคมเปญ + ชุดฟรีทั่วไป) */
export function formatFreeMockSummary(groups: MockExamGroups): string {
  const total = groups.campaigns.length + groups.free.length;
  return `${total.toLocaleString('th-TH')} ชุด · ${groups.campaigns.length.toLocaleString('th-TH')} แคมเปญ`;
}

// ── แคมเปญ ────────────────────────────────────────────────

/** สถานะที่ใช้แสดง: ชุดโค้ดที่ API ไม่ส่ง campaign (API เก่า) = กำลังเปิด / ชุดอื่น = null */
export function campaignStatusOf(exam: Pick<MockExamSummary, 'accessType' | 'campaign'>): MockCampaignStatus | null {
  if (exam.accessType !== 'code') return null;
  return exam.campaign?.status ?? 'open';
}

/** ส่วนของบรรทัดวันที่ (strong = ตัวหนา) */
export interface TextSegment {
  text: string;
  strong?: boolean;
}

const daysCount = (days: number) => `${days.toLocaleString('th-TH')} วัน`;

/** ไทย UTC+7 ไม่มี daylight saving จึงใช้ offset คงที่ได้ */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** เวลาไทย "HH:mm" ค่าไม่ถูกต้อง → null */
export function formatThaiTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

/**
 * วันที่สั้น + เวลา (เวลาไทย) สำหรับบรรทัดวันที่แคมเปญ: แสดงเวลาเฉพาะเมื่อไม่ใช่เวลาปกติของขอบวัน
 * (เปิด 00:00 / ปิด 23:59) เช่น "30 พ.ย." / "30 พ.ย. 18:00 น." — สั้นพอไม่ล้นการ์ดที่ 375px
 */
function campaignDateText(value: string | null | undefined, boundary: 'start' | 'end'): string | null {
  const date = formatThaiShortDate(value);
  if (!date) return null;
  const time = formatThaiTime(value);
  const usual = boundary === 'start' ? '00:00' : '23:59';
  return time && time !== usual ? `${date} ${time} น.` : date;
}

/**
 * บรรทัดวันที่ใต้ป้ายสถานะ (เวลาไทย):
 * open + มีวันปิด → "เปิดถึง 30 พ.ย. · เหลือ 22 วัน" / upcoming → "เปิด 1 ธ.ค. · อีก 23 วัน"
 * / ended → "แคมเปญจบเมื่อ 2 พ.ย." / ไม่มีวันที่ → null
 * เวลาที่ไม่ใช่ขอบวัน (เปิด ≠ 00:00, ปิด ≠ 23:59) ต่อท้ายวันที่ เช่น "เปิดถึง 30 พ.ย. 18:00 น."
 * จำนวนวันใช้ค่าที่ server คำนวณ ไม่มี → คำนวณจากวันที่
 */
export function campaignDateSegments(campaign: MockCampaign | null, now: Date = new Date()): TextSegment[] | null {
  if (!campaign) return null;
  if (campaign.status === 'open') {
    const date = campaignDateText(campaign.endsAt, 'end');
    if (!date) return null;
    const days = campaign.daysLeft ?? daysRemaining(campaign.endsAt, now);
    const segs: TextSegment[] = [{ text: 'เปิดถึง ' }, { text: date, strong: true }];
    // 0 = ปิดภายในวันนี้ (server นับวันตามเวลาไทย)
    if (days === 0) segs.push({ text: ' · ' }, { text: 'ปิดวันนี้', strong: true });
    else if (days != null) segs.push({ text: ' · เหลือ ' }, { text: daysCount(days), strong: true });
    return segs;
  }
  if (campaign.status === 'upcoming') {
    const date = campaignDateText(campaign.startsAt, 'start');
    if (!date) return null;
    const days = campaign.daysUntilOpen ?? daysRemaining(campaign.startsAt, now);
    const segs: TextSegment[] = [{ text: 'เปิด ' }, { text: date, strong: true }];
    if (days === 0) segs.push({ text: ' · ' }, { text: 'เปิดวันนี้', strong: true });
    else if (days != null) segs.push({ text: ' · อีก ' }, { text: daysCount(days), strong: true });
    return segs;
  }
  const date = campaignDateText(campaign.endsAt, 'end');
  return date ? [{ text: 'แคมเปญจบเมื่อ ' }, { text: date, strong: true }] : null;
}

export const segmentsToText = (segs: TextSegment[] | null): string => (segs ?? []).map((s) => s.text).join('');

// ── ความคืบหน้า ───────────────────────────────────────────

export interface ProgressInfo {
  segments: TextSegment[];
  /** 0–100 สำหรับแถบ (เฉพาะ in_progress) */
  barPercent: number | null;
}

/** "คุณทำแล้ว 12 จาก 20 ข้อ" + แถบ / "คุณทำแล้ว 82%" / guest หรือยังไม่เคยทำ → null */
export function progressInfo(progress: MockProgress | null): ProgressInfo | null {
  if (!progress) return null;
  if (progress.status === 'in_progress') {
    const total = Math.max(progress.total, progress.answered);
    const barPercent = total > 0 ? Math.round((progress.answered / total) * 100) : 0;
    return {
      segments: [
        { text: 'คุณทำแล้ว ' },
        { text: `${progress.answered.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} ข้อ`, strong: true },
      ],
      barPercent,
    };
  }
  if (progress.scorePercent == null) return { segments: [{ text: 'คุณทำชุดนี้แล้ว' }], barPercent: null };
  return {
    segments: [{ text: 'คุณทำแล้ว ' }, { text: `${Math.round(progress.scorePercent)}%`, strong: true }],
    barPercent: null,
  };
}

// ── ปุ่มบนการ์ด ───────────────────────────────────────────

export type CardActionVariant = 'primary' | 'outline' | 'text';

export type MockCardAction =
  | { kind: 'link'; label: string; href: string; variant: CardActionVariant }
  /** ไม่มีปุ่ม แสดงเป็นป้าย (แคมเปญยังไม่เปิด / จบแล้วและไม่เคยทำ) */
  | { kind: 'note'; label: string };

export const detailHref = (id: string) => `/dashboard/mock-exams/${id}`;
const examHref = (id: string) => `/exam/${id}`;

/**
 * ปุ่มขวาล่างของการ์ด
 * - แคมเปญ open: ไม่มีสิทธิ์ → "เข้าร่วมแคมเปญ" / ค้าง → "ทำต่อ" / มีสิทธิ์ → "เริ่มทำ" (ไปหน้ารายละเอียด)
 * - แคมเปญ upcoming → ป้าย "เปิด <วันที่>" (ไม่มีปุ่มแจ้งเตือน — งานเพิ่มเติม)
 * - แคมเปญ ended → เคยส่ง → "ดูผลและเฉลย" (หน้าประวัติ) / ค้างและมีสิทธิ์ → "ทำต่อ" (API ให้ส่งได้) / ไม่เคยทำ → "จบแล้ว"
 * - ชุดฟรี → "ทำต่อ" / "เริ่มทำ"
 * - ชุด Pro → มีสิทธิ์ = แบบชุดฟรี / ไม่มี → "Upgrade" (หน้าแพ็กเกจของสนาม)
 */
export function getMockCardAction(exam: MockExamSummary): MockCardAction {
  const progress = exam.myProgress;
  const canStart = canStartMock(exam, exam.access);
  // ทำต่อตามโหมดของ attempt ที่ค้าง (practice → /practice/exam, exam → /exam)
  const resumeHref = progress?.mode === 'practice' ? `/practice/exam/${exam.id}` : examHref(exam.id);
  const resume: MockCardAction = { kind: 'link', label: 'ทำต่อ', href: resumeHref, variant: 'outline' };
  const start: MockCardAction = { kind: 'link', label: 'เริ่มทำ', href: detailHref(exam.id), variant: 'primary' };
  const inProgress = progress?.status === 'in_progress';

  const status = campaignStatusOf(exam);
  if (status === 'upcoming') {
    const date = formatThaiShortDate(exam.campaign?.startsAt);
    return { kind: 'note', label: date ? `เปิด ${date}` : CAMPAIGN_STATUS_LABELS.upcoming };
  }
  if (status === 'ended') {
    if (progress?.status === 'completed') {
      return {
        kind: 'link',
        label: 'ดูผลและเฉลย',
        href: `/dashboard/history/${encodeURIComponent(progress.attemptId)}`,
        variant: 'text',
      };
    }
    if (inProgress && canStart) return resume;
    return { kind: 'note', label: CAMPAIGN_STATUS_LABELS.ended };
  }
  if (status === 'open') {
    if (!canStart) {
      return { kind: 'link', label: 'เข้าร่วมแคมเปญ', href: detailHref(exam.id), variant: 'primary' };
    }
    return inProgress ? resume : start;
  }
  if (exam.accessType === 'purchase' && !canStart) {
    const href = exam.venueKey ? `/upgrade?venue=${encodeURIComponent(exam.venueKey)}` : '/upgrade';
    return { kind: 'link', label: 'Upgrade', href, variant: 'outline' };
  }
  return inProgress ? resume : start;
}

// ── บรรทัดหมวด / สีแบนเนอร์ ────────────────────────────────

/** "แคมเปญ • NETSAT คณิตศาสตร์" / ชุดอื่น "A-Level • คณิตศาสตร์ประยุกต์ 1" */
export function cardContextLine(exam: MockExamSummary): string {
  const subject = exam.subjectLabel ?? exam.subjectName;
  if (exam.accessType === 'code') return `แคมเปญ • ${subject ?? mockCategoryLabel(exam)}`;
  const category = mockCategoryLabel(exam);
  return subject ? `${category} • ${subject}` : category;
}

/** สีแบนเนอร์เมื่อ API ไม่ส่งสี (ตาม accessType) */
const FALLBACK_COLORS: Record<MockExamSummary['accessType'], string> = {
  code: '#6d5ce8',
  free: '#3b82f6',
  purchase: '#a855f7',
};

export function bannerColor(exam: Pick<MockExamSummary, 'color' | 'accessType'>): string {
  return exam.color ?? FALLBACK_COLORS[exam.accessType];
}
