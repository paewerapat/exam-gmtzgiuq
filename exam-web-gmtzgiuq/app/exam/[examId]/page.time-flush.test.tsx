import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RealExamPage from './page';
import PracticeExamPage from '@/app/practice/exam/[examId]/page';
import { getPublicExam } from '@/lib/api/exams';
import { completeAttempt, getMyInProgressForExam, startInProgressAttempt, submitAttempt } from '@/lib/api/attempts';
import { loadExamSession, loadRealExamSession } from '@/lib/exam-utils';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn().mockResolvedValue({}),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// UI ข้อสอบจริงแทนด้วย: แสดงเวลาของข้อปัจจุบัน + ปุ่มส่งที่เรียก onComplete ตรง ๆ
// (ทางเดียวกับหมดเวลา — ไม่ผ่าน completeExam() ของ ExamContainer)
jest.mock('@/components/exam/ExamContainer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  function FakeExamContainer({ onComplete }: { onComplete: () => void }) {
    const { state } = useExam();
    return (
      <div>
        <span>{`เวลาข้อนี้ ${state.currentTimer}`}</span>
        <button type="button" onClick={onComplete}>
          ส่งข้อสอบ
        </button>
      </div>
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

// ชุด 1 ข้อ (กรณีใน BUG-22: เปิดข้อเดียวแล้วส่ง ไม่เคยเปลี่ยนข้อ)
const exam = {
  id: 'e1',
  title: 'ชุดข้อเดียว',
  category: 'tgat',
  durationMinutes: 60,
  passages: [],
  questions: [{ id: 'q1', question: 'q1', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

const pages = [
  {
    name: '/exam/[examId]',
    Page: RealExamPage,
    storedSession: () => loadRealExamSession('e1').session,
  },
  {
    name: '/practice/exam/[examId]',
    Page: PracticeExamPage,
    storedSession: () => loadExamSession(true).session,
  },
];

describe.each(pages)('$name — ส่งแล้วนับเวลาของข้อที่เปิดอยู่ (BUG-22)', ({ Page, storedSession }) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    (completeAttempt as jest.Mock).mockResolvedValue({ id: 'att-1', status: 'completed' });
  });

  it('ชุด 1 ข้อ: timePerQuestion ที่ส่ง complete มีเวลาข้อสุดท้าย และ totalTime / หน้าผลไม่เป็น 0', async () => {
    render(<Page params={Promise.resolve({ examId: 'e1' })} />);
    // รอให้นาฬิกาของข้อนี้เดินอย่างน้อย 1 วินาที (ยังไม่เปลี่ยนข้อเลย)
    await screen.findByText('เวลาข้อนี้ 1', undefined, FIND);

    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));

    await waitFor(() => expect(completeAttempt).toHaveBeenCalledTimes(1), FIND);
    expect(submitAttempt).not.toHaveBeenCalled();
    const payload = (completeAttempt as jest.Mock).mock.calls[0][1];
    expect(payload.timePerQuestion.q1).toBeGreaterThanOrEqual(1);
    expect(payload.totalTime).toBe(payload.timePerQuestion.q1);
    // หน้าผลอ่าน session จาก storage → เวลาต้องอยู่ในนั้นด้วย
    expect(storedSession()?.timePerQuestion.q1).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);
});
