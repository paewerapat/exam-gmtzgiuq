import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockExamList from './MockExamList';
import { getMockExamCategories, getMockExams, type MockExamSummary } from '@/lib/api/exams';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/mock-exams',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/exams', () => ({ getMockExams: jest.fn(), getMockExamCategories: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const item = (patch: Partial<MockExamSummary>): MockExamSummary => ({
  id: 'x',
  title: 'ชุด',
  category: 'tgat',
  categoryName: 'TGAT',
  subjectId: null,
  subjectName: null,
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 60,
  level: null,
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  ...patch,
});

const three = [
  item({ id: 'f', title: 'ชุดฟรี', category: 'tgat', subjectName: 'ภาษาอังกฤษ' }),
  item({
    id: 'c',
    title: 'ชุดโค้ด',
    category: 'alevel',
    categoryName: 'A-Level',
    accessType: 'code',
    durationMinutes: null,
  }),
  item({
    id: 'p',
    title: 'ชุดซื้อ',
    category: 'onet',
    categoryName: null,
    accessType: 'purchase',
    price: 150,
    questionCount: 25,
  }),
];

const page = (items: MockExamSummary[]) => ({ items, total: items.length, page: 1, limit: 12, totalPages: 1 });

describe('MockExamList (task 11 AC3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = '';
    (getMockExams as jest.Mock).mockResolvedValue(page(three));
    (getMockExamCategories as jest.Mock).mockResolvedValue([
      { name: 'TGAT', slug: 'tgat', count: 1 },
      { name: 'A-Level', slug: 'alevel', count: 1 },
      { name: 'onet', slug: 'onet', count: 1 },
    ]);
  });

  it('แสดงการ์ด 3 ใบ ป้าย ฟรี / Campaign / 150 บาท และข้อมูลบนการ์ด', async () => {
    render(<MockExamList />);
    const grid = await screen.findByTestId('mock-exam-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-3');

    const links = within(grid).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/mock-exams/f',
      '/dashboard/mock-exams/c',
      '/dashboard/mock-exams/p',
    ]);
    expect(screen.getAllByTestId('mock-access-badge').map((b) => b.textContent)).toEqual(['ฟรี', 'Campaign', '150 บาท']);

    const free = links[0];
    // "สนามสอบ · วิชา" = categoryName · subjectName (ไม่มี categoryName → slug)
    expect(within(free).getByText('TGAT · ภาษาอังกฤษ')).toBeInTheDocument();
    expect(within(links[1]).getByText('A-Level', { selector: 'p > span' })).toBeInTheDocument();
    expect(within(links[2]).getByText('onet', { selector: 'p > span' })).toBeInTheDocument();
    expect(within(free).getByText('40 ข้อ · 60 นาที')).toBeInTheDocument();
    expect(within(links[1]).getByText('40 ข้อ · ไม่จับเวลา')).toBeInTheDocument();
    expect(within(links[2]).getByText('25 ข้อ · 60 นาที')).toBeInTheDocument();
    expect(getMockExams).toHaveBeenCalledWith({ category: undefined, page: 1, limit: 12 }, expect.anything());
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('ดรอปดาวน์ "เลือกสนามสอบ" แสดง name และเลือกแล้วเก็บ slug ใน ?category=', async () => {
    const user = userEvent.setup();
    render(<MockExamList />);
    const select = screen.getByLabelText('เลือกสนามสอบ');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'A-Level (1)' })).toBeInTheDocument());
    expect(within(select).getByRole('option', { name: 'เลือกสนามสอบ: ทั้งหมด' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'onet (1)' })).toBeInTheDocument();

    await user.selectOptions(select, 'alevel');
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams?category=alevel', { scroll: false });
  });

  it('อ่าน ?category= จาก URL แล้วกรองผ่าน API', async () => {
    mockSearch = 'category=alevel';
    (getMockExams as jest.Mock).mockResolvedValue(page([three[1]]));
    render(<MockExamList />);
    await screen.findByTestId('mock-exam-grid');
    expect(getMockExams).toHaveBeenCalledWith({ category: 'alevel', page: 1, limit: 12 }, expect.anything());
    expect((screen.getByLabelText('เลือกสนามสอบ') as HTMLSelectElement).value).toBe('alevel');
  });

  it('สนามสอบที่ไม่มีชุด → ข้อความว่าง', async () => {
    mockSearch = 'category=tgat';
    (getMockExams as jest.Mock).mockResolvedValue(page([]));
    render(<MockExamList />);
    expect(await screen.findByText('ยังไม่มีชุด Mock Exam ในสนามสอบนี้')).toBeInTheDocument();
  });

  it('โหลดไม่สำเร็จ → ข้อความ error + ลองใหม่', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getMockExams as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    render(<MockExamList />);
    expect(await screen.findByText('โหลดชุด Mock Exam ไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByTestId('mock-exam-grid')).toBeInTheDocument();
    expect(getMockExams).toHaveBeenCalledTimes(2);
  });
});
