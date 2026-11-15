import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PredictedSeriesList from './PredictedSeriesList';
import { deletePredictedSeries, getAdminPredictedSeries, type AdminPredictedSeries } from '@/lib/api/predicted';
import { getProAdminConfig } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/api/predicted', () => ({
  getAdminPredictedSeries: jest.fn(),
  deletePredictedSeries: jest.fn(),
}));
jest.mock('@/lib/api/pro', () => ({ getProAdminConfig: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const series = (patch: Partial<AdminPredictedSeries>): AdminPredictedSeries => ({
  id: 'x',
  title: 'ซีรีส์',
  description: null,
  color: null,
  venueId: 'v1',
  venueKey: 'netsat',
  venueName: 'NETSAT',
  subjectId: null,
  subjectName: null,
  sortOrder: 0,
  isActive: true,
  sets: [],
  setCount: 0,
  updatedAt: null,
  ...patch,
});

const items = [
  series({ id: 'b', title: 'NETSAT PHYSICS', sortOrder: 2, subjectName: 'ฟิสิกส์' }),
  series({ id: 'c', title: 'A-LEVEL MATH', venueId: 'v2', venueKey: 'alevel', venueName: 'A-Level', isActive: false }),
  series({
    id: 'a',
    title: 'NETSAT MATH',
    sortOrder: 1,
    setCount: 4,
    sets: [
      { examId: 'e1', setNo: 1, access: 'free', previewCount: 20, title: '', questionCount: 40, status: null },
      { examId: 'e2', setNo: 2, access: 'pro', previewCount: null, title: '', questionCount: 40, status: null },
    ],
  }),
];

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('link')[0].textContent);

describe('PredictedSeriesList — /admin/predicted (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAdminPredictedSeries as jest.Mock).mockResolvedValue(items);
    (getProAdminConfig as jest.Mock).mockResolvedValue({
      venues: [
        { id: 'v1', key: 'netsat', name: 'NETSAT' },
        { id: 'v2', key: 'alevel', name: 'A-Level' },
      ],
    });
  });

  it('เรียงตามสนาม → ลำดับ + กรองสนาม (aria-pressed) + ลิงก์สร้างพาสนามที่เลือก', async () => {
    const user = userEvent.setup();
    render(<PredictedSeriesList />);
    await waitFor(() => expect(titles()).toEqual(['NETSAT MATH', 'NETSAT PHYSICS', 'A-LEVEL MATH']));
    const row = within(screen.getByRole('row', { name: /NETSAT MATH/ }));
    expect(row.getByText('4 ชุด')).toBeInTheDocument();
    // API รายการไม่ส่งชุด → ไม่แสดงบรรทัด ฟรี/Preview (ข้อมูลไม่ครบ)
    expect(row.queryByText(/ฟรี .* · Preview/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /A-LEVEL MATH/ })).getByText('ปิดอยู่')).toBeInTheDocument();

    const filter = within(screen.getByRole('group', { name: 'กรองตามสนามสอบ' }));
    await user.click(filter.getByRole('button', { name: 'A-Level' }));
    expect(filter.getByRole('button', { name: 'A-Level' })).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['A-LEVEL MATH']);
    expect(screen.getAllByRole('link', { name: 'สร้างซีรีส์' })[0]).toHaveAttribute('href', '/admin/predicted/new?venueId=v2');
  });

  it('ลบ: เปิด modal ของแอป (ไม่ใช่ window.confirm) → ยืนยัน → เรียก API แล้วโหลดใหม่', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm');
    render(<PredictedSeriesList />);
    await user.click(await screen.findByRole('button', { name: 'ลบ NETSAT MATH' }));
    const dialog = screen.getByRole('dialog', { name: 'ลบซีรีส์?' });
    expect(dialog).toHaveTextContent('และเอา 4 ชุดออกจากซีรีส์');
    expect(dialog).toHaveTextContent('ชุดข้อสอบจะไม่ถูกลบ แต่จะกลับเป็นชุดปกติ');
    (deletePredictedSeries as jest.Mock).mockResolvedValue(undefined);
    await user.click(within(dialog).getByRole('button', { name: 'ลบซีรีส์' }));
    await waitFor(() => expect(deletePredictedSeries).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(getAdminPredictedSeries).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ลบไม่สำเร็จ → ข้อความไทยจาก API ใน modal', async () => {
    const user = userEvent.setup();
    (deletePredictedSeries as jest.Mock).mockRejectedValue(new ApiError('ไม่พบซีรีส์', 404));
    render(<PredictedSeriesList />);
    await user.click(await screen.findByRole('button', { name: 'ลบ NETSAT PHYSICS' }));
    const dialog = screen.getByRole('dialog', { name: 'ลบซีรีส์?' });
    await user.click(within(dialog).getByRole('button', { name: 'ลบซีรีส์' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ไม่พบซีรีส์');
  });

  it('ว่าง → ข้อความ + ลิงก์สร้าง / โหลดไม่สำเร็จ → ข้อความไทย + ลองใหม่', async () => {
    const user = userEvent.setup();
    (getAdminPredictedSeries as jest.Mock).mockResolvedValueOnce([]);
    const { unmount } = render(<PredictedSeriesList />);
    expect(await screen.findByText('ยังไม่มีซีรีส์')).toBeInTheDocument();
    unmount();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getAdminPredictedSeries as jest.Mock).mockRejectedValueOnce(new ApiError('Forbidden resource', 403));
    render(<PredictedSeriesList />);
    expect(await screen.findByText('โหลดรายการซีรีส์ไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    await waitFor(() => expect(titles()).toHaveLength(3));
  });
});
