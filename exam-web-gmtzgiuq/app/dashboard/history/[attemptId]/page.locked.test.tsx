import { render, screen } from '@testing-library/react';
import AttemptDetailPage from './page';
import { getMyAttempt, type ExamAttempt } from '@/lib/api/attempts';
import { getPublicExam } from '@/lib/api/exams';
import { ApiError } from '@/lib/api/apiError';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/attempts', () => ({ getMyAttempt: jest.fn() }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const attempt = {
  id: 'att-1',
  examId: 'mock-1',
  examTitle: 'NETSAT Mock 1',
  category: 'netsat',
  totalQuestions: 40,
  correctAnswers: 30,
  incorrectAnswers: 8,
  unanswered: 2,
  score: 75,
  totalTime: 3600,
  timePerQuestion: {},
  answers: {},
  questionIds: ['q1'],
  currentIndex: 0,
  status: 'completed',
  mode: 'exam',
  startedAt: '2026-11-01T00:00:00.000Z',
  completedAt: '2026-11-01T01:00:00.000Z',
  createdAt: '2026-11-01T01:00:00.000Z',
} as unknown as ExamAttempt;

function renderPage() {
  render(<AttemptDetailPage params={Promise.resolve({ attemptId: 'att-1' })} />);
}

describe('ประวัติการสอบ — ชุดที่สิทธิ์หมด (task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMyAttempt as jest.Mock).mockResolvedValue(attempt);
  });

  it('exam ล็อก (403 EXAM_LOCKED) → คะแนนสรุปยังแสดง + ข้อความ ไม่แสดงแท็บเฉลย ไม่ error', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('ชุดข้อสอบนี้ต้อง Unlock ก่อน', 403, 'EXAM_LOCKED'));
    renderPage();
    expect(await screen.findByText('สิทธิ์ของชุดนี้หมดอายุ ดูโจทย์และเฉลยไม่ได้')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'NETSAT Mock 1' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('30/40')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เฉลยข้อสอบ' })).not.toBeInTheDocument();
    expect(screen.queryByText('ไม่พบข้อมูลการสอบ')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ไปหน้ารายละเอียดชุดข้อสอบ' })).toHaveAttribute(
      'href',
      '/dashboard/mock-exams/mock-1',
    );
  });

  it('exam ถูกลบ (error อื่น) → พฤติกรรมเดิม: แท็บเฉลยแสดง "ไม่สามารถโหลดข้อมูลคำถามได้"', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('Exam not found', 404, null));
    renderPage();
    expect(await screen.findByText('ไม่สามารถโหลดข้อมูลคำถามได้')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เฉลยข้อสอบ' })).toBeInTheDocument();
    expect(screen.queryByText('สิทธิ์ของชุดนี้หมดอายุ ดูโจทย์และเฉลยไม่ได้')).not.toBeInTheDocument();
  });
});
