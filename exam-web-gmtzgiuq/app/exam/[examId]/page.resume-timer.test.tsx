import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import RealExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import { completeAttempt, getMyInProgressForExam, startInProgressAttempt } from '@/lib/api/attempts';
import { fetchClockOffset } from '@/lib/api/serverTime';
import { ApiError, CAMPAIGN_ENDED_RESUME_TEXT } from '@/lib/api/apiError';
import { loadRealExamSession } from '@/lib/exam-utils';
import { trackEvent } from '@/lib/api/analytics';

// task 21 M2: ทำต่อจาก attempt บน server (เช่นเบราว์เซอร์ใหม่) ต้องนับถอยหลังเวลาที่เหลือ ไม่ใช่ทำได้ไม่จำกัดเวลา
// task 21 M3: กด "เริ่มสอบใหม่" บนแคมเปญที่จบแล้ว → แจ้งแล้วทำ attempt เดิมต่อ

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn().mockResolvedValue(undefined),
  completeAttempt: jest.fn().mockResolvedValue({}),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn() }));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/components/exam/ExamContainer', () => ({
  __esModule: true,
  default: () => <p>หน้าข้อสอบ</p>,
}));

const exam = (patch: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'ชุดจริง',
  category: 'tgat',
  durationMinutes: 60,
  isMock: true,
  passages: [],
  questions: [
    { id: 'q1', question: '1', type: 'short_answer', correctAnswer: '1', choices: [] },
    { id: 'q2', question: '2', type: 'short_answer', correctAnswer: '2', choices: [] },
  ],
  ...patch,
});

// เริ่มเมื่อ 2 ชั่วโมงก่อน (ปิดหน้าไปนาน) แต่ใช้เวลาทำจริงตาม timePerQuestion
const STARTED_AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const backendAttempt = (patch: Record<string, unknown> = {}) => ({
  id: 'att-old',
  examId: 'e1',
  examTitle: 'ชุดจริง',
  category: 'tgat',
  mode: 'exam',
  status: 'in_progress',
  questionIds: ['q1', 'q2'],
  currentIndex: 1,
  answers: { q1: '1' },
  timePerQuestion: { q1: 400, q2: 200 },
  startedAt: STARTED_AT,
  ...patch,
});

/** เวลาที่เหลือ (วินาที) ตามสูตรของ ExamContainer: startedAt + duration + totalPausedMs − เวลา server */
function remainingOf(offsetMs: number): number {
  const s = loadRealExamSession('e1').session!;
  const end = new Date(s.startedAt).getTime() + (s.durationSeconds ?? 0) * 1000 + (s.totalPausedMs ?? 0);
  return (end - (Date.now() + offsetMs)) / 1000;
}

