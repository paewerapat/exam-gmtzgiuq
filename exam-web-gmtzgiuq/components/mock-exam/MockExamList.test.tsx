import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockExamList from './MockExamList';
import { getAllMockExams, type MockExamSummary } from '@/lib/api/exams';
import { getProUpgrade } from '@/lib/api/pro';
import { useAuth } from '@/contexts/AuthContext';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/mock-exams',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/exams', () => ({
  getAllMockExams: jest.fn(),
  MOCK_EXAM_SORTS: ['recommended', 'newest', 'name'],
}));
jest.mock('@/lib/api/pro', () => ({ getProUpgrade: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const item = (patch: Partial<MockExamSummary>): MockExamSummary => ({
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
  access: { status: 'free', expiresAt: null },
  venueKey: 'netsat',
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  campaign: null,
  subjectLabel: null,
  color: null,
  myProgress: null,
  ...patch,
});

const locked = { status: 'locked' as const, expiresAt: null };

const items = [
  item({
    id: 'c-open',
    title: 'NETSAT MATH CAMPAIGN 1',
    accessType: 'code',
    access: locked,
    subjectLabel: 'NETSAT คณิตศาสตร์',
    color: '#6d5ce8',
    campaign: { status: 'open', startsAt: null, endsAt: '2026-11-30T10:00:00.000Z', daysLeft: 22, daysUntilOpen: null },
  }),
  item({
    id: 'c-prog',
    title: 'NETSAT PHYSICS CAMPAIGN 1',
    accessType: 'code',
    access: { status: 'unlocked', expiresAt: null },
    questionCount: 20,
    durationMinutes: 60,
    campaign: { status: 'open', startsAt: null, endsAt: '2026-11-30T10:00:00.000Z', daysLeft: 22, daysUntilOpen: null },
    myProgress: { status: 'in_progress', mode: 'exam', answered: 12, total: 20, scorePercent: null, attemptId: 'a1' },
  }),
  item({
    id: 'c-soon',
    title: 'NETSAT CHEMISTRY CAMPAIGN 1',
    accessType: 'code',
    access: locked,
    campaign: { status: 'upcoming', startsAt: '2026-11-30T17:00:00.000Z', endsAt: null, daysLeft: null, daysUntilOpen: 23 },
  }),
  item({
    id: 'c-end',
    title: 'NETSAT BIOLOGY CAMPAIGN 1',
    accessType: 'code',
    access: locked,
    campaign: { status: 'ended', startsAt: null, endsAt: '2026-11-02T10:00:00.000Z', daysLeft: null, daysUntilOpen: null },
    myProgress: { status: 'completed', mode: 'exam', answered: 45, total: 45, scorePercent: 82, attemptId: 'a9' },
  }),
  item({ id: 'f1', title: 'A-LEVEL MATH 1 FREE MOCK 1', categoryName: 'A-Level', venueKey: 'alevel' }),
  item({ id: 'p1', title: 'ชุด Pro', accessType: 'purchase', access: locked, price: 150 }),
];

const card = (title: string) => screen.getByRole('article', { name: title });

describe('MockExamList — Free Mock Exam (task 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = '';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getAllMockExams as jest.Mock).mockResolvedValue(items);
    (getProUpgrade as jest.Mock).mockResolvedValue({
      page: {},
      my: [],
      venues: [
        { id: 'v1', key: 'netsat', name: 'NETSAT' },
        { id: 'v2', key: 'alevel', name: 'A-Level' },
      ],
    });
  });

  it('หัวข้อ แท็บสนาม (ทั้งหมด + ชื่อจริง) สรุปจำนวน และแบ่งกลุ่ม แคมเปญ / ชุดฟรีทั่วไป / ชุดสำหรับสมาชิก Pro', async () => {
    render(<MockExamList />);
    expect(screen.getByRole('heading', { level: 1, name: 'Free Mock Exam' })).toBeInTheDocument();
    expect(screen.getByText('ข้อสอบจำลองฟรี จัดทำโดยทีมวิชาการ LUMO EXAM')).toBeInTheDocument();

    const campaigns = await screen.findByTestId('mock-campaigns-grid');
    expect(within(campaigns).getAllByRole('article')).toHaveLength(4);
    expect(within(screen.getByTestId('mock-free-grid')).getAllByRole('article')).toHaveLength(1);
    expect(within(screen.getByTestId('mock-pro-grid')).getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'แคมเปญ' })).toBeInTheDocument();
    expect(screen.getByText('ชุดฟรีที่เปิดเป็นช่วงเวลา สถานะ: กำลังเปิด / เร็ว ๆ นี้ / จบแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ชุดฟรีทั่วไป' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ชุดสำหรับสมาชิก Pro' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-summary')).toHaveTextContent('5 ชุด · 4 แคมเปญ');

    const tabs = within(screen.getByRole('group', { name: 'เลือกสนามสอบ' }));
    await waitFor(() => expect(tabs.getByRole('button', { name: 'A-Level' })).toBeInTheDocument());
    expect(tabs.getByRole('button', { name: 'ทั้งหมด' })).toHaveAttribute('aria-pressed', 'true');
    expect(getAllMockExams).toHaveBeenCalledWith({ sort: 'recommended', venue: undefined }, expect.anything());
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('กริด 1 / 2 (sm) / 4 (xl) คอลัมน์', async () => {
    render(<MockExamList />);
    const grid = await screen.findByTestId('mock-campaigns-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-4');
  });

  it('การ์ดแคมเปญ: ป้าย FREE/CAMPAIGN, หมวด, ข้อ·นาที, สถานะ, วันที่, ความคืบหน้า และปุ่มตามสถานะ', async () => {
    render(<MockExamList />);
    await screen.findByTestId('mock-campaigns-grid');

    const open = within(card('NETSAT MATH CAMPAIGN 1'));
    expect(open.getByText('FREE')).toBeInTheDocument();
    expect(open.getByText('CAMPAIGN')).toBeInTheDocument();
    expect(open.getByText('แคมเปญ • NETSAT คณิตศาสตร์')).toBeInTheDocument();
    // nit 6b: บรรทัดหมวดถูกตัดด้วย ellipsis → title มีชื่อเต็ม
    expect(open.getByText('แคมเปญ • NETSAT คณิตศาสตร์')).toHaveAttribute('title', 'แคมเปญ • NETSAT คณิตศาสตร์');
    expect(open.getByText('40 ข้อ · 90 นาที')).toBeInTheDocument();
    expect(open.getByTestId('campaign-status')).toHaveTextContent('กำลังเปิด');
    expect(open.getByTestId('campaign-dates')).toHaveTextContent('เปิดถึง 30 พ.ย. 17:00 น. · เหลือ 22 วัน');
    expect(open.getByRole('link', { name: 'เข้าร่วมแคมเปญ NETSAT MATH CAMPAIGN 1' })).toHaveAttribute(
      'href',
      '/dashboard/mock-exams/c-open',
    );
    expect(open.getByText('Free')).toBeInTheDocument();

    const prog = within(card('NETSAT PHYSICS CAMPAIGN 1'));
    expect(prog.getByTestId('mock-progress')).toHaveTextContent('คุณทำแล้ว 12 จาก 20 ข้อ');
    expect(prog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(prog.getByRole('link', { name: /^ทำต่อ/ })).toHaveAttribute('href', '/exam/c-prog');

    const soon = within(card('NETSAT CHEMISTRY CAMPAIGN 1'));
    expect(soon.getByTestId('campaign-status')).toHaveTextContent('เร็ว ๆ นี้');
    expect(soon.getByTestId('campaign-dates')).toHaveTextContent('เปิด 1 ธ.ค. · อีก 23 วัน');
    expect(soon.getByTestId('mock-card-note')).toHaveTextContent('เปิด 1 ธ.ค.');
    expect(soon.queryByRole('link', { name: /แจ้งเตือน|เริ่มทำ|เข้าร่วม/ })).not.toBeInTheDocument();

    const ended = within(card('NETSAT BIOLOGY CAMPAIGN 1'));
    expect(ended.getByTestId('campaign-status')).toHaveTextContent('จบแล้ว');
    expect(ended.getByTestId('campaign-dates')).toHaveTextContent('แคมเปญจบเมื่อ 2 พ.ย.');
    expect(ended.getByTestId('mock-progress')).toHaveTextContent('คุณทำแล้ว 82%');
    expect(ended.getByRole('link', { name: /^ดูผลและเฉลย/ })).toHaveAttribute('href', '/dashboard/history/a9');
  });

  it('ชุดฟรีทั่วไป → "เริ่มทำ" ไปหน้ารายละเอียด ไม่มีป้าย CAMPAIGN / ชุด Pro → "Upgrade"', async () => {
    render(<MockExamList />);
    await screen.findByTestId('mock-free-grid');
    const free = within(card('A-LEVEL MATH 1 FREE MOCK 1'));
    expect(free.queryByText('CAMPAIGN')).not.toBeInTheDocument();
    expect(free.queryByTestId('campaign-status')).not.toBeInTheDocument();
    expect(free.getByText('A-Level')).toBeInTheDocument();
    expect(free.getByRole('link', { name: /^เริ่มทำ/ })).toHaveAttribute('href', '/dashboard/mock-exams/f1');

    const pro = within(card('ชุด Pro'));
    expect(pro.getByRole('link', { name: /^Upgrade/ })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(pro.getByText('Pro')).toBeInTheDocument();
  });

  it('guest → ไม่มีบรรทัดความคืบหน้า (API ไม่ส่ง myProgress)', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    (getAllMockExams as jest.Mock).mockResolvedValue(items.map((i) => ({ ...i, myProgress: null })));
    render(<MockExamList />);
    await screen.findByTestId('mock-campaigns-grid');
    expect(screen.queryByTestId('mock-progress')).not.toBeInTheDocument();
  });

  it('เลือกแท็บสนาม → ?venue=<key> / เลือกตัวเรียง → ?sort= (แนะนำ = ค่าเริ่มต้นไม่ใส่ใน URL)', async () => {
    const user = userEvent.setup();
    render(<MockExamList />);
    const tabs = within(screen.getByRole('group', { name: 'เลือกสนามสอบ' }));
    await user.click(await tabs.findByRole('button', { name: 'A-Level' }));
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams?venue=alevel', { scroll: false });

    const select = screen.getByLabelText('เรียงโดย');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['แนะนำ', 'ใหม่สุด', 'ชื่อ']);
    await user.selectOptions(select, 'name');
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/mock-exams?sort=name', { scroll: false });
  });

  it('อ่าน ?venue= และ ?sort= จาก URL แล้วส่งให้ API (กรองด้วย venueKey) — ลำดับตามที่ API เรียง', async () => {
    mockSearch = 'venue=alevel&sort=newest';
    (getAllMockExams as jest.Mock).mockResolvedValue([
      item({ id: 'f2', title: 'ชุด B' }),
      item({ id: 'f1', title: 'ชุด A' }),
    ]);
    render(<MockExamList />);
    const grid = await screen.findByTestId('mock-free-grid');
    expect(getAllMockExams).toHaveBeenCalledWith({ sort: 'newest', venue: 'alevel' }, expect.anything());
    expect(within(grid).getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual([
      'mock-card-title-f2',
      'mock-card-title-f1',
    ]);
    expect((screen.getByLabelText('เรียงโดย') as HTMLSelectElement).value).toBe('newest');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'A-Level' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByTestId('mock-summary')).toHaveTextContent('2 ชุด · 0 แคมเปญ');
  });

  it('สนามที่ไม่มีชุด → ข้อความว่าง + ปุ่มดูทุกสนาม', async () => {
    const user = userEvent.setup();
    mockSearch = 'venue=tgat';
    (getAllMockExams as jest.Mock).mockResolvedValue([]);
    render(<MockExamList />);
    expect(await screen.findByText('ยังไม่มีชุด Free Mock Exam ในสนามสอบนี้')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ดูทุกสนามสอบ' }));
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams', { scroll: false });
  });

  it('โหลดไม่สำเร็จ → ข้อความ error + ลองใหม่', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getAllMockExams as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    render(<MockExamList />);
    expect(await screen.findByText('โหลดชุด Free Mock Exam ไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByTestId('mock-campaigns-grid')).toBeInTheDocument();
    expect(getAllMockExams).toHaveBeenCalledTimes(2);
  });

  it('แถบล่าง "อยากได้ชุดเพิ่ม..." ปุ่มไป /upgrade', async () => {
    render(<MockExamList />);
    await screen.findByTestId('mock-campaigns-grid');
    const bar = screen.getByRole('complementary', { name: 'ชุดข้อสอบเพิ่มเติม' });
    expect(bar).toHaveTextContent('อยากได้ชุดเพิ่มทุกชุด ทุกวิชา?');
    expect(within(bar).getByRole('link', { name: 'Upgrade เป็น Pro' })).toHaveAttribute('href', '/upgrade');
  });
});
