import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RealExamPage from './page';
import PracticeExamPage from '@/app/practice/exam/[examId]/page';
import { getPublicExam } from '@/lib/api/exams';
import { completeAttempt, getMyInProgressForExam, submitAttempt } from '@/lib/api/attempts';
import { saveExamSession, saveRealExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn().mockResolvedValue({}),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// แทน UI ข้อสอบด้วยปุ่มส่งที่เรียก onComplete ของหน้า (หน้าใช้ ExamContainer จาก 2 path)
jest.mock('@/components/exam/ExamContainer', () => {
  function FakeExamContainer({ onComplete }: { onComplete: () => void }) {
    return (
      <button type="button" onClick={onComplete}>
        ส่งข้อสอบ
      </button>
    );
  }
  return { __esModule: true, default: FakeExamContainer, ExamContainer: FakeExamContainer };
});
jest.mock('@/components/exam', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/components/exam/ExamContainer');
  return { ExamContainer: mod.default };
});

const FIND = { timeout: 5000 };
const TEST_TIMEOUT = 15000;

const question = (id: string) => ({ id, question: id, type: 'short_answer', correctAnswer: '1', choices: [] });
const exam = {
  id: 'e1',
  title: 'ชุดทดสอบ',
  category: 'tgat',
  durationMinutes: 60,
  passages: [],
  questions: [question('q1'), question('q2')],
};

const session = (): ExamSession => ({
  id: 's1',
  examId: 'e1',
  examTitle: 'ชุดทดสอบ',
  category: 'tgat' as ExamSession['category'],
  questionIds: ['q1', 'q2'],
  currentIndex: 1,
  answers: { q1: '1' },
  markedForReview: [],
  timePerQuestion: {},
  startedAt: new Date().toISOString(),
  durationSeconds: 3600,
  status: 'in_progress',
});

const pages = [
  {
    name: '/exam/[examId]',
    Page: RealExamPage,
    attemptKey: 'real_exam_backend_attempt_id_e1',
    seed: () => saveRealExamSession('e1', session(), exam.questions as never),
    results: '/exam/e1/results',
  },
  {
    name: '/practice/exam/[examId]',
    Page: PracticeExamPage,
    attemptKey: 'exam_backend_attempt_id_e1',
    seed: () => saveExamSession(session(), exam.questions as never),
    results: '/practice/exam/e1/results',
  },
];

describe.each(pages)('$name — ส่งข้อสอบแล้ว complete ได้ 409 (task 14 B3)', ({ Page, attemptKey, seed, results }) => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    // ทำต่อจาก session ในเครื่อง + attempt id เดิม (attempt นี้ถูกส่งไปแล้วจากแท็บอื่น)
    seed();
    localStorage.setItem(attemptKey, 'att-1');
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it('API ตอบ 409 (completeAttempt throw) → ยังไปหน้าผลตามปกติ ไม่ยิง submit ซ้ำ', async () => {
    (completeAttempt as jest.Mock).mockRejectedValue(new Error('Failed to complete attempt'));
    render(<Page params={Promise.resolve({ examId: 'e1' })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ส่งข้อสอบ' }, FIND));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(results), FIND);
    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(completeAttempt).toHaveBeenCalledWith('att-1', expect.objectContaining({ examId: 'e1' }));
    expect(submitAttempt).not.toHaveBeenCalled();
    // error ไม่ถูกแสดงบนหน้า (มีแค่ console)
    expect(screen.queryByText(/Failed to complete attempt/)).not.toBeInTheDocument();
    // attempt id ถูกล้าง ไม่ให้เปิดครั้งหน้าไปผูก attempt ที่ส่งแล้ว
    expect(localStorage.getItem(attemptKey)).toBeNull();
  }, TEST_TIMEOUT);

  it('complete สำเร็จ → ไปหน้าผลเหมือนเดิม', async () => {
    (completeAttempt as jest.Mock).mockResolvedValue({ id: 'att-1', status: 'completed' });
    render(<Page params={Promise.resolve({ examId: 'e1' })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'ส่งข้อสอบ' }, FIND));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(results), FIND);
    expect(completeAttempt).toHaveBeenCalledTimes(1);
  }, TEST_TIMEOUT);
});
