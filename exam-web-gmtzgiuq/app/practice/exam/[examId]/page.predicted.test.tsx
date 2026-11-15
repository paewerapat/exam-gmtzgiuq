import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PracticeExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import {
  completeAttempt,
  getMyInProgressForExam,
  startInProgressAttempt,
  updateAttemptProgress,
} from '@/lib/api/attempts';
import { ApiError } from '@/lib/api/apiError';
import { normalizeExamPredicted, recallPredicted, rememberPredicted } from '@/lib/predicted';
import { loadExamSession, saveExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';

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
  updateAttemptProgress: jest.fn().mockResolvedValue(undefined),
  completeAttempt: jest.fn().mockResolvedValue(undefined),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// timeout ของ complete สั้นลงใน test (หน้าใช้ 15 วินาที) — เก็บค่า ms ที่หน้าส่งมาไว้ตรวจ
const mockTimeoutCalls: number[] = [];
jest.mock('@/lib/with-timeout', () => {
  const actual = jest.requireActual('@/lib/with-timeout');
  return {
    withTimeout: (p: Promise<unknown>, ms: number) => {
      mockTimeoutCalls.push(ms);
      return actual.withTimeout(p, 300);
    },
  };
});
// แสดง notice / backUrl ที่หน้าส่งให้ ExamContainer + ปุ่มตอบ/ส่ง (ผ่าน ExamContext จริง)
jest.mock('@/components/exam', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  function FakeExamContainer({
    notice,
    backUrl,
    onComplete,
  }: {
    notice?: React.ReactNode;
    backUrl?: string;
    onComplete: () => void;
  }) {
    const { selectAnswer, state } = useExam();
    return (
      <div>
        <p>หน้าข้อสอบ</p>
        <p data-testid="back-url">{backUrl ?? '(ค่าเริ่มต้น)'}</p>
        <p data-testid="question-count">{state.questions.length}</p>
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
  return { ExamContainer: FakeExamContainer };
});

const q = (id: string) => ({
  id,
  question: id,
  type: 'short_answer',
  correctAnswer: '1',
  choices: [],
});

const previewExam = {
  id: 'e1',
  title: 'NETSAT MATH ชุดที่ 1',
  category: 'netsat',
  passages: [],
  questions: [q('q1'), q('q2'), q('q3')],
  predicted: {
    access: 'preview',
    previewCount: 3,
    totalQuestions: 40,
    seriesId: 's1',
    setNo: 1,
    venueKey: 'netsat',
  },
};

function renderPage() {
  render(<PracticeExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('/practice/exam/[examId] — ชุด Predicted (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    (updateAttemptProgress as jest.Mock).mockResolvedValue(undefined);
    (completeAttempt as jest.Mock).mockResolvedValue(undefined);
  });

  it('preview → แถบ "Preview 3 จาก 40 ข้อ" + Upgrade ไป /upgrade?venue= + ปุ่มกลับไปหน้า Predicted + จำข้อมูลให้หน้าผล', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    renderPage();
    const bar = await screen.findByTestId('predicted-preview-bar');
    expect(bar).toHaveTextContent('Preview 3 จาก 40 ข้อ');
    expect(screen.getByRole('link', { name: 'Upgrade เป็น Pro' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(screen.getByTestId('back-url')).toHaveTextContent('/dashboard/predicted');
    expect(recallPredicted('e1')).toMatchObject({
      access: 'preview',
      totalQuestions: 40,
    });
    // attempt เริ่มด้วยข้อที่ได้มา (เฉพาะ Preview) — server ตั้ง mode preview เอง
    expect(startInProgressAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'e1',
        totalQuestions: 3,
        questionIds: ['q1', 'q2', 'q3'],
      }),
    );
  });

  it('full → ไม่มีแถบ Preview / ชุดปกติ → ไม่มีแถบและลบข้อมูล predicted เก่า', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue({
      ...previewExam,
      predicted: { ...previewExam.predicted, access: 'full' },
    });
    const { unmount } = render(<PracticeExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(screen.queryByTestId('predicted-preview-bar')).not.toBeInTheDocument();
    unmount();

    localStorage.clear();
    localStorage.setItem('token', 't');
    localStorage.setItem('predicted_exam_info_e1', JSON.stringify({ access: 'preview', totalQuestions: 9 }));
    (getPublicExam as jest.Mock).mockResolvedValue({
      ...previewExam,
      predicted: undefined,
    });
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(screen.queryByTestId('predicted-preview-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('back-url')).toHaveTextContent('(ค่าเริ่มต้น)');
    expect(recallPredicted('e1')).toBeNull();
  });

  it('GET /exams/:id 403 PREDICTED_LOCKED → หน้าล็อก + Unlock (ไม่ใช่ error ทั่วไป ไม่ redirect)', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(
      new ApiError('ชุดข้อสอบนี้สำหรับสมาชิก Pro', 403, 'PREDICTED_LOCKED', {
        venueKey: 'alevel',
      }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ชุดนี้สำหรับสมาชิก Pro' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=alevel');
    expect(screen.getByRole('link', { name: 'กลับหน้า Predicted Exam' })).toHaveAttribute('href', '/dashboard/predicted');
    expect(screen.queryByText('ไม่สามารถโหลดข้อสอบได้')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('start attempt 403 PREDICTED_LOCKED (ไม่มี venueKey) → หน้าล็อก Unlock ไป /upgrade และทิ้ง session ที่เพิ่งสร้าง', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ล็อก', 403, 'PREDICTED_LOCKED'));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade');
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
    expect(loadExamSession().session).toBeNull();
  });

  it('session เดิมมีข้อที่ API ไม่ส่งแล้ว (สิทธิ์ลดเหลือ Preview) → เริ่มใหม่ด้วยข้อ Preview ไม่ resume ของเดิม', async () => {
    const old: ExamSession = {
      id: 'old',
      examId: 'e1',
      examTitle: 'เก่า',
      category: 'netsat' as ExamSession['category'],
      questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      currentIndex: 4,
      answers: { q4: '1' },
      markedForReview: [],
      timePerQuestion: {},
      startedAt: new Date().toISOString(),
      durationSeconds: null,
      status: 'in_progress',
    };
    saveExamSession(old, []);
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    renderPage();
    await screen.findByTestId('predicted-preview-bar');
    await waitFor(() => expect(startInProgressAttempt).toHaveBeenCalled());
    expect(loadExamSession().session?.questionIds).toEqual(['q1', 'q2', 'q3']);
  });

  // ── ได้ Pro ภายหลัง: attempt/session ของ Preview ไม่ resume (Q2) ──
  const fullExam = {
    ...previewExam,
    questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')],
    predicted: {
      ...previewExam.predicted,
      access: 'full',
      previewCount: 2,
      totalQuestions: 5,
    },
  };
  const previewSession = (patch: Partial<ExamSession> = {}): ExamSession => ({
    id: 'preview-session',
    examId: 'e1',
    examTitle: 'NETSAT MATH ชุดที่ 1',
    category: 'netsat' as ExamSession['category'],
    questionIds: ['q1', 'q2'],
    currentIndex: 1,
    answers: { q1: '1' },
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'in_progress',
    ...patch,
  });

  it('attempt Preview ค้างบน server (มีคำตอบ) + ตอนนี้ทำได้เต็ม → ไม่ถามทำต่อ เริ่มใหม่ทั้งชุด', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue({
      id: 'att-preview',
      mode: 'preview',
      examTitle: 'NETSAT MATH ชุดที่ 1',
      category: 'netsat',
      questionIds: ['q1', 'q2'],
      currentIndex: 1,
      answers: { q1: '1' },
      timePerQuestion: {},
      startedAt: new Date().toISOString(),
    });
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(screen.queryByText('ทำข้อสอบค้างอยู่')).not.toBeInTheDocument();
    expect(screen.getByTestId('question-count')).toHaveTextContent('5');
    expect(startInProgressAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        totalQuestions: 5,
        questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      }),
    );
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-1');
  });

  it('session ในเครื่องของ Preview (ค้าง / ส่งแล้ว) + ตอนนี้ทำได้เต็ม → ทิ้ง session เริ่มใหม่ทั้งชุด ไม่ไปหน้าผลเดิม', async () => {
    for (const status of ['in_progress', 'completed'] as const) {
      jest.clearAllMocks();
      (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
      (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
      saveExamSession(previewSession({ status }), [q('q1'), q('q2')] as never);
      // โหลดครั้งก่อน (ตอนสร้าง session) เป็น Preview
      rememberPredicted(
        'e1',
        normalizeExamPredicted({
          access: 'preview',
          previewCount: 2,
          totalQuestions: 5,
        }),
      );
      localStorage.setItem('exam_backend_attempt_id_e1', 'att-preview');
      (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
      const { unmount } = render(<PracticeExamPage params={Promise.resolve({ examId: 'e1' })} />);
      expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalledWith('/practice/exam/e1/results');
      expect(startInProgressAttempt).toHaveBeenCalledWith(expect.objectContaining({ totalQuestions: 5 }));
      const saved = loadExamSession().session;
      expect(saved?.id).not.toBe('preview-session');
      expect(saved?.questionIds).toHaveLength(5);
      expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-1');
      unmount();
    }
  });

  it('attempt เต็มบน server ที่มีข้อน้อยกว่าที่โหลดได้ (แอดมินเพิ่มข้อ) + ทำได้เต็ม → ยังถามทำต่อ ไม่ทิ้งคำตอบ (M1)', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue({
      id: 'att-full',
      mode: 'practice',
      examTitle: 'NETSAT MATH ชุดที่ 1',
      category: 'netsat',
      questionIds: ['q1', 'q2', 'q3'],
      currentIndex: 2,
      answers: { q1: '1', q2: '1' },
      timePerQuestion: {},
      startedAt: new Date().toISOString(),
    });
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    expect(await screen.findByText('ทำข้อสอบค้างอยู่')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ทำต่อจากข้อที่ 3/ })).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('session ในเครื่องที่สร้างตอนทำได้เต็ม แต่มีข้อน้อยกว่า (แอดมินเพิ่มข้อ) → ทำต่อ ไม่เริ่มใหม่ (M1)', async () => {
    saveExamSession(previewSession({ id: 'full-session', questionIds: ['q1', 'q2', 'q3'] }), [] as never);
    localStorage.setItem('exam_backend_attempt_id_e1', 'att-full');
    rememberPredicted('e1', normalizeExamPredicted({ access: 'full', totalQuestions: 3 }));
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(loadExamSession().session).toMatchObject({
      id: 'full-session',
      answers: { q1: '1' },
    });
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-full');
  });

  it('session ในเครื่องที่ครบชุด + ทำได้เต็ม → ทำต่อตามเดิม (ไม่เริ่มใหม่)', async () => {
    saveExamSession(previewSession({ questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] }), [] as never);
    localStorage.setItem('exam_backend_attempt_id_e1', 'att-full');
    (getPublicExam as jest.Mock).mockResolvedValue(fullExam);
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(loadExamSession().session?.id).toBe('preview-session');
  });

  // ── 403 PREDICTED_LOCKED ระหว่างทำ / ตอนส่ง (N3) ──
  it('autosave 403 PREDICTED_LOCKED → หน้าล็อก Unlock (คำตอบยังอยู่ในเครื่อง)', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    (updateAttemptProgress as jest.Mock).mockRejectedValue(
      new ApiError('ล็อก', 403, 'PREDICTED_LOCKED', { venueKey: 'netsat' }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }));
    expect(await screen.findByRole('link', { name: 'Unlock' }, { timeout: 5000 })).toHaveAttribute(
      'href',
      '/upgrade?venue=netsat',
    );
    expect(updateAttemptProgress).toHaveBeenCalledWith('att-1', expect.objectContaining({ answers: { q1: '1' } }));
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
    expect(loadExamSession().session?.answers).toEqual({ q1: '1' });
  });

  it('complete 403 PREDICTED_LOCKED → หน้าล็อก ไม่ไปหน้าผล, session กลับเป็นกำลังทำ + เก็บ attempt id ไว้', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    (completeAttempt as jest.Mock).mockRejectedValue(
      new ApiError('ล็อก', 403, 'PREDICTED_LOCKED', { venueKey: 'netsat' }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }));
    // ExamContext เก็บ session ลง storage แบบหน่วง 500ms (ExamContainer จริงเก็บก่อนเรียก onComplete)
    await waitFor(() => expect(loadExamSession().session?.answers).toEqual({ q1: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    expect(await screen.findByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(completeAttempt).toHaveBeenCalledWith('att-1', expect.objectContaining({ questionIds: ['q1', 'q2', 'q3'] }));
    expect(mockPush).not.toHaveBeenCalledWith('/practice/exam/e1/results');
    const saved = loadExamSession(true).session;
    expect(saved?.status).toBe('in_progress');
    expect(saved?.answers).toEqual({ q1: '1' });
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-1');
  });

  it('ระหว่างรอ complete → overlay "กำลังส่งข้อสอบ…" (aria-live) / ช้าเกิน timeout → ไปหน้าผลต่อ (M2)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTimeoutCalls.length = 0;
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    (completeAttempt as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งข้อสอบ' }));
    const overlay = await screen.findByTestId('submitting-overlay');
    expect(overlay).toHaveTextContent('กำลังส่งข้อสอบ…');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay.parentElement).toBe(document.body);
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/practice/exam/e1/results'));
    expect(mockTimeoutCalls).toEqual([15000]);
  });

  it('complete สำเร็จ → รอผลแล้วไปหน้าผล + ล้าง attempt id', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(previewExam);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งข้อสอบ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/practice/exam/e1/results'));
    expect(completeAttempt).toHaveBeenCalledWith('att-1', expect.anything());
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBeNull();
  });
});
