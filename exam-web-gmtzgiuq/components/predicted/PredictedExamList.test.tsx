import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PredictedExamList from './PredictedExamList';
import { getPredicted, type PredictedPageData } from '@/lib/api/predicted';
import { getMyPro } from '@/lib/api/pro';
import { useAuth } from '@/contexts/AuthContext';
import type { PredictedSetSummary } from '@/lib/predicted';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/predicted',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/predicted', () => ({ getPredicted: jest.fn() }));
jest.mock('@/lib/api/pro', () => ({ getMyPro: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const set = (patch: Partial<PredictedSetSummary>): PredictedSetSummary => ({
  setNo: 1,
  examId: 'x',
  title: '',
  questionCount: 40,
  durationMinutes: 90,
  access: 'pro',
  previewCount: null,
  viewerAccess: 'locked',
  myProgress: null,
  status: 'published',
  ...patch,
});

const pageData = (patch: Partial<PredictedPageData> = {}): PredictedPageData => ({
  venue: 'netsat',
  venues: [
    { key: 'netsat', name: 'NETSAT' },
    { key: 'alevel', name: 'A-Level' },
  ],
  subjects: [
    { id: 'math', name: 'คณิต', count: 4 },
    { id: 'phy', name: 'ฟิสิกส์', count: 2 },
  ],
  series: [
    {
      id: 'sr-math',
      title: 'NETSAT MATH JAN PREDICTED',
      description: null,
      color: '#5b4cf0',
      venueKey: 'netsat',
      subject: { id: 'math', name: 'คณิตศาสตร์' },
      sets: [
        set({ setNo: 1, examId: 'm1', access: 'free', previewCount: 20, viewerAccess: 'preview' }),
        set({
          setNo: 2,
          examId: 'm2',
          viewerAccess: 'full',
          myProgress: { status: 'in_progress', mode: 'exam', answered: 3, total: 40, scorePercent: null, attemptId: 'a2' },
        }),
        set({
          setNo: 3,
          examId: 'm3',
          viewerAccess: 'full',
          myProgress: { status: 'completed', mode: 'practice', answered: 40, total: 40, scorePercent: 75, attemptId: 'a3' },
        }),
        set({ setNo: 4, examId: 'm4' }),
      ],
    },
    {
      id: 'sr-phy',
      title: 'NETSAT PHYSICS JAN PREDICTED',
      description: 'ชุดฟิสิกส์',
      color: null,
      venueKey: 'netsat',
      subject: { id: 'phy', name: 'ฟิสิกส์' },
      sets: [set({ setNo: 1, examId: 'p1', viewerAccess: 'full', questionCount: 20 }), set({ setNo: 2, examId: 'p2', questionCount: 20 })],
    },
  ],
  total: 6,
  viewerHasPaidPlan: null,
  ...patch,
});

const card = (title: string) => within(screen.getByRole('article', { name: title }));
const rows = (title: string) => card(title).getAllByTestId('predicted-set-row');

describe('PredictedExamList — หน้า Predicted Exam (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = '';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getPredicted as jest.Mock).mockResolvedValue(pageData());
    (getMyPro as jest.Mock).mockResolvedValue([]);
  });

  it('หัวข้อ + แท็บสนาม (สนามที่ API เลือกเป็น active) + ชิปวิชา "ทั้งหมด 6 ชุด"', async () => {
    render(<PredictedExamList />);
    expect(screen.getByRole('heading', { level: 1, name: 'Predicted Exam' })).toBeInTheDocument();
    await screen.findByTestId('predicted-series-grid');
    const venues = within(screen.getByRole('group', { name: 'เลือกสนามสอบ' }));
    expect(venues.getByRole('button', { name: 'NETSAT' })).toHaveAttribute('aria-pressed', 'true');
    expect(venues.getByRole('button', { name: 'A-Level' })).toHaveAttribute('aria-pressed', 'false');
    const chips = within(screen.getByRole('group', { name: 'เลือกวิชา' }));
    expect(chips.getByRole('button', { name: 'ทั้งหมด 6 ชุด' })).toHaveAttribute('aria-pressed', 'true');
    expect(chips.getByRole('button', { name: 'คณิต' })).toHaveAttribute('aria-pressed', 'false');
    expect(getPredicted).toHaveBeenCalledWith({ venue: undefined, subject: undefined }, expect.anything());
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('การ์ดซีรีส์: ชื่อ + "<วิชา> · N ชุด" + กริด 1 / 2 (lg) คอลัมน์', async () => {
    render(<PredictedExamList />);
    const grid = await screen.findByTestId('predicted-series-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-2');
    expect(card('NETSAT MATH JAN PREDICTED').getByText('คณิตศาสตร์ · 4 ชุด')).toBeInTheDocument();
    expect(card('NETSAT PHYSICS JAN PREDICTED').getByText('ชุดฟิสิกส์')).toBeInTheDocument();
  });

  it('แถวชุด: ป้าย/บรรทัดรอง/ปุ่มตาม viewerAccess + myProgress', async () => {
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    const [r1, r2, r3, r4] = rows('NETSAT MATH JAN PREDICTED').map((r) => within(r));

    expect(r1.getByText('ชุดที่ 1')).toBeInTheDocument();
    expect(r1.getByText('Preview 20 ข้อ จากทั้งหมด 40 ข้อ')).toBeInTheDocument();
    expect(r1.getByText('Preview')).toBeInTheDocument();
    expect(r1.queryByText('Pro')).not.toBeInTheDocument();
    expect(r1.getByRole('link', { name: 'Free NETSAT MATH JAN PREDICTED ชุดที่ 1' })).toHaveAttribute(
      'href',
      '/practice/exam/m1',
    );

    // pro ที่ทำได้เต็ม → ไม่มีป้าย, ค้างโหมด exam → ทำต่อที่ /exam
    expect(r2.getByText('40 ข้อ')).toBeInTheDocument();
    expect(r2.queryByText('Pro')).not.toBeInTheDocument();
    expect(r2.getByRole('link', { name: /^ทำต่อ/ })).toHaveAttribute('href', '/exam/m2');

    expect(r3.getByRole('link', { name: /^ดูผล/ })).toHaveAttribute('href', '/dashboard/history/a3');

    expect(r4.getByText('Pro')).toBeInTheDocument();
    expect(r4.getByRole('link', { name: /^Unlock/ })).toHaveAttribute('href', '/upgrade?venue=netsat');

    const [p1] = rows('NETSAT PHYSICS JAN PREDICTED').map((r) => within(r));
    expect(p1.getByRole('link', { name: /^เริ่มทำ/ })).toHaveAttribute('href', '/practice/exam/p1');
  });

  it('แถบ Upgrade แสดงเมื่อไม่มีแพ็กเกจ / ซ่อนเมื่อมีแพ็กเกจในสนามนี้ (GET /pro/me)', async () => {
    const { unmount } = render(<PredictedExamList />);
    const bar = await screen.findByRole('complementary', { name: 'Upgrade เป็น Pro' });
    expect(bar).toHaveTextContent('Preview ดูได้บางส่วน Upgrade เป็น Pro เพื่อ Unlock ทำได้ทั้งชุด ทุกชุด ทุกสนามสอบ');
    expect(within(bar).getByRole('link', { name: 'Upgrade เป็น Pro' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    unmount();

    (getMyPro as jest.Mock).mockResolvedValue([{ venueKey: 'netsat', status: 'active' }]);
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    await waitFor(() => expect(getMyPro).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Upgrade เป็น Pro' })).not.toBeInTheDocument());
  });

  it('แพ็กเกจของสนามอื่น / หมดอายุ → ยังแสดงแถบ, API บอก viewerHasPaidPlan=true → ซ่อน, guest ไม่เรียก /pro/me', async () => {
    (getMyPro as jest.Mock).mockResolvedValue([
      { venueKey: 'alevel', status: 'active' },
      { venueKey: 'netsat', status: 'expired' },
    ]);
    const { unmount } = render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    await waitFor(() => expect(getMyPro).toHaveBeenCalled());
    expect(screen.getByRole('complementary', { name: 'Upgrade เป็น Pro' })).toBeInTheDocument();
    unmount();

    (getPredicted as jest.Mock).mockResolvedValue(pageData({ viewerHasPaidPlan: true }));
    (getMyPro as jest.Mock).mockClear();
    const second = render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    expect(screen.queryByRole('complementary', { name: 'Upgrade เป็น Pro' })).not.toBeInTheDocument();
    // API บอกสถานะแพ็กเกจแล้ว → ไม่เรียก /pro/me ซ้ำ
    expect(getMyPro).not.toHaveBeenCalled();
    second.unmount();

    (getPredicted as jest.Mock).mockResolvedValue(pageData({ viewerHasPaidPlan: false }));
    const third = render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    expect(screen.getByRole('complementary', { name: 'Upgrade เป็น Pro' })).toBeInTheDocument();
    expect(getMyPro).not.toHaveBeenCalled();
    third.unmount();

    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    (getPredicted as jest.Mock).mockResolvedValue(pageData());
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    expect(getMyPro).not.toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Upgrade เป็น Pro' })).toBeInTheDocument();
  });

  it('เลือกสนาม → ?venue= (ล้างวิชา) / เลือกวิชา → ?subject= / อ่านจาก URL ส่งให้ API', async () => {
    const user = userEvent.setup();
    mockSearch = 'venue=netsat&subject=math';
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    expect(getPredicted).toHaveBeenCalledWith({ venue: 'netsat', subject: 'math' }, expect.anything());
    const chips = within(screen.getByRole('group', { name: 'เลือกวิชา' }));
    expect(chips.getByRole('button', { name: 'คณิต' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(chips.getByRole('button', { name: 'ฟิสิกส์' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/predicted?venue=netsat&subject=phy', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'A-Level' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/predicted?venue=alevel', { scroll: false });
    await user.click(chips.getByRole('button', { name: /^ทั้งหมด/ }));
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/predicted?venue=netsat', { scroll: false });
  });

  it('เลขชุดที่ผู้ใช้เห็น = ลำดับในรายการ (setNo เว้นช่วงก็ไม่เว้น) / ชุดฉบับร่าง (แอดมิน) มีป้ายและไม่มีปุ่ม (Q4/Q5)', async () => {
    (getPredicted as jest.Mock).mockResolvedValue(
      pageData({
        series: [
          {
            ...pageData().series[0],
            sets: [
              set({ setNo: 1, examId: 'g1', viewerAccess: 'full' }),
              set({ setNo: 3, examId: 'g3', viewerAccess: 'full', status: 'draft' }),
              set({ setNo: 5, examId: 'g5', viewerAccess: 'full' }),
            ],
          },
        ],
      }),
    );
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    const [g1, g3, g5] = rows('NETSAT MATH JAN PREDICTED').map((r) => within(r));
    expect(g1.getByText('ชุดที่ 1')).toBeInTheDocument();
    expect(g3.getByText('ชุดที่ 2')).toBeInTheDocument();
    expect(g5.getByText('ชุดที่ 3')).toBeInTheDocument();
    expect(screen.queryByText('ชุดที่ 5')).not.toBeInTheDocument();
    expect(g3.getByText('ฉบับร่าง')).toBeInTheDocument();
    expect(g3.queryByRole('link')).not.toBeInTheDocument();
    expect(g5.getByRole('link', { name: 'เริ่มทำ NETSAT MATH JAN PREDICTED ชุดที่ 3' })).toHaveAttribute('href', '/practice/exam/g5');
    expect(g1.queryByText('ฉบับร่าง')).not.toBeInTheDocument();
  });

  it('attempt Preview เดิม + ตอนนี้ทำได้เต็ม → ปุ่มเริ่มทำ/Free (ไม่ใช่ ดูผล/ทำต่อ ของ Preview) (B1/Q1)', async () => {
    const preview = { mode: 'preview' as const, answered: 5, total: 5, scorePercent: 40, attemptId: 'ap' };
    (getPredicted as jest.Mock).mockResolvedValue(
      pageData({
        series: [
          {
            ...pageData().series[0],
            sets: [
              set({ setNo: 1, examId: 'c1', viewerAccess: 'full', myProgress: { ...preview, status: 'completed' } }),
              set({ setNo: 2, examId: 'c2', access: 'free', viewerAccess: 'full', myProgress: { ...preview, status: 'in_progress' } }),
            ],
          },
        ],
      }),
    );
    render(<PredictedExamList />);
    await screen.findByTestId('predicted-series-grid');
    const [c1, c2] = rows('NETSAT MATH JAN PREDICTED').map((r) => within(r));
    expect(c1.getByRole('link', { name: /^เริ่มทำ/ })).toHaveAttribute('href', '/practice/exam/c1');
    expect(c2.getByRole('link', { name: /^Free/ })).toHaveAttribute('href', '/practice/exam/c2');
    expect(screen.queryByRole('link', { name: /^ดูผล|^ทำต่อ/ })).not.toBeInTheDocument();
  });

  it('สนามไม่มีซีรีส์ → empty state ไม่มีแถบ Upgrade', async () => {
    (getPredicted as jest.Mock).mockResolvedValue(pageData({ series: [], subjects: [], total: 0 }));
    render(<PredictedExamList />);
    expect(await screen.findByText('ยังไม่มีชุด Predicted Exam ในสนามสอบนี้')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Upgrade เป็น Pro' })).not.toBeInTheDocument();
  });

  it('วิชาที่เลือกไม่มีซีรีส์ → ข้อความวิชา + ปุ่มดูทุกวิชา', async () => {
    const user = userEvent.setup();
    mockSearch = 'subject=bio';
    (getPredicted as jest.Mock).mockResolvedValue(pageData({ series: [] }));
    render(<PredictedExamList />);
    expect(await screen.findByText('ยังไม่มีชุด Predicted Exam ของวิชานี้')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ดูทุกวิชา' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/predicted', { scroll: false });
  });

  it('โหลดไม่สำเร็จ → ข้อความ + ลองใหม่', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    (getPredicted as jest.Mock).mockRejectedValueOnce(new Error('down'));
    render(<PredictedExamList />);
    expect(await screen.findByText('โหลดชุด Predicted Exam ไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByTestId('predicted-series-grid')).toBeInTheDocument();
    expect(getPredicted).toHaveBeenCalledTimes(2);
  });
});
