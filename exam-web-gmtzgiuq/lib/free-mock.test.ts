import type { MockExamSummary } from '@/lib/api/exams';
import {
  campaignDateSegments,
  campaignStatusOf,
  cardContextLine,
  formatFreeMockSummary,
  formatThaiTime,
  getMockCardAction,
  groupMockExams,
  progressInfo,
  segmentsToText,
} from './free-mock';

const mockSummary = (patch: Partial<MockExamSummary> = {}): MockExamSummary => ({
  id: 'x',
  title: 'ชุด',
  category: 'netsat',
  categoryName: 'NETSAT',
  subjectId: null,
  subjectName: null,
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 90,
  level: null,
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  access: { status: 'free', expiresAt: null },
  venueKey: null,
  campaign: null,
  subjectLabel: null,
  color: null,
  myProgress: null,
  ...patch,
});

const NOW = new Date('2026-11-08T05:00:00.000Z'); // 8 พ.ย. 2569 12:00 เวลาไทย

const campaign = (status: 'open' | 'upcoming' | 'ended', patch: Partial<NonNullable<MockExamSummary['campaign']>> = {}) => ({
  status,
  startsAt: null,
  endsAt: null,
  daysLeft: null,
  daysUntilOpen: null,
  ...patch,
});

describe('groupMockExams / formatFreeMockSummary', () => {
  it('แยกแคมเปญ (code) / ชุดฟรี (free) / ชุด Pro (purchase) โดยคงลำดับของ API', () => {
    const items = [
      mockSummary({ id: 'f1' }),
      mockSummary({ id: 'c1', accessType: 'code' }),
      mockSummary({ id: 'p1', accessType: 'purchase' }),
      mockSummary({ id: 'c2', accessType: 'code' }),
      mockSummary({ id: 'f2' }),
    ];
    const groups = groupMockExams(items);
    expect(groups.campaigns.map((i) => i.id)).toEqual(['c1', 'c2']);
    expect(groups.free.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(groups.pro.map((i) => i.id)).toEqual(['p1']);
    // นับเฉพาะชุดฟรี (แคมเปญ + ชุดฟรีทั่วไป)
    expect(formatFreeMockSummary(groups)).toBe('4 ชุด · 2 แคมเปญ');
  });
});

describe('สถานะ/วันที่แคมเปญ', () => {
  it('ชุดโค้ดที่ไม่มี campaign (API เก่า) = กำลังเปิด / ชุดอื่น = null', () => {
    expect(campaignStatusOf({ accessType: 'code', campaign: null })).toBe('open');
    expect(campaignStatusOf({ accessType: 'free', campaign: null })).toBeNull();
    expect(campaignStatusOf({ accessType: 'code', campaign: campaign('ended') })).toBe('ended');
  });

  it('open + วันปิด → "เปิดถึง 30 พ.ย. · เหลือ 22 วัน" (ใช้ daysLeft จาก server)', () => {
    const segs = campaignDateSegments(campaign('open', { endsAt: '2026-11-30T16:59:00.000Z', daysLeft: 22 }), NOW);
    expect(segmentsToText(segs)).toBe('เปิดถึง 30 พ.ย. · เหลือ 22 วัน');
    expect(segs?.filter((s) => s.strong).map((s) => s.text)).toEqual(['30 พ.ย.', '22 วัน']);
  });

  it('open ไม่มีวันปิด → ไม่มีบรรทัดวันที่', () => {
    expect(campaignDateSegments(campaign('open'), NOW)).toBeNull();
  });

  it('ขอบวันเวลาไทย: ปิด 30 พ.ย. 23:59 (= 16:59Z) แสดงเป็น 30 พ.ย. ไม่ใช่ 1 ธ.ค.', () => {
    const segs = campaignDateSegments(campaign('open', { endsAt: '2026-11-30T16:59:00.000Z', daysLeft: 23 }), NOW);
    expect(segmentsToText(segs)).toContain('30 พ.ย.');
    // วันเปิด 1 ธ.ค. 00:00 เวลาไทย = 30 พ.ย. 17:00Z
    const up = campaignDateSegments(campaign('upcoming', { startsAt: '2026-11-30T17:00:00.000Z', daysUntilOpen: 23 }), NOW);
    expect(segmentsToText(up)).toBe('เปิด 1 ธ.ค. · อีก 23 วัน');
  });

  it('ไม่มี days จาก server → คำนวณจากวันที่ (ปัดขึ้น)', () => {
    const segs = campaignDateSegments(campaign('upcoming', { startsAt: '2026-11-10T05:00:00.000Z' }), NOW);
    expect(segmentsToText(segs)).toBe('เปิด 10 พ.ย. 12:00 น. · อีก 2 วัน');
  });

  it('เวลาที่ไม่ใช่ขอบวัน (เปิด ≠ 00:00, ปิด ≠ 23:59) แสดง HH:mm เวลาไทยต่อท้ายวันที่ (R8)', () => {
    // ปิด 30 พ.ย. 18:00 เวลาไทย = 11:00Z
    const open = campaignDateSegments(campaign('open', { endsAt: '2026-11-30T11:00:00.000Z', daysLeft: 22 }), NOW);
    expect(segmentsToText(open)).toBe('เปิดถึง 30 พ.ย. 18:00 น. · เหลือ 22 วัน');
    expect(open?.filter((s) => s.strong).map((s) => s.text)).toEqual(['30 พ.ย. 18:00 น.', '22 วัน']);
    // ปิดเที่ยงคืนพอดี (00:00 ของวันถัดไป) → แสดงเวลาให้ชัดว่าวันไหน
    const midnight = campaignDateSegments(campaign('open', { endsAt: '2026-11-30T17:00:00.000Z', daysLeft: 23 }), NOW);
    expect(segmentsToText(midnight)).toBe('เปิดถึง 1 ธ.ค. 00:00 น. · เหลือ 23 วัน');
    // เปิด 9:30 เวลาไทย
    const up = campaignDateSegments(campaign('upcoming', { startsAt: '2026-11-30T02:30:00.000Z', daysUntilOpen: 22 }), NOW);
    expect(segmentsToText(up)).toBe('เปิด 30 พ.ย. 09:30 น. · อีก 22 วัน');
    // จบแล้ว 17:00 เวลาไทย
    const ended = campaignDateSegments(campaign('ended', { endsAt: '2026-11-02T10:00:00.000Z' }), NOW);
    expect(segmentsToText(ended)).toBe('แคมเปญจบเมื่อ 2 พ.ย. 17:00 น.');
  });

  it('formatThaiTime: เวลาไทย HH:mm / ค่าไม่ถูกต้อง → null', () => {
    expect(formatThaiTime('2026-11-30T16:59:00.000Z')).toBe('23:59');
    expect(formatThaiTime('2026-11-30T17:05:00.000Z')).toBe('00:05');
    expect(formatThaiTime(null)).toBeNull();
    expect(formatThaiTime('not-a-date')).toBeNull();
  });

  it('daysLeft / daysUntilOpen = 0 → "ปิดวันนี้" / "เปิดวันนี้"', () => {
    const last = campaignDateSegments(campaign('open', { endsAt: '2026-11-08T16:00:00.000Z', daysLeft: 0 }), NOW);
    expect(segmentsToText(last)).toBe('เปิดถึง 8 พ.ย. 23:00 น. · ปิดวันนี้');
    const today = campaignDateSegments(campaign('upcoming', { startsAt: '2026-11-08T10:00:00.000Z', daysUntilOpen: 0 }), NOW);
    expect(segmentsToText(today)).toBe('เปิด 8 พ.ย. 17:00 น. · เปิดวันนี้');
  });

  it('ended → "แคมเปญจบเมื่อ 2 พ.ย."', () => {
    expect(segmentsToText(campaignDateSegments(campaign('ended', { endsAt: '2026-11-02T16:59:00.000Z' }), NOW))).toBe(
      'แคมเปญจบเมื่อ 2 พ.ย.',
    );
  });
});

describe('progressInfo', () => {
  it('in_progress → "คุณทำแล้ว 12 จาก 20 ข้อ" + แถบ 60%', () => {
    const info = progressInfo({ status: 'in_progress', mode: 'exam', answered: 12, total: 20, scorePercent: null, attemptId: 'a' });
    expect(segmentsToText(info?.segments ?? null)).toBe('คุณทำแล้ว 12 จาก 20 ข้อ');
    expect(info?.barPercent).toBe(60);
  });

  it('completed → "คุณทำแล้ว 82%" ไม่มีแถบ / guest → null', () => {
    const info = progressInfo({ status: 'completed', mode: 'exam', answered: 40, total: 40, scorePercent: 82.4, attemptId: 'a' });
    expect(segmentsToText(info?.segments ?? null)).toBe('คุณทำแล้ว 82%');
    expect(info?.barPercent).toBeNull();
    expect(progressInfo(null)).toBeNull();
  });
});

describe('getMockCardAction', () => {
  const locked = { status: 'locked' as const, expiresAt: null };
  const unlocked = { status: 'unlocked' as const, expiresAt: null };
  const inProgress = { status: 'in_progress' as const, mode: 'exam' as const, answered: 3, total: 20, scorePercent: null, attemptId: 'att-1' };
  const completed = { status: 'completed' as const, mode: 'exam' as const, answered: 20, total: 20, scorePercent: 80, attemptId: 'att-9' };
  const code = (patch: Partial<MockExamSummary>) => mockSummary({ id: 'c', accessType: 'code', access: locked, ...patch });

  it('แคมเปญ open ไม่มีสิทธิ์ → "เข้าร่วมแคมเปญ" ไปหน้ารายละเอียด', () => {
    expect(getMockCardAction(code({ campaign: campaign('open') }))).toEqual({
      kind: 'link',
      label: 'เข้าร่วมแคมเปญ',
      href: '/dashboard/mock-exams/c',
      variant: 'primary',
    });
  });

  it('แคมเปญ open มีสิทธิ์ → "เริ่มทำ" (หน้ารายละเอียด) / ค้าง → "ทำต่อ" (/exam/<id>)', () => {
    expect(getMockCardAction(code({ access: unlocked, campaign: campaign('open') }))).toMatchObject({
      label: 'เริ่มทำ',
      href: '/dashboard/mock-exams/c',
    });
    expect(getMockCardAction(code({ access: unlocked, campaign: campaign('open'), myProgress: inProgress }))).toMatchObject({
      label: 'ทำต่อ',
      href: '/exam/c',
      variant: 'outline',
    });
  });

  it('แคมเปญ upcoming → ป้าย "เปิด <วันที่>" ไม่มีปุ่ม', () => {
    expect(
      getMockCardAction(code({ campaign: campaign('upcoming', { startsAt: '2026-11-30T17:00:00.000Z' }) })),
    ).toEqual({ kind: 'note', label: 'เปิด 1 ธ.ค.' });
  });

  it('แคมเปญ ended: เคยส่ง → "ดูผลและเฉลย" (หน้าประวัติ) / ค้าง+มีสิทธิ์ → "ทำต่อ" / ไม่เคยทำ → "จบแล้ว"', () => {
    expect(getMockCardAction(code({ campaign: campaign('ended'), myProgress: completed }))).toEqual({
      kind: 'link',
      label: 'ดูผลและเฉลย',
      href: '/dashboard/history/att-9',
      variant: 'text',
    });
    expect(
      getMockCardAction(code({ access: unlocked, campaign: campaign('ended'), myProgress: inProgress })),
    ).toMatchObject({ label: 'ทำต่อ', href: '/exam/c' });
    // attempt ค้างในโหมดฝึก → ทำต่อที่ /practice/exam
    expect(
      getMockCardAction(code({ access: unlocked, campaign: campaign('open'), myProgress: { ...inProgress, mode: 'practice' } })),
    ).toMatchObject({ label: 'ทำต่อ', href: '/practice/exam/c' });
    expect(getMockCardAction(code({ campaign: campaign('ended') }))).toEqual({ kind: 'note', label: 'จบแล้ว' });
  });

  it('ชุดฟรี → "เริ่มทำ" / ค้าง → "ทำต่อ"; ส่งแล้วเริ่มใหม่ได้', () => {
    expect(getMockCardAction(mockSummary({ id: 'f' }))).toMatchObject({ label: 'เริ่มทำ', href: '/dashboard/mock-exams/f' });
    expect(getMockCardAction(mockSummary({ id: 'f', myProgress: inProgress }))).toMatchObject({ label: 'ทำต่อ', href: '/exam/f' });
    expect(getMockCardAction(mockSummary({ id: 'f', myProgress: completed }))).toMatchObject({ label: 'เริ่มทำ' });
  });

  it('ชุด Pro ไม่มีสิทธิ์ → "Upgrade" ไปหน้าแพ็กเกจของสนาม / มีสิทธิ์ → "เริ่มทำ"', () => {
    const pro = (patch: Partial<MockExamSummary>) =>
      mockSummary({ id: 'p', accessType: 'purchase', access: locked, venueKey: 'netsat', ...patch });
    expect(getMockCardAction(pro({}))).toEqual({ kind: 'link', label: 'Upgrade', href: '/upgrade?venue=netsat', variant: 'outline' });
    expect(getMockCardAction(pro({ venueKey: null }))).toMatchObject({ href: '/upgrade' });
    expect(getMockCardAction(pro({ access: unlocked }))).toMatchObject({ label: 'เริ่มทำ' });
  });
});

describe('cardContextLine', () => {
  it('แคมเปญ → "แคมเปญ • <วิชา>" / ชุดอื่น → "<สนาม> • <วิชา>"', () => {
    expect(cardContextLine(mockSummary({ accessType: 'code', subjectLabel: 'NETSAT คณิตศาสตร์' }))).toBe(
      'แคมเปญ • NETSAT คณิตศาสตร์',
    );
    expect(cardContextLine(mockSummary({ accessType: 'code' }))).toBe('แคมเปญ • NETSAT');
    expect(cardContextLine(mockSummary({ categoryName: 'A-Level', subjectName: 'คณิต 1' }))).toBe('A-Level • คณิต 1');
    expect(cardContextLine(mockSummary({}))).toBe('NETSAT');
  });
});
