import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewUnlockBatchPage from './page';
import { getLockableMockExams } from '@/lib/api/exams';
import { getProAdminConfig } from '@/lib/api/pro';
import { createUnlockBatch } from '@/lib/api/unlockCodes';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getLockableMockExams: jest.fn() }));
jest.mock('@/lib/api/pro', () => ({ getProAdminConfig: jest.fn() }));
jest.mock('@/lib/api/unlockCodes', () => ({ createUnlockBatch: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.setTimeout(30000);

const plan = (id: string, rank: number, name: string, isPurchasable: boolean, periodDays = 30, isVisible = true) => ({
  id,
  rank,
  name,
  isPurchasable,
  periodDays,
  isVisible,
  code: id,
  venueId: '',
  tagline: null,
  priceSatang: rank === 0 ? 0 : 19900,
  priceUnit: null,
  priceNote: null,
  buttonText: '',
  badge: null,
  highlight: false,
  sortOrder: rank,
  entitlements: {},
});

const config = {
  page: { title: '', subtitle: '', venuePickerTitle: '', footerNote: '', vatEnabled: false },
  venues: [
    {
      id: 'v1',
      key: 'netsat',
      name: 'NETSAT',
      isActive: true,
      plans: [
        plan('n-free', 0, 'Free', false),
        plan('n-pro', 1, 'PRO', true, 30),
        plan('n-max', 2, 'MAX', false),
        plan('n-hidden', 3, 'HIDDEN', true, 30, false),
      ],
    },
    { id: 'v2', key: 'tgat', name: 'TGAT', isActive: true, plans: [plan('t-free', 0, 'Free', false)] },
    { id: 'v3', key: 'alevel', name: 'A-Level', isActive: false, plans: [plan('a-pro', 1, 'A PRO', true)] },
  ],
};

describe('/admin/unlock-codes/new — แคมเปญแบบให้แพ็กเกจ Pro (task 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getLockableMockExams as jest.Mock).mockResolvedValue([]);
    (getProAdminConfig as jest.Mock).mockResolvedValue(config);
    (createUnlockBatch as jest.Mock).mockResolvedValue({ id: 'b9', name: 'PRO 7 วัน', codeCount: 5 });
  });

  it('ค่าเริ่มต้น = Unlock ชุดข้อสอบ (ไม่โหลดแพ็กเกจ) / ไม่มีคำว่า "ปลดล็อก"', async () => {
    render(<NewUnlockBatchPage />);
    expect(screen.getByRole('radio', { name: /Unlock ชุดข้อสอบ/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /ให้แพ็กเกจ Pro/ })).not.toBeChecked();
    expect(screen.getByRole('group', { name: /ชุดที่ Unlock/ })).toBeInTheDocument();
    expect(getProAdminConfig).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
    await waitFor(() => expect(getLockableMockExams).toHaveBeenCalled());
  });

  it('เลือก "ให้แพ็กเกจ Pro" → ซ่อนตัวเลือกชุด, สนามที่เปิดอยู่ → แพ็กเกจที่แสดงอยู่ ระดับ > 0 (ยังไม่เปิดขายก็แจกได้)', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    await user.click(screen.getByRole('radio', { name: /ให้แพ็กเกจ Pro/ }));
    expect(screen.queryByRole('group', { name: /ชุดที่ Unlock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /ทุกชุด Mock Exam/ })).not.toBeInTheDocument();

    const venue = await screen.findByLabelText('สนาม');
    // TGAT มีแค่แพ็กเกจฟรี / A-Level ปิดสนาม → ไม่อยู่ในรายการ
    expect(within(venue).getAllByRole('option').map((o) => o.textContent)).toEqual(['เลือกสนาม', 'NETSAT']);
    const planSelect = screen.getByLabelText('แพ็กเกจ');
    expect(planSelect).toBeDisabled();
    await user.selectOptions(venue, 'v1');
    expect(planSelect).toBeEnabled();
    // ระดับ 0 และแพ็กเกจที่ซ่อนไม่อยู่ / MAX ยังไม่เปิดขายแต่แจกได้
    expect(within(planSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'เลือกแพ็กเกจ',
      'PRO',
      'MAX (ยังไม่เปิดขาย)',
    ]);
    expect(screen.getByLabelText(/จำนวนวันของแพ็กเกจ/)).toBeInTheDocument();
    expect(getProAdminConfig).toHaveBeenCalledTimes(1);
  });

  it('ไม่เลือกแพ็กเกจ → "กรุณาเลือกแพ็กเกจ" ไม่เรียก API / เลือกแล้ว → POST kind pro + proPlanId + จำนวนวัน', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    await user.type(screen.getByLabelText(/ชื่อแคมเปญ/), 'PRO NETSAT 7 วัน');
    await user.click(screen.getByRole('radio', { name: /ให้แพ็กเกจ Pro/ }));
    const venue = await screen.findByLabelText('สนาม');
    const count = screen.getByLabelText(/จำนวนโค้ด/);
    await user.clear(count);
    await user.type(count, '5');
    await user.click(screen.getByRole('button', { name: 'สร้าง 5 โค้ด' }));
    expect(screen.getByText('กรุณาเลือกแพ็กเกจ')).toBeInTheDocument();
    expect(venue).toHaveFocus();
    expect(createUnlockBatch).not.toHaveBeenCalled();

    await user.selectOptions(venue, 'v1');
    await user.selectOptions(screen.getByLabelText('แพ็กเกจ'), 'n-pro');
    expect(screen.queryByText('กรุณาเลือกแพ็กเกจ')).not.toBeInTheDocument();
    // เลือกแพ็กเกจ → จำนวนวันตั้งตามรอบของแพ็กเกจ แล้วแก้ต่อได้
    const days = screen.getByLabelText(/จำนวนวันของแพ็กเกจ/);
    expect(days).toHaveValue(30);
    await user.clear(days);
    await user.type(days, '7');
    await user.click(screen.getByRole('button', { name: 'สร้าง 5 โค้ด' }));
    await waitFor(() =>
      expect(createUnlockBatch).toHaveBeenCalledWith({
        name: 'PRO NETSAT 7 วัน',
        count: 5,
        accessDays: 7,
        codeExpiresAt: undefined,
        kind: 'pro',
        proPlanId: 'n-pro',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/unlock-codes/b9');
  });

  it('โหลดแพ็กเกจไม่สำเร็จ → ลองใหม่ได้', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    (getProAdminConfig as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    render(<NewUnlockBatchPage />);
    await user.click(screen.getByRole('radio', { name: /ให้แพ็กเกจ Pro/ }));
    expect(await screen.findByText('โหลดรายการแพ็กเกจไม่สำเร็จ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByLabelText('สนาม')).toBeInTheDocument();
    expect(getProAdminConfig).toHaveBeenCalledTimes(2);
  });
});
