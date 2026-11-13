import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentsTab from './PaymentsTab';
import { getProAdminPayments, type ProAdminPayment, type ProAdminVenue } from '@/lib/api/pro';

jest.mock('@/lib/api/pro', () => ({ getProAdminPayments: jest.fn() }));
jest.setTimeout(30000);

const venues: ProAdminVenue[] = [
  { id: 'v1', key: 'netsat', name: 'NETSAT', description: null, sortOrder: 0, isActive: true, comparison: { groups: [] }, plans: [] },
  { id: 'v2', key: 'tgat', name: 'TGAT', description: null, sortOrder: 1, isActive: true, comparison: { groups: [] }, plans: [] },
];

const pay = (patch: Partial<ProAdminPayment> = {}): ProAdminPayment => ({
  id: 'a1',
  user: { id: 'u1', email: 'a@x.com', firstName: 'สมชาย', lastName: 'ใจดี' },
  venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
  plan: { id: 'p1', code: 'pro', name: 'PRO' },
  method: 'card',
  status: 'successful',
  isRenewal: true,
  totalSatang: 21293,
  vatSatang: 1393,
  omiseChargeId: 'chrg_test_5xyz',
  failureMessage: null,
  paidAt: '2026-11-13T03:00:00Z',
  createdAt: '2026-11-13T03:00:00Z',
  refundRequired: false,
  discountSatang: 0,
  discountCode: null,
  ...patch,
});

const lastParams = () => (getProAdminPayments as jest.Mock).mock.calls.at(-1)?.[0];

