// กรอกโค้ดแบบให้แพ็กเกจ Pro ในหน้ารายละเอียด Mock (task 19)
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import MockExamDetail from './MockExamDetail';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import { redeemUnlockCode } from '@/lib/api/unlockCodes';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api/exams', () => ({ getMockExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({ getMyInProgressAttempts: jest.fn() }));
jest.mock('@/lib/api/unlockCodes', () => ({ redeemUnlockCode: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.setTimeout(30000);

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const exam = (patch: Partial<MockExamDetailData> = {}): MockExamDetailData => ({
  id: 'm1',
  title: 'NETSAT Mock 1',
  category: 'netsat',
  categoryName: 'NETSAT',
  subjectId: 's1',
  subjectName: 'คณิต',
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 90,
  level: 'hard',
  accessType: 'purchase',
  price: 150,
  releaseDate: '2026-11-01T00:00:00.000Z',
  access: { status: 'locked', expiresAt: null },
  venueKey: 'netsat',
  description: 'คำอธิบาย',
  detailBlocks: [],
  codeInstructions: null,
  ...patch,
});

const proResult = { kind: 'pro', venue: { key: 'netsat', name: 'NETSAT' }, plan: { name: 'PRO' }, currentPeriodEnd: FUTURE, autoRenewDatesDiffer: false };

const panel = () => screen.getByTestId('mock-access-panel');

describe('หน้า Mock: กรอกโค้ด Pro (task 19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([]);
  });

  it('แพ็กเกจให้สิทธิ์ชุดนี้ → ถามสิทธิ์ใหม่ (ไม่ขึ้นหน้าโหลด) แล้วกล่องเปลี่ยนเป็น Unlocked + ปุ่มเริ่มทำ', async () => {
    const user = userEvent.setup();
    (getMockExam as jest.Mock)
      .mockResolvedValueOnce(exam())
      .mockResolvedValueOnce(exam({ access: { status: 'unlocked', expiresAt: FUTURE, via: 'pro' } }));
    (redeemUnlockCode as jest.Mock).mockResolvedValue(proResult);
    render(<MockExamDetail id="m1" />);
    const input = await within(await screen.findByTestId('mock-access-panel')).findByLabelText('โค้ด Unlock');
    await user.type(input, 'pro7days');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'PRO7DAYS', examId: 'm1' });
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^ได้รับแพ็กเกจ PRO NETSAT ถึง /));
    expect(getMockExam).toHaveBeenCalledTimes(2);
    expect(within(panel()).getByRole('heading', { name: 'Unlocked' })).toBeInTheDocument();
    expect(within(panel()).getByTestId('access-until')).toHaveTextContent('สิทธิ์จากแพ็กเกจ Pro');
    // ไม่ขึ้นหน้าโหลดทั้งหน้า (หัวข้อชุดอยู่ตลอด)
    expect(screen.getByRole('heading', { level: 1, name: 'NETSAT Mock 1' })).toBeInTheDocument();
  });

  it('แพ็กเกจไม่ให้สิทธิ์ชุดนี้ (สนามอื่น/ไม่มี mockPurchase) → บอกผลใต้ช่อง กล่องยังเป็นแบบเดิม', async () => {
    const user = userEvent.setup();
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    (redeemUnlockCode as jest.Mock).mockResolvedValue({ ...proResult, venue: { key: 'tgat', name: 'TGAT' }, autoRenewDatesDiffer: true });
    render(<MockExamDetail id="m1" />);
    const input = await within(await screen.findByTestId('mock-access-panel')).findByLabelText('โค้ด Unlock');
    await user.type(input, 'tgat7days');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));

    expect(await within(panel()).findByRole('status')).toHaveTextContent(/^ได้รับแพ็กเกจ PRO TGAT ถึง /);
    await waitFor(() => expect(getMockExam).toHaveBeenCalledTimes(2));
    expect(input).toHaveValue('');
    expect(within(panel()).getByRole('button', { name: 'Unlock' })).toBeEnabled();
    expect(within(panel()).getByRole('link', { name: /Upgrade/ })).toBeInTheDocument();
    expect(within(panel()).getByRole('note')).toHaveTextContent('ต่ออายุสิทธิ์แล้ว แต่วันตัดบัตรรอบถัดไปยังเป็นวันเดิม');
  });
});
