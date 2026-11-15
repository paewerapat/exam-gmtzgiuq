import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RealExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import {
  completeAttempt,
  getMyInProgressForExam,
  startInProgressAttempt,
  updateAttemptProgress,
} from '@/lib/api/attempts';
import { ApiError } from '@/lib/api/apiError';
import { loadRealExamSession, saveRealExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';
import { normalizeExamPredicted, recallPredicted, rememberPredicted } from '@/lib/predicted';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn(),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/lib/api/serverTime', () => ({
  fetchClockOffset: jest.fn().mockResolvedValue(0),
}));
jest.mock('@/components/exam/ExamContainer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  function FakeExamContainer({
    onComplete,
    notice,
    backUrl,
    mode,
  }: {
    onComplete: () => void;
    notice?: React.ReactNode;
    backUrl?: string;
    mode?: string;
  }) {
    const { selectAnswer } = useExam();
    return (
      <div>
        <p data-testid="mode">{mode}</p>
        <p data-testid="back-url">{backUrl}</p>
        {notice}
        <button type="button" onClick={() => selectAnswer('q1', '1')}>
          ตอบข้อ 1
        </button>
        <button type="button" onClick={onComplete}>
          ส่งข้อสอบ
        </button>
      </div>
    );
  }
  return { __esModule: true, default: FakeExamContainer };
});

const q = (id: string) => ({
  id,
  question: id,
  type: 'short_answer',
  correctAnswer: '1',
  choices: [],
});

const exam = {
  id: 'e1',
  title: 'NETSAT PHYSICS ชุดที่ 2',
  category: 'netsat',
  durationMinutes: 60,
  isMock: false,
  passages: [],
  questions: [q('q1'), q('q2')],
  predicted: {
    access: 'preview',
    previewCount: 2,
    totalQuestions: 20,
    seriesId: 's1',
    setNo: 2,
  },
};

// ใต้โหลดของ jest ทั้งชุด หน้าโหลดช้ากว่า 1 วินาทีได้
const WAIT = { timeout: 5000 };

