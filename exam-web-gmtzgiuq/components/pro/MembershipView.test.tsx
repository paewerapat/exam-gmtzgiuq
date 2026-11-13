import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import MembershipView from './MembershipView';
import {
  cancelProRenewal,
  changeProCard,
  getMyPro,
  getMyProPayments,
  type ProMeItem,
  type ProMyPayment,
} from '@/lib/api/pro';
import { useAuth } from '@/contexts/AuthContext';
import { resetOmiseLoaderForTest, type OmiseCardOpenOptions } from '@/lib/omise';

jest.mock('@/lib/api/pro', () => ({
  getMyPro: jest.fn(),
  getMyProPayments: jest.fn(),
  cancelProRenewal: jest.fn(),
  changeProCard: jest.fn(),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const FUTURE = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

const sub = (patch: Partial<ProMeItem> = {}): ProMeItem => ({
  id: 's-card',
  venueId: 'v1',
  venueKey: 'netsat',
  venueName: 'NETSAT',
  planId: 'p-pro',
  planCode: 'pro',
  planName: 'PRO',
  status: 'active',
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: FUTURE,
  autoRenew: true,
  source: 'card',
  cardBrand: 'Visa',
  cardLastDigits: '4242',
  canceledAt: null,
  renewalFailedAt: null,
  ...patch,
});

const payment = (patch: Partial<ProMyPayment> = {}): ProMyPayment => ({
  id: 'pay1',
  status: 'successful',
  method: 'card',
  isRenewal: false,
  subtotalSatang: 19900,
  vatSatang: 1393,
  totalSatang: 21293,
  failureMessage: null,
  paidAt: '2026-11-13T03:00:00Z',
  createdAt: '2026-11-13T03:00:00Z',
  subscriptionId: 's-card',
  plan: { id: 'p-pro', name: 'PRO' },
  venue: { id: 'v1', name: 'NETSAT' },
  refundRequired: false,
  ...patch,
});

const subs = () => [
  sub(),
  sub({ id: 's-pp', venueId: 'v2', venueKey: 'tgat', venueName: 'TGAT', planId: 'p-tgat', planName: 'TGAT PRO', autoRenew: false, source: 'promptpay', cardBrand: null, cardLastDigits: null }),
];

describe('/dashboard/membership — MembershipView (task 18)', () => {
  const originalKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOmiseLoaderForTest();
    delete window.OmiseCard;
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = 'pkey_test_dummy';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getMyPro as jest.Mock).mockResolvedValue(subs());
    (getMyProPayments as jest.Mock).mockResolvedValue({ items: [payment()], total: 1 });
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = originalKey;
  });

  it('แสดงแพ็กเกจต่อสนาม: วันหมด วิธีชำระ บัตร •••• 4242 การต่ออายุ และปุ่มตามวิธีชำระ', async () => {
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    expect(within(card).getByRole('heading', { name: 'PRO' })).toBeInTheDocument();
    expect(within(card).getByTestId('card-label')).toHaveTextContent('Visa •••• 4242');
    expect(within(card).getByText('บัตรเครดิต/เดบิต')).toBeInTheDocument();
    expect(within(card).getByText(/^อัตโนมัติ · ตัดบัตรครั้งถัดไป /)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'ยกเลิกการต่ออายุ' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'เปลี่ยนบัตร' })).toBeEnabled();
    expect(within(card).queryByRole('link', { name: 'ต่ออายุ' })).not.toBeInTheDocument();

    const pp = screen.getByTestId('membership-tgat');
    expect(within(pp).getByText('PromptPay')).toBeInTheDocument();
    expect(within(pp).getByText('ชำระทีละรอบ (กดต่ออายุเอง)')).toBeInTheDocument();
    expect(within(pp).getByRole('link', { name: 'ต่ออายุ' })).toHaveAttribute('href', '/upgrade/checkout?plan=p-tgat');
    expect(within(pp).queryByRole('button', { name: 'ยกเลิกการต่ออายุ' })).not.toBeInTheDocument();
    expect(within(pp).queryByRole('button', { name: 'เปลี่ยนบัตร' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('ยกเลิกต่ออายุ: ยืนยันก่อน → เรียก API → แสดงยกเลิกแล้ว + ปุ่มต่ออายุ', async () => {
    const user = userEvent.setup();
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    (cancelProRenewal as jest.Mock).mockResolvedValue(undefined);
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    await user.click(within(card).getByRole('button', { name: 'ยกเลิกการต่ออายุ' }));
    expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'ยกเลิกการต่ออายุอัตโนมัติ?' }));
    await waitFor(() => expect(cancelProRenewal).toHaveBeenCalledWith('s-card'));
    expect(await within(card).findByText('ยกเลิกการต่ออายุแล้ว')).toBeInTheDocument();
    expect(within(card).getByText('สิทธิ์ใช้ได้ถึงวันหมดอายุ จะไม่ถูกตัดบัตรอีก')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'ยกเลิกการต่ออายุ' })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'ต่ออายุ' })).toHaveAttribute('href', '/upgrade/checkout?plan=p-pro');
    expect(toast.success).toHaveBeenCalledWith('ยกเลิกการต่ออายุแล้ว');
  });

  it('ยกเลิกต่ออายุ: กดยกเลิกในกล่องยืนยัน → ไม่เรียก API', async () => {
    const user = userEvent.setup();
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: false });
    render(<MembershipView />);
    await user.click(within(await screen.findByTestId('membership-netsat')).getByRole('button', { name: 'ยกเลิกการต่ออายุ' }));
    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect(cancelProRenewal).not.toHaveBeenCalled();
  });

  it('เปลี่ยนบัตร: เปิด OmiseCard (ซ่อนยอด) → ส่ง token → โหลดสถานะจาก server ใหม่ → เลขท้ายใหม่', async () => {
    const user = userEvent.setup();
    const omise = {
      configure: jest.fn(),
      open: jest.fn((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('tokn_new')),
    };
    window.OmiseCard = omise;
    (changeProCard as jest.Mock).mockResolvedValue({ cardBrand: 'MasterCard', cardLastDigits: '5454', autoRenewFailed: [] });
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    (getMyPro as jest.Mock).mockResolvedValue([sub({ cardBrand: 'MasterCard', cardLastDigits: '5454' }), subs()[1]]);
    await user.click(within(card).getByRole('button', { name: 'เปลี่ยนบัตร' }));
    await waitFor(() => expect(changeProCard).toHaveBeenCalledWith('s-card', 'tokn_new'));
    expect(omise.open).toHaveBeenCalledWith(expect.objectContaining({ hideAmount: 'true', submitLabel: 'บันทึกบัตร' }));
    await waitFor(() => expect(getMyPro).toHaveBeenCalledTimes(2));
    expect(within(await screen.findByTestId('membership-netsat')).getByTestId('card-label')).toHaveTextContent('MasterCard •••• 5454');
    expect(toast.success).toHaveBeenCalledWith('เปลี่ยนเป็นบัตร MasterCard •••• 5454 แล้ว');
    expect(screen.queryByText('เปลี่ยนบัตรแล้ว แต่ตั้งต่ออายุอัตโนมัติด้วยบัตรใหม่ไม่สำเร็จ')).not.toBeInTheDocument();
  });

  it('เปลี่ยนบัตร: autoRenewFailed ไม่ว่าง → โหลดใหม่ + คำเตือนไทยว่าปิดต่ออายุของแพ็กเกจนั้นแล้ว (round 2)', async () => {
    const user = userEvent.setup();
    window.OmiseCard = { configure: jest.fn(), open: jest.fn((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('tokn_new')) };
    (changeProCard as jest.Mock).mockResolvedValue({ cardBrand: 'Visa', cardLastDigits: '1111', autoRenewFailed: ['s-card'] });
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    (getMyPro as jest.Mock).mockResolvedValue([sub({ autoRenew: false, cardLastDigits: '1111' }), subs()[1]]);
    await user.click(within(card).getByRole('button', { name: 'เปลี่ยนบัตร' }));
    const warn = await screen.findByText('เปลี่ยนบัตรแล้ว แต่ตั้งต่ออายุอัตโนมัติด้วยบัตรใหม่ไม่สำเร็จ');
    expect(warn.closest('[role="alert"]')).toHaveTextContent('ปิดการต่ออายุอัตโนมัติของ NETSAT · PRO แล้ว');
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(getMyPro).toHaveBeenCalledTimes(2));
    const reloaded = await screen.findByTestId('membership-netsat');
    expect(within(reloaded).getByRole('link', { name: 'ต่ออายุ' })).toBeInTheDocument();
    expect(within(reloaded).queryByRole('button', { name: 'ยกเลิกการต่ออายุ' })).not.toBeInTheDocument();
  });

  it('เปลี่ยนบัตร: ปิดหน้าต่าง → ไม่เรียก API / ไม่มี public key → ปุ่มกดไม่ได้ + ข้อความ', async () => {
    const user = userEvent.setup();
    window.OmiseCard = { configure: jest.fn(), open: jest.fn((opts: OmiseCardOpenOptions) => opts.onFormClosed?.()) };
    const { unmount } = render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    await user.click(within(card).getByRole('button', { name: 'เปลี่ยนบัตร' }));
    await waitFor(() => expect(within(card).getByRole('button', { name: 'เปลี่ยนบัตร' })).toBeEnabled());
    expect(changeProCard).not.toHaveBeenCalled();
    unmount();

    delete process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    render(<MembershipView />);
    const card2 = await screen.findByTestId('membership-netsat');
    expect(within(card2).getByRole('button', { name: 'เปลี่ยนบัตร' })).toBeDisabled();
    expect(within(card2).getByText('เปลี่ยนบัตร: ระบบชำระเงินยังไม่พร้อม')).toBeInTheDocument();
  });

  it('ตัดบัตรรอบต่ออายุไม่สำเร็จ (renewalFailedAt จาก API, autoRenew ปิด) → คำเตือนตรงกัน ไม่มี "ตัดบัตรครั้งถัดไป" มีปุ่มต่ออายุ', async () => {
    (getMyPro as jest.Mock).mockResolvedValue([sub({ autoRenew: false, renewalFailedAt: '2026-11-14T00:00:00Z' })]);
    (getMyProPayments as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    expect(within(card).getByRole('alert')).toHaveTextContent('ตัดบัตรรอบต่ออายุไม่สำเร็จ การต่ออายุอัตโนมัติถูกปิดแล้ว');
    expect(within(card).getByText('ปิดแล้ว (ตัดบัตรไม่สำเร็จ)')).toBeInTheDocument();
    expect(within(card).queryByText(/ตัดบัตรครั้งถัดไป/)).not.toBeInTheDocument();
    expect(within(card).queryByText('สิทธิ์ใช้ได้ถึงวันหมดอายุ จะไม่ถูกตัดบัตรอีก')).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'ต่ออายุ' })).toHaveAttribute('href', '/upgrade/checkout?plan=p-pro');
  });

  it('มีรายการใหม่กว่า 10 รายการ (ประวัติหน้าแรกไม่มี payment ที่ล้ม) และไปหน้า 2 → คำเตือนยังอยู่ (round 3)', async () => {
    const user = userEvent.setup();
    (getMyPro as jest.Mock).mockResolvedValue([sub({ autoRenew: false, renewalFailedAt: '2026-10-01T00:00:00Z' }), subs()[1]]);
    const newer = Array.from({ length: 10 }, (_, i) =>
      payment({ id: `n${i}`, subscriptionId: 's-pp', createdAt: `2026-11-${String(i + 10).padStart(2, '0')}T00:00:00Z` }),
    );
    (getMyProPayments as jest.Mock)
      .mockResolvedValueOnce({ items: newer, total: 11 })
      .mockResolvedValueOnce({ items: [payment({ id: 'old', subscriptionId: 's-card', status: 'successful', createdAt: '2026-09-01T00:00:00Z' })], total: 11 });
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    expect(within(card).getByRole('alert')).toHaveTextContent('ตัดบัตรรอบต่ออายุไม่สำเร็จ');
    expect(within(card).getByText('ปิดแล้ว (ตัดบัตรไม่สำเร็จ)')).toBeInTheDocument();
    expect(within(card).queryByText('ยกเลิกการต่ออายุแล้ว')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('membership-tgat')).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }));
    await waitFor(() => expect(getMyProPayments).toHaveBeenLastCalledWith({ page: 2, limit: 10 }, expect.any(AbortSignal)));
    const card2 = screen.getByTestId('membership-netsat');
    expect(within(card2).getByRole('alert')).toHaveTextContent('ตัดบัตรรอบต่ออายุไม่สำเร็จ');
    expect(within(card2).getByText('ปิดแล้ว (ตัดบัตรไม่สำเร็จ)')).toBeInTheDocument();
  });

  it('ไม่มี renewalFailedAt → ไม่อนุมานจากประวัติ: payment ต่ออายุที่ล้มในประวัติไม่ทำให้ขึ้นคำเตือน (round 3)', async () => {
    (getMyPro as jest.Mock).mockResolvedValue([sub({ autoRenew: false, renewalFailedAt: null })]);
    (getMyProPayments as jest.Mock).mockResolvedValue({
      items: [payment({ id: 'r2', isRenewal: true, status: 'failed', failureMessage: 'ยอดเงินไม่พอ', paidAt: null, createdAt: '2026-11-14T00:00:00Z' })],
      total: 1,
    });
    render(<MembershipView />);
    const card = await screen.findByTestId('membership-netsat');
    await screen.findByText('ยอดเงินไม่พอ');
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(card).getByText('ยกเลิกการต่ออายุแล้ว')).toBeInTheDocument();
  });

  it('ประวัติการชำระ: แพ็กเกจ ยอด VAT สถานะไทย ข้อความล้มเหลว ลิงก์ดูรายการที่ค้าง', async () => {
    (getMyProPayments as jest.Mock).mockResolvedValue({
      items: [
        payment(),
        payment({ id: 'f1', status: 'failed', failureMessage: 'บัตรถูกปฏิเสธ', vatSatang: 0, totalSatang: 19900 }),
        payment({ id: 'q1', method: 'promptpay', status: 'pending', plan: { id: 'p-tgat', name: 'TGAT PRO' } }),
        payment({ id: 'rf', refundRequired: true }),
      ],
      total: 4,
    });
    render(<MembershipView />);
    const section = (await screen.findByRole('heading', { name: 'ประวัติการชำระเงิน' })).closest('section') as HTMLElement;
    await within(section).findByText('บัตรถูกปฏิเสธ');
    expect(within(section).getAllByText('฿212.93').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('รวม VAT ฿13.93').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('สำเร็จ')).toHaveLength(2);
    expect(within(section).getAllByText('รายการนี้อยู่ระหว่างดำเนินการคืนเงิน')).toHaveLength(1);
    expect(within(section).getByText('ไม่สำเร็จ')).toBeInTheDocument();
    expect(within(section).getByText('รอชำระ')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'ดูรายการ' })).toHaveAttribute('href', '/upgrade/result?payment=q1&plan=p-tgat');
    expect(getMyProPayments).toHaveBeenCalledWith({ page: 1, limit: 10 }, expect.any(AbortSignal));
  });

  it('ไม่มีแพ็กเกจ / ไม่มีประวัติ → empty state + ลิงก์ดูแพ็กเกจ', async () => {
    (getMyPro as jest.Mock).mockResolvedValue([]);
    (getMyProPayments as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    render(<MembershipView />);
    expect(await screen.findByText('ยังไม่มีแพ็กเกจที่ใช้งานอยู่')).toBeInTheDocument();
    expect(await screen.findByText('ยังไม่มีประวัติการชำระเงิน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ดูแพ็กเกจ' })).toHaveAttribute('href', '/upgrade');
  });

  it('ไม่ได้ login → ปุ่มเข้าสู่ระบบ (redirect กลับมาหน้านี้) และไม่เรียก API', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    render(<MembershipView />);
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute('href', '/login?redirect=%2Fdashboard%2Fmembership');
    expect(getMyPro).not.toHaveBeenCalled();
    expect(getMyProPayments).not.toHaveBeenCalled();
  });

  it('ประวัติ: รายการที่ถูกแทนที่ (canceled — task 19 รอบ 2) → "ยกเลิกแล้ว" + เหตุผลสีเทา ไม่มีลิงก์ดูรายการ', async () => {
    (getMyProPayments as jest.Mock).mockResolvedValue({
      items: [payment({ id: 'c1', status: 'canceled', method: 'promptpay', failureMessage: 'ถูกแทนที่ด้วยรายการชำระใหม่', paidAt: null })],
      total: 1,
    });
    render(<MembershipView />);
    const section = (await screen.findByRole('heading', { name: 'ประวัติการชำระเงิน' })).closest('section') as HTMLElement;
    const badge = await within(section).findByText('ยกเลิกแล้ว');
    expect(badge.className).toContain('dark:bg-gray-700');
    const reason = within(section).getByText('ถูกแทนที่ด้วยรายการชำระใหม่');
    expect(reason.className).toContain('text-gray-600');
    expect(within(section).queryByRole('link', { name: 'ดูรายการ' })).not.toBeInTheDocument();
  });
});
