import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import MockExamDetail from './MockExamDetail';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import { redeemUnlockCode } from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';
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

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000 - 60_000).toISOString(); // เหลือ 10 วัน

const exam = (patch: Partial<MockExamDetailData> = {}): MockExamDetailData => ({
  id: 'm1',
  title: 'TGAT Mock 1',
  category: 'tgat',
  categoryName: 'TGAT',
  subjectId: 's1',
  subjectName: 'ภาษาอังกฤษ',
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 90,
  level: 'hard',
  accessType: 'free',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  access: { status: 'free', expiresAt: null },
  venueKey: null,
  description: 'คำอธิบายเดิม',
  detailBlocks: [],
  codeInstructions: null,
  ...patch,
});

const codeExam = (patch: Partial<MockExamDetailData> = {}) =>
  exam({
    accessType: 'code',
    access: { status: 'locked', expiresAt: null },
    codeInstructions: {
      steps: [
        { title: 'ติดตามเพจ Instagram', description: 'กดติดตามเพจ LUMO', linkLabel: 'ไปที่ Instagram', linkUrl: 'https://instagram.com/lumo' },
        { title: 'รับโค้ดจากแอดมิน' },
      ],
      note: 'บัญชีที่แชร์ควรตั้งเป็นสาธารณะ',
    },
    ...patch,
  });

function setUser(user: object | null) {
  (useAuth as jest.Mock).mockReturnValue({ user });
}

function panel() {
  return screen.getByTestId('mock-access-panel');
}

