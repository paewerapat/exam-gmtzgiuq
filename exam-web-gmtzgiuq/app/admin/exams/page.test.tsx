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

describe('AdminExamsPage — คอลัมน์วันเผยแพร่ (task 10)', () => {
  const exam = (id: string, title: string, dates: { releaseDate?: string; createdAt: string }) => ({
    id,
    title,
    category: 'tgat',
    status: 'published',
    questionCount: 3,
    questions: [],
    author: { id: 'a', email: 'a@x' },
    updatedAt: dates.createdAt,
    ...dates,
  });

  beforeEach(() => {
    (getExamStats as jest.Mock).mockResolvedValue({ total: 2, published: 2, draft: 0, byCategory: [] });
    (getCategories as jest.Mock).mockResolvedValue([]);
  });

  it('แสดงวันเผยแพร่เป็นเวลาไทยตามลำดับที่ API ส่งมา (ไม่มี releaseDate → createdAt)', async () => {
    (getAdminExams as jest.Mock).mockResolvedValue({
      items: [
        exam('e1', 'ชุดเก่าที่ตั้งวันใหม่', { releaseDate: '2026-11-05T07:30:00.000Z', createdAt: '2025-01-01T00:00:00.000Z' }),
        exam('e2', 'ชุดจาก API เก่า', { createdAt: '2026-01-10T17:30:00.000Z' }),
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    render(<AdminExamsPage />);
    expect(await screen.findByRole('columnheader', { name: 'วันเผยแพร่' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('ชุดเก่าที่ตั้งวันใหม่');
    expect(rows[0]).toHaveTextContent('5 พ.ย. 2569 14:30');
    expect(rows[1]).toHaveTextContent('ชุดจาก API เก่า');
    expect(rows[1]).toHaveTextContent('11 ม.ค. 2569 00:30');
  });
});
