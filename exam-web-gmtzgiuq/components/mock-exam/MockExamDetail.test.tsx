import { render, screen, waitFor, within } from '@testing-library/react';
import MockExamDetail from './MockExamDetail';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api/exams', () => ({ getMockExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({ getMyInProgressAttempts: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const exam = (patch: Partial<MockExamDetailData> = {}): MockExamDetailData => ({
  id: 'm1',
  title: 'TGAT Mock 1',
  category: 'tgat',
  categoryName: 'TGAT',
  subjectId: 's1',
  subjectName: 'ภาษาอังกฤษ',
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 90,
  level: 'hard',
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  description: 'คำอธิบายเดิม',
  detailBlocks: [],
  ...patch,
});

function setUser(user: object | null) {
  (useAuth as jest.Mock).mockReturnValue({ user });
}

describe('MockExamDetail (task 11 AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUser(null);
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([]);
  });

  it('แสดงข้อมูลครบ: สนามสอบ · วิชา, ชื่อ, จำนวนข้อ, เวลา, ระดับ, ฟรี', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'TGAT Mock 1' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('TGAT · ภาษาอังกฤษ')).toBeInTheDocument());
    expect(screen.getByText('40 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('90 นาที')).toBeInTheDocument();
    expect(screen.getByText('ยาก')).toBeInTheDocument();
    expect(screen.getByTestId('mock-access-badge')).toHaveTextContent('ฟรี');
    expect(getMockExam).toHaveBeenCalledWith('m1', expect.anything());
  });

  it('ชุดฟรี (guest) → "เริ่มทำ" ไป /exam/<id> ไม่เรียก attempts', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    const start = await screen.findByRole('link', { name: /เริ่มทำ/ });
    expect(start).toHaveAttribute('href', '/exam/m1');
    expect(getMyInProgressAttempts).not.toHaveBeenCalled();
  });

  it('ชุดฟรี + login + มี attempt โหมด exam ค้าง → "ทำต่อ"', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([
      { id: 'a0', examId: 'm1', mode: 'practice' },
      { id: 'a1', examId: 'm1', mode: 'exam' },
    ]);
    render(<MockExamDetail id="m1" />);
    const resume = await screen.findByRole('link', { name: /ทำต่อ/ });
    expect(resume).toHaveAttribute('href', '/exam/m1');
    expect(getMyInProgressAttempts).toHaveBeenCalledTimes(1);
  });

  it('ชุดฟรี + login แต่ attempt ค้างเป็นชุดอื่น/โหมดฝึก → "เริ่มทำ"', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([
      { id: 'a0', examId: 'm1', mode: 'practice' },
      { id: 'a2', examId: 'other', mode: 'exam' },
    ]);
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำ/ })).toHaveAttribute('href', '/exam/m1');
  });

  it('ชุดโค้ด → ปุ่ม Unlock กดไม่ได้ + ข้อความ ไม่มีลิงก์เริ่มทำ', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(exam({ accessType: 'code' }));
    render(<MockExamDetail id="m1" />);
    const btn = await screen.findByRole('button', { name: /Unlock/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText('กรอกโค้ดเพื่อ Unlock — เปิดให้ใช้เร็ว ๆ นี้')).toBeInTheDocument();
    expect(screen.getByTestId('mock-access-badge')).toHaveTextContent('Campaign');
    expect(screen.queryByRole('link', { name: /เริ่มทำ|ทำต่อ/ })).not.toBeInTheDocument();
    expect(getMyInProgressAttempts).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('ชุดซื้อ → ราคา + ปุ่ม ซื้อ กดไม่ได้', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam({ accessType: 'purchase', price: 150 }));
    render(<MockExamDetail id="m1" />);
    const btn = await screen.findByRole('button', { name: /ซื้อ/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText('เปิดให้ซื้อเร็ว ๆ นี้')).toBeInTheDocument();
    expect(screen.getAllByText('150 บาท').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: /เริ่มทำ/ })).not.toBeInTheDocument();
  });

  it('คำอธิบายแบบ block เรียงตามที่แอดมินจัด รูปพอดีจอ มี alt', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({
        detailBlocks: [
          { type: 'text', text: 'ข้อความบน' },
          { type: 'image', url: '/uploads/a.png' },
          { type: 'text', text: 'ข้อความล่าง' },
        ],
      }),
    );
    render(<MockExamDetail id="m1" />);
    const blocks = await screen.findByTestId('detail-blocks');
    const children = Array.from(blocks.children);
    expect(children.map((c) => (c.tagName === 'IMG' ? 'IMG' : c.textContent))).toEqual([
      'ข้อความบน',
      'IMG',
      'ข้อความล่าง',
    ]);
    const img = within(blocks).getByRole('img', { name: 'รูปประกอบ 1 — TGAT Mock 1' });
    // /uploads/ เติม base URL ของ API (เว็บกับไฟล์อัปโหลดอยู่คนละโดเมน)
    expect(img.getAttribute('src')).toMatch(/^https?:\/\/[^/]+.*\/uploads\/a\.png$/);
    expect(img.className).toContain('max-w-full');
    expect(img.className).toContain('h-auto');
    expect(screen.queryByText('คำอธิบายเดิม')).not.toBeInTheDocument();
  });

  it('ไม่มี block → แสดง description เดิม', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByText('คำอธิบายเดิม')).toBeInTheDocument();
  });

  it('404 → "ไม่พบชุดข้อสอบ" + ลิงก์กลับ', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(null);
    render(<MockExamDetail id="nope" />);
    expect(await screen.findByRole('heading', { name: 'ไม่พบชุดข้อสอบ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /กลับไปหน้า Mock Exam/ })).toHaveAttribute('href', '/dashboard/mock-exams');
  });
});
