import { render, screen, waitFor, within } from '@testing-library/react';
import DashboardSidebar from './DashboardSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { getMyPro } from '@/lib/api/pro';
import { resetHasProCache } from '@/lib/use-has-pro';

let mockPathname = '/dashboard/mock-exams/abc';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api/pro', () => ({ getMyPro: jest.fn() }));
jest.mock('@/components/feedback/FeedbackModal', () => ({
  __esModule: true,
  default: () => null,
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedGetMyPro = getMyPro as jest.Mock;

const member = { id: 'u1', email: 'a@b.c', firstName: 'A', role: 'user' };

function navLabels() {
  const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent?.replace('PROเฉพาะ Pro', '').trim());
}

describe('DashboardSidebar — โครงเมนูใหม่ (task 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHasProCache();
    mockPathname = '/dashboard/mock-exams/abc';
    mockedUseAuth.mockReturnValue({ user: member, logout: jest.fn() });
    mockedGetMyPro.mockResolvedValue([]);
  });

  it('เรียงตามดีไซน์: Dashboard / ข้อสอบเก่า / LUMO\'S EXAM / ของฉัน / เพิ่มเติม — ไม่มี Predicted Exam', async () => {
    render(<DashboardSidebar />);
    expect(navLabels()).toEqual([
      'Dashboard',
      'ฝึกทำข้อสอบ',
      'ทำข้อสอบแยกบท',
      'ฝึกทำข้อสอบ(จับเวลา)',
      'Question Bank',
      'Challenge Questions',
      'Free Mock Exam',
      'ประวัติการสอบ',
      'โปรไฟล์',
      'สมาชิกของฉัน',
      'บทความ',
    ]);
    const lumo = screen.getByRole('group', { name: "LUMO'S EXAM" });
    expect(within(lumo).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/question-bank',
      '/dashboard/challenge',
      '/dashboard/mock-exams',
    ]);
    expect(within(screen.getByRole('group', { name: 'ข้อสอบเก่า' })).getAllByRole('link')).toHaveLength(3);
    expect(within(screen.getByRole('group', { name: 'ของฉัน' })).getAllByRole('link')).toHaveLength(3);
    const more = within(screen.getByRole('group', { name: 'เพิ่มเติม' }));
    expect(more.getByRole('link', { name: 'บทความ' })).toBeInTheDocument();
    expect(more.getByRole('button', { name: 'ส่งความคิดเห็น' })).toBeInTheDocument();
    expect(screen.queryByText(/Predicted/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mock Exam' })).not.toBeInTheDocument();
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalled());
  });

  it('หน้ารายละเอียด/รายการ Free Mock → เมนู Free Mock Exam active เมนูเดียว (aria-current)', async () => {
    render(<DashboardSidebar />);
    const mock = screen.getByRole('link', { name: 'Free Mock Exam' });
    expect(mock).toHaveAttribute('href', '/dashboard/mock-exams');
    expect(mock).toHaveAttribute('aria-current', 'page');
    expect(mock.className).toContain('bg-indigo-600');
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalled());
  });

  it('ไม่มีแพ็กเกจ → ปุ่ม "Upgrade" [Pro] ไป /upgrade', async () => {
    render(<DashboardSidebar />);
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalledTimes(1));
    const btn = screen.getByTestId('sidebar-upgrade');
    expect(btn).toHaveAttribute('href', '/upgrade');
    expect(btn).toHaveTextContent('UpgradePro');
  });

  it('มีแพ็กเกจที่ยังใช้ได้ → "สมาชิก Pro" ไป /dashboard/membership', async () => {
    mockedGetMyPro.mockResolvedValue([{ id: 's1', status: 'active' }]);
    render(<DashboardSidebar />);
    await waitFor(() => expect(screen.getByTestId('sidebar-upgrade')).toHaveTextContent('สมาชิก Pro'));
    expect(screen.getByTestId('sidebar-upgrade')).toHaveAttribute('href', '/dashboard/membership');
  });

  it('desktop + drawer มือถือ (render 2 ที่) ใช้คำขอ /pro/me ครั้งเดียว', async () => {
    mockedGetMyPro.mockResolvedValue([{ id: 's1', status: 'active' }]);
    render(
      <>
        <DashboardSidebar />
        <DashboardSidebar onNavigate={jest.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByText('สมาชิก Pro')).toHaveLength(2));
    expect(mockedGetMyPro).toHaveBeenCalledTimes(1);
  });

  it('/pro/me ล้ม → ยังเป็นปุ่ม Upgrade', async () => {
    mockedGetMyPro.mockRejectedValue(new Error('down'));
    render(<DashboardSidebar />);
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalled());
    expect(screen.getByTestId('sidebar-upgrade')).toHaveAttribute('href', '/upgrade');
  });

  it('ไม่มีคำว่า "ปลดล็อก" ในเมนู', async () => {
    render(<DashboardSidebar />);
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalled());
  });

  it('admin เห็นกลุ่ม "ผู้ดูแลระบบ" / ผู้ใช้ทั่วไปไม่เห็น', async () => {
    mockedUseAuth.mockReturnValue({ user: { ...member, role: 'ADMIN' }, logout: jest.fn() });
    const { unmount } = render(<DashboardSidebar />);
    const admin = within(screen.getByRole('group', { name: 'ผู้ดูแลระบบ' }));
    expect(admin.getByRole('link', { name: 'จัดการข้อสอบ' })).toHaveAttribute('href', '/admin/exams');
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalled());
    unmount();
    mockedUseAuth.mockReturnValue({ user: { ...member, id: 'u2' }, logout: jest.fn() });
    render(<DashboardSidebar />);
    expect(screen.queryByRole('group', { name: 'ผู้ดูแลระบบ' })).not.toBeInTheDocument();
    await waitFor(() => expect(mockedGetMyPro).toHaveBeenCalledTimes(2));
  });
});

describe('DashboardSidebar — Question Bank / Challenge Questions (task 20) + guest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHasProCache();
    mockedUseAuth.mockReturnValue({ user: null, logout: jest.fn() });
  });

  it('มีเมนู Question Bank และ Challenge Questions (ป้าย PRO) ให้ guest เห็นด้วย ไม่เรียก /pro/me', () => {
    render(<DashboardSidebar />);
    expect(screen.getByRole('link', { name: 'Question Bank' })).toHaveAttribute('href', '/dashboard/question-bank');
    // ป้าย PRO เป็นภาพ (aria-hidden) แต่ screen reader ได้ยิน "เฉพาะ Pro" (round 2)
    const challenge = screen.getByRole('link', { name: 'Challenge Questions เฉพาะ Pro' });
    expect(challenge).toHaveAttribute('href', '/dashboard/challenge');
    expect(challenge).toHaveTextContent('PRO');
    expect(screen.getByTestId('sidebar-upgrade')).toHaveAttribute('href', '/upgrade');
    expect(mockedGetMyPro).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });
});
