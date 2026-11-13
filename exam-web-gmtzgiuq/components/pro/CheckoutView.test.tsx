import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckoutView from './CheckoutView';
import { createCheckout, getCheckoutQuote, type ProCheckoutQuote } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import { useAuth } from '@/contexts/AuthContext';
import { redirectToAuthorize } from '@/lib/pro-payments';
import { resetOmiseLoaderForTest, type OmiseCardOpenOptions } from '@/lib/omise';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearch = 'plan=p-pro';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/pro', () => ({ getCheckoutQuote: jest.fn(), createCheckout: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/pro-payments', () => ({
  ...jest.requireActual('@/lib/pro-payments'),
  redirectToAuthorize: jest.fn(() => true),
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

const quote = (patch: Partial<ProCheckoutQuote> = {}): ProCheckoutQuote => ({
  plan: { id: 'p-pro', code: 'pro', name: 'PRO', periodDays: 30, venue: { id: 'v1', key: 'netsat', name: 'NETSAT' } },
  subtotalSatang: 19900,
  vatSatang: 1393,
  totalSatang: 21293,
  vatEnabled: true,
  current: null,
  changesPlan: false,
  discount: null,
  discountError: null,
  renewalTotalSatang: 21293,
  ...patch,
});

/** OmiseCard global ปลอม: open() ทำตาม behavior ที่ตั้ง (token / ปิดหน้าต่าง / ค้างไว้) */
function mockOmise(behavior: 'token' | 'close' | 'hold' = 'token') {
  const card = {
    configure: jest.fn(),
    open: jest.fn((opts: OmiseCardOpenOptions) => {
      if (behavior === 'token') opts.onCreateTokenSuccess('tokn_test_abc');
      if (behavior === 'close') opts.onFormClosed?.();
    }),
  };
  window.OmiseCard = card;
  return card;
}

const payButton = () => screen.getByRole('button', { name: /ชำระด้วยบัตร|สร้าง QR ชำระ|กำลังดำเนินการ/ });

describe('/upgrade/checkout — CheckoutView (task 18)', () => {
  const originalKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOmiseLoaderForTest();
    delete window.OmiseCard;
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    mockSearch = 'plan=p-pro';
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = 'pkey_test_dummy';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getCheckoutQuote as jest.Mock).mockResolvedValue(quote());
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = originalKey;
  });

  it('สรุป: สนาม แพ็กเกจ ราคา VAT 7% ยอดรวม + ข้อความต่ออายุอัตโนมัติ', async () => {
    mockOmise();
    render(<CheckoutView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'ชำระเงิน' })).toBeInTheDocument();
    expect(getCheckoutQuote).toHaveBeenCalledWith('p-pro', expect.any(AbortSignal));
    expect(screen.getByText('NETSAT')).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('฿199')).toBeInTheDocument();
    expect(screen.getByText('VAT 7%')).toBeInTheDocument();
    expect(screen.getByText('฿13.93')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿212.93');
    expect(screen.getByRole('radio', { name: /บัตรเครดิต\/เดบิต/ })).toBeChecked();
    expect(screen.getByText('ต่ออายุอัตโนมัติทุก 30 วัน ยกเลิกได้ตลอด')).toBeInTheDocument();
    expect(payButton()).toHaveTextContent('ชำระด้วยบัตร ฿212.93');
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('VAT ปิด → ไม่มีแถว VAT ยอดรวม = ราคา', async () => {
    (getCheckoutQuote as jest.Mock).mockResolvedValue(quote({ vatEnabled: false, vatSatang: 0, totalSatang: 19900 }));
    render(<CheckoutView />);
    expect(await screen.findByTestId('checkout-total')).toHaveTextContent('฿199');
    expect(screen.queryByText('VAT 7%')).not.toBeInTheDocument();
  });

  it('บัตรสำเร็จทันที: เปิด OmiseCard ด้วยยอดรวม → POST checkout ด้วย token → ไปหน้าผล', async () => {
    const user = userEvent.setup();
    const card = mockOmise('token');
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay1', status: 'successful', authorizeUri: null });
    render(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿212.93' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/upgrade/result?payment=pay1&plan=p-pro'));
    expect(card.configure).toHaveBeenCalledWith({ publicKey: 'pkey_test_dummy' });
    // Opn ต่อท้ายยอดบนปุ่มให้เอง → submitLabel ไม่มียอด (กัน "ชำระ ฿212.93 212.93 THB")
    expect(card.open).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 21293, currency: 'THB', frameLabel: 'LUMO', submitLabel: 'ชำระเงิน', hideAmount: 'false' }),
    );
    expect(createCheckout).toHaveBeenCalledWith({ planId: 'p-pro', method: 'card', cardToken: 'tokn_test_abc' });
  });

  it('บัตรต้อง 3-D Secure → redirect ไป authorizeUri', async () => {
    const user = userEvent.setup();
    mockOmise('token');
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay1', status: 'pending', authorizeUri: 'https://api.omise.co/payments/x/authorize' });
    render(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿212.93' }));
    await waitFor(() => expect(redirectToAuthorize).toHaveBeenCalledWith('https://api.omise.co/payments/x/authorize'));
    expect(mockPush).not.toHaveBeenCalled();
    // ระหว่างออกจากหน้า ปุ่มยังกดไม่ได้
    expect(payButton()).toBeDisabled();
  });

  it('บัตรถูกปฏิเสธ → ข้อความไทยจาก API กดลองใหม่ได้', async () => {
    const user = userEvent.setup();
    mockOmise('token');
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay1', status: 'failed', failureMessage: 'ยอดเงินในบัตรไม่เพียงพอ' });
    render(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿212.93' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ยอดเงินในบัตรไม่เพียงพอ');
    expect(payButton()).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ปิดหน้าต่างบัตร → ไม่เรียก API ปุ่มกลับมากดได้', async () => {
    const user = userEvent.setup();
    mockOmise('close');
    render(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿212.93' }));
    await waitFor(() => expect(payButton()).toBeEnabled());
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('กันกดซ้ำ: ระหว่างรอหน้าต่างบัตร ปุ่ม disabled และเปิดหน้าต่างครั้งเดียว', async () => {
    const user = userEvent.setup();
    const card = mockOmise('hold');
    render(<CheckoutView />);
    const btn = await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿212.93' });
    await user.click(btn);
    await user.click(btn);
    await waitFor(() => expect(card.open).toHaveBeenCalledTimes(1));
    expect(payButton()).toBeDisabled();
    expect(payButton()).toHaveTextContent('กำลังดำเนินการ...');
    expect(screen.getByRole('radio', { name: /PromptPay/ })).toBeDisabled();
  });

  it('PromptPay: POST checkout แบบ promptpay (ไม่มี token) → ไปหน้า QR', async () => {
    const user = userEvent.setup();
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay9', status: 'pending', qrImageUrl: 'https://qr', expiresAt: FUTURE });
    render(<CheckoutView />);
    await user.click(await screen.findByRole('radio', { name: /PromptPay/ }));
    await user.click(screen.getByRole('button', { name: 'สร้าง QR ชำระ ฿212.93' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/upgrade/result?payment=pay9&plan=p-pro'));
    expect(createCheckout).toHaveBeenCalledWith({ planId: 'p-pro', method: 'promptpay' });
    expect(window.OmiseCard).toBeUndefined();
  });

  it('ไม่มี public key → "ระบบชำระเงินยังไม่พร้อม" ปุ่มบัตรกดไม่ได้ แต่ PromptPay ใช้ได้', async () => {
    const user = userEvent.setup();
    delete process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    render(<CheckoutView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('ระบบชำระเงินยังไม่พร้อม');
    expect(payButton()).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /PromptPay/ }));
    expect(payButton()).toBeEnabled();
    expect(document.head.querySelector('script[src*="omise"]')).toBeNull();
  });

  it('Opn ล่ม (503) → ข้อความไทย ไม่ค้าง', async () => {
    const user = userEvent.setup();
    (createCheckout as jest.Mock).mockRejectedValue(new ApiError('Service Unavailable', 503, 'OMISE_UNAVAILABLE'));
    render(<CheckoutView />);
    await user.click(await screen.findByRole('radio', { name: /PromptPay/ }));
    await user.click(payButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('ระบบชำระเงินขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง');
    expect(payButton()).toBeEnabled();
  });

  it('เปลี่ยนแพ็กเกจ → คำเตือนเริ่มรอบใหม่ทันที / ต่ออายุแพ็กเกจเดิม → แจ้งว่าต่อจากวันหมด', async () => {
    (getCheckoutQuote as jest.Mock).mockResolvedValue(
      quote({ changesPlan: true, current: { planId: 'p-max', currentPeriodEnd: FUTURE, autoRenew: true, source: 'card' } }),
    );
    const { unmount } = render(<CheckoutView />);
    const warn = await screen.findByText('เปลี่ยนแพ็กเกจจะเริ่มรอบใหม่ทันที');
    expect(warn.closest('[role="note"]')).toHaveTextContent(/ไม่คิดส่วนต่าง.*การต่ออายุอัตโนมัติของแพ็กเกจเดิมจะถูกยกเลิก/);
    unmount();

    (getCheckoutQuote as jest.Mock).mockResolvedValue(
      quote({ changesPlan: false, current: { planId: 'p-pro', currentPeriodEnd: FUTURE, autoRenew: false, source: 'promptpay' } }),
    );
    render(<CheckoutView />);
    expect(await screen.findByText(/คุณมีแพ็กเกจนี้อยู่แล้ว.*ชำระแล้วจะต่อจากวันหมดอายุเดิม/)).toBeInTheDocument();
    expect(screen.queryByText('เปลี่ยนแพ็กเกจจะเริ่มรอบใหม่ทันที')).not.toBeInTheDocument();
  });

  it('แพ็กเกจเดิมต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว → ไม่เปิด OmiseCard ปิดทั้งสองวิธี + ลิงก์สมาชิกของฉัน (round 2)', async () => {
    const user = userEvent.setup();
    const card = mockOmise('token');
    (getCheckoutQuote as jest.Mock).mockResolvedValue(
      quote({ changesPlan: false, current: { planId: 'p-pro', currentPeriodEnd: FUTURE, autoRenew: true, source: 'card' } }),
    );
    render(<CheckoutView />);
    const note = await screen.findByTestId('already-auto-renew');
    expect(note).toHaveTextContent('แพ็กเกจนี้ต่ออายุอัตโนมัติอยู่แล้ว');
    expect(within(note).getByRole('link', { name: 'สมาชิกของฉัน' })).toHaveAttribute('href', '/dashboard/membership');
    expect(screen.queryByText(/คุณมีแพ็กเกจนี้อยู่แล้ว/)).not.toBeInTheDocument();
    expect(payButton()).toBeDisabled();
    expect(screen.getByRole('radio', { name: /บัตรเครดิต/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /PromptPay/ })).toBeDisabled();
    await user.click(payButton());
    expect(card.open).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('API ตอบ 409 ALREADY_AUTO_RENEW (เช่นแท็บอื่นเพิ่งสมัคร) → ข้อความไทยจาก API', async () => {
    const user = userEvent.setup();
    (createCheckout as jest.Mock).mockRejectedValue(
      new ApiError('แพ็กเกจนี้ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว ไม่ต้องชำระซ้ำ', 409, 'ALREADY_AUTO_RENEW'),
    );
    render(<CheckoutView />);
    await user.click(await screen.findByRole('radio', { name: /PromptPay/ }));
    await user.click(payButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('แพ็กเกจนี้ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว');
  });

  it('ไม่ได้ login → /login?redirect=<checkout> และไม่โหลด quote', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    render(<CheckoutView />);
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/upgrade/checkout?plan=p-pro'));
    expect(getCheckoutQuote).not.toHaveBeenCalled();
  });

  it('แพ็กเกจซื้อไม่ได้ (400) → ข้อความ ไม่มีปุ่มลองใหม่ / ไม่มี ?plan → ไม่พบแพ็กเกจ', async () => {
    (getCheckoutQuote as jest.Mock).mockRejectedValue(new ApiError('Bad Request', 400, 'PLAN_NOT_PURCHASABLE'));
    const { unmount } = render(<CheckoutView />);
    expect(await screen.findByRole('heading', { name: 'แพ็กเกจนี้ยังไม่เปิดให้สมัคร' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ลองใหม่' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปเลือกแพ็กเกจ' })).toHaveAttribute('href', '/upgrade');
    unmount();

    mockSearch = '';
    render(<CheckoutView />);
    expect(screen.getByRole('heading', { name: 'ไม่พบแพ็กเกจที่เลือก' })).toBeInTheDocument();
  });

  it('โหลด quote ล้ม (เน็ต) → ลองใหม่ได้', async () => {
    const user = userEvent.setup();
    (getCheckoutQuote as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<CheckoutView />);
    const heading = await screen.findByRole('heading', { name: /เชื่อมต่อระบบไม่ได้/ });
    await user.click(within(heading.parentElement as HTMLElement).getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByTestId('checkout-total')).toBeInTheDocument();
    expect(getCheckoutQuote).toHaveBeenCalledTimes(2);
  });
});
