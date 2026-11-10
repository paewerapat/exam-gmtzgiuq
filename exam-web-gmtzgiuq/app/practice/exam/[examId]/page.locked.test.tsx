import { render, screen } from '@testing-library/react';
import { toast } from 'react-toastify';
import PracticeExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';
import { getMyInProgressForExam, startInProgressAttempt } from '@/lib/api/attempts';
import { ApiError } from '@/lib/api/apiError';

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
jest.mock('@/components/exam', () => ({
  ExamContainer: () => <p>หน้าข้อสอบ</p>,
}));

const locked = () => new ApiError('ชุดข้อสอบนี้ต้อง Unlock ก่อน', 403, 'EXAM_LOCKED');

function renderPage() {
  render(<PracticeExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('/practice/exam/[examId] — ชุดล็อก (task 15 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    (getMyInProgressForExam as jest.Mock).mockResolvedValue(null);
  });

  it('GET /exams/:id ได้ 403 EXAM_LOCKED → toast + พาไปหน้ารายละเอียด Mock ไม่ค้าง loading', async () => {
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
    expect(screen.queryByText('ไม่สามารถโหลดข้อสอบได้')).not.toBeInTheDocument();
  });

  it('start attempt ได้ 403 EXAM_LOCKED → พาไปหน้ารายละเอียด ไม่เข้าหน้าข้อสอบ', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue({
      id: 'e1',
      title: 'Mock',
      category: 'tgat',
      passages: [],
      questions: [{ id: 'q1', question: '1', type: 'short_answer', correctAnswer: '1', choices: [] }],
    });
    (startInProgressAttempt as jest.Mock).mockRejectedValue(locked());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน' })).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/mock-exams/e1');
    expect(screen.queryByText('หน้าข้อสอบ')).not.toBeInTheDocument();
  });

  it('error อื่น → ข้อความเดิม ไม่ redirect', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getPublicExam as jest.Mock).mockRejectedValue(new ApiError('down', 500, null));
    renderPage();
    expect(await screen.findByText('ไม่สามารถโหลดข้อสอบได้')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
