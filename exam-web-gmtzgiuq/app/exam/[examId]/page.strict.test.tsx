import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RealExamPage from './page';
import PracticeExamPage from '@/app/practice/exam/[examId]/page';
import { getPublicExam } from '@/lib/api/exams';
import { getMyInProgressForExam, startInProgressAttempt } from '@/lib/api/attempts';
import { saveExamSession, saveRealExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn().mockResolvedValue({}),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// แทน UI ข้อสอบจริงด้วยตัวบอกข้อปัจจุบัน (หน้าใช้ ExamContainer จาก 2 path)
jest.mock('@/components/exam/ExamContainer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  function FakeExamContainer() {
    const { state } = useExam();
    return <p>ข้อปัจจุบัน {state.session.currentIndex + 1}</p>;
  }
  return { __esModule: true, default: FakeExamContainer, ExamContainer: FakeExamContainer };
});
jest.mock('@/components/exam', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/components/exam/ExamContainer');
  return { ExamContainer: mod.default };
});

const question = (id: string) => ({ id, question: id, type: 'short_answer', correctAnswer: '1', choices: [] });
const exam = {
  id: 'e1',
  title: 'ชุดทดสอบ',
  category: 'tgat',
  durationMinutes: 60,
  passages: [],
  questions: [question('q1'), question('q2'), question('q3')],
};

const attempt = (patch: object = {}) => ({
  id: 'att-1',
  examId: 'e1',
  examTitle: 'ชุดทดสอบ',
  category: 'tgat',
  status: 'in_progress',
  mode: 'exam',
  questionIds: ['q1', 'q2', 'q3'],
  totalQuestions: 3,
  currentIndex: 0,
  answers: {},
  timePerQuestion: {},
  startedAt: new Date().toISOString(),
  ...patch,
});

const session = (patch: Partial<ExamSession> = {}): ExamSession => ({
  id: 's1',
  examId: 'e1',
  examTitle: 'ชุดทดสอบ',
  category: 'tgat' as ExamSession['category'],
  questionIds: ['q1', 'q2', 'q3'],
  currentIndex: 1,
  answers: { q1: '1' },
  markedForReview: [],
  timePerQuestion: {},
  startedAt: new Date().toISOString(),
  durationSeconds: 3600,
  status: 'in_progress',
  ...patch,
});

const pages = [
  ['/exam/[examId] (จับเวลา/Mock)', RealExamPage],
  ['/practice/exam/[examId]', PracticeExamPage],
] as const;

function renderStrict(Page: (typeof pages)[number][1]) {
  return render(
    <StrictMode>
      <Page params={Promise.resolve({ examId: 'e1' })} />
    </StrictMode>,
  );
}

describe.each(pages)('%s — StrictMode เริ่ม/โหลดครั้งเดียว (task 13 รอบ 2)', (_name, Page) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue(attempt());
  });

  it('เปิดครั้งแรก → POST /attempts/start ครั้งเดียว และเห็นข้อสอบ', async () => {
    renderStrict(Page);
    expect(await screen.findByText('ข้อปัจจุบัน 1')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(startInProgressAttempt).toHaveBeenCalledTimes(1);
    expect(getMyInProgressForExam).toHaveBeenCalledTimes(1);
    expect(getPublicExam).toHaveBeenCalledTimes(1);
  });

  it('มี session ค้างใน localStorage → ทำต่อจากข้อเดิม ไม่เรียก start', async () => {
    if (Page === RealExamPage) saveRealExamSession('e1', session(), exam.questions as never);
    else saveExamSession(session(), exam.questions as never);
    renderStrict(Page);
    expect(await screen.findByText('ข้อปัจจุบัน 2')).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('backend มี attempt ค้าง (ข้อ 3) → dialog ทำต่อ → กดแล้วไปข้อ 3 ไม่เรียก start', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(attempt({ currentIndex: 2, answers: { q1: '1', q2: '1' } }));
    renderStrict(Page);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อ/ }));
    expect(await screen.findByText('ข้อปัจจุบัน 3')).toBeInTheDocument();
    await waitFor(() => expect(getMyInProgressForExam).toHaveBeenCalledTimes(1));
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });
});
