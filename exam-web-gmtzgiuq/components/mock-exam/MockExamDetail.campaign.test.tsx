import { act, render, screen, within } from '@testing-library/react';
import MockExamDetail from './MockExamDetail';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api/exams', () => ({ getMockExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({ getMyInProgressAttempts: jest.fn() }));
jest.mock('@/lib/api/unlockCodes', () => ({ redeemUnlockCode: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.setTimeout(30000);

const exam = (patch: Partial<MockExamDetailData> = {}): MockExamDetailData => ({
  id: 'm1',
  title: 'A-LEVEL MATH 1 FREE MOCK 1',
  category: 'alevel',
  categoryName: 'A-Level',
  subjectId: 's1',
  subjectName: 'คณิตศาสตร์ประยุกต์ 1',
  bannerImage: null,
  questionCount: 30,
  durationMinutes: 90,
  level: null,
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  access: { status: 'free', expiresAt: null },
  venueKey: 'alevel',
  description: 'ข้อสอบจำลอง',
  detailBlocks: [],
  codeInstructions: null,
  campaign: null,
  subjectLabel: null,
  color: null,
  myProgress: null,
  topicBreakdown: [
    { topicId: 't1', name: 'ฟังก์ชัน', count: 8 },
    { topicId: 't2', name: 'สถิติ', count: 6 },
    { topicId: null, name: 'อื่น ๆ', count: 2 },
  ],
  ...patch,
});

const codeExam = (status: 'open' | 'upcoming' | 'ended', patch: Partial<MockExamDetailData> = {}) =>
  exam({
    accessType: 'code',
    access: { status: 'locked', expiresAt: null },
    campaign: {
      status,
      startsAt: '2026-11-30T17:00:00.000Z', // 1 ธ.ค. 2569 00:00 เวลาไทย
      endsAt: '2026-12-31T16:59:00.000Z', // 31 ธ.ค. 2569 23:59 เวลาไทย
      daysLeft: status === 'open' ? 22 : null,
      daysUntilOpen: status === 'upcoming' ? 23 : null,
    },
    ...patch,
  });

function setUser(user: object | null) {
  (useAuth as jest.Mock).mockReturnValue({ user });
}
const panel = () => screen.getByTestId('mock-access-panel');

describe('MockExamDetail — task 21 (เนื้อหาที่ออก / สิ่งที่ได้หลังทำ / สถานะแคมเปญ)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUser(null);
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([]);
  });

  it('ชุดฟรี: กล่อง "เนื้อหาที่ออก" มีแถบต่อบท + จำนวนข้อเป็นข้อความ และ "สิ่งที่ได้หลังทำ" 4 ข้อ', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    const topics = within(await screen.findByTestId('mock-topic-breakdown'));
    expect(topics.getByRole('heading', { name: 'เนื้อหาที่ออก' })).toBeInTheDocument();
    expect(topics.getByText('จำนวนข้อต่อบทจากทั้งหมด 30 ข้อ')).toBeInTheDocument();
    const rows = topics.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['ฟังก์ชัน8 ข้อ', 'สถิติ6 ข้อ', 'อื่น ๆ2 ข้อ']);

    const after = within(screen.getByTestId('mock-after-exam'));
    expect(after.getByRole('heading', { name: 'สิ่งที่ได้หลังทำ' })).toBeInTheDocument();
    expect(after.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'คะแนนรวมและคะแนนรายบท',
      'เฉลยพร้อมวิธีทำทุกข้อ',
      'บันทึกใน "ประวัติการสอบ" ของคุณ',
      'เทียบกับชุด Predicted Exam (Pro) เพื่อฝึกต่อ',
    ]);
    // task 22: "ชุด Predicted Exam (Pro)" เป็นลิงก์ไปหน้า Predicted
    expect(after.getByRole('link', { name: 'ชุด Predicted Exam (Pro)' })).toHaveAttribute('href', '/dashboard/predicted');
    // ชุดฟรีไม่มีแถวช่วงแคมเปญ / ป้ายสถานะ
    expect(screen.queryByText('ช่วงแคมเปญ')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('ชุดฟรีทั่วไป')).toBeInTheDocument();
  });

  it('ไม่มี topicBreakdown → ไม่แสดงกล่องเนื้อหาที่ออก แต่ยังมีสิ่งที่ได้หลังทำ / ชุด Pro ไม่มีทั้งสองกล่อง', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam({ topicBreakdown: [] }));
    const { unmount } = render(<MockExamDetail id="m1" />);
    expect(await screen.findByTestId('mock-after-exam')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-topic-breakdown')).not.toBeInTheDocument();
    unmount();

    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'locked', expiresAt: null } }),
    );
    render(<MockExamDetail id="m1" />);
    await screen.findByTestId('mock-access-panel');
    expect(screen.queryByTestId('mock-detail-extras')).not.toBeInTheDocument();
  });

  it('แคมเปญกำลังเปิด: ป้าย "กำลังเปิด" + วันที่ในแถบหัว + แถวช่วงแคมเปญ + ช่องโค้ดใช้ได้ + กล่องทั้งสอง', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam('open'));
    render(<MockExamDetail id="m1" />);
    const hero = within(await screen.findByTestId('mock-detail-hero'));
    expect(hero.getByText('กำลังเปิด')).toBeInTheDocument();
    expect(hero.getByTestId('hero-campaign-dates')).toHaveTextContent('เปิดถึง 31 ธ.ค. · เหลือ 22 วัน');
    expect(screen.getByText('ช่วงแคมเปญ')).toBeInTheDocument();
    expect(screen.getByText(/1 ธ\.ค\. 2569.*–.*31 ธ\.ค\. 2569/)).toBeInTheDocument();
    expect(within(panel()).getByLabelText('โค้ด Unlock')).toBeEnabled();
    expect(screen.getByTestId('mock-topic-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('mock-after-exam')).toBeInTheDocument();
  });

  it('แคมเปญเร็ว ๆ นี้: กล่องขวาปิดช่องโค้ดพร้อมเหตุผล ไม่มีปุ่มเริ่มทำ', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam('upcoming'));
    render(<MockExamDetail id="m1" />);
    const box = within(await screen.findByTestId('mock-access-panel'));
    expect(box.getByRole('heading', { name: 'แคมเปญยังไม่เปิด' })).toBeInTheDocument();
    const input = box.getByLabelText('โค้ด Unlock');
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription(/เปิด 1 ธ\.ค\. · อีก 23 วัน.*กรอกโค้ดและเริ่มทำได้เมื่อแคมเปญเปิด/);
    expect(box.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /เริ่มทำข้อสอบ/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('เร็ว ๆ นี้')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('แคมเปญจบแล้ว + เคยส่ง → "แคมเปญจบแล้ว" + ปุ่ม "ดูผลและเฉลย" ไปหน้าประวัติ', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', {
        myProgress: { status: 'completed', mode: 'exam', answered: 30, total: 30, scorePercent: 80, attemptId: 'att-7' },
      }),
    );
    render(<MockExamDetail id="m1" />);
    const box = within(await screen.findByTestId('mock-access-panel'));
    expect(box.getByRole('heading', { name: 'แคมเปญจบแล้ว' })).toBeInTheDocument();
    expect(box.getByLabelText('โค้ด Unlock')).toBeDisabled();
    expect(box.getByText('แคมเปญนี้ปิดแล้ว กรอกโค้ดและเริ่มทำใหม่ไม่ได้')).toBeInTheDocument();
    expect(box.getByRole('link', { name: 'ดูผลและเฉลย' })).toHaveAttribute('href', '/dashboard/history/att-7');
  });

  it('แคมเปญจบแล้วแต่มีสิทธิ์และ attempt ค้าง → ยัง "ทำต่อ" ได้ (API ให้ส่งงานที่ค้าง)', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', { access: { status: 'unlocked', expiresAt: null, via: 'code' } }),
    );
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([{ id: 'a1', examId: 'm1', mode: 'exam' }]);
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /ทำต่อ/ })).toHaveAttribute('href', '/exam/m1');
  });

  it('task 21 Q3: แคมเปญจบแล้ว + attempt โหมดฝึกค้าง → "ทำต่อ" ไป /practice/exam ไม่ขึ้นกล่องปิด', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', {
        access: { status: 'unlocked', expiresAt: null, via: 'code' },
        myProgress: { status: 'in_progress', mode: 'practice', answered: 0, total: 30, scorePercent: null, attemptId: 'a1' },
      }),
    );
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([{ id: 'a1', examId: 'm1', mode: 'practice' }]);
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /ทำต่อ/ })).toHaveAttribute('href', '/practice/exam/m1');
    expect(screen.queryByRole('heading', { name: 'แคมเปญจบแล้ว' })).not.toBeInTheDocument();
  });

  it('แคมเปญจบแล้ว + มีสิทธิ์: ระหว่างเช็ก attempt ค้าง → กล่อง loading ไม่โชว์ "เริ่มทำ" แล้วค่อยเป็นกล่องปิด (R2)', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', { access: { status: 'unlocked', expiresAt: null, via: 'code' } }),
    );
    let resolveProgress: (v: unknown[]) => void = () => {};
    (getMyInProgressAttempts as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    render(<MockExamDetail id="m1" />);
    const box = within(await screen.findByTestId('mock-access-panel'));
    expect(box.getByRole('status')).toHaveTextContent('กำลังตรวจสอบสถานะการทำข้อสอบ...');
    expect(screen.queryByRole('heading', { name: /เริ่มทำข้อสอบ|Unlock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /เริ่มทำ|ทำต่อ/ })).not.toBeInTheDocument();

    await act(async () => resolveProgress([]));
    expect(await screen.findByRole('heading', { name: 'แคมเปญจบแล้ว' })).toBeInTheDocument();
    expect(screen.queryByText('กำลังตรวจสอบสถานะการทำข้อสอบ...')).not.toBeInTheDocument();
  });

  it('แคมเปญจบแล้ว + มีสิทธิ์: เช็กเสร็จแล้วเจอ attempt ค้าง → จาก loading เป็น "ทำต่อ" (R2)', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', { access: { status: 'unlocked', expiresAt: null, via: 'code' } }),
    );
    let resolveProgress: (v: unknown[]) => void = () => {};
    (getMyInProgressAttempts as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByText('กำลังตรวจสอบสถานะการทำข้อสอบ...')).toBeInTheDocument();
    await act(async () => resolveProgress([{ id: 'a1', examId: 'm1', mode: 'exam' }]));
    expect(await screen.findByRole('link', { name: /ทำต่อ/ })).toHaveAttribute('href', '/exam/m1');
    expect(screen.queryByRole('heading', { name: 'แคมเปญจบแล้ว' })).not.toBeInTheDocument();
  });

  it('แคมเปญจบแล้ว มีสิทธิ์แต่ไม่มี attempt ค้าง → กล่องปิด (เริ่มใหม่ไม่ได้)', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('ended', { access: { status: 'unlocked', expiresAt: null, via: 'code' } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('heading', { name: 'แคมเปญจบแล้ว' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /เริ่มทำข้อสอบ/ })).not.toBeInTheDocument();
  });

  it('แอดมิน: แคมเปญยังไม่เปิดแต่มีสิทธิ์ → เริ่มทำได้ (API bypass)', async () => {
    setUser({ id: 'admin', role: 'ADMIN' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam('upcoming', { access: { status: 'unlocked', expiresAt: null, via: 'admin' } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
  });
});
