// กล่อง "มีโค้ด?" ในหน้า /upgrade และ /dashboard/membership (task 19): ได้แพ็กเกจแล้วโหลดสิทธิ์ใหม่
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpgradeView from './UpgradeView';
import MembershipView from './MembershipView';
import { getMyPro, getMyProPayments, getProUpgrade, type ProMeItem, type ProUpgradeData } from '@/lib/api/pro';
import { redeemUnlockCode } from '@/lib/api/unlockCodes';
import { useAuth } from '@/contexts/AuthContext';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/upgrade',
  useSearchParams: () => new URLSearchParams(''),
}));
jest.mock('@/lib/api/pro', () => ({
  getProUpgrade: jest.fn(),
  getMyPro: jest.fn(),
  getMyProPayments: jest.fn(),
  cancelProRenewal: jest.fn(),
  changeProCard: jest.fn(),
}));
jest.mock('@/lib/api/unlockCodes', () => ({ redeemUnlockCode: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.setTimeout(30000);

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const plan = (id: string, code: string, rank: number, name: string) => ({
  id,
  code,
  rank,
  name,
  tagline: null,
  priceSatang: rank === 0 ? 0 : 19900,
  priceUnit: null,
  priceNote: null,
  buttonText: `สมัคร ${name}`,
  badge: null,
  highlight: false,
  isPurchasable: rank > 0,
});

const upgradeData = (my: ProUpgradeData['my'] = []): ProUpgradeData => ({
  page: { title: 'แพ็กเกจ LUMO', subtitle: '', venuePickerTitle: 'เลือกสนาม', footerNote: '', vatEnabled: false },
  venues: [
    { id: 'v1', key: 'netsat', name: 'NETSAT', description: null, comparison: { groups: [] }, plans: [plan('n-free', 'free', 0, 'Free'), plan('n-pro', 'pro', 1, 'PRO')] },
    { id: 'v2', key: 'tgat', name: 'TGAT', description: null, comparison: { groups: [] }, plans: [plan('t-pro', 'pro', 1, 'TGAT PRO')] },
  ],
  my,
});

const proResult = (venue: { key: string; name: string }) => ({
  kind: 'pro' as const,
  venue,
  plan: { name: 'PRO' },
  currentPeriodEnd: FUTURE,
  autoRenewDatesDiffer: false,
});

async function redeem(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(await screen.findByRole('button', { name: /มีโค้ด\?/ }));
  await user.type(screen.getByLabelText('โค้ด'), code);
  await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
}

describe('/upgrade — กล่อง "มีโค้ด?" (task 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
  });

  it('ใช้โค้ด pro สำเร็จ → โหลดสิทธิ์ใหม่โดยไม่ขึ้นหน้าโหลด (ผลยังแสดง) + การ์ดแพ็กเกจเป็นแพ็กเกจปัจจุบัน', async () => {
    const user = userEvent.setup();
    (getProUpgrade as jest.Mock)
      .mockResolvedValueOnce(upgradeData())
      .mockResolvedValueOnce(
        upgradeData([{ venueId: 'v1', planId: 'n-pro', planCode: 'pro', status: 'active', currentPeriodEnd: FUTURE, autoRenew: false, source: 'code' }]),
      );
    (redeemUnlockCode as jest.Mock).mockResolvedValue(proResult({ key: 'netsat', name: 'NETSAT' }));
    render(<UpgradeView />);
    await redeem(user, 'PRO7DAYS');
    expect(await screen.findByText(/^ได้รับแพ็กเกจ PRO NETSAT ถึง /)).toBeInTheDocument();
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'PRO7DAYS' });
    await waitFor(() => expect(getProUpgrade).toHaveBeenCalledTimes(2));
    // สนามเดิม → ไม่เปลี่ยน URL
    expect(mockReplace).not.toHaveBeenCalled();
    const current = await screen.findByTestId('current-plan');
    expect(current.closest('article')).toHaveTextContent('PRO');
    // กล่องโค้ดไม่ถูก unmount ระหว่างโหลดใหม่ → ข้อความสำเร็จยังอยู่
    expect(screen.getByText(/^ได้รับแพ็กเกจ PRO NETSAT ถึง /)).toBeInTheDocument();
  });

  it('โค้ดของสนามอื่น → พาไปสนามนั้น (?venue=tgat)', async () => {
    const user = userEvent.setup();
    (getProUpgrade as jest.Mock).mockResolvedValue(upgradeData());
    (redeemUnlockCode as jest.Mock).mockResolvedValue(proResult({ key: 'tgat', name: 'TGAT' }));
    render(<UpgradeView />);
    await redeem(user, 'TGAT7');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/upgrade?venue=tgat', { scroll: false }));
  });

  it('โค้ดของชุดข้อสอบ → ข้อความให้ไปกรอกที่หน้าชุด ไม่โหลดใหม่', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('@/lib/api/apiError');
    (getProUpgrade as jest.Mock).mockResolvedValue(upgradeData());
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new ApiError('x', 400, 'NOT_FOR_THIS_EXAM'));
    render(<UpgradeView />);
    await redeem(user, 'EXAMCODE');
    expect(await screen.findByRole('alert')).toHaveTextContent('โค้ดนี้ใช้กับชุดข้อสอบ กรุณากรอกที่หน้าชุดข้อสอบ');
    expect(getProUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe('/dashboard/membership — กล่อง "มีโค้ด?" (task 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getMyProPayments as jest.Mock).mockResolvedValue({ items: [], total: 0 });
  });

  it('ใช้โค้ดสำเร็จ → โหลดแพ็กเกจของฉันใหม่ เห็นแพ็กเกจที่ได้ และข้อความสำเร็จยังอยู่', async () => {
    const user = userEvent.setup();
    const granted: ProMeItem = {
      id: 's1',
      venueId: 'v1',
      venueKey: 'netsat',
      venueName: 'NETSAT',
      planId: 'n-pro',
      planCode: 'pro',
      planName: 'PRO',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: FUTURE,
      autoRenew: false,
      source: 'code',
      cardBrand: null,
      cardLastDigits: null,
      canceledAt: null,
      renewalFailedAt: null,
    };
    (getMyPro as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([granted]);
    (redeemUnlockCode as jest.Mock).mockResolvedValue(proResult({ key: 'netsat', name: 'NETSAT' }));
    render(<MembershipView />);
    expect(await screen.findByText('ยังไม่มีแพ็กเกจที่ใช้งานอยู่')).toBeInTheDocument();
    await redeem(user, 'PRO7DAYS');
    const card = await screen.findByTestId('membership-netsat');
    expect(within(card).getByText('โค้ด')).toBeInTheDocument();
    expect(getMyPro).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/^ได้รับแพ็กเกจ PRO NETSAT ถึง /)).toBeInTheDocument();
  });
});