describe('MockExamDetail (task 11 + task 15 โครงใหม่)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUser(null);
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([]);
  });

  it('แถบหัว: ชื่อ, สนามสอบ · วิชา, ป้าย FREE, N ข้อ / M นาที / ฟรี + กล่องรายละเอียด', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'TGAT Mock 1' })).toBeInTheDocument();
    const hero = screen.getByTestId('mock-detail-hero');
    expect(within(hero).getByText('TGAT · ภาษาอังกฤษ')).toBeInTheDocument();
    expect(within(hero).getByText('FREE')).toBeInTheDocument();
    const stats = within(screen.getByTestId('mock-hero-stats'));
    expect(stats.getByText('40')).toBeInTheDocument();
    expect(stats.getByText('90')).toBeInTheDocument();
    expect(stats.getByText('ทำได้ตลอด')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'รายละเอียดข้อสอบ' })).toBeInTheDocument();
    expect(screen.getByText('40 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('90 นาที')).toBeInTheDocument();
    expect(screen.getByText('ยาก')).toBeInTheDocument();
    expect(screen.getByText('ทำได้ตลอด ไม่ต้องใช้โค้ด')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /กลับไป Mock Exam/ })).toHaveAttribute('href', '/dashboard/mock-exams');
    expect(getMockExam).toHaveBeenCalledWith('m1', expect.anything());
  });

  it('ชุดฟรี (guest) → "เริ่มทำข้อสอบ" ไป /exam/<id> + ชวนเข้าสู่ระบบ (redirect กลับหน้านี้) ไม่เรียก attempts', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    const start = await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ });
    expect(start).toHaveAttribute('href', '/exam/m1');
    expect(within(panel()).getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdashboard%2Fmock-exams%2Fm1',
    );
    expect(within(panel()).getByRole('link', { name: 'สมัครสมาชิก' })).toHaveAttribute('href', '/register');
    expect(getMyInProgressAttempts).not.toHaveBeenCalled();
  });

  it('ชุดฟรี + login + มี attempt โหมด exam ค้าง → "ทำต่อ" ไม่มีลิงก์ชวน login', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([
      { id: 'a0', examId: 'm1', mode: 'practice' },
      { id: 'a1', examId: 'm1', mode: 'exam' },
    ]);
    render(<MockExamDetail id="m1" />);
    const resume = await screen.findByRole('link', { name: /ทำต่อ/ });
    expect(resume).toHaveAttribute('href', '/exam/m1');
    expect(within(panel()).queryByRole('link', { name: 'เข้าสู่ระบบ' })).not.toBeInTheDocument();
    expect(getMyInProgressAttempts).toHaveBeenCalledTimes(1);
  });

  it('ชุดฟรี + login แต่ attempt ค้างเป็นชุดอื่น/โหมดฝึก → "เริ่มทำข้อสอบ"', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([
      { id: 'a0', examId: 'm1', mode: 'practice' },
      { id: 'a2', examId: 'other', mode: 'exam' },
    ]);
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
  });

  it('ชุดโค้ด: กล่อง "วิธีรับโค้ด" เป็นการ์ดเรียงลำดับ + ปุ่มลิงก์เปิดแท็บใหม่ + หมายเหตุ', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    render(<MockExamDetail id="m1" />);
    const box = await screen.findByRole('region', { name: 'วิธีรับโค้ด' });
    expect(within(box).getByText('ทำตาม 2 ขั้นตอน')).toBeInTheDocument();
    const steps = within(within(box).getByTestId('code-steps')).getAllByRole('listitem');
    expect(steps.map((s) => within(s).getByRole('heading').textContent)).toEqual([
      'ขั้นที่ 1: ติดตามเพจ Instagram',
      'ขั้นที่ 2: รับโค้ดจากแอดมิน',
    ]);
    const link = within(steps[0]).getByRole('link', { name: /ไปที่ Instagram/ });
    expect(link).toHaveAttribute('href', 'https://instagram.com/lumo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(box).getByText('บัญชีที่แชร์ควรตั้งเป็นสาธารณะ')).toBeInTheDocument();
  });

  it('ชุดโค้ด + guest → ช่องโค้ด disabled + "ต้องเข้าสู่ระบบก่อนกรอกโค้ด" + ลิงก์ login พากลับ ไม่มีปุ่มเริ่มทำ', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    render(<MockExamDetail id="m1" />);
    const input = await screen.findByLabelText('โค้ด Unlock');
    expect(input).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(within(panel()).getByText(/ต้องเข้าสู่ระบบก่อนกรอกโค้ด/)).toBeInTheDocument();
    expect(within(panel()).getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdashboard%2Fmock-exams%2Fm1',
    );
    expect(screen.queryByRole('link', { name: /เริ่มทำ|ทำต่อ/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('CAMPAIGN')).toBeInTheDocument();
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('Campaign · ยังไม่ Unlock')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('ชุดโค้ด + login: ช่องกรอกมี label, autocomplete off, ตัวพิมพ์ใหญ่อัตโนมัติ; ว่าง → แจ้งไม่เรียก API', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    render(<MockExamDetail id="m1" />);
    const input = await screen.findByLabelText('โค้ด Unlock');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await user.type(input, 'ab-cd ef');
    expect(input).toHaveValue('AB-CD EF');
    await user.clear(input);
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกโค้ด');
    expect(redeemUnlockCode).not.toHaveBeenCalled();
    expect(getMyInProgressAttempts).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', 404, 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง'],
    ['DISABLED', 403, 'โค้ดนี้ถูกปิดใช้งานแล้ว'],
    ['EXPIRED', 410, 'โค้ดนี้หมดอายุแล้ว'],
    ['USED', 409, 'โค้ดนี้ถูกใช้ไปแล้ว'],
    ['ALREADY_REDEEMED', 409, 'คุณใช้โค้ดนี้ไปแล้ว ใช้ซ้ำไม่ได้'],
    ['BATCH_ALREADY_USED', 409, 'บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว'],
    ['NOT_FOR_THIS_EXAM', 422, 'โค้ดนี้ใช้กับชุดข้อสอบนี้ไม่ได้'],
    ['TOO_MANY_ATTEMPTS', 429, 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่'],
    ['INVALID_FORMAT', 400, 'รูปแบบโค้ดไม่ถูกต้อง'],
  ])('redeem error %s → ข้อความใต้ช่อง (role=alert, aria-describedby, aria-invalid)', async (code, status, msg) => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new ApiError('server message', status, code));
    render(<MockExamDetail id="m1" />);
    const input = await screen.findByLabelText('โค้ด Unlock');
    await user.type(input, 'abcd1234');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(msg);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(input).toHaveValue('ABCD1234');
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'ABCD1234', examId: 'm1' });
    expect(screen.queryByRole('link', { name: /เริ่มทำ/ })).not.toBeInTheDocument();
  });

  it('error ไม่รู้จักหรือ network → ข้อความทั่วไป; แก้ช่องแล้ว error หาย', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MockExamDetail id="m1" />);
    const input = await screen.findByLabelText('โค้ด Unlock');
    await user.type(input, 'x');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    await user.type(input, 'y');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('redeem สำเร็จ → Unlocked ทันทีไม่โหลดใหม่ + toast + ปุ่มเริ่มทำ (เช็ก attempt ค้าง) + ป้ายหัวเป็น Unlocked', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    (redeemUnlockCode as jest.Mock).mockResolvedValue({ unlockedExamIds: ['m1', 'm2'], expiresAt: FUTURE });
    render(<MockExamDetail id="m1" />);
    await user.type(await screen.findByLabelText('โค้ด Unlock'), ' lumo-abcd ');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));

    const start = await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ });
    expect(start).toHaveAttribute('href', '/exam/m1');
    await waitFor(() => expect(start).toHaveFocus());
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'LUMO-ABCD', examId: 'm1' });
    expect(toast.success).toHaveBeenCalledWith('Unlock สำเร็จ 2 ชุด เริ่มทำข้อสอบได้เลย');
    expect(within(panel()).getByRole('heading', { name: 'Unlocked' })).toBeInTheDocument();
    expect(within(panel()).getByTestId('access-until')).toHaveTextContent(/^ทำได้ถึง .+ · เหลือ 10 วัน$/);
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('Unlocked')).toBeInTheDocument();
    expect(screen.queryByLabelText('โค้ด Unlock')).not.toBeInTheDocument();
    expect(getMockExam).toHaveBeenCalledTimes(1);
    expect(getMyInProgressAttempts).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['code', 'ใช้โค้ดสำเร็จ', /^ทำได้ถึง .+ · เหลือ 10 วัน$/],
    ['pro', null, /^สิทธิ์จากแพ็กเกจ Pro · ใช้ได้ถึง .+$/],
    ['admin', null, /^มีสิทธิ์เข้าทำ · ใช้ได้ถึง .+$/],
    ['purchase', null, /^มีสิทธิ์เข้าทำ · ใช้ได้ถึง .+$/],
    [null, null, /^มีสิทธิ์เข้าทำ · ใช้ได้ถึง .+$/],
  ] as const)('กล่องสิทธิ์ตามที่มา (task 17): via=%s', async (via, title, line) => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, venueKey: 'netsat', access: { status: 'unlocked', expiresAt: FUTURE, via } }),
    );
    render(<MockExamDetail id="m1" />);
    await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ });
    expect(within(panel()).getByTestId('access-until')).toHaveTextContent(line);
    if (title) expect(within(panel()).getByText(title)).toBeInTheDocument();
    else expect(within(panel()).queryByText('ใช้โค้ดสำเร็จ')).not.toBeInTheDocument();
  });

  it('ชุดโค้ดที่ unlocked อยู่แล้ว + มี attempt ค้าง → "ทำต่อ" + วันหมดสิทธิ์ในแถบหัว', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam({ access: { status: 'unlocked', expiresAt: FUTURE } }));
    (getMyInProgressAttempts as jest.Mock).mockResolvedValue([{ id: 'a1', examId: 'm1', mode: 'exam' }]);
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /ทำต่อ/ })).toHaveAttribute('href', '/exam/m1');
    expect(within(screen.getByTestId('mock-hero-stats')).getByText('ทำได้ถึง')).toBeInTheDocument();
    expect(screen.queryByLabelText('โค้ด Unlock')).not.toBeInTheDocument();
  });

  it('unlocked แต่ expiresAt null (แอดมิน / ไม่หมดอายุ) → เริ่มทำได้ ไม่แสดง "ใช้โค้ดสำเร็จ" / วันหมดสิทธิ์', async () => {
    setUser({ id: 'admin1', role: 'admin' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam({ access: { status: 'unlocked', expiresAt: null } }));
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
    expect(within(panel()).queryByText('ใช้โค้ดสำเร็จ')).not.toBeInTheDocument();
    expect(screen.queryByTestId('access-until')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('mock-hero-stats')).queryByText('ทำได้ถึง')).not.toBeInTheDocument();
    expect(screen.getByText('ทำได้ไม่จำกัดเวลา')).toBeInTheDocument();
  });

  it('400 validation ของ Nest (message array ภาษาอังกฤษ ไม่มี errorCode) → ข้อความทั่วไปภาษาไทย', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(codeExam());
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new ApiError('examId must be a UUID', 400, null));
    render(<MockExamDetail id="m1" />);
    await user.type(await screen.findByLabelText('โค้ด Unlock'), 'K7M2XQ9PAB');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    expect(screen.getByLabelText('โค้ด Unlock')).toHaveAttribute('placeholder', 'เช่น K7M2XQ9PAB');
  });

  it('ชุดโค้ดที่สิทธิ์หมด →"สิทธิ์ของคุณหมดอายุแล้ว" + ช่องกรอกโค้ดใหม่ ไม่มีปุ่มเริ่มทำ', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      codeExam({ access: { status: 'expired', expiresAt: '2026-10-01T00:00:00.000Z' } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await within(await screen.findByTestId('mock-access-panel')).findByRole('heading', { name: 'สิทธิ์ของคุณหมดอายุแล้ว' })).toBeInTheDocument();
    expect(screen.getByLabelText('โค้ด Unlock')).toBeEnabled();
    expect(within(panel()).getByText(/กรอกโค้ดใหม่ \(ของแคมเปญอื่น\)/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /เริ่มทำ|ทำต่อ/ })).not.toBeInTheDocument();
    expect(getMyInProgressAttempts).not.toHaveBeenCalled();
  });

  it('ชุดซื้อ (ยังไม่มีสิทธิ์) → ราคา + ปุ่ม "ซื้อ" กดไม่ได้ "เปิดให้ซื้อเร็ว ๆ นี้"', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'locked', expiresAt: null } }),
    );
    render(<MockExamDetail id="m1" />);
    const btn = await screen.findByRole('button', { name: /ซื้อ/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText('เปิดให้ซื้อเร็ว ๆ นี้')).toBeInTheDocument();
    expect(screen.getAllByText('150 บาท').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: /เริ่มทำ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'วิธีรับโค้ด' })).not.toBeInTheDocument();
  });

  it('ชุดซื้อ + login → ใต้ปุ่มซื้อมี "มีโค้ด? กรอกเพื่อ Unlock" กรอกโค้ดสำเร็จ → เริ่มทำได้ทันที (รอบ 2)', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'locked', expiresAt: null } }),
    );
    (redeemUnlockCode as jest.Mock).mockResolvedValue({ unlockedExamIds: ['m1'], expiresAt: FUTURE });
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('button', { name: /ซื้อ/ })).toBeDisabled();
    expect(within(panel()).getByRole('heading', { name: 'มีโค้ด? กรอกเพื่อ Unlock' })).toBeInTheDocument();
    const input = within(panel()).getByLabelText('โค้ด Unlock');
    expect(input).toBeEnabled();
    await user.type(input, 'k7m2xq9pab');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
    expect(redeemUnlockCode).toHaveBeenCalledWith({ code: 'K7M2XQ9PAB', examId: 'm1' });
    expect(toast.success).toHaveBeenCalledWith('Unlock สำเร็จ เริ่มทำข้อสอบได้เลย');
    expect(screen.queryByRole('button', { name: /ซื้อ/ })).not.toBeInTheDocument();
  });

  it('ชุดซื้อ + กรอกโค้ดผิด → error ใต้ช่อง ปุ่มซื้อยังอยู่', async () => {
    const user = userEvent.setup();
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'locked', expiresAt: null } }),
    );
    (redeemUnlockCode as jest.Mock).mockRejectedValue(new ApiError('x', 422, 'NOT_FOR_THIS_EXAM'));
    render(<MockExamDetail id="m1" />);
    await user.type(await screen.findByLabelText('โค้ด Unlock'), 'K7M2XQ9PAB');
    await user.click(within(panel()).getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('โค้ดนี้ใช้กับชุดข้อสอบนี้ไม่ได้');
    expect(screen.getByRole('button', { name: /ซื้อ/ })).toBeDisabled();
  });

  it('ชุดซื้อที่หมวดผูกสนาม (venueKey) + locked → ปุ่ม Upgrade ไป /upgrade?venue=<key> แทนปุ่มซื้อ (task 17)', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, venueKey: 'netsat', access: { status: 'locked', expiresAt: null } }),
    );
    render(<MockExamDetail id="m1" />);
    const upgrade = await within(await screen.findByTestId('mock-access-panel')).findByRole('link', { name: 'Upgrade' });
    expect(upgrade).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(screen.queryByRole('button', { name: /ซื้อ/ })).not.toBeInTheDocument();
    // ป้ายราคาในแถบหัว + ช่องกรอกโค้ดยังอยู่
    expect(within(screen.getByTestId('mock-detail-hero')).getByText('150 บาท')).toBeInTheDocument();
    expect(within(panel()).getByLabelText('โค้ด Unlock')).toBeEnabled();
    expect(screen.queryByRole('link', { name: /เริ่มทำ/ })).not.toBeInTheDocument();
  });

  it('ชุดซื้อที่ผูกสนาม + สิทธิ์หมดอายุ → ยังเป็นปุ่ม Upgrade พร้อมแจ้งหมดอายุ / unlocked → เริ่มทำได้ ไม่มี Upgrade', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, venueKey: 'a-level', access: { status: 'expired', expiresAt: '2026-10-01T00:00:00.000Z' } }),
    );
    const { unmount } = render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/upgrade?venue=a-level');
    expect(within(panel()).getByText('สิทธิ์ของคุณหมดอายุแล้ว')).toBeInTheDocument();
    unmount();

    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, venueKey: 'netsat', access: { status: 'unlocked', expiresAt: FUTURE } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
    expect(screen.queryByRole('link', { name: 'Upgrade' })).not.toBeInTheDocument();
  });

  it('ชุดซื้อ + guest → ช่องโค้ด disabled + ลิงก์เข้าสู่ระบบ/สมัครสมาชิก', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'locked', expiresAt: null } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByLabelText('โค้ด Unlock')).toBeDisabled();
    expect(within(panel()).getByText(/ต้องเข้าสู่ระบบก่อนกรอกโค้ด/)).toBeInTheDocument();
    expect(within(panel()).getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdashboard%2Fmock-exams%2Fm1',
    );
  });

  it('ป้ายในแถบหัวมีสีโหมดมืด (dark:) ทุกป้าย', async () => {
    for (const patch of [
      {},
      { accessType: 'code' as const, access: { status: 'locked' as const, expiresAt: null } },
      { accessType: 'code' as const, access: { status: 'unlocked' as const, expiresAt: FUTURE } },
      { accessType: 'purchase' as const, price: 150, access: { status: 'expired' as const, expiresAt: null } },
    ]) {
      (getMockExam as jest.Mock).mockResolvedValue(exam(patch));
      const { unmount } = render(<MockExamDetail id="m1" />);
      const pills = within(await screen.findByTestId('mock-detail-hero')).getAllByRole('listitem');
      expect(pills.length).toBeGreaterThanOrEqual(2);
      for (const p of pills) expect(p.className).toMatch(/\bdark:bg-/);
      for (const p of pills) expect(p.className).toMatch(/\bdark:text-/);
      unmount();
    }
  });

  it('ชุดซื้อที่ Unlocked จากโค้ด → เริ่มทำได้', async () => {
    setUser({ id: 'u1' });
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({ accessType: 'purchase', price: 150, access: { status: 'unlocked', expiresAt: FUTURE } }),
    );
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByRole('link', { name: /เริ่มทำข้อสอบ/ })).toHaveAttribute('href', '/exam/m1');
    expect(screen.queryByRole('button', { name: /ซื้อ/ })).not.toBeInTheDocument();
  });

  it('คำอธิบายแบบ block เรียงตามที่แอดมินจัด รูปพอดีจอ มี alt', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(
      exam({
        detailBlocks: [
          { type: 'text', text: 'ข้อความบน' },
          { type: 'image', url: '/uploads/a.png' },
          { type: 'text', text: 'ข้อความล่าง' },
        ],
      }),
    );
    render(<MockExamDetail id="m1" />);
    const blocks = await screen.findByTestId('detail-blocks');
    const children = Array.from(blocks.children);
    expect(children.map((c) => (c.tagName === 'IMG' ? 'IMG' : c.textContent))).toEqual([
      'ข้อความบน',
      'IMG',
      'ข้อความล่าง',
    ]);
    const img = within(blocks).getByRole('img', { name: 'รูปประกอบ 1 — TGAT Mock 1' });
    // /uploads/ เติม base URL ของ API (เว็บกับไฟล์อัปโหลดอยู่คนละโดเมน)
    expect(img.getAttribute('src')).toMatch(/^https?:\/\/[^/]+.*\/uploads\/a\.png$/);
    expect(img.className).toContain('max-w-full');
    expect(img.className).toContain('h-auto');
    expect(screen.queryByText('คำอธิบายเดิม')).not.toBeInTheDocument();
  });

  it('ไม่มี block → แสดง description เดิม', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(exam());
    render(<MockExamDetail id="m1" />);
    expect(await screen.findByText('คำอธิบายเดิม')).toBeInTheDocument();
  });

  it('404 → "ไม่พบชุดข้อสอบ" + ลิงก์กลับ', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(null);
    render(<MockExamDetail id="nope" />);
    expect(await screen.findByRole('heading', { name: 'ไม่พบชุดข้อสอบ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /กลับไปหน้า Mock Exam/ })).toHaveAttribute('href', '/dashboard/mock-exams');
  });
});
