import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import AdminUnlockCodesPage from './page';
import { getUnlockBatches, updateUnlockBatch, type UnlockBatch } from '@/lib/api/unlockCodes';

jest.mock('@/lib/api/unlockCodes', () => ({ getUnlockBatches: jest.fn(), updateUnlockBatch: jest.fn() }));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const batch = (patch: Partial<UnlockBatch> = {}): UnlockBatch => ({
  id: 'b1',
  name: 'NETSAT Campaign',
  allMock: false,
  exams: [
    { id: 'e1', title: 'NETSAT Math 1' },
    { id: 'e2', title: 'NETSAT Math 2' },
    { id: 'e3', title: 'NETSAT Math 3' },
  ],
  codeCount: 5000,
  usedCount: 120,
  accessDays: 30,
  codeExpiresAt: null,
  isActive: true,
  createdAt: '2026-11-10T03:00:00.000Z',
  ...patch,
});

const page = (items: UnlockBatch[], extra: object = {}) => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...extra,
});

describe('/admin/unlock-codes (task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUnlockBatches as jest.Mock).mockResolvedValue(
      page([batch(), batch({ id: 'b2', name: 'ทุกชุด', allMock: true, exams: [], isActive: false, codeExpiresAt: '2020-01-01T00:00:00.000Z' })]),
    );
  });

  it('ตารางแคมเปญ: ชื่อ (ลิงก์), ชุดที่ผูก, ใช้แล้ว/ทั้งหมด, อายุสิทธิ์, วันหมดอายุ, สถานะ + ปุ่มสร้างโค้ด', async () => {
    render(<AdminUnlockCodesPage />);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByRole('link', { name: 'NETSAT Campaign' })).toHaveAttribute('href', '/admin/unlock-codes/b1');
    expect(within(rows[0]).getByText('NETSAT Math 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('และอีก 1 ชุด')).toBeInTheDocument();
    expect(within(rows[0]).getByText('120')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/5,000/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('30 วัน')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ไม่กำหนด')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('switch', { name: 'เปิดใช้งานแคมเปญ NETSAT Campaign' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    expect(within(rows[1]).getByText('ทุกชุด Mock Exam')).toBeInTheDocument();
    expect(within(rows[1]).getByText('หมดอายุแล้ว')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    expect(screen.getByRole('link', { name: /สร้างโค้ด/ })).toHaveAttribute('href', '/admin/unlock-codes/new');
    expect(getUnlockBatches).toHaveBeenCalledTimes(1);
    expect(getUnlockBatches).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined }, expect.anything());
  });

  it('ค้นหา (debounce) → เรียก API พร้อม search', async () => {
    const user = userEvent.setup();
    render(<AdminUnlockCodesPage />);
    await screen.findByRole('table');
    (getUnlockBatches as jest.Mock).mockResolvedValue(page([]));
    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาแคมเปญ' }), 'net');
    await waitFor(() =>
      expect(getUnlockBatches).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'net' }, expect.anything()),
    );
    expect(await screen.findByText('ไม่พบแคมเปญที่ค้นหา')).toBeInTheDocument();
  });

  it('ปิดแคมเปญ → ยืนยันก่อน แล้ว PATCH isActive:false อัปเดตแถวทันที / ยกเลิก → ไม่เรียก API', async () => {
    const user = userEvent.setup();
    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: false }).mockResolvedValueOnce({ isConfirmed: true });
    (updateUnlockBatch as jest.Mock).mockResolvedValue(batch({ isActive: false }));
    render(<AdminUnlockCodesPage />);
    const sw = await screen.findByRole('switch', { name: 'เปิดใช้งานแคมเปญ NETSAT Campaign' });

    await user.click(sw);
    expect(Swal.fire).toHaveBeenCalledTimes(1);
    expect(updateUnlockBatch).not.toHaveBeenCalled();

    await user.click(sw);
    await waitFor(() => expect(updateUnlockBatch).toHaveBeenCalledWith('b1', { isActive: false }));
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
  });

  it('เปิดแคมเปญ → ไม่ต้องยืนยัน', async () => {
    const user = userEvent.setup();
    (updateUnlockBatch as jest.Mock).mockResolvedValue(batch({ id: 'b2', isActive: true }));
    render(<AdminUnlockCodesPage />);
    const sw = await screen.findByRole('switch', { name: 'เปิดใช้งานแคมเปญ ทุกชุด' });
    await user.click(sw);
    await waitFor(() => expect(updateUnlockBatch).toHaveBeenCalledWith('b2', { isActive: true }));
    expect(Swal.fire).not.toHaveBeenCalled();
  });

  it('ยังไม่มีแคมเปญ → empty state + ลิงก์สร้าง / โหลดไม่ได้ → ลองใหม่', async () => {
    (getUnlockBatches as jest.Mock).mockResolvedValueOnce(page([]));
    const { unmount } = render(<AdminUnlockCodesPage />);
    expect(await screen.findByText('ยังไม่มีแคมเปญโค้ด')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /สร้างแคมเปญแรก/ })).toHaveAttribute('href', '/admin/unlock-codes/new');
    unmount();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    (getUnlockBatches as jest.Mock).mockRejectedValueOnce(new Error('down'));
    render(<AdminUnlockCodesPage />);
    expect(await screen.findByText('โหลดรายการแคมเปญไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ลองใหม่/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
