import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import RealExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import {
  completeAttempt,
  getMyInProgressForExam,
  startInProgressAttempt,
  updateAttemptProgress,
} from '@/lib/api/attempts';
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
  updateAttemptProgress: jest.fn(),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn(),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// แทน UI ข้อสอบด้วยปุ่มส่ง + ปุ่มตอบ (เปลี่ยน session → autosave progress)
jest.mock('@/components/exam/ExamContainer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  function FakeExamContainer({ onComplete }: { onComplete: () => void }) {
    const { selectAnswer } = useExam();
    return (
      <div>
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

const locked = () => new ApiError('ชุดข้อสอบนี้ต้อง Unlock ก่อน', 403, 'EXAM_LOCKED');

const exam = {
  id: 'e1',
  title: 'Mock ล็อก',
  category: 'tgat',
  durationMinutes: 60,
  isMock: true,
  passages: [],
  questions: [{ id: 'q1', question: '1', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

function renderPage() {
  render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('/exam/[examId] — ชุดล็อก (task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
    (startInProgressAttempt as jest.Mock).mockResolvedValue({ id: 'att-1' });
    (updateAttemptProgress as jest.Mock).mockResolvedValue(undefined);
  });

  it('GET /exams/:id ได้ 403 EXAM_LOCKED → พาไปหน้ารายละเอียด Mock + ข้อความ ไม่ค้าง loading ไม่เริ่ม attempt', async () => {
    (getPublicExam as jest.Mock).mockRejectedValue(locked());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน' })).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams/e1');
    expect(toast.info).toHaveBeenCalledWith('ชุดข้อสอบนี้ต้อง Unlock ก่อน');
    expect(screen.getByRole('link', { name: 'ไปหน้ารายละเอียดชุดข้อสอบ' })).toHaveAttribute(
      'href',
      '/dashboard/mock-exams/e1',
    );
    expect(screen.queryByText('กำลังโหลดข้อสอบ...')).not.toBeInTheDocument();
    expect(startInProgressAttempt).not.toHaveBeenCalled();
  });

  it('error อื่น (ไม่ใช่ EXAM_LOCKED) → ข้อความเดิม ไม่ redirect', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('not found', 404, null));
    renderPage();
    expect(await screen.findByText('ไม่สามารถโหลดข้อสอบได้')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('start attempt ได้ 403 EXAM_LOCKED → พาไปหน้ารายละเอียด', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    (startInProgressAttempt as jest.Mock).mockRejectedValue(locked());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน' })).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams/e1');
    expect(screen.queryByRole('button', { name: 'ส่งข้อสอบ' })).not.toBeInTheDocument();
  });

  it('สิทธิ์หมดตอนส่ง (complete 403) → แจ้งชัด (role=alert) ไม่ไปหน้าผลสอบ คำตอบยังอยู่ในเครื่อง', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam);
    (completeAttempt as jest.Mock).mockRejectedValue(locked());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('สิทธิ์ของชุดนี้หมดอายุ');
    expect(alert).toHaveTextContent('ระบบจึงบันทึกคำตอบและผลสอบไม่ได้');
    expect(completeAttempt).toHaveBeenCalledWith('att-1', expect.objectContaining({ examId: 'e1' }));
    expect(mockPush).not.toHaveBeenCalledWith('/exam/e1/results');
    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'ไปหน้ารายละเอียดชุดข้อสอบ' })).toHaveAttribute(
      'href',
      '/dashboard/mock-exams/e1',
    );
    // session ถูกคืนเป็น "กำลังทำ" พร้อมคำตอบ + attempt id (ได้สิทธิ์ใหม่กลับมาส่งได้)
    const saved = loadRealExamSession('e1').session;
    expect(saved?.status).toBe('in_progress');
    expect(saved?.answers).toEqual({ q1: '1' });
    expect(localStorage.getItem('real_exam_backend_attempt_id_e1')).toBe('att-1');
  });

  it(
    'สิทธิ์หมดระหว่างทำ (autosave progress 403) → หยุดและแจ้ง',
    async () => {
      (getPublicExam as jest.Mock).mockResolvedValue(exam);
      (updateAttemptProgress as jest.Mock).mockRejectedValue(locked());
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'ตอบข้อ 1' }));
      expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('สิทธิ์ของชุดนี้หมดอายุ');
      await waitFor(() => expect(updateAttemptProgress).toHaveBeenCalledWith('att-1', expect.anything()));
      expect(screen.queryByRole('button', { name: 'ส่งข้อสอบ' })).not.toBeInTheDocument();
    },
    15000,
  );
});
