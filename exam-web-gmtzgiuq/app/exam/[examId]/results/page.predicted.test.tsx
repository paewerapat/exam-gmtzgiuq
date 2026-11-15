import { render, screen } from '@testing-library/react';
import RealExamResultsPage from './page';
import PracticeResultsPage from '@/app/practice/exam/[examId]/results/page';
import { getMockExam } from '@/lib/api/exams';
import { saveExamSession, saveRealExamSession } from '@/lib/exam-utils';
import { rememberPredicted } from '@/lib/predicted';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getMockExam: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/exam', () => ({
  ResultsSummary: () => <div data-testid="summary" />,
  QuestionReview: () => <div data-testid="review" />,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const question = (id: string) =>
  ({ id, question: '1+1', type: 'short_answer', correctAnswer: '2', choices: [] }) as unknown as Question;

const session: ExamSession = {
  id: 's1',
  examId: 'e1',
  examTitle: 'NETSAT MATH ชุดที่ 1',
  category: 'netsat' as ExamSession['category'],
  questionIds: ['q1', 'q2'],
  currentIndex: 1,
  answers: { q1: '2' },
  markedForReview: [],
  timePerQuestion: {},
  startedAt: '2026-11-05T00:00:00.000Z',
  completedAt: '2026-11-05T01:00:00.000Z',
  status: 'completed',
};

const previewInfo = {
  access: 'preview' as const,
  previewCount: 2,
  totalQuestions: 40,
  seriesId: 's',
  setNo: 1,
  venueKey: 'netsat',
};

describe('หน้าผลของชุด Predicted (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (getMockExam as jest.Mock).mockResolvedValue(null);
  });

  it('สอบจริง + preview → กล่อง "Upgrade เป็น Pro เพื่อทำครบ 40 ข้อ" + ปุ่มกลับหน้า Predicted', async () => {
    rememberPredicted('e1', previewInfo);
    saveRealExamSession('e1', session, [question('q1'), question('q2')]);
    render(<RealExamResultsPage params={Promise.resolve({ examId: 'e1' })} />);
    const box = await screen.findByTestId('predicted-upgrade-box');
    expect(box).toHaveTextContent('Upgrade เป็น Pro เพื่อทำครบ 40 ข้อ');
    expect(box).toHaveTextContent('ผลนี้มาจาก Preview 2 ข้อแรกของชุด');
    expect(screen.getByRole('link', { name: 'Upgrade เป็น Pro' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(screen.getByRole('link', { name: 'กลับหน้า Predicted Exam' })).toHaveAttribute('href', '/dashboard/predicted');
  });

  it('ฝึก + preview → กล่อง Upgrade / full → ไม่มีกล่อง แต่ปุ่มกลับไปหน้า Predicted', async () => {
    rememberPredicted('e1', previewInfo);
    saveExamSession(session, [question('q1'), question('q2')]);
    const { unmount } = render(<PracticeResultsPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByTestId('predicted-upgrade-box')).toHaveTextContent('Upgrade เป็น Pro เพื่อทำครบ 40 ข้อ');
    unmount();

    rememberPredicted('e1', { ...previewInfo, access: 'full' });
    render(<PracticeResultsPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByRole('link', { name: 'กลับหน้า Predicted Exam' })).toHaveAttribute('href', '/dashboard/predicted');
    expect(screen.queryByTestId('predicted-upgrade-box')).not.toBeInTheDocument();
  });

  it('ชุดปกติ → ไม่มีกล่อง Upgrade และปุ่มกลับเดิม', async () => {
    saveRealExamSession('e1', session, [question('q1'), question('q2')]);
    render(<RealExamResultsPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByRole('link', { name: 'กลับหน้าข้อสอบจริง' })).toBeInTheDocument();
    expect(screen.queryByTestId('predicted-upgrade-box')).not.toBeInTheDocument();
  });
});
