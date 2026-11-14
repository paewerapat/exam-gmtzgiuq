import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import PracticeExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import { completeAttempt, getMyInProgressForExam, startInProgressAttempt, submitAttempt } from '@/lib/api/attempts';
import { ApiError, CAMPAIGN_ENDED_RESUME_TEXT } from '@/lib/api/apiError';
import { EXAM_STORAGE_KEYS } from '@/lib/exam-utils';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn().mockResolvedValue(undefined),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// ExamContainer แทนด้วยข้อความ + ปุ่มส่งที่ทำแบบเดียวกับของจริง (completeExam → เก็บ storage → onComplete)
jest.mock('@/components/exam', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { saveExamSession } = require('@/lib/exam-utils');
  function FakeExamContainer({
    onComplete,
    timerSettings,
  }: {
    onComplete: () => void | Promise<void>;
    timerSettings?: { recommendedMinutes?: number | null };
  }) {
    const { state, selectAnswer, completeExam } = useExam();
    return (
      <div>
        <p>หน้าข้อสอบ แนะนำ {String(timerSettings?.recommendedMinutes)}</p>
        <button type="button" onClick={() => selectAnswer(state.session.questionIds[0], '1')}>
          ตอบข้อนี้
        </button>
        <button
          type="button"
          onClick={async () => {
            const { session, questions } = completeExam();
            saveExamSession(session, questions);
            await onComplete();
          }}
        >
          ส่งข้อสอบ
        </button>
      </div>
    );
  }
  return { ExamContainer: FakeExamContainer };
});