describe('/exam/[examId] — ทำต่อจาก attempt บน server (task 21 M2/M3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (fetchClockOffset as jest.Mock).mockResolvedValue(0);
    (getPublicExam as jest.Mock).mockResolvedValue(exam());
  });

  it('M2: เหลือเวลาบางส่วน → นับถอยหลังเวลาที่เหลือ = duration − เวลาที่ใช้จริง (ไม่นับช่วงปิดหน้า) startedAt เดิม', async () => {
    (fetchClockOffset as jest.Mock).mockResolvedValue(5000); // นาฬิกาเครื่องช้ากว่า server 5 วินาที
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อจากข้อที่ 2/ }));
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();

    const s = loadRealExamSession('e1').session!;
    expect(s.durationSeconds).toBe(3600);
    expect(s.startedAt).toBe(STARTED_AT);
    expect(s.answers).toEqual({ q1: '1' });
    // 3600 − (400 + 200) = 3000 วินาที (เผื่อเวลาที่ test รัน)
    expect(remainingOf(5000)).toBeGreaterThan(2995);
    expect(remainingOf(5000)).toBeLessThanOrEqual(3000);
    // ExamContainer ใช้ offset เดียวกันจนกว่าจะ sync เอง (review 4 ข้อ 2)
    expect(s.clockOffsetBasisMs).toBe(5000);
    expect(completeAttempt).not.toHaveBeenCalled();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('M2: แคมเปญจบแล้ว + attempt ที่ยังไม่ได้ตอบ (fallback ทำต่ออัตโนมัติ) ก็นับถอยหลังเต็มเวลา', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(
      backendAttempt({ currentIndex: 0, answers: {}, timePerQuestion: {} }),
    );
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(loadRealExamSession('e1').session?.durationSeconds).toBe(3600);
    expect(remainingOf(0)).toBeGreaterThan(3595);
  });

  it('M2: เวลาหมดแล้ว → ส่งทันทีด้วย complete ครั้งเดียว ไม่เปิดหน้าข้อสอบ แล้วไปหน้าผล', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ timePerQuestion: { q1: 3000, q2: 700 } }));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อจากข้อที่ 2/ }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/exam/e1/results'));
    expect(completeAttempt).toHaveBeenCalledTimes(1);
    const [attemptId, payload] = (completeAttempt as jest.Mock).mock.calls[0];
    expect(attemptId).toBe('att-old');
    expect(payload).toMatchObject({ examId: 'e1', answers: { q1: '1' }, mode: 'exam', totalTime: 3700 });
    expect(toast.info).toHaveBeenCalledWith('หมดเวลาสอบแล้ว ระบบส่งข้อสอบให้อัตโนมัติ');
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
    expect(loadRealExamSession('e1').session?.status).toBe('completed');

    // ไม่มีการส่งซ้ำตามมา
    await new Promise((r) => setTimeout(r, 1500));
    expect(completeAttempt).toHaveBeenCalledTimes(1);
  });

  it('M2: ชุดไม่มี durationMinutes → นับขึ้นเหมือนเดิม (ไม่มี durationSeconds) ไม่เรียก GET /time', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam({ durationMinutes: null }));
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ timePerQuestion: { q1: 99999 } }));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อจากข้อที่ 2/ }));
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    const s = loadRealExamSession('e1').session!;
    expect(s.durationSeconds ?? null).toBeNull();
    expect(s.totalPausedMs ?? 0).toBe(0);
    expect(s.startedAt).toBe(STARTED_AT);
    expect(fetchClockOffset).not.toHaveBeenCalled();
    expect(completeAttempt).not.toHaveBeenCalled();
  });

  it('M2: GET /time ล้ม → ใช้นาฬิกาเครื่อง ยังนับถอยหลังได้', async () => {
    (fetchClockOffset as jest.Mock).mockRejectedValue(new Error('offline'));
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อจากข้อที่ 2/ }));
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(remainingOf(0)).toBeGreaterThan(2995);
    // sync ล้ม → basis 0 ให้ ExamContainer ปรับเมื่อ sync ได้ทีหลัง
    expect(loadRealExamSession('e1').session?.clockOffsetBasisMs).toBe(0);
  });

  it('review 4 ข้อ 3: timer_start ยิงหลังเริ่ม attempt สำเร็จเท่านั้น (start ถูกปฏิเสธ → ไม่ยิง)', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    const first = render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('แคมเปญจบแล้ว');
    expect(trackEvent).not.toHaveBeenCalledWith('timer_start', expect.anything());
    first.unmount();

    localStorage.clear();
    localStorage.setItem('token', 't');
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-new' });
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith('timer_start', expect.objectContaining({ examId: 'e1', durationSeconds: 3600 }));
    const startOrder = (startInProgressAttempt as jest.Mock).mock.invocationCallOrder.at(-1)!;
    const trackOrder = (trackEvent as jest.Mock).mock.invocationCallOrder.at(-1)!;
    expect(trackOrder).toBeGreaterThan(startOrder);
  });

  it('เริ่มใหม่ (ไม่มี attempt ค้าง) ยังจับเวลาจากตอนเริ่มเหมือนเดิม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-new' });
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    const s = loadRealExamSession('e1').session!;
    expect(s.durationSeconds).toBe(3600);
    expect(s.totalPausedMs ?? 0).toBe(0);
    expect(remainingOf(0)).toBeGreaterThan(3595);
    expect(fetchClockOffset).not.toHaveBeenCalled();
  });

  it('M3: แคมเปญจบแล้ว กด "เริ่มสอบใหม่" (start 403 CAMPAIGN_ENDED) → แจ้งแล้วทำ attempt เดิมต่อ ไม่ขึ้นหน้าปิด', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'เริ่มสอบใหม่' }));

    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(CAMPAIGN_ENDED_RESUME_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(startInProgressAttempt).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-old');
    const s = loadRealExamSession('e1').session!;
    expect(s.answers).toEqual({ q1: '1' });
    expect(s.currentIndex).toBe(1);
    expect(s.durationSeconds).toBe(3600);
  });

  it('M3: แคมเปญยังไม่เปิด (CAMPAIGN_NOT_OPEN) ตอนเริ่มใหม่ → ยังขึ้นหน้าแคมเปญปิดแบบเดิม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('not open', 403, 'CAMPAIGN_NOT_OPEN'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'เริ่มสอบใหม่' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('แคมเปญยังไม่เปิด');
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
  });
});
