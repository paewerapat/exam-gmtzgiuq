import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const exam = (id: string, title: string, bankOnly?: boolean) => ({
  id,
  title,
  category: 'tgat',
  status: 'published',
  questionCount: 3,
  questions: [],
  author: { id: 'a' },
  releaseDate: '2026-11-05T07:30:00.000Z',
  createdAt: '2026-11-05T07:30:00.000Z',
  updatedAt: '2026-11-05T07:30:00.000Z',
  ...(bankOnly === undefined ? {} : { bankOnly }),
});

describe('AdminExamsPage — ป้ายและตัวกรอง Question Bank (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getExamStats as jest.Mock).mockResolvedValue({ total: 2, published: 2, draft: 0, byCategory: [] });
    (getCategories as jest.Mock).mockResolvedValue([]);
    (getAdminExams as jest.Mock).mockResolvedValue({
      items: [exam('e1', 'ชุดคลังข้อ', true), exam('e2', 'ชุดปกติ', false), exam('e3', 'ชุดจาก API เก่า')],
      total: 3,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('ชุด bankOnly มีป้าย "Question Bank" เฉพาะแถวนั้น', async () => {
    render(<AdminExamsPage />);
    const row = (await screen.findByText('ชุดคลังข้อ')).closest('tr')!;
    expect(row).toHaveTextContent('Question Bank');
    expect(screen.getByText('ชุดปกติ', { selector: 'div' }).closest('tr')).not.toHaveTextContent('Question Bank');
    expect(screen.getByText('ชุดจาก API เก่า').closest('tr')).not.toHaveTextContent('Question Bank');
  });

  it('ตัวกรองประเภทชุด → ส่ง bankOnly ไป API และกลับหน้า 1', async () => {
    render(<AdminExamsPage />);
    await screen.findByText('ชุดคลังข้อ');
    expect((getAdminExams as jest.Mock).mock.calls[0][0].bankOnly).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Question Bank' }));
    await waitFor(() => expect((getAdminExams as jest.Mock).mock.lastCall[0]).toMatchObject({ bankOnly: true, page: 1 }));
    expect(screen.getByRole('button', { name: 'Question Bank' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'ชุดปกติ' }));
    await waitFor(() => expect((getAdminExams as jest.Mock).mock.lastCall[0]).toMatchObject({ bankOnly: false }));
  });
});
