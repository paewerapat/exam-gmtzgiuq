import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import UpgradeView, { PAYMENT_COMING_SOON } from './UpgradeView';
import { getProUpgrade, type ProUpgradeData } from '@/lib/api/pro';
import { useAuth } from '@/contexts/AuthContext';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/upgrade',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api/pro', () => ({ getProUpgrade: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const FUTURE = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const plans = (prefix: string) => [
  { id: `${prefix}-free`, code: 'free', rank: 0, name: 'Free', tagline: 'เริ่มต้นทดลองใช้', priceSatang: 0, priceUnit: null, priceNote: null, buttonText: 'เริ่มใช้งาน', badge: null, highlight: false, isPurchasable: false },
  { id: `${prefix}-pro`, code: 'pro', rank: 1, name: 'PRO', tagline: 'ฝึกต่อเนื่อง', priceSatang: 19900, priceUnit: '/ เดือน', priceNote: 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้', buttonText: 'สมัคร PRO', badge: null, highlight: false, isPurchasable: true },
  { id: `${prefix}-max`, code: 'max', rank: 2, name: 'MAX', tagline: 'ครบทุกอย่าง', priceSatang: 29950, priceUnit: '/ เดือน', priceNote: null, buttonText: 'สมัคร MAX', badge: 'แนะนำ', highlight: true, isPurchasable: true },
];

const data = (patch: Partial<ProUpgradeData> = {}): ProUpgradeData => ({
  page: { title: 'แพ็กเกจ LUMO', subtitle: 'เลือกแพ็กเกจที่เหมาะกับคุณ', venuePickerTitle: 'เลือกสนามที่จะสมัคร', footerNote: 'ราคาตัวอย่าง' },
  venues: [
    {
      id: 'v1',
      key: 'netsat',
      name: 'NETSAT',
      description: 'สมัคร NETSAT ใช้ได้เฉพาะ NETSAT',
      comparison: {
        groups: [
          {
            title: 'PREDICTED EXAM',
            rows: [
              {
                label: 'ข้อสอบจำลอง',
                sublabel: 'รวม 4 วิชา',
                cells: {
                  free: { type: 'text', text: 'Preview', subtext: 'ทุกวิชา' },
                  pro: { type: 'check' },
                  max: { type: 'cross' },
                  gone: { type: 'check' },
                },
              },
              { label: '<script>alert(1)</script>', cells: { pro: { type: 'text', text: '<b>bold</b>' } } },
            ],
          },
        ],
      },
      plans: plans('n'),
    },
    {
      id: 'v2',
      key: 'tgat',
      name: 'TGAT',
      description: 'คำอธิบาย TGAT',
      comparison: { groups: [] },
      plans: [{ ...plans('t')[1], name: 'TGAT PRO', isPurchasable: false, badge: 'เร็วๆ นี้' }],
    },
  ],
  my: [],
  ...patch,
});

function setUser(user: object | null) {
  (useAuth as jest.Mock).mockReturnValue({ user });
}

describe('/upgrade — UpgradeView (task 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = '';
    setUser(null);
    (getProUpgrade as jest.Mock).mockResolvedValue(data());
  });

  it('ข้อความหน้าจาก API + สนามแรกถูกเลือก + การ์ดเรียงตามลำดับ ราคา/หน่วย/ป้าย', async () => {
    render(<UpgradeView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'แพ็กเกจ LUMO' })).toBeInTheDocument();
    expect(screen.getByText('เลือกแพ็กเกจที่เหมาะกับคุณ')).toBeInTheDocument();
    expect(screen.getByText('ราคาตัวอย่าง')).toBeInTheDocument();
    const picker = screen.getByRole('group', { name: 'เลือกสนามที่จะสมัคร' });
    expect(within(picker).getByRole('button', { name: 'NETSAT' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(picker).getByRole('button', { name: 'TGAT' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('สมัคร NETSAT ใช้ได้เฉพาะ NETSAT')).toBeInTheDocument();

    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Free', 'PRO', 'MAX']);
    expect(within(cards[0]).getByText('฿0')).toBeInTheDocument();
    expect(within(cards[1]).getByText('฿199')).toBeInTheDocument();
    expect(within(cards[1]).getByText('/ เดือน')).toBeInTheDocument();
    expect(within(cards[1]).getByText('ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้')).toBeInTheDocument();
    expect(within(cards[2]).getByText('฿299.50')).toBeInTheDocument();
    expect(within(cards[2]).getByText('แนะนำ')).toBeInTheDocument();
    expect(cards[2].className).toContain('border-indigo-600');
    expect(cards[2].className).toContain('dark:border-indigo-400');
  });

  it('ปุ่ม: ฟรี (guest) → ลิงก์สมัครสมาชิก / จ่ายเงิน → toast ระบบชำระเงินกำลังจะเปิด', async () => {
    const user = userEvent.setup();
    render(<UpgradeView />);
    const free = await screen.findByTestId('plan-card-free');
    expect(within(free).getByRole('link', { name: 'เริ่มใช้งาน' })).toHaveAttribute('href', '/register');
    await user.click(within(screen.getByTestId('plan-card-max')).getByRole('button', { name: 'สมัคร MAX' }));
    expect(toast.info).toHaveBeenCalledWith(PAYMENT_COMING_SOON);
    expect(PAYMENT_COMING_SOON).toBe('ระบบชำระเงินกำลังจะเปิดให้บริการ');
  });

  it('login แล้ว: แพ็กเกจฟรีลิงก์ไปหน้าฝึก', async () => {
    setUser({ id: 'u1' });
    render(<UpgradeView />);
    const free = await screen.findByTestId('plan-card-free');
    expect(within(free).getByRole('link', { name: 'เริ่มใช้งาน' })).toHaveAttribute('href', '/dashboard/practice');
  });

  it('?venue=tgat เลือกสนามให้, แพ็กเกจที่ปิดซื้อ → ปุ่ม disabled + ป้าย, ไม่มีตารางเมื่อไม่มีกลุ่ม', async () => {
    mockSearch = 'venue=tgat';
    render(<UpgradeView />);
    const card = await screen.findByTestId('plan-card-pro');
    expect(within(card).getByRole('heading', { name: 'TGAT PRO' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'สมัคร PRO' })).toBeDisabled();
    expect(within(card).getByText('เร็วๆ นี้')).toBeInTheDocument();
    expect(screen.getByText('คำอธิบาย TGAT')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('?venue ที่ไม่มี → สนามแรก / กดสนามอื่น → router.replace(/upgrade?venue=<key>)', async () => {
    const user = userEvent.setup();
    mockSearch = 'venue=nope';
    render(<UpgradeView />);
    await user.click(await screen.findByRole('button', { name: 'TGAT' }));
    expect(mockReplace).toHaveBeenCalledWith('/upgrade?venue=tgat', { scroll: false });
    expect(screen.getByRole('button', { name: 'NETSAT' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ตารางเปรียบเทียบ: check / cross / text+subtext, cell ของ code ที่ไม่มีแพ็กเกจถูกละ, แพ็กเกจที่ไม่มี cell ว่าง', async () => {
    render(<UpgradeView />);
    const table = await screen.findByRole('table', { name: 'ตารางเปรียบเทียบแพ็กเกจ NETSAT' });
    expect(within(table).getByRole('columnheader', { name: 'PREDICTED EXAM' })).toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /ข้อสอบจำลอง/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.querySelector('[data-cell-type]')?.getAttribute('data-cell-type'))).toEqual(['text', 'check', 'cross']);
    expect(within(cells[0]).getByText('Preview')).toBeInTheDocument();
    expect(within(cells[0]).getByText('ทุกวิชา')).toBeInTheDocument();
    expect(within(cells[1]).getByText('มี')).toHaveClass('sr-only');
    expect(within(cells[2]).getByText('ไม่มี')).toHaveClass('sr-only');
    expect(within(row).getByText('รวม 4 วิชา')).toBeInTheDocument();
    // แถวที่ 2: free/max ไม่มี cell → ว่าง
    const row2 = within(table).getByRole('row', { name: /script/ });
    const cells2 = within(row2).getAllByRole('cell');
    expect(cells2[0].querySelector('[data-cell-type]')?.getAttribute('data-cell-type')).toBe('empty');
    expect(cells2[2].querySelector('[data-cell-type]')?.getAttribute('data-cell-type')).toBe('empty');
  });

  it('ข้อความ <script> / HTML ใน cell และชื่อแถวแสดงเป็นตัวอักษร ไม่ถูก parse', async () => {
    render(<UpgradeView />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(within(table).getByText('<b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('table script')).toBeNull();
    expect(document.querySelector('table b')).toBeNull();
  });

  it('ผู้ใช้มีแพ็กเกจของสนามนั้น → การ์ด "แพ็กเกจปัจจุบัน · ใช้ได้ถึง <วันที่>" แทนปุ่ม (หมดอายุ/ถอนแล้วไม่นับ)', async () => {
    setUser({ id: 'u1' });
    (getProUpgrade as jest.Mock).mockResolvedValue(
      data({
        my: [
          { venueId: 'v1', planId: 'n-pro', planCode: 'pro', status: 'active', currentPeriodEnd: FUTURE, autoRenew: false },
          { venueId: 'v1', planId: 'n-max', planCode: 'max', status: 'active', currentPeriodEnd: PAST, autoRenew: false },
          { venueId: 'v2', planId: 't-pro', planCode: 'pro', status: 'revoked', currentPeriodEnd: FUTURE, autoRenew: false },
        ],
      }),
    );
    render(<UpgradeView />);
    const pro = await screen.findByTestId('plan-card-pro');
    expect(within(pro).getByTestId('current-plan')).toHaveTextContent(/^แพ็กเกจปัจจุบัน · ใช้ได้ถึง .+/);
    expect(within(pro).queryByRole('button')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('plan-card-max')).queryByTestId('current-plan')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('current-plan')).toHaveLength(1);
  });

  it('ไม่มีสนาม → ข้อความว่าง / โหลดไม่สำเร็จ → ลองใหม่', async () => {
    const user = userEvent.setup();
    (getProUpgrade as jest.Mock).mockResolvedValueOnce(data({ venues: [] }));
    const { unmount } = render(<UpgradeView />);
    expect(await screen.findByText('ยังไม่มีแพ็กเกจให้สมัครในตอนนี้')).toBeInTheDocument();
    unmount();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getProUpgrade as jest.Mock).mockRejectedValueOnce(new Error('x'));
    render(<UpgradeView />);
    await user.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'แพ็กเกจ LUMO' })).toBeInTheDocument();
    expect(getProUpgrade).toHaveBeenCalledTimes(3);
  });
});
