import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import ProCodeRedeemBox from './ProCodeRedeemBox';
import { redeemUnlockCode } from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';

jest.mock('@/lib/api/unlockCodes', () => ({ redeemUnlockCode: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const proResult = {
  kind: 'pro' as const,
  venue: { key: 'netsat', name: 'NETSAT' },
  plan: { name: 'PRO' },
  currentPeriodEnd: '2026-11-20T05:00:00.000Z',
  autoRenewDatesDiffer: false,
};

async function openBox(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole('button', { name: /มีโค้ด\?/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return screen.getByLabelText('โค้ด');
}

describe('กล่อง "มีโค้ด?" (task 19)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('พับไว้ก่อน กดแล้วเห็นช่องกรอก (ตัวพิมพ์ใหญ่อัตโนมัติ) / ว่าง → แจ้งไม่เรียก API', async () => {
    const user = userEvent.setup();
    render(<ProCodeRedeemBox isLoggedIn loginRedirect="/upgrade" onRedeemed={jest.fn()} />);
    expect(screen.queryByLabelText('โค้ด')).not.toBeInTheDocument();
    const input = await openBox(user);
    await user.type(input, 'pro7days');
    expect(input).toHaveValue('PRO7DAYS');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกโค้ด');
    expect(redeemUnlockCode).not.toHaveBeenCalled();
  });

  it('โค้ด pro สำเร็จ → ไม่ส่ง examId, "ได้รับแพ็กเกจ PRO NETSAT ถึง …" + toast + onRedeemed, ล้างช่อง', async () => {
    const user = userEvent.setup();
    const onRedeemed = jest.fn();
    (redeemUnlockCode as jest.Mock).mockResolvedValue(proResult);
    render(<ProCodeRedeemBox isLoggedIn loginRedirect="/upgrade" onRedeemed={onRedeemed} />);
    const input = await openBox(user);
    await user.type(input, ' pro7days ');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    await waitFor(() => expect(onRedeemed).toHaveBeenCalledWith(proResult));
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'PRO7DAYS' });
    expect(screen.getByRole('status')).toHaveTextContent('ได้รับแพ็กเกจ PRO NETSAT ถึง 20 พ.ย. 2569');
    expect(toast.success).toHaveBeenCalledWith('ได้รับแพ็กเกจ PRO NETSAT ถึง 20 พ.ย. 2569');
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'ใช้โค้ด' })).toBeEnabled();
    expect(screen.queryByTestId('auto-renew-dates-note')).not.toBeInTheDocument();
  });

  it('autoRenewDatesDiffer → หมายเหตุว่าวันตัดบัตรรอบถัดไปยังเป็นวันเดิม', async () => {
    const user = userEvent.setup();
    (redeemUnlockCode as jest.Mock).mockResolvedValue({ ...proResult, autoRenewDatesDiffer: true });
    render(<ProCodeRedeemBox isLoggedIn loginRedirect="/dashboard/membership" onRedeemed={jest.fn()} />);
    await user.type(await openBox(user), 'PRO7DAYS');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByRole('note')).toHaveTextContent('ต่ออายุสิทธิ์แล้ว แต่วันตัดบัตรรอบถัดไปยังเป็นวันเดิม');
    expect(screen.getByTestId('auto-renew-dates-note').className).toContain('dark:bg-amber-900/30');
  });

  it.each([
    ['NOT_FOR_THIS_EXAM', 400, 'โค้ดนี้ใช้กับชุดข้อสอบ กรุณากรอกที่หน้าชุดข้อสอบ'],
    ['ALREADY_HIGHER_PLAN', 409, 'คุณมีแพ็กเกจของสนามนี้ที่ระดับสูงกว่าหรือเท่ากันอยู่แล้ว โค้ดนี้จึงยังไม่ถูกใช้'],
    ['BATCH_ALREADY_USED', 409, 'บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว'],
    ['ALREADY_REDEEMED', 409, 'คุณใช้โค้ดนี้ไปแล้ว ใช้ซ้ำไม่ได้'],
    ['TOO_MANY_ATTEMPTS', 429, 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่'],
  ])('error %s → ข้อความไทยใต้ช่อง (role=alert, aria-invalid)', async (code, status, message) => {
    const user = userEvent.setup();
    const onRedeemed = jest.fn();
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new ApiError('server', status, code));
    render(<ProCodeRedeemBox isLoggedIn loginRedirect="/upgrade" onRedeemed={onRedeemed} />);
    const input = await openBox(user);
    await user.type(input, 'ABCD1234');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(onRedeemed).not.toHaveBeenCalled();
  });

  it('เน็ตหลุด → ข้อความทั่วไป', async () => {
    const user = userEvent.setup();
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProCodeRedeemBox isLoggedIn loginRedirect="/upgrade" onRedeemed={jest.fn()} />);
    await user.type(await openBox(user), 'ABCD');
    await user.click(screen.getByRole('button', { name: 'ใช้โค้ด' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });

  it('guest → ช่อง/ปุ่ม disabled + ลิงก์เข้าสู่ระบบพากลับหน้าเดิม', async () => {
    const user = userEvent.setup();
    render(<ProCodeRedeemBox isLoggedIn={false} loginRedirect="/upgrade" onRedeemed={jest.fn()} />);
    const input = await openBox(user);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ใช้โค้ด' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute('href', '/login?redirect=%2Fupgrade');
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });
});
