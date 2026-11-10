import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import UnlockBatchDetail from './UnlockBatchDetail';
import {
  downloadUnlockBatchCsv,
  getUnlockBatch,
  getUnlockBatchCodes,
  updateUnlockBatch,
  updateUnlockCode,
  type UnlockBatch,
  type UnlockCode,
} from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';

jest.mock('@/lib/api/unlockCodes', () => ({
  downloadUnlockBatchCsv: jest.fn(),
  getUnlockBatch: jest.fn(),
  getUnlockBatchCodes: jest.fn(),
  updateUnlockBatch: jest.fn(),
  updateUnlockCode: jest.fn(),
}));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const batch: UnlockBatch = {
  id: 'b1',
  name: 'NETSAT Campaign',
  allMock: false,
  exams: [
    { id: 'e1', title: 'NETSAT Math 1' },
    { id: 'e2', title: 'NETSAT Math 2' },
  ],
  codeCount: 5000,
  usedCount: 2,
  accessDays: 30,
  codeExpiresAt: '2026-11-30T16:59:00.000Z',
  isActive: true,
  createdAt: '2026-11-10T03:00:00.000Z',
};

const codes: UnlockCode[] = [
  {
    id: 'c1',
    code: 'ABCD2345',
    isActive: true,
    usedAt: '2026-11-10T05:30:00.000Z',
    usedBy: { id: 'u1', email: 'a@example.com', firstName: 'สมชาย', lastName: 'ใจดี' },
  },
  { id: 'c2', code: 'EFGH6789', isActive: false, usedAt: null, usedBy: null },
];

const codesPage = (items: UnlockCode[], extra: object = {}) => ({
  items,
  total: items.length,
  page: 1,
  limit: 50,
  totalPages: 1,
  ...extra,
});

async function renderPage() {
  await act(async () => {
    render(<UnlockBatchDetail id="b1" />);
  });
}

