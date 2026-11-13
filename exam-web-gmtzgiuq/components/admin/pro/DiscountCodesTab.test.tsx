import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import DiscountCodesTab from './DiscountCodesTab';
import {
  createProDiscountCode,
  getProDiscountCodes,
  getProDiscountRedemptions,
  updateProDiscountCode,
  type ProAdminVenue,
  type ProDiscountCode,
} from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';

jest.mock('@/lib/api/pro', () => ({
  getProDiscountCodes: jest.fn(),
  createProDiscountCode: jest.fn(),
  updateProDiscountCode: jest.fn(),
  getProDiscountRedemptions: jest.fn(),
}));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.setTimeout(30000);

const plan = (id: string, rank: number, name: string, isPurchasable = true) => ({
  id,
  venueId: 'v1',
  code: name.toLowerCase(),
  rank,
  name,
  tagline: null,
  priceSatang: rank === 0 ? 0 : 19900,
  priceUnit: null,
  priceNote: null,
  buttonText: '',
  badge: null,
  highlight: false,
  isPurchasable,
  periodDays: 30,
  sortOrder: rank,
  isVisible: true,
  entitlements: { challenge: false, beyond: false, predictedSets: 0, solutions: false, analytics: false, mockPurchase: rank > 0 },
});

const venues: ProAdminVenue[] = [
  {
    id: 'v1',
    key: 'netsat',
    name: 'NETSAT',
    description: null,
    sortOrder: 0,
    isActive: true,
    comparison: { groups: [] },
    plans: [plan('p-free', 0, 'Free'), plan('p-pro', 1, 'PRO'), plan('p-max', 2, 'MAX', false)],
  },
  { id: 'v2', key: 'tgat', name: 'TGAT', description: null, sortOrder: 1, isActive: true, comparison: { groups: [] }, plans: [] },
];

const dc = (patch: Partial<ProDiscountCode> = {}): ProDiscountCode => ({
  id: 'd1',
  code: 'NEWYEAR20',
  description: 'โปรปีใหม่',
  discountType: 'percent',
  discountValue: 20,
  venueId: 'v1',
  planId: 'p-pro',
  venue: null,
  plan: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: 100,
  perUserLimit: 1,
  isActive: true,
  redeemedCount: 3,
  reservedCount: 0,
  status: 'active',
  createdAt: '2026-11-13T00:00:00.000Z',
  updatedAt: '2026-11-13T00:00:00.000Z',
  ...patch,
});

const lastParams = () => (getProDiscountCodes as jest.Mock).mock.calls.at(-1)?.[0];