describe('/admin/pro แท็บการชำระเงิน — PaymentsTab (task 18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProAdminPayments as jest.Mock).mockResolvedValue({
      items: [
        pay(),
        pay({ id: 'a2', user: null, method: 'promptpay', status: 'failed', isRenewal: false, vatSatang: 0, totalSatang: 19900, omiseChargeId: null, failureMessage: 'QR หมดอายุ', paidAt: null }),
      ],
      total: 2,
    });
  });

  it('ตาราง: ผู้ชำระ สนาม/แพ็กเกจ วิธี (ต่ออายุอัตโนมัติ) ยอด + VAT สถานะไทย รหัสอ้างอิง', async () => {
    render(<PaymentsTab venues={venues} />);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const r1 = rows[1];
    expect(within(r1).getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(within(r1).getByText('a@x.com')).toBeInTheDocument();
    expect(within(r1).getByText('บัตรเครดิต/เดบิต')).toBeInTheDocument();
    expect(within(r1).getByText('ต่ออายุอัตโนมัติ')).toBeInTheDocument();
    expect(within(r1).getByText('฿212.93')).toBeInTheDocument();
    expect(within(r1).getByText('VAT ฿13.93')).toBeInTheDocument();
    expect(within(r1).getByText('สำเร็จ')).toBeInTheDocument();
    expect(within(r1).getByText('chrg_test_5xyz')).toBeInTheDocument();
    const r2 = rows[2];
    expect(within(r2).getByText('(ผู้ใช้ถูกลบ)')).toBeInTheDocument();
    expect(within(r2).getByText('PromptPay')).toBeInTheDocument();
    expect(within(r2).getByText('ไม่มี VAT')).toBeInTheDocument();
    expect(within(r2).getByText('ไม่สำเร็จ')).toBeInTheDocument();
    expect(within(r2).getByText('QR หมดอายุ')).toBeInTheDocument();
    expect(screen.getByText('ทั้งหมด 2 รายการ')).toBeInTheDocument();
    // ตารางกว้าง scroll ในกรอบตัวเอง
    expect(screen.getByTestId('payments-scroll')).toHaveClass('overflow-x-auto');
  });

  it('refundRequired → ป้าย "ต้องคืนเงินใน Opn" เฉพาะแถวนั้น / ไอคอนค้นหามีสี dark (round 2)', async () => {
    (getProAdminPayments as jest.Mock).mockResolvedValue({
      items: [pay(), pay({ id: 'a3', refundRequired: true, omiseChargeId: 'chrg_test_refund' })],
      total: 2,
    });
    render(<PaymentsTab venues={venues} />);
    const table = await screen.findByRole('table');
    const [, r1, r2] = within(table).getAllByRole('row');
    expect(within(r1).queryByText('ต้องคืนเงินใน Opn')).not.toBeInTheDocument();
    expect(within(r2).getByText('ต้องคืนเงินใน Opn')).toHaveClass('dark:bg-red-500');
    expect(screen.getAllByTestId('refund-required')).toHaveLength(1);
    const icon = screen.getByLabelText('ค้นหา').parentElement?.querySelector('svg');
    expect(icon?.getAttribute('class')).toMatch(/dark:text-gray-500/);
  });

  it('ตัวกรอง: สถานะ วิธี สนาม ค้นหา (debounce) → ส่งไป API และกลับหน้า 1', async () => {
    const user = userEvent.setup();
    render(<PaymentsTab venues={venues} />);
    await screen.findByRole('table');
    expect(lastParams()).toEqual({ page: 1, limit: 20, status: undefined, method: undefined, venueId: undefined, search: undefined });

    await user.selectOptions(screen.getByLabelText('สถานะ'), 'failed');
    await user.selectOptions(screen.getByLabelText('วิธีชำระ'), 'promptpay');
    await user.selectOptions(screen.getByLabelText('สนาม'), 'v2');
    await user.type(screen.getByLabelText('ค้นหา'), 'chrg_');
    await waitFor(() =>
      expect(lastParams()).toEqual({ page: 1, limit: 20, status: 'failed', method: 'promptpay', venueId: 'v2', search: 'chrg_' }),
    );
  });

  it('ไม่มีรายการตามตัวกรอง / โหลดไม่สำเร็จ → ลองใหม่', async () => {
    const user = userEvent.setup();
    (getProAdminPayments as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });
    const { unmount } = render(<PaymentsTab venues={venues} />);
    expect(await screen.findByText('ยังไม่มีการชำระเงิน')).toBeInTheDocument();
    unmount();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getProAdminPayments as jest.Mock).mockRejectedValueOnce(new Error('x'));
    render(<PaymentsTab venues={venues} />);
    await user.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('คอลัมน์ส่วนลด (task 19): ยอดลด + โค้ด / ไม่มีส่วนลด → "-"', async () => {
    (getProAdminPayments as jest.Mock).mockResolvedValue({
      items: [pay({ discountSatang: 3980, discountCode: 'NEWYEAR20', totalSatang: 17034 }), pay({ id: 'a2' })],
      total: 2,
    });
    render(<PaymentsTab venues={venues} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'ส่วนลด' })).toBeInTheDocument();
    const cells = screen.getAllByTestId('payment-discount');
    expect(cells[0]).toHaveTextContent('−฿39.80');
    expect(cells[0]).toHaveTextContent('NEWYEAR20');
    expect(cells[1]).toHaveTextContent('-');
    expect(cells[1]).not.toHaveTextContent('฿');
  });

  it('สถานะ canceled (task 19 รอบ 2): ป้าย "ยกเลิกแล้ว" + เหตุผลสีเทา และกรองด้วยสถานะนี้ได้', async () => {
    const user = userEvent.setup();
    (getProAdminPayments as jest.Mock).mockResolvedValue({
      items: [pay({ status: 'canceled', method: 'promptpay', failureMessage: 'ถูกแทนที่ด้วยรายการชำระใหม่', paidAt: null, omiseChargeId: 'chrg_old' })],
      total: 1,
    });
    render(<PaymentsTab venues={venues} />);
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    const badge = within(row).getByText('ยกเลิกแล้ว');
    expect(badge.className).toContain('dark:text-gray-300');
    expect(within(row).getByText('ถูกแทนที่ด้วยรายการชำระใหม่').className).toContain('text-gray-600');
    await user.selectOptions(screen.getByLabelText('สถานะ'), 'canceled');
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'canceled', page: 1 }));
  });

  it('ต้องคืนเงิน + มีส่วนลด (task 19 รอบ 3) → "(ไม่นับสิทธิ์)" ข้างส่วนลด / แถวปกติไม่มี', async () => {
    (getProAdminPayments as jest.Mock).mockResolvedValue({
      items: [
        pay({ refundRequired: true, discountSatang: 5000, discountCode: 'BAHT50' }),
        pay({ id: 'a2', discountSatang: 5000, discountCode: 'BAHT50' }),
      ],
      total: 2,
    });
    render(<PaymentsTab venues={venues} />);
    await screen.findByRole('table');
    const cells = screen.getAllByTestId('payment-discount');
    expect(cells[0]).toHaveTextContent('(ไม่นับสิทธิ์)');
    expect(within(cells[0]).getByTestId('discount-not-counted').className).toContain('dark:text-amber-300');
    expect(cells[1]).not.toHaveTextContent('ไม่นับสิทธิ์');
    expect(screen.getByTestId('refund-required')).toBeInTheDocument();
  });
});
