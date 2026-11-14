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
  id: 'att-7',
  examId: 'camp-1',
  examTitle: 'แคมเปญ TGAT',
  category: 'tgat',
  totalQuestions: 1,
  correctAnswers: 1,
  incorrectAnswers: 0,
  unanswered: 0,
  score: 100,
  totalTime: 60,
  timePerQuestion: {},
  answers: { q1: 'a' },
  questionIds: ['q1'],
  currentIndex: 0,
  status: 'completed',
  mode: 'exam',
  startedAt: '2026-11-01T00:00:00.000Z',
  completedAt: '2026-11-01T00:01:00.000Z',
} as unknown as ExamAttempt;

const question = {
  id: 'q1',
  question: 'โจทย์แคมเปญ',
  type: 'multiple_choice',
  category: 'tgat',
  difficulty: 'medium',
  status: 'published',
  author: { id: 'u', firstName: '', lastName: '' },
  createdAt: '',
  updatedAt: '',
  choices: [
    { id: 'a', text: 'ถูก', isCorrect: true },
    { id: 'b', text: 'ผิด', isCorrect: false },
  ],
};

function renderPage() {
  render(<AttemptDetailPage params={Promise.resolve({ attemptId: 'att-7' })} />);
}

describe('ประวัติการสอบ — ชุดแคมเปญ (task 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMyAttempt as jest.Mock).mockResolvedValue(attempt);
  });

  it('แคมเปญจบแล้ว: GET /exams/:id ยังได้ 200 → "ดูผลและเฉลย" เห็นโจทย์และเฉลย', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue({ id: 'camp-1', title: 'แคมเปญ TGAT', questions: [question] });
    renderPage();
    expect(await screen.findByText('โจทย์แคมเปญ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'แคมเปญ TGAT' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText('ไม่พบข้อมูลการสอบ')).not.toBeInTheDocument();
  });

  it('แคมเปญถูกเลื่อนไปอนาคต (403 CAMPAIGN_NOT_OPEN) → คะแนนสรุปยังแสดง ไม่ error ทั้งหน้า', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('ยังไม่เปิด', 403, 'CAMPAIGN_NOT_OPEN'));
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'แคมเปญ TGAT' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.queryByText('ไม่พบข้อมูลการสอบ')).not.toBeInTheDocument();
  });
});
