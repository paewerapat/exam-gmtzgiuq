import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckoutView from './CheckoutView';
import { createCheckout, getCheckoutQuote, type ProCheckoutQuote } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import { useAuth } from '@/contexts/AuthContext';
import { resetOmiseLoaderForTest, type OmiseCardOpenOptions } from '@/lib/omise';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams('plan=p-pro'),
}));
jest.mock('@/lib/api/pro', () => ({ getCheckoutQuote: jest.fn(), createCheckout: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.setTimeout(30000);

// ราคาเต็ม 199 + VAT 13.93 = 212.93 / ลด 20% → 159.20 + VAT 11.14 = 170.34
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

const discounted = quote({
  vatSatang: 1114,
  totalSatang: 17034,
  discount: { code: 'NEWYEAR20', type: 'percent', value: 20, discountSatang: 3980 },
});

function mockOmise() {
  const card = {
    configure: jest.fn(),
    open: jest.fn((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('tokn_test_abc')),
  };
  window.OmiseCard = card;
  return card;
}

const codeInput = () => screen.getByLabelText('โค้ดส่วนลด');

describe('/upgrade/checkout — โค้ดส่วนลด (task 19)', () => {
  const originalKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOmiseLoaderForTest();
    delete window.OmiseCard;
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = 'pkey_test_dummy';
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getCheckoutQuote as jest.Mock).mockImplementation((_plan: string, _signal?: AbortSignal, code?: string) =>
      Promise.resolve(code ? discounted : quote()),
    );
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = originalKey;
  });

  it('ใช้โค้ด → quote ใหม่: บรรทัดส่วนลด, VAT จากยอดหลังลด, ยอดชำระใหม่, รอบถัดไปตัดราคาเต็ม (บัตร)', async () => {
    const user = userEvent.setup();
    mockOmise();
    render(<CheckoutView />);
    await user.type(await screen.findByLabelText('โค้ดส่วนลด'), 'newyear20');
    expect(codeInput()).toHaveValue('NEWYEAR20');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));

    await waitFor(() => expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿170.34'));
    expect(getCheckoutQuote).toHaveBeenLastCalledWith('p-pro', undefined, 'NEWYEAR20');
    const line = screen.getByTestId('checkout-discount');
    expect(line).toHaveTextContent('NEWYEAR20');
    expect(line).toHaveTextContent('(20%)');
    expect(line).toHaveTextContent('−฿39.80');
    expect(screen.getByText('คิดจากยอดหลังหักส่วนลด')).toBeInTheDocument();
    expect(screen.getByText('฿11.14')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-renewal')).toHaveTextContent('รอบถัดไปตัด ฿212.93');
    expect(screen.getByRole('button', { name: 'ชำระด้วยบัตร ฿170.34' })).toBeEnabled();
    // ช่องกรอกถูกแทนด้วยสรุปโค้ด + ปุ่มเอาออก
    expect(screen.queryByLabelText('โค้ดส่วนลด')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เอาโค้ดออก' })).toBeInTheDocument();
  });

  it('จ่ายบัตรพร้อมโค้ด: OmiseCard ใช้ยอดหลังลด + discountCode ติดไปกับ checkout', async () => {
    const user = userEvent.setup();
    const card = mockOmise();
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay1', status: 'successful', authorizeUri: null });
    render(<CheckoutView />);
    await user.type(await screen.findByLabelText('โค้ดส่วนลด'), 'NEWYEAR20');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    await user.click(await screen.findByRole('button', { name: 'ชำระด้วยบัตร ฿170.34' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/upgrade/result?payment=pay1&plan=p-pro'));
    expect(card.open).toHaveBeenCalledWith(expect.objectContaining({ amount: 17034 }));
    expect(createCheckout).toHaveBeenCalledWith({
      planId: 'p-pro',
      method: 'card',
      cardToken: 'tokn_test_abc',
      discountCode: 'NEWYEAR20',
    });
  });

  it('PromptPay พร้อมโค้ด: discountCode ติดไปด้วย ไม่แสดงยอดรอบถัดไป', async () => {
    const user = userEvent.setup();
    (createCheckout as jest.Mock).mockResolvedValue({ paymentId: 'pay2', status: 'pending', qrImageUrl: 'https://x/qr.png' });
    render(<CheckoutView />);
    await user.click(await screen.findByRole('radio', { name: /PromptPay/ }));
    await user.type(codeInput(), 'NEWYEAR20');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByTestId('checkout-renewal')).toHaveTextContent('ส่วนลดใช้กับการชำระครั้งนี้เท่านั้น');
    expect(screen.getByTestId('checkout-renewal')).not.toHaveTextContent('รอบถัดไป');
    await user.click(screen.getByRole('button', { name: 'สร้าง QR ชำระ ฿170.34' }));
    await waitFor(() =>
      expect(createCheckout).toHaveBeenCalledWith({ planId: 'p-pro', method: 'promptpay', discountCode: 'NEWYEAR20' }),
    );
  });

  it('โค้ดใช้ไม่ได้ (discountError) → ข้อความไทยใต้ช่อง ยอดเดิม ไม่ส่งโค้ดตอนชำระ', async () => {
    const user = userEvent.setup();
    (getCheckoutQuote as jest.Mock).mockImplementation((_p: string, _s?: AbortSignal, code?: string) =>
      Promise.resolve(
        code
          ? quote({ discountError: { errorCode: 'DISCOUNT_NOT_APPLICABLE', message: 'not applicable' } })
          : quote(),
      ),
    );
    render(<CheckoutView />);
    await user.type(await screen.findByLabelText('โค้ดส่วนลด'), 'TGAT10');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByText('โค้ดส่วนลดนี้ใช้กับแพ็กเกจนี้ไม่ได้')).toHaveAttribute('role', 'alert');
    expect(codeInput()).toHaveAttribute('aria-invalid', 'true');
    expect(codeInput()).toHaveAttribute('aria-describedby', 'checkout-code-error');
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿212.93');
    expect(screen.queryByTestId('checkout-discount')).not.toBeInTheDocument();
    // แก้ช่องแล้ว error หาย
    await user.type(codeInput(), 'X');
    expect(screen.queryByText('โค้ดส่วนลดนี้ใช้กับแพ็กเกจนี้ไม่ได้')).not.toBeInTheDocument();
  });

  it('ช่องว่าง → แจ้งไม่เรียก API / 429 กรอกผิดหลายครั้ง → ข้อความไทย quote เดิมยังอยู่', async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'ใช้โค้ด' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกโค้ดส่วนลด');
    expect(getCheckoutQuote).toHaveBeenCalledTimes(1);

    (getCheckoutQuote as jest.Mock).mockRejectedValueOnce(new ApiError('Too Many Requests', 429, 'TOO_MANY_ATTEMPTS'));
    await user.type(codeInput(), 'GUESS1');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByText('กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿212.93');
  });

  it('เอาโค้ดออก → quote ใหม่ไม่มีโค้ด ยอดกลับเป็นราคาเต็ม', async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);
    await user.type(await screen.findByLabelText('โค้ดส่วนลด'), 'NEWYEAR20');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    await user.click(await screen.findByRole('button', { name: 'เอาโค้ดออก' }));
    await waitFor(() => expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿212.93'));
    expect(getCheckoutQuote).toHaveBeenLastCalledWith('p-pro', undefined, undefined);
    expect(screen.queryByTestId('checkout-discount')).not.toBeInTheDocument();
    expect(codeInput()).toBeInTheDocument();
  });

  it('checkout ตอบโค้ดใช้ไม่ได้แล้ว (เช่นใช้ครบระหว่างนั้น) → ข้อความไทย + คิดยอดใหม่แบบไม่มีโค้ด', async () => {
    const user = userEvent.setup();
    (createCheckout as jest.Mock).mockRejectedValue(new ApiError('used up', 400, 'DISCOUNT_USED_UP'));
    render(<CheckoutView />);
    await user.click(await screen.findByRole('radio', { name: /PromptPay/ }));
    await user.type(codeInput(), 'NEWYEAR20');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    await user.click(await screen.findByRole('button', { name: 'สร้าง QR ชำระ ฿170.34' }));
    await waitFor(() => expect(screen.getByTestId('checkout-total')).toHaveTextContent('฿212.93'));
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => within(a).queryByText('โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว'))).toBe(true);
    expect(getCheckoutQuote).toHaveBeenLastCalledWith('p-pro', undefined, undefined);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('แพ็กเกจต่ออายุอัตโนมัติอยู่แล้ว → ไม่มีช่องโค้ดส่วนลด', async () => {
    (getCheckoutQuote as jest.Mock).mockResolvedValue(
      quote({ current: { planId: 'p-pro', currentPeriodEnd: '2099-01-01T00:00:00Z', autoRenew: true, source: 'card' } }),
    );
    render(<CheckoutView />);
    expect(await screen.findByTestId('already-auto-renew')).toBeInTheDocument();
    expect(screen.queryByLabelText('โค้ดส่วนลด')).not.toBeInTheDocument();
  });
});