const exam = {
  id: 'e1',
  title: 'Campaign',
  category: 'tgat',
  durationMinutes: 90,
  passages: [],
  questions: [{ id: 'q1', question: '1', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

function renderPage() {
  render(<PracticeExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('/practice/exam/[examId] — task 21', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
  });

  it.each([
    ['CAMPAIGN_NOT_OPEN', 'แคมเปญยังไม่เปิด', 'แคมเปญนี้ยังไม่เปิด เริ่มทำได้เมื่อแคมเปญเปิด'],
    ['CAMPAIGN_ENDED', 'แคมเปญจบแล้ว', 'แคมเปญนี้จบแล้ว เริ่มทำใหม่ไม่ได้'],
  ])('start attempt 403 %s → หยุดพร้อมข้อความไทย ไม่เข้าหน้าข้อสอบ และไม่ทิ้ง session ค้าง', async (code, title, message) => {
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('closed', 403, code));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole('link', { name: 'ไปหน้ารายละเอียดชุดข้อสอบ' })).toHaveAttribute('href', '/dashboard/mock-exams/e1');
    expect(screen.queryByText(/หน้าข้อสอบ/)).not.toBeInTheDocument();
    expect(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION)).toBeNull();
  });

  it.each([
    ['CAMPAIGN_NOT_OPEN', 'แคมเปญยังไม่เปิด'],
    ['CAMPAIGN_ENDED', 'แคมเปญจบแล้ว'],
  ])('GET /exams/:id ตอบ 403 %s ตอนโหลด → CampaignClosedScreen ไม่เริ่ม attempt', async (code, title) => {
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('closed', 403, code));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(title);
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText(/หน้าข้อสอบ/)).not.toBeInTheDocument();
  });

  it('ส่งแบบ legacy (ไม่มี attempt ค้าง) แล้ว API ตอบ CAMPAIGN_ENDED → ไม่ไปหน้าผล, แจ้งว่าไม่ได้บันทึก, คำตอบยังอยู่ในเครื่อง (R3)', async () => {
    // start attempt ล้มด้วย error อื่น → ทำต่อโดยไม่มี attempt (ส่งผ่าน POST /attempts)
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('boom', 500, null));
    (submitAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    renderPage();
    await screen.findByText('หน้าข้อสอบ แนะนำ 90');
    fireEvent.click(screen.getByRole('button', { name: 'ตอบข้อนี้' }));
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('แคมเปญจบแล้ว');
    expect(submitAttempt).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('ส่งข้อสอบไม่สำเร็จ ผลนี้ยังไม่ได้บันทึก (คำตอบเก็บไว้ในเครื่องนี้)');
    expect(mockPush).not.toHaveBeenCalledWith('/practice/exam/e1/results');
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
    expect(saved.status).toBe('in_progress');
    expect(saved.completedAt).toBeUndefined();
    expect(saved.answers).toEqual({ q1: '1' });
  });

  it('ส่งแบบ legacy สำเร็จ → ไปหน้าผลตามเดิม', async () => {
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('boom', 500, null));
    (submitAttempt as jest.Mock).mockResolvedValue({ id: 'att-9' });
    renderPage();
    await screen.findByText('หน้าข้อสอบ แนะนำ 90');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/practice/exam/e1/results'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('เริ่มใหม่: นับขึ้นเป็นค่าเริ่มต้น (ไม่ตั้ง durationSeconds) และส่งเวลาสอบจริงเป็นค่าแนะนำ', async () => {
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
    expect(saved.durationSeconds).toBeNull();
  });

  // ── Q1: แคมเปญจบแล้ว + attempt ค้างบน server แต่ไม่มี session ในเครื่อง ──
  const backendAttempt = (patch: Record<string, unknown> = {}) => ({
    id: 'att-old',
    examId: 'e1',
    examTitle: 'Campaign',
    category: 'tgat',
    mode: 'practice',
    status: 'in_progress',
    questionIds: ['q1'],
    currentIndex: 0,
    answers: {},
    timePerQuestion: {},
    startedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  });

  it('Q1: attempt ค้างยังไม่ได้ตอบ + start 403 CAMPAIGN_ENDED → ทำ attempt เดิมต่อ แล้วส่งเข้า attempt เดิม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    (completeAttempt as jest.Mock).mockResolvedValue({ id: 'att-old' });
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    await waitFor(() => expect(completeAttempt).toHaveBeenCalledWith('att-old', expect.any(Object)));
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it('Q1: attempt ค้างที่ตอบแล้ว (ข้อ 1) → ถามทำต่อ ไม่เริ่มใหม่ทับคำตอบ', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ answers: { q1: '1' } }));
    renderPage();
    expect(await screen.findByText('ทำข้อสอบค้างอยู่')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ทำต่อจากข้อที่ 1/ }));
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
    expect(saved.answers).toEqual({ q1: '1' });
  });

  it('M3: แคมเปญจบแล้ว กด "เริ่มทำใหม่" ใน dialog ทำค้าง (start 403 CAMPAIGN_ENDED) → แจ้งแล้วทำ attempt เดิมต่อ ส่งเข้า attempt เดิม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ answers: { q1: '1' } }));
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    (completeAttempt as jest.Mock).mockResolvedValue({ id: 'att-old' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'เริ่มทำใหม่' }));
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(CAMPAIGN_ENDED_RESUME_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
    expect(saved.answers).toEqual({ q1: '1' });
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-old');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));
    await waitFor(() => expect(completeAttempt).toHaveBeenCalledWith('att-old', expect.any(Object)));
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it('M3: แคมเปญยังเปิด กด "เริ่มทำใหม่" → เริ่ม attempt ใหม่ตามเดิม ไม่แจ้งเรื่องแคมเปญ', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ answers: { q1: '1' } }));
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-new' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'เริ่มทำใหม่' }));
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    expect(toast.info).not.toHaveBeenCalledWith(CAMPAIGN_ENDED_RESUME_TEXT);
    expect(localStorage.getItem('exam_backend_attempt_id_e1')).toBe('att-new');
    expect(JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}').answers).toEqual({});
  });

  it('Q1: แคมเปญยังเปิด + attempt ค้างที่ยังไม่ได้ตอบ → เริ่มตามเดิม ไม่ถาม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-old' });
    renderPage();
    expect(await screen.findByText('หน้าข้อสอบ แนะนำ 90')).toBeInTheDocument();
    expect(startInProgressAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('ทำข้อสอบค้างอยู่')).not.toBeInTheDocument();
  });

  it('N2: กดส่งซ้ำระหว่างรอ legacy submit → เรียก POST /attempts ครั้งเดียวและไปหน้าผลครั้งเดียว', async () => {
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('boom', 500, null));
    let resolveSubmit: (v: unknown) => void = () => {};
    (submitAttempt as jest.Mock).mockImplementation(
      () =>
        new Promise((r) => {
          resolveSubmit = r;
        }),
    );
    renderPage();
    await screen.findByText('หน้าข้อสอบ แนะนำ 90');
    const send = screen.getByRole('button', { name: 'ส่งข้อสอบ' });
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(submitAttempt).toHaveBeenCalledTimes(1));
    resolveSubmit({ id: 'att-9' });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/practice/exam/e1/results'));
    expect(submitAttempt).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('N2: กดส่งซ้ำระหว่างรอ complete attempt → เรียก complete ครั้งเดียว', async () => {
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    (completeAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    renderPage();
    await screen.findByText('หน้าข้อสอบ แนะนำ 90');
    const send = screen.getByRole('button', { name: 'ส่งข้อสอบ' });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/practice/exam/e1/results'));
    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
