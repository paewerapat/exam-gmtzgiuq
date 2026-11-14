import { render, screen } from '@testing-library/react';
import DashboardSidebar from './DashboardSidebar';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/mock-exams/abc' }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/feedback/FeedbackModal', () => ({
  __esModule: true,
  default: () => null,
}));

const mockedUseAuth = useAuth as jest.Mock;

describe('DashboardSidebar — เมนู Mock Exam (task 11 AC3)', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.c', firstName: 'A', role: 'user' },
      logout: jest.fn(),
    });
  });

  it('มีเมนู "Mock Exam" อยู่ถัดจาก "ฝึกทำข้อสอบ(จับเวลา)" และลิงก์ไป /dashboard/mock-exams', () => {
    render(<DashboardSidebar />);
    const labels = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    const timed = labels.indexOf('ฝึกทำข้อสอบ(จับเวลา)');
    expect(timed).toBeGreaterThanOrEqual(0);
    expect(labels[timed + 1]).toBe('Mock Exam');
    expect(screen.getByRole('link', { name: 'Mock Exam' })).toHaveAttribute('href', '/dashboard/mock-exams');
  });

  it('อยู่ในหน้ารายละเอียด Mock Exam → เมนู Mock Exam เป็น active เมนูเดียว', () => {
    render(<DashboardSidebar />);
    const mock = screen.getByRole('link', { name: 'Mock Exam' });
    const timed = screen.getByRole('link', { name: 'ฝึกทำข้อสอบ(จับเวลา)' });
    expect(mock.className).not.toEqual(timed.className);
    expect(mock.className).toMatch(/indigo|bg-/);
  });

  it('ไม่มีคำว่า "ปลดล็อก" ในเมนู', () => {
    render(<DashboardSidebar />);
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });
});

describe('DashboardSidebar — Question Bank / Challenge Questions (task 20)', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ user: null, logout: jest.fn() });
  });

  it('มีเมนู Question Bank และ Challenge Questions (ป้าย PRO) ให้ guest เห็นด้วย', () => {
    render(<DashboardSidebar />);
    expect(screen.getByRole('link', { name: 'Question Bank' })).toHaveAttribute('href', '/dashboard/question-bank');
    // ป้าย PRO เป็นภาพ (aria-hidden) แต่ screen reader ได้ยิน "เฉพาะ Pro" (round 2)
    const challenge = screen.getByRole('link', { name: 'Challenge Questions เฉพาะ Pro' });
    expect(challenge).toHaveAttribute('href', '/dashboard/challenge');
    expect(challenge).toHaveTextContent('PRO');
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });
});