function renderPage() {
  render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('/exam/[examId] — ชุด Predicted (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    (updateAttemptProgress as jest.Mock).mockResolvedValue(undefined);
    (completeAttempt as jest.Mock).mockResolvedValue(undefined);
  });

  it('preview → แถบ "Preview 2 จาก 20 ข้อ" (สีโหมดสอบจริง) + ปุ่มกลับไปหน้า Predicted / ไม่มี venueKey → /upgrade', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    renderPage();
    const bar = await screen.findByTestId('predicted-preview-bar', {}, WAIT);
    expect(bar).toHaveTextContent('Preview 2 จาก 20 ข้อ');
    const upgrade = screen.getByRole('link', { name: 'Upgrade เป็น Pro' });
    expect(upgrade).toHaveAttribute('href', '/upgrade');
    expect(upgrade.className).toContain('bg-rose-600');
    expect(screen.getByTestId('mode')).toHaveTextContent('exam');
    expect(screen.getByTestId('back-url')).toHaveTextContent('/dashboard/predicted');
    // timer ของโหมดสอบจริงทำงานตามเดิม (durationMinutes) + start attempt โหมด exam (server เปลี่ยนเป็น preview เอง)
    expect(loadRealExamSession('e1').session?.durationSeconds).toBe(3600);
    expect(startInProgressAttempt).toHaveBeenCalledWith(expect.objectContaining({ mode: 'exam', totalQuestions: 2 }));
  });

  it('ส่งข้อสอบ preview → complete แล้วไปหน้าผล (หน้าผลอ่านข้อมูล predicted จาก storage)', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }, WAIT));
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/exam/e1/results'), WAIT);
    expect(completeAttempt).toHaveBeenCalledWith(
      'att-1',
      expect.objectContaining({ totalQuestions: 2, questionIds: ['q1', 'q2'] }),
    );
    expect(recallPredicted('e1')).toMatchObject({
      access: 'preview',
      totalQuestions: 20,
    });
  });

  it('403 PREDICTED_LOCKED ตอนโหลด → หน้าล็อก + Unlock ไม่ redirect ไปหน้า Mock', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(
      new ApiError('ชุดข้อสอบนี้สำหรับสมาชิก Pro', 403, 'PREDICTED_LOCKED', {
        venueKey: 'netsat',
      }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ชุดนี้สำหรับสมาชิก Pro' }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('สิทธิ์หมดตอนส่ง (complete 403 PREDICTED_LOCKED) → หน้าล็อก ไม่ไปหน้าผล คำตอบยังอยู่ในเครื่อง', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue({
      ...exam,
      predicted: { ...exam.predicted, access: 'full' },
    });
    (completeAttempt as jest.Mock).mockRejectedValue(new ApiError('ล็อก', 403, 'PREDICTED_LOCKED'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }, WAIT));
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    expect(await screen.findByRole('link', { name: 'Unlock' }, WAIT)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/exam/e1/results');
    const saved = loadRealExamSession('e1').session;
    expect(saved?.status).toBe('in_progress');
    expect(saved?.answers).toEqual({ q1: '1' });
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-1');
  });

  it('attempt ค้างบน server ที่มีข้อเกินชุด Preview (Pro หมด) → ไม่ถามทำต่อ เริ่มใหม่ด้วยข้อ Preview', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue({
      id: 'old',
      mode: 'exam',
      examTitle: 'เก่า',
      category: 'netsat',
      questionIds: ['q1', 'q2', 'q3'],
      currentIndex: 2,
      answers: { q3: '1' },
      timePerQuestion: {},
      startedAt: new Date().toISOString(),
    });
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    renderPage();
    await screen.findByTestId('predicted-preview-bar', {}, WAIT);
    expect(screen.queryByText('ข้อสอบจริงที่ค้างอยู่')).not.toBeInTheDocument();
    expect(loadRealExamSession('e1').session?.questionIds).toEqual(['q1', 'q2']);
  });

  const previewAttempt = {
    id: 'att-preview',
    mode: 'preview',
    examTitle: 'NETSAT PHYSICS ชุดที่ 2',
    category: 'netsat',
    questionIds: ['q1', 'q2'],
    currentIndex: 1,
    answers: { q1: '1' },
    timePerQuestion: { q1: 10 },
    startedAt: new Date().toISOString(),
  };
  const fullExam = {
    ...exam,
    questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')],
    predicted: {
      ...exam.predicted,
      access: 'full',
      previewCount: 2,
      totalQuestions: 5,
    },
  };

  it('attempt Preview ค้าง (เริ่มจากหน้าฝึก) + ยังเป็น Preview → ถามทำต่อ และทำต่อ attempt เดิมได้ (N4)', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(previewAttempt);
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    renderPage();
    expect(await screen.findByText('ข้อสอบจริงที่ค้างอยู่', {}, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ทำต่อจากข้อที่ 2/ }));
    await screen.findByTestId('predicted-preview-bar', {}, WAIT);
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(loadRealExamSession('e1').session).toMatchObject({
      questionIds: ['q1', 'q2'],
      answers: { q1: '1' },
    });
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-preview');
  });

  it('attempt Preview ค้าง + ตอนนี้ทำได้เต็ม (ได้ Pro) → ไม่ถามทำต่อ เริ่มใหม่ทั้งชุด (Q2)', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(previewAttempt);
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    await screen.findByRole('button', { name: 'ส่งข้อสอบ' }, WAIT);
    expect(screen.queryByText('ข้อสอบจริงที่ค้างอยู่')).not.toBeInTheDocument();
    expect(screen.queryByTestId('predicted-preview-bar')).not.toBeInTheDocument();
    expect(startInProgressAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        totalQuestions: 5,
        questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      }),
    );
    expect(loadRealExamSession('e1').session?.questionIds).toHaveLength(5);
  });

  it('session ในเครื่องของ Preview (2 ข้อ) + ตอนนี้ทำได้เต็ม → ทิ้ง session เริ่มใหม่ทั้งชุด (Q2)', async () => {
    saveRealExamSession(
      'e1',
      {
        id: 'old-session',
        examId: 'e1',
        examTitle: 'เก่า',
        category: 'netsat' as ExamSession['category'],
        questionIds: ['q1', 'q2'],
        currentIndex: 1,
        answers: { q1: '1' },
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        durationSeconds: 3600,
        status: 'in_progress',
      },
      [],
    );
    localStorage.setItem('real_exam_backend_attempt_id_e1', 'att-preview');
    // โหลดครั้งก่อน (ตอนสร้าง session) เป็น Preview
    rememberPredicted(
      'e1',
      normalizeExamPredicted({
        access: 'preview',
        previewCount: 2,
        totalQuestions: 5,
      }),
    );
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    await screen.findByRole('button', { name: 'ส่งข้อสอบ' }, WAIT);
    await waitFor(
      () => expect(startInProgressAttempt).toHaveBeenCalledWith(expect.objectContaining({ totalQuestions: 5 })),
      WAIT,
    );
    const saved = loadRealExamSession('e1').session;
    expect(saved?.id).not.toBe('old-session');
    expect(saved?.questionIds).toHaveLength(5);
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-1');
  });

  it('attempt เต็ม (mode exam) ที่มีข้อน้อยกว่าที่โหลดได้ (แอดมินเพิ่มข้อ) + ทำได้เต็ม → ยังถามทำต่อ (M1)', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue({
      ...previewAttempt,
      id: 'att-full',
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
    });
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    expect(await screen.findByText('ข้อสอบจริงที่ค้างอยู่', {}, WAIT)).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('session ในเครื่องที่สร้างตอนทำได้เต็ม แต่มีข้อน้อยกว่า (แอดมินเพิ่มข้อ) → ทำต่อ ไม่เริ่มใหม่ (M1)', async () => {
    saveRealExamSession(
      'e1',
      {
        id: 'full-session',
        examId: 'e1',
        examTitle: 'เต็ม',
        category: 'netsat' as ExamSession['category'],
        questionIds: ['q1', 'q2', 'q3'],
        currentIndex: 1,
        answers: { q1: '1' },
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        durationSeconds: 3600,
        status: 'in_progress',
      },
      [],
    );
    localStorage.setItem('real_exam_backend_attempt_id_e1', 'att-full');
    rememberPredicted('e1', normalizeExamPredicted({ access: 'full', totalQuestions: 3 }));
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    await screen.findByRole('button', { name: 'ส่งข้อสอบ' }, WAIT);
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(loadRealExamSession('e1').session).toMatchObject({
      id: 'full-session',
      answers: { q1: '1' },
    });
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-full');
  });
});
