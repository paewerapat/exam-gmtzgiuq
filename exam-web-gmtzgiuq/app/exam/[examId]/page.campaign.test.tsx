import { fireEvent, render, screen } from '@testing-library/react';
import RealExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import { getMyInProgressForExam, startInProgressAttempt } from '@/lib/api/attempts';
import { ApiError } from '@/lib/api/apiError';
import { loadRealExamSession } from '@/lib/exam-utils';

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
jest.mock('@/components/exam/ExamContainer', () => ({
  __esModule: true,
  default: () => <p>หน้าข้อสอบ</p>,
}));

const exam = {
  id: 'e1',
  title: 'Campaign',
  category: 'tgat',
  durationMinutes: 60,
  isMock: true,
  passages: [],
  questions: [{ id: 'q1', question: '1', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

describe('/exam/[examId] — แคมเปญนอกช่วงเวลา (task 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
  });

  it('start attempt 403 CAMPAIGN_ENDED → หยุดพร้อมข้อความไทย ไม่เข้าหน้าข้อสอบ ไม่เก็บ session', async () => {
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('แคมเปญจบแล้ว');
    expect(alert).toHaveTextContent('แคมเปญนี้จบแล้ว เริ่มทำใหม่ไม่ได้');
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
    expect(loadRealExamSession('e1').session).toBeNull();
  });

  it('GET /exams/:id ตอบ 403 CAMPAIGN_NOT_OPEN ตอนโหลด (แคมเปญยังไม่เปิด) → CampaignClosedScreen ไม่เริ่ม attempt', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('ยังไม่เปิด', 403, 'CAMPAIGN_NOT_OPEN'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('แคมเปญยังไม่เปิด');
    expect(alert).toHaveTextContent('แคมเปญนี้ยังไม่เปิด เริ่มทำได้เมื่อแคมเปญเปิด');
    expect(screen.getByRole('link', { name: 'ไปหน้ารายละเอียดชุดข้อสอบ' })).toHaveAttribute('href', '/dashboard/mock-exams/e1');
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
  });

  // ── Q1: แคมเปญจบแล้ว + attempt ค้างบน server แต่ไม่มี session ในเครื่อง (เช่นเปิดจากเครื่องอื่น) ──
  const backendAttempt = (patch: Record<string, unknown> = {}) => ({
    id: 'att-old',
    examId: 'e1',
    examTitle: 'Campaign',
    category: 'tgat',
    mode: 'exam',
    status: 'in_progress',
    questionIds: ['q1'],
    currentIndex: 0,
    answers: {},
    timePerQuestion: {},
    startedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  });

  it('Q1: attempt ค้างยังไม่ได้ตอบ (ข้อ 1) + start 403 CAMPAIGN_ENDED → ทำ attempt เดิมต่อ ไม่ขึ้นหน้าปิด', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-old');
    expect(loadRealExamSession('e1').session).toMatchObject({ questionIds: ['q1'], status: 'in_progress' });
  });

  it('Q1: attempt ค้างที่ตอบแล้วแต่ยังอยู่ข้อ 1 → ถามทำต่อ (ไม่เริ่มใหม่ทับคำตอบ) แล้วทำต่อได้', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt({ answers: { q1: '1' } }));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /ทำต่อจากข้อที่ 1/ }));
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
    expect(loadRealExamSession('e1').session?.answers).toEqual({ q1: '1' });
  });

  it('Q1: แคมเปญยังเปิด + attempt ค้างที่ยังไม่ได้ตอบ → เริ่มตามเดิม (POST /attempts/start) ไม่ถาม', async () => {
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(backendAttempt());
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-old' });
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByText('หน้าข้อสอบ')).toBeInTheDocument();
    expect(startInProgressAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /ทำต่อจากข้อที่/ })).not.toBeInTheDocument();
  });

  it('Q1: ไม่มี attempt ค้าง + start 403 CAMPAIGN_ENDED → ยังขึ้นหน้าแคมเปญจบแล้ว', async () => {
    (startInProgressAttempt as jest.Mock).mockRejectedValue(new ApiError('ended', 403, 'CAMPAIGN_ENDED'));
    render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('แคมเปญจบแล้ว');
  });
});