describe('/admin/pro แท็บโค้ดส่วนลด — DiscountCodesTab (task 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProDiscountCodes as jest.Mock).mockResolvedValue({
      items: [dc(), dc({ id: 'd2', code: 'BAHT50', description: null, discountType: 'amount', discountValue: 5000, venueId: null, planId: null, maxRedemptions: null, perUserLimit: 2, isActive: false, redeemedCount: 0, status: 'inactive' })],
      total: 2,
    });
  });

  it('ตาราง: โค้ด มูลค่า ขอบเขต ช่วงเวลา ใช้แล้ว/สูงสุด สถานะ', async () => {
    render(<DiscountCodesTab venues={venues} />);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const r1 = rows[1];
    expect(within(r1).getByText('NEWYEAR20')).toBeInTheDocument();
    expect(within(r1).getByText('โปรปีใหม่')).toBeInTheDocument();
    expect(within(r1).getByText('20%')).toBeInTheDocument();
    expect(within(r1).getByText('NETSAT · PRO')).toBeInTheDocument();
    expect(within(r1).getByText('ไม่จำกัดเวลา')).toBeInTheDocument();
    expect(within(r1).getByText(/ใช้แล้ว 3 \/ 100/)).toBeInTheDocument();
    expect(within(r1).getByText('ใช้งานได้')).toBeInTheDocument();
    const r2 = rows[2];
    expect(within(r2).getByText('฿50')).toBeInTheDocument();
    expect(within(r2).getByText('จำนวนบาท')).toBeInTheDocument();
    expect(within(r2).getByText('ทุกสนาม')).toBeInTheDocument();
    expect(within(r2).getByText(/ใช้แล้ว 0 \/ ไม่จำกัด/)).toBeInTheDocument();
    expect(within(r2).getByText('บัญชีละ 2 ครั้ง')).toBeInTheDocument();
    expect(within(r2).getByText('ปิดอยู่')).toBeInTheDocument();
    // ตารางกว้าง → scroll ในกรอบของตัวเอง
    expect(screen.getByTestId('discounts-scroll').className).toContain('overflow-x-auto');
  });

  it('รอบ 2: ป้ายสถานะจาก API (used_up) + "ใช้แล้ว N (+R จอง) / max" + คอลัมน์จัดการติดขวา', async () => {
    (getProDiscountCodes as jest.Mock).mockResolvedValue({
      items: [dc({ redeemedCount: 1, reservedCount: 1, maxRedemptions: 2, status: 'used_up' })],
      total: 1,
    });
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    expect(screen.getByTestId('discount-usage')).toHaveTextContent('ใช้แล้ว 1 (+1 จอง) / 2');
    expect(screen.getByText('ใช้ครบแล้ว')).toBeInTheDocument();
    expect(screen.queryByText('ใช้งานได้')).not.toBeInTheDocument();
    const actions = screen.getByTestId('discount-actions');
    expect(actions.className).toContain('sticky');
    expect(actions.className).toContain('right-0');
    expect(actions.className).toContain('dark:bg-gray-800');
    expect(within(actions).getByRole('button', { name: 'แก้โค้ด NEWYEAR20' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'ดูรายการที่ใช้โค้ด NEWYEAR20' })).toBeInTheDocument();
    // ตารางแคบลงให้พอดีพื้นที่เนื้อหาที่ 1280px (~950px)
    expect(screen.getByRole('table').className).toContain('min-w-[880px]');
  });

  it('ตัวกรองสถานะ + ค้นหา (debounce) → query ใหม่ กลับหน้า 1', async () => {
    const user = userEvent.setup();
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('สถานะ'), 'false');
    await waitFor(() => expect(lastParams()).toMatchObject({ isActive: false, page: 1 }));
    await user.type(screen.getByLabelText('ค้นหา'), 'new');
    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'new', isActive: false }));
  });

  it('สร้างโค้ด: validate ในฟอร์ม แล้ว POST ตามสัญญา (บาท → สตางค์, ตัวพิมพ์ใหญ่) + โหลดรายการใหม่', async () => {
    const user = userEvent.setup();
    (createProDiscountCode as jest.Mock).mockResolvedValue(dc({ id: 'd3', code: 'BAHT50' }));
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'สร้างโค้ดส่วนลด' }));
    const dialog = screen.getByRole('dialog', { name: 'สร้างโค้ดส่วนลด' });

    await user.click(within(dialog).getByRole('button', { name: 'สร้างโค้ด' }));
    expect(within(dialog).getByText('กรุณากรอกโค้ด')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^โค้ด/)).toHaveFocus();
    expect(createProDiscountCode).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^โค้ด/), 'baht50');
    await user.click(within(dialog).getByRole('radio', { name: 'จำนวนบาท' }));
    await user.type(within(dialog).getByLabelText(/มูลค่าส่วนลด/), '50');
    await user.selectOptions(within(dialog).getByLabelText('สนาม'), 'v1');
    // แพ็กเกจที่ลดได้ = ไม่ใช่ระดับ 0 (MAX ปิดขายแต่เลือกได้)
    const planSelect = within(dialog).getByLabelText('แพ็กเกจ');
    expect(within(planSelect).queryByRole('option', { name: 'Free' })).not.toBeInTheDocument();
    expect(within(planSelect).getByRole('option', { name: 'MAX (ปิดการขาย)' })).toBeInTheDocument();
    await user.selectOptions(planSelect, 'p-pro');
    fireEvent.change(within(dialog).getByLabelText(/ใช้ได้ถึง/), { target: { value: '2026-12-31T23:59' } });
    await user.type(within(dialog).getByLabelText(/ใช้ได้สูงสุด/), '200');
    await user.click(within(dialog).getByRole('button', { name: 'สร้างโค้ด' }));

    await waitFor(() =>
      expect(createProDiscountCode).toHaveBeenCalledWith({
        code: 'BAHT50',
        description: null,
        discountType: 'amount',
        discountValue: 5000,
        venueId: 'v1',
        planId: 'p-pro',
        startsAt: null,
        endsAt: '2026-12-31T16:59:00.000Z',
        maxRedemptions: 200,
        perUserLimit: 1,
        isActive: true,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('สร้างโค้ด BAHT50 แล้ว');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(getProDiscountCodes).toHaveBeenCalledTimes(2));
  });

  it('โค้ดซ้ำ (409 DISCOUNT_CODE_TAKEN) → error ใต้ช่องโค้ด ฟอร์มยังเปิด', async () => {
    const user = userEvent.setup();
    (createProDiscountCode as jest.Mock).mockRejectedValue(
      new ApiError('โค้ดส่วนลดนี้มีอยู่แล้ว กรุณาใช้โค้ดอื่น', 409, 'DISCOUNT_CODE_TAKEN'),
    );
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'สร้างโค้ดส่วนลด' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^โค้ด/), 'NEWYEAR20');
    await user.type(within(dialog).getByLabelText(/มูลค่าส่วนลด/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'สร้างโค้ด' }));
    expect(await within(dialog).findByText('โค้ดส่วนลดนี้มีอยู่แล้ว กรุณาใช้โค้ดอื่น')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^โค้ด/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('แก้โค้ดที่มีการใช้แล้ว: แจ้งเตือนล่วงหน้า, PUT เฉพาะที่เปลี่ยน, 409 → ข้อความจาก API ในฟอร์ม', async () => {
    const user = userEvent.setup();
    (updateProDiscountCode as jest.Mock).mockRejectedValue(
      new ApiError('โค้ดนี้มีการใช้แล้ว แก้ตัวโค้ด ประเภท หรือมูลค่าส่วนลดไม่ได้ (เปิด/ปิด หรือแก้ส่วนอื่นได้)', 409, 'DISCOUNT_IN_USE'),
    );
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'แก้โค้ด NEWYEAR20' }));
    const dialog = screen.getByRole('dialog', { name: 'แก้โค้ดส่วนลด NEWYEAR20' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('โค้ดนี้มีการใช้แล้ว 3 ครั้ง');
    expect(within(dialog).getByLabelText(/^โค้ด/)).toHaveValue('NEWYEAR20');
    const value = within(dialog).getByLabelText(/มูลค่าส่วนลด/);
    expect(value).toHaveValue('20');
    await user.clear(value);
    await user.type(value, '30');
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProDiscountCode).toHaveBeenCalledWith('d1', { discountValue: 30 }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('โค้ดนี้มีการใช้แล้ว แก้ตัวโค้ด ประเภท หรือมูลค่าส่วนลดไม่ได้');
    expect(within(dialog).getByRole('button', { name: 'บันทึก' })).toBeEnabled();
  });

  it('แก้ส่วนอื่นสำเร็จ → แถวอัปเดตทันที', async () => {
    const user = userEvent.setup();
    (updateProDiscountCode as jest.Mock).mockResolvedValue(dc({ maxRedemptions: 500 }));
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'แก้โค้ด NEWYEAR20' }));
    const dialog = screen.getByRole('dialog');
    const max = within(dialog).getByLabelText(/ใช้ได้สูงสุด/);
    await user.clear(max);
    await user.type(max, '500');
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProDiscountCode).toHaveBeenCalledWith('d1', { maxRedemptions: 500 }));
    expect(await screen.findByText(/3 \/ 500/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ปิดโค้ด → ยืนยันก่อน แล้ว PUT { isActive:false } / ยกเลิกยืนยัน → ไม่เรียก API', async () => {
    const user = userEvent.setup();
    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: false }).mockResolvedValueOnce({ isConfirmed: true });
    (updateProDiscountCode as jest.Mock).mockResolvedValue(dc({ isActive: false, status: 'inactive' }));
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    const toggle = screen.getByRole('switch', { name: 'เปิดใช้งานโค้ด NEWYEAR20' });
    await user.click(toggle);
    expect(updateProDiscountCode).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(() => expect(updateProDiscountCode).toHaveBeenCalledWith('d1', { isActive: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'เปิดใช้งานโค้ด NEWYEAR20' })).toHaveAttribute('aria-checked', 'false'));
  });

  it('ดูรายการที่ใช้: ผู้ใช้ ยอดลด สถานะไทย รหัส payment', async () => {
    const user = userEvent.setup();
    (getProDiscountRedemptions as jest.Mock).mockResolvedValue({
      items: [
        { user: { id: 'u1', email: 'a@x.com', firstName: 'สมชาย', lastName: 'ใจดี' }, paymentId: 'pay_1', amountSatang: 3980, status: 'used', createdAt: '2026-11-13T03:00:00Z' },
        { user: null, paymentId: 'pay_2', amountSatang: 3980, status: 'released', createdAt: '2026-11-12T03:00:00Z' },
      ],
      total: 2,
    });
    render(<DiscountCodesTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'ดูรายการที่ใช้โค้ด NEWYEAR20' }));
    const dialog = screen.getByRole('dialog', { name: 'รายการที่ใช้โค้ด NEWYEAR20' });
    expect(await within(dialog).findByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(getProDiscountRedemptions).toHaveBeenCalledWith('d1', { page: 1, limit: 20 }, expect.any(AbortSignal));
    expect(within(dialog).getAllByText('−฿39.80')).toHaveLength(2);
    expect(within(dialog).getByText('ใช้แล้ว')).toBeInTheDocument();
    expect(within(dialog).getByText('คืนสิทธิ์')).toBeInTheDocument();
    expect(within(dialog).getByText('(ผู้ใช้ถูกลบ)')).toBeInTheDocument();
    expect(within(dialog).getByText('pay_1')).toBeInTheDocument();
    // modal อยู่ใต้ document.body (createPortal)
    expect(dialog.closest('body')).toBe(document.body);
  });

  it('โหลดไม่สำเร็จ → ปุ่มลองใหม่ / ไม่มีโค้ด → ข้อความว่าง', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    (getProDiscountCodes as jest.Mock).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ items: [], total: 0 });
    render(<DiscountCodesTab venues={venues} />);
    await user.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByText('ยังไม่มีโค้ดส่วนลด')).toBeInTheDocument();
  });
});