describe('/admin/unlock-codes/[id] — UnlockBatchDetail (task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUnlockBatch as jest.Mock).mockResolvedValue(batch);
    (getUnlockBatchCodes as jest.Mock).mockResolvedValue(codesPage(codes));
  });

  it('สรุป: ชื่อ, ตัวเลข, ชุดที่ผูก (ลิงก์ไปแก้ชุด), วันหมดอายุโค้ด, สวิตช์แคมเปญ', async () => {
    await renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'NETSAT Campaign' })).toBeInTheDocument();
    expect(screen.getByText('โค้ดทั้งหมด').nextSibling).toHaveTextContent('5,000');
    expect(screen.getByText('ใช้แล้ว', { selector: 'dt' }).nextSibling).toHaveTextContent('2');
    expect(screen.getByText('ยังไม่ใช้', { selector: 'dt' }).nextSibling).toHaveTextContent('4,998');
    expect(screen.getByText('อายุสิทธิ์').nextSibling).toHaveTextContent('30 วัน');
    expect(screen.getByRole('link', { name: 'NETSAT Math 2' })).toHaveAttribute('href', '/admin/exams/e2/edit');
    expect(screen.getByRole('switch', { name: 'เปิดใช้งานแคมเปญนี้' })).toHaveAttribute('aria-checked', 'true');
    // ฟอร์มแก้ไขแสดงวันหมดอายุเป็นเวลาไทย
    expect(screen.getByLabelText(/วันหมดอายุของโค้ด/)).toHaveValue('2026-11-30T23:59');
  });

  it('ตารางโค้ด: โค้ด สถานะ ผู้ใช้ (อีเมล ชื่อ) เวลาที่ใช้ และสวิตช์ปิดโค้ด', async () => {
    await renderPage();
    const table = await screen.findByRole('table');
    const [, used, unused] = within(table).getAllByRole('row');
    expect(within(used).getByText('ABCD2345')).toBeInTheDocument();
    expect(within(used).getByText('ใช้แล้ว')).toBeInTheDocument();
    expect(within(used).getByText('a@example.com')).toBeInTheDocument();
    expect(within(used).getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(within(used).getByText(/10 พ\.ย\. 2569/)).toBeInTheDocument();
    expect(within(unused).getByText('ยังไม่ใช้')).toBeInTheDocument();
    expect(within(unused).getByText('ปิด', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(within(unused).getByRole('switch', { name: 'เปิดใช้งานโค้ด EFGH6789' })).toHaveAttribute('aria-checked', 'false');
    expect(getUnlockBatchCodes).toHaveBeenCalledWith('b1', { status: 'all', search: undefined, page: 1, limit: 50 }, expect.anything());
  });

  it('กรองสถานะ / ค้นหาโค้ด / แบ่งหน้า → เรียก API ตามเงื่อนไข', async () => {
    const user = userEvent.setup();
    (getUnlockBatchCodes as jest.Mock).mockResolvedValue(codesPage(codes, { total: 120, totalPages: 3 }));
    await renderPage();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'ใช้แล้ว' }));
    expect(screen.getByRole('button', { name: 'ใช้แล้ว' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(getUnlockBatchCodes).toHaveBeenLastCalledWith('b1', { status: 'used', search: undefined, page: 1, limit: 50 }, expect.anything()),
    );

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await waitFor(() =>
      expect(getUnlockBatchCodes).toHaveBeenLastCalledWith('b1', { status: 'used', search: undefined, page: 2, limit: 50 }, expect.anything()),
    );

    await screen.findByRole('table');
    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาโค้ดหรืออีเมล' }), 'abc');
    expect(screen.getByRole('searchbox', { name: 'ค้นหาโค้ดหรืออีเมล' })).toHaveValue('abc');
    await waitFor(() =>
      expect(getUnlockBatchCodes).toHaveBeenLastCalledWith('b1', { status: 'used', search: 'abc', page: 1, limit: 50 }, expect.anything()),
    );
  });

  it('ปิดโค้ด → PATCH แล้วสวิตช์เปลี่ยนทันที', async () => {
    const user = userEvent.setup();
    (updateUnlockCode as jest.Mock).mockResolvedValue({ ...codes[0], isActive: false });
    await renderPage();
    const sw = await screen.findByRole('switch', { name: 'เปิดใช้งานโค้ด ABCD2345' });
    await user.click(sw);
    expect(updateUnlockCode).toHaveBeenCalledWith('c1', { isActive: false });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
  });

  it('ปิดแคมเปญ → ยืนยัน → PATCH + แสดงแถบ "แคมเปญนี้ปิดอยู่"', async () => {
    const user = userEvent.setup();
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    (updateUnlockBatch as jest.Mock).mockResolvedValue({ ...batch, isActive: false });
    await renderPage();
    await user.click(await screen.findByRole('switch', { name: 'เปิดใช้งานแคมเปญนี้' }));
    await waitFor(() => expect(updateUnlockBatch).toHaveBeenCalledWith('b1', { isActive: false }));
    expect(await screen.findByText(/แคมเปญนี้ปิดอยู่/)).toBeInTheDocument();
  });

  it('แก้ชื่อ + ล้างวันหมดอายุ → PATCH เฉพาะที่เปลี่ยน (codeExpiresAt: null)', async () => {
    const user = userEvent.setup();
    (updateUnlockBatch as jest.Mock).mockResolvedValue({ ...batch, name: 'ชื่อใหม่', codeExpiresAt: null });
    await renderPage();
    const save = await screen.findByRole('button', { name: 'บันทึก' });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText('ชื่อแคมเปญ');
    await user.clear(name);
    await user.type(name, 'ชื่อใหม่');
    await user.click(screen.getByRole('button', { name: 'ไม่หมดอายุ' }));
    await user.click(save);
    await waitFor(() => expect(updateUnlockBatch).toHaveBeenCalledWith('b1', { name: 'ชื่อใหม่', codeExpiresAt: null }));
    expect(await screen.findByRole('heading', { level: 1, name: 'ชื่อใหม่' })).toBeInTheDocument();
  });

  it('เปลี่ยนวันหมดอายุอย่างเดียว → ส่ง ISO ตามเวลาไทย', async () => {
    const user = userEvent.setup();
    (updateUnlockBatch as jest.Mock).mockResolvedValue(batch);
    await renderPage();
    fireEvent.change(await screen.findByLabelText(/วันหมดอายุของโค้ด/), { target: { value: '2026-12-31T23:59' } });
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() =>
      expect(updateUnlockBatch).toHaveBeenCalledWith('b1', { codeExpiresAt: '2026-12-31T16:59:00.000Z' }),
    );
  });

  it('ดาวน์โหลด CSV → เรียก API แล้วสร้างลิงก์ดาวน์โหลดชื่อไฟล์จาก API', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['﻿code,status\n'], { type: 'text/csv' });
    (downloadUnlockBatchCsv as jest.Mock).mockResolvedValue({ blob, filename: 'NETSAT Campaign.csv' });
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('NETSAT Campaign.csv');
      expect(this.href).toBe('blob:x');
    });
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /ดาวน์โหลด CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(downloadUnlockBatchCsv).toHaveBeenCalledWith('b1', 'NETSAT Campaign');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    click.mockRestore();
  });

  it('ไม่พบแคมเปญ (404) → ข้อความ + ลิงก์กลับ', async () => {
    (getUnlockBatch as jest.Mock).mockRejectedValue(new ApiError('Not Found', 404, null));
    await renderPage();
    expect(await screen.findByRole('heading', { name: 'ไม่พบแคมเปญนี้' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปรายการแคมเปญ' })).toHaveAttribute('href', '/admin/unlock-codes');
  });
});
