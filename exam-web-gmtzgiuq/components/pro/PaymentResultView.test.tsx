import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentResultView from './PaymentResultView';
import { createCheckout, getProPayment, type ProPaymentDetail } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import { useAuth } from '@/contexts/AuthContext';

const mockReplace = jest.fn();
let mockSearch = 'payment=pay1&plan=p-pro';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/pro', () => ({ getProPayment: jest.fn(), createCheckout: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const T0 = Date.parse('2026-11-13T10:00:00Z');

const detail = (patch: Partial<ProPaymentDetail> = {}): ProPaymentDetail => ({
  id: 'pay1',
  status: 'pending',
  method: 'promptpay',
  totalSatang: 21293,
  subtotalSatang: 19900,
  vatSatang: 1393,
  qrImageUrl: 'https://cdn.omise.co/qr/abc.png',
  expiresAt: new Date(T0 + 2 * 60 * 1000).toISOString(),
  failureMessage: null,
  plan: { id: '', name: 'PRO' },
  venue: { name: 'NETSAT' },
  subscription: null,
  ...patch,
});

/** เดินเวลา + ให้ promise ที่ค้างทำงาน */
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('/upgrade/result — PaymentResultView (task 18)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    jest.clearAllMocks();
    mockSearch = 'payment=pay1&plan=p-pro';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('PromptPay pending: QR + ยอด + นับถอยหลัง, poll ทุก 5 วินาที แล้วหยุดเมื่อสำเร็จ', async () => {
    (getProPayment as jest.Mock)
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({ status: 'successful', subscription: { currentPeriodEnd: '2026-12-13T10:00:00Z', autoRenew: false } }),
      );
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'สแกน QR เพื่อชำระเงิน' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR PromptPay ยอด ฿212.93' })).toHaveAttribute('src', 'https://cdn.omise.co/qr/abc.png');
    expect(screen.getByTestId('qr-countdown')).toHaveTextContent('02:00');
    expect(getProPayment).toHaveBeenCalledTimes(1);

    await advance(1000);
    expect(screen.getByTestId('qr-countdown')).toHaveTextContent('01:59');

    await advance(4000); // ครบ 5 วินาที → poll ครั้งที่ 2
    expect(getProPayment).toHaveBeenCalledTimes(2);
    await advance(5000); // poll ครั้งที่ 3 → สำเร็จ
    expect(getProPayment).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('heading', { name: /^สมัครสำเร็จ · ใช้ได้ถึง / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ดูสมาชิกของฉัน/ })).toHaveAttribute('href', '/dashboard/membership');

    await advance(30000);
    expect(getProPayment).toHaveBeenCalledTimes(3);
  });

  it('ออกจากหน้า (unmount) → หยุด poll', async () => {
    (getProPayment as jest.Mock).mockResolvedValue(detail());
    const { unmount } = render(<PaymentResultView />);
    await advance(0);
    await advance(5000);
    expect(getProPayment).toHaveBeenCalledTimes(2);
    unmount();
    await advance(20000);
    expect(getProPayment).toHaveBeenCalledTimes(2);
  });

  it('QR หมดเวลา → "QR หมดอายุแล้ว" หยุด poll หลังช่วงเผื่อ → สร้าง QR ใหม่ด้วยแพ็กเกจเดิม', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (getProPayment as jest.Mock).mockResolvedValue(detail({ expiresAt: new Date(T0 + 7000).toISOString() }));
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay2', status: 'pending' });
    render(<PaymentResultView />);
    await advance(0);
    await advance(8000);
    expect(screen.getByRole('heading', { name: 'QR หมดอายุแล้ว' })).toBeInTheDocument();
    await advance(60000);
    const calls = (getProPayment as jest.Mock).mock.calls.length;
    await advance(60000);
    expect(getProPayment).toHaveBeenCalledTimes(calls);
    expect(calls).toBeLessThanOrEqual(5);

    await user.click(screen.getByRole('button', { name: 'สร้าง QR ใหม่' }));
    await advance(0);
    expect(createCheckout).toHaveBeenCalledWith({ planId: 'p-pro', method: 'promptpay' });
    expect(mockReplace).toHaveBeenCalledWith('/upgrade/result?payment=pay2&plan=p-pro');
  });

  it('server ตอบ expired → ปุ่มสร้าง QR ใหม่ / ล้มเหลวแบบ promptpay ก็สร้างใหม่ได้', async () => {
    (getProPayment as jest.Mock).mockResolvedValue(detail({ status: 'expired' }));
    const { unmount } = render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'QR หมดอายุแล้ว' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'สร้าง QR ใหม่' })).toBeEnabled();
    unmount();

    (getProPayment as jest.Mock).mockResolvedValue(detail({ status: 'failed', failureMessage: 'ชำระไม่สำเร็จ' }));
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'ชำระเงินไม่สำเร็จ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'สร้าง QR ใหม่' })).toBeInTheDocument();
  });

  it('บัตรกลับจาก 3DS: pending → "กำลังยืนยัน" poll จนสำเร็จ (ต่ออายุอัตโนมัติ)', async () => {
    mockSearch = 'payment=pay1';
    (getProPayment as jest.Mock)
      .mockResolvedValueOnce(detail({ method: 'card', qrImageUrl: null, expiresAt: null }))
      .mockResolvedValueOnce(
        detail({ method: 'card', status: 'successful', subscription: { currentPeriodEnd: '2026-12-13T10:00:00Z', autoRenew: true } }),
      );
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'กำลังยืนยันการชำระเงิน...' })).toBeInTheDocument();
    await advance(5000);
    expect(screen.getByRole('heading', { name: /^สมัครสำเร็จ/ })).toBeInTheDocument();
    expect(screen.getByText('ต่ออายุอัตโนมัติ ยกเลิกได้ตลอดในหน้าสมาชิกของฉัน')).toBeInTheDocument();
  });

  it('บัตร pending เกิน 3 นาที → หยุด poll + ปุ่มตรวจสอบอีกครั้ง', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (getProPayment as jest.Mock).mockResolvedValue(detail({ method: 'card', qrImageUrl: null, expiresAt: null }));
    render(<PaymentResultView />);
    await advance(0);
    await advance(3 * 60 * 1000 + 5000);
    expect(screen.getByRole('heading', { name: 'ยังไม่ได้รับผลการชำระเงิน' })).toBeInTheDocument();
    const calls = (getProPayment as jest.Mock).mock.calls.length;
    await advance(60000);
    expect(getProPayment).toHaveBeenCalledTimes(calls);
    await user.click(screen.getByRole('button', { name: 'ตรวจสอบอีกครั้ง' }));
    await advance(0);
    expect(getProPayment).toHaveBeenCalledTimes(calls + 1);
  });

  it('บัตรล้มเหลว → ข้อความไทย + ลิงก์ลองชำระอีกครั้ง (ไม่มี plan → /upgrade)', async () => {
    mockSearch = 'payment=pay1';
    (getProPayment as jest.Mock).mockResolvedValue(
      detail({ method: 'card', status: 'failed', failureMessage: 'บัตรถูกปฏิเสธ กรุณาติดต่อธนาคาร' }),
    );
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent('บัตรถูกปฏิเสธ กรุณาติดต่อธนาคาร');
    expect(screen.getByRole('link', { name: 'ลองชำระอีกครั้ง' })).toHaveAttribute('href', '/upgrade');
  });

  it('API ส่ง plan.id มา → ลองใหม่ไป checkout ของแพ็กเกจนั้น', async () => {
    mockSearch = 'payment=pay1';
    (getProPayment as jest.Mock).mockResolvedValue(detail({ method: 'card', status: 'failed', plan: { id: 'p-max', name: 'MAX' } }));
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('link', { name: 'ลองชำระอีกครั้ง' })).toHaveAttribute('href', '/upgrade/checkout?plan=p-max');
  });

  it('poll ระหว่างทางล้ม (เน็ตหลุด) → แจ้งเตือนแล้วลองต่อ', async () => {
    (getProPayment as jest.Mock)
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(detail({ status: 'successful' }));
    render(<PaymentResultView />);
    await advance(0);
    await advance(5000);
    expect(screen.getByText('เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...')).toBeInTheDocument();
    await advance(5000);
    expect(screen.getByRole('heading', { name: /^สมัครสำเร็จ/ })).toBeInTheDocument();
    expect(screen.queryByText('เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...')).not.toBeInTheDocument();
  });

  it('PromptPay: poll ล้มต่อเนื่อง → ลองต่อจนถึง expiresAt + ช่วงเผื่อ แล้วหยุด + ปุ่มตรวจสอบอีกครั้ง (round 2)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // QR อายุ 10 นาที (นานกว่ากฎเดิม 6 นาทีของบัตร)
    const expiresAt = new Date(T0 + 10 * 60 * 1000).toISOString();
    (getProPayment as jest.Mock).mockResolvedValueOnce(detail({ expiresAt })).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PaymentResultView />);
    await advance(0);
    await advance(5000);
    expect(screen.getByText('เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...')).toBeInTheDocument();
    await advance(7 * 60 * 1000);
    const midCalls = (getProPayment as jest.Mock).mock.calls.length;
    await advance(10000);
    expect((getProPayment as jest.Mock).mock.calls.length).toBeGreaterThan(midCalls); // ยัง poll หลังนาทีที่ 6
    await advance(4 * 60 * 1000);
    const calls = (getProPayment as jest.Mock).mock.calls.length;
    await advance(60000);
    expect(getProPayment).toHaveBeenCalledTimes(calls);
    expect(screen.getByText('เชื่อมต่อไม่ได้ กดตรวจสอบอีกครั้งเมื่อพร้อม')).toBeInTheDocument();
    expect(screen.queryByText('เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'QR หมดอายุแล้ว' })).toBeInTheDocument();

    (getProPayment as jest.Mock).mockResolvedValue(detail({ status: 'successful', expiresAt }));
    await user.click(screen.getByRole('button', { name: 'ตรวจสอบอีกครั้ง' }));
    await advance(0);
    expect(screen.getByRole('heading', { name: /^สมัครสำเร็จ/ })).toBeInTheDocument();
  });

  it('บัตร: poll ล้มต่อเนื่อง → หยุดที่ 3 นาที + ปุ่มตรวจสอบอีกครั้ง ไม่ขึ้น "กำลังลองใหม่" (round 2)', async () => {
    (getProPayment as jest.Mock)
      .mockResolvedValueOnce(detail({ method: 'card', qrImageUrl: null, expiresAt: null }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PaymentResultView />);
    await advance(0);
    await advance(3 * 60 * 1000 + 5000);
    const calls = (getProPayment as jest.Mock).mock.calls.length;
    await advance(60000);
    expect(getProPayment).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole('heading', { name: 'ยังไม่ได้รับผลการชำระเงิน' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตรวจสอบอีกครั้ง' })).toBeInTheDocument();
    expect(screen.queryByText('เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่...')).not.toBeInTheDocument();
  });

  it('PromptPay pending ที่ไม่มี expiresAt/QR → ไม่ poll วนไม่จบ แสดงตรวจสอบอีกครั้ง + สร้าง QR ใหม่ (round 2)', async () => {
    (getProPayment as jest.Mock).mockResolvedValue(detail({ expiresAt: null, qrImageUrl: null }));
    render(<PaymentResultView />);
    await advance(0);
    await advance(60000);
    expect(getProPayment).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'ตรวจสอบอีกครั้ง' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'สร้าง QR ใหม่' })).toBeInTheDocument();
    expect(screen.queryByText('ชำระแล้วหน้านี้จะอัปเดตเองภายในไม่กี่วินาที')).not.toBeInTheDocument();
  });

  it('API ตอบ failed (omise_unavailable) สำหรับ PromptPay ที่สร้าง QR ไม่ได้ → ข้อความ + สร้าง QR ใหม่ (round 2)', async () => {
    (getProPayment as jest.Mock).mockResolvedValue(
      detail({ status: 'failed', expiresAt: null, qrImageUrl: null, failureMessage: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณาสร้าง QR ใหม่' }),
    );
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'ชำระเงินไม่สำเร็จ' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('ระบบชำระเงินขัดข้องชั่วคราว กรุณาสร้าง QR ใหม่');
    expect(screen.getByRole('button', { name: 'สร้าง QR ใหม่' })).toBeEnabled();
    await advance(30000);
    expect(getProPayment).toHaveBeenCalledTimes(1);
  });

  it('payment ของคนอื่น/ไม่มี (404) → ไม่พบรายการ ไม่ poll', async () => {
    (getProPayment as jest.Mock).mockRejectedValue(new ApiError('ไม่พบรายการ', 404, 'PAYMENT_NOT_FOUND'));
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'ไม่พบรายการชำระเงินนี้' })).toBeInTheDocument();
    await advance(20000);
    expect(getProPayment).toHaveBeenCalledTimes(1);
  });

  it('QR URL ไม่ใช่ https → ไม่แสดงรูป', async () => {
    (getProPayment as jest.Mock).mockResolvedValue(detail({ qrImageUrl: 'javascript:alert(1)' }));
    render(<PaymentResultView />);
    await advance(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('แสดง QR ไม่ได้ กรุณาสร้าง QR ใหม่')).toBeInTheDocument();
  });

  it('ไม่ได้ login → /login?redirect=<หน้าผล>', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    render(<PaymentResultView />);
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/upgrade/result?payment=pay1&plan=p-pro'));
    expect(getProPayment).not.toHaveBeenCalled();
  });
});
