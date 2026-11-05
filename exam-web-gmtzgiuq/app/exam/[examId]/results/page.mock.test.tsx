import { render, screen, waitFor } from '@testing-library/react';
import RealExamResultsPage from './page';
import { getMockExam } from '@/lib/api/exams';
import { saveRealExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getMockExam: jest.fn() }));
jest.mock('@/components/exam', () => ({
  ResultsSummary: () => <div data-testid="summary" />,
  QuestionReview: () => <div data-testid="review" />,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const question = {
  id: 'q1',
  question: '1+1',
  type: 'short_answer',
  correctAnswer: '2',
  choices: [],
} as unknown as Question;

const session: ExamSession = {
  id: 's1',
  examId: 'e1',
  examTitle: 'ชุดทดสอบ',
  category: 'tgat' as ExamSession['category'],
  questionIds: ['q1'],
  currentIndex: 0,
  answers: { q1: '2' },
  markedForReview: [],
  timePerQuestion: {},
  startedAt: '2026-11-05T00:00:00.000Z',
  completedAt: '2026-11-05T01:00:00.000Z',
  status: 'completed',
};

function renderPage() {
  saveRealExamSession('e1', session, [question]);
  render(<RealExamResultsPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('หน้าผลสอบจับเวลา — ปุ่มย้อนกลับของชุด Mock (task 11 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('ชุด Mock → "กลับหน้า Mock Exam" ไปหน้ารายละเอียด Mock', async () => {
    (getMockExam as jest.Mock).mockResolvedValue({ id: 'e1' });
    renderPage();
    const link = await screen.findByRole('link', { name: 'กลับหน้า Mock Exam' });
    expect(link).toHaveAttribute('href', '/dashboard/mock-exams/e1');
    expect(getMockExam).toHaveBeenCalledWith('e1', expect.anything());
  });

  it('ชุดปกติ (/exams/mock/:id 404 → null) → "กลับหน้าข้อสอบจริง" ไป /dashboard/exam', async () => {
    (getMockExam as jest.Mock).mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(getMockExam).toHaveBeenCalled());
    const link = await screen.findByRole('link', { name: 'กลับหน้าข้อสอบจริง' });
    expect(link).toHaveAttribute('href', '/dashboard/exam');
  });

  it('เช็กไม่ได้ (network error) → ใช้ลิงก์เดิม', async () => {
    (getMockExam as jest.Mock).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByRole('link', { name: 'กลับหน้าข้อสอบจริง' })).toHaveAttribute('href', '/dashboard/exam');
  });
});
