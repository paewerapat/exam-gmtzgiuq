import { fireEvent, render, screen, within } from '@testing-library/react';
import QuestionBankHome from './QuestionBankHome';
import { useAuth } from '@/contexts/AuthContext';
import { getQbVenueOverview, getQbVenues } from '@/lib/api/question-bank';

const mockReplace = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/question-bank',
  useSearchParams: () => mockSearch,
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api/question-bank', () => ({
  getQbVenues: jest.fn(),
  getQbVenueOverview: jest.fn(),
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const venues = [
  { id: 'v1', key: 'netsat', name: 'NETSAT' },
  { id: 'v2', key: 'tgat', name: 'TGAT' },
];

const overview = (over: Record<string, unknown> = {}) => ({
  venue: venues[0],
  mode: 'bank',
  subjects: [
    { id: 's-math', label: 'คณิต', color: '#4f46e5', iconEmoji: null, total: 320, answered: 4, percent: 1 },
    { id: 's-bio', label: 'ชีวะ', color: '#facc15', iconEmoji: null, total: 360, answered: 48, percent: 13 },
  ],
  stats: {
    answered: 70,
    accuracy: 71,
    streakDays: 3,
    weekly: [
      { weekStart: '2026-11-02', correct: 10, wrong: 2 },
      { weekStart: '2026-11-09', correct: 4, wrong: 3 },
    ],
  },
  challengeUnlocked: false,
  ...over,
});

describe('QuestionBankHome — หน้า 1 (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = new URLSearchParams();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1', email: 'a@b.c' } });
    (getQbVenues as jest.Mock).mockResolvedValue(venues);
    (getQbVenueOverview as jest.Mock).mockResolvedValue(overview());
  });

  it('แท็บสนาม (เลือกอันแรกเมื่อไม่มี ?venue=) + การ์ดวิชาแสดงจำนวนทำแล้ว/ทั้งหมด/% + ลิงก์เปิด', async () => {
    render(<QuestionBankHome mode="bank" />);
    expect(await screen.findByRole('heading', { name: 'คณิต' })).toBeInTheDocument();
    expect(getQbVenueOverview).toHaveBeenCalledTimes(1);
    expect((getQbVenueOverview as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(['netsat', 'bank']);
    expect(screen.getByRole('button', { name: 'NETSAT' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'TGAT' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('ทำแล้ว 48 จาก 360 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'ความคืบหน้า ชีวะ' })).toHaveAttribute('aria-valuenow', '13');
    expect(screen.getByRole('link', { name: 'เปิด ชีวะ' })).toHaveAttribute('href', '/dashboard/question-bank/s-bio');
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('สถิติ 3 ช่อง (ไม่มีช่องข้อที่บันทึกไว้) + กราฟมีข้อความสรุปและตาราง', async () => {
    render(<QuestionBankHome mode="bank" />);
    const tiles = await screen.findByText('ความแม่นยำปัจจุบัน');
    const dl = tiles.closest('dl')!;
    expect(within(dl).getByText('70')).toBeInTheDocument();
    expect(within(dl).getByText('71%')).toBeInTheDocument();
    expect(within(dl).getByText('3 วัน')).toBeInTheDocument();
    expect(screen.queryByText('ข้อที่บันทึกไว้')).not.toBeInTheDocument();

    const figure = screen.getByRole('figure', { name: 'แนวโน้มการทำข้อสอบ' });
    expect(figure).toHaveAccessibleDescription(/2 สัปดาห์ล่าสุด ตอบทั้งหมด 19 ข้อ ถูก 14 ข้อ ผิด 5 ข้อ/);
    expect(within(figure).getByText('ตอบถูก')).toBeInTheDocument();
    expect(within(figure).getByText('ตอบผิด')).toBeInTheDocument();
    const table = within(figure).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('เปลี่ยนแท็บสนาม → แก้ ?venue= ใน URL', async () => {
    render(<QuestionBankHome mode="bank" />);
    await screen.findByRole('heading', { name: 'คณิต' });
    fireEvent.click(screen.getByRole('button', { name: 'TGAT' }));
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/question-bank?venue=tgat', { scroll: false });
  });

  it('?venue= เลือกสนามนั้น', async () => {
    mockSearch = new URLSearchParams('venue=tgat');
    (getQbVenueOverview as jest.Mock).mockResolvedValue(overview({ venue: venues[1] }));
    render(<QuestionBankHome mode="bank" />);
    await screen.findByRole('heading', { name: 'คณิต' });
    expect((getQbVenueOverview as jest.Mock).mock.calls[0][0]).toBe('tgat');
    expect(screen.getByRole('button', { name: 'TGAT' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('guest: เห็นการ์ดและจำนวน แต่สถิติแสดงชวนเข้าสู่ระบบ (กลับมาสนามเดิม)', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    (getQbVenueOverview as jest.Mock).mockResolvedValue(overview({ stats: null }));
    render(<QuestionBankHome mode="bank" />);
    expect(await screen.findByText('ทำแล้ว 4 จาก 320 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('เข้าสู่ระบบเพื่อดูสถิติการทำข้อของคุณ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/dashboard/question-bank?venue=netsat')}`,
    );
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('Challenge ที่ยังไม่มีสิทธิ์: ป้ายเฉพาะ Pro + ปุ่ม Upgrade พร้อมสนาม, การ์ดลิงก์ไปหน้า challenge', async () => {
    (getQbVenueOverview as jest.Mock).mockResolvedValue(overview({ mode: 'challenge', challengeUnlocked: false }));
    render(<QuestionBankHome mode="challenge" />);
    expect(screen.getByRole('heading', { name: 'Challenge Questions' })).toBeInTheDocument();
    expect(screen.getByText('ข้อที่ยากที่สุดของแต่ละวิชา')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'คณิต' });
    expect(getQbVenues).toHaveBeenCalledWith('challenge', expect.anything());
    expect(screen.getByText('เฉพาะ Pro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(screen.getByRole('link', { name: 'เปิด คณิต' })).toHaveAttribute('href', '/dashboard/challenge/s-math');
    expect(screen.getByText('ข้อ Challenge ที่ทำแล้ว')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('Challenge ที่มีสิทธิ์แล้ว: ไม่มีป้ายเฉพาะ Pro', async () => {
    (getQbVenueOverview as jest.Mock).mockResolvedValue(overview({ mode: 'challenge', challengeUnlocked: true }));
    render(<QuestionBankHome mode="challenge" />);
    await screen.findByRole('heading', { name: 'คณิต' });
    expect(screen.queryByText('เฉพาะ Pro')).not.toBeInTheDocument();
  });

  it('ไม่มีสนาม → ข้อความว่าง ; โหลดไม่สำเร็จ → ปุ่มลองใหม่', async () => {
    (getQbVenues as jest.Mock).mockResolvedValueOnce([]);
    const { unmount } = render(<QuestionBankHome mode="bank" />);
    expect(await screen.findByText('ยังไม่มีสนามสอบที่เปิดใน Question Bank')).toBeInTheDocument();
    unmount();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getQbVenues as jest.Mock).mockRejectedValueOnce(new Error('x'));
    render(<QuestionBankHome mode="bank" />);
    fireEvent.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByRole('heading', { name: 'คณิต' })).toBeInTheDocument();
  });
});
