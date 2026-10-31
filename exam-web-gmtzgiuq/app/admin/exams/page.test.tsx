import { render, screen } from '@testing-library/react';
import AdminExamsPage from './page';
import { getAdminExams, getExamStats } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';

jest.mock('@/lib/api/exams', () => ({
  getAdminExams: jest.fn(),
  getExamStats: jest.fn(),
  deleteExam: jest.fn(),
  updateExam: jest.fn(),
}));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('AdminExamsPage — ปุ่มนำเข้า (task 01 AC1)', () => {
  beforeEach(() => {
    (getAdminExams as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    (getExamStats as jest.Mock).mockResolvedValue({ total: 0, published: 0, draft: 0, byCategory: [] });
    (getCategories as jest.Mock).mockResolvedValue([]);
  });

  it('มีลิงก์ "นำเข้า" ไป /admin/exams/import อยู่คู่กับปุ่มสร้างชุดข้อสอบ', async () => {
    render(<AdminExamsPage />);
    const link = await screen.findByRole('link', { name: 'นำเข้า' });
    expect(link).toHaveAttribute('href', '/admin/exams/import');
    expect(link.className).toMatch(/dark:/);
    expect(screen.getByRole('link', { name: 'สร้างชุดข้อสอบ' })).toHaveAttribute('href', '/admin/exams/new');
  });
});
