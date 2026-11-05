import { render, screen } from '@testing-library/react';
import RealExamPage from './page';
import { getPublicExam } from '@/lib/api/exams';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/lib/api/attempts', () => ({
  submitAttempt: jest.fn(),
  startInProgressAttempt: jest.fn(),
  updateAttemptProgress: jest.fn(),
  completeAttempt: jest.fn(),
  getMyInProgressForExam: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/api/analytics', () => ({ trackEvent: jest.fn() }));
// ExamContainer จำลอง: แสดงลิงก์ "Go back" ตาม backUrl ที่หน้าส่งมา (ของจริงส่งต่อให้ ExamHeader)
jest.mock('@/components/exam/ExamContainer', () => ({
  __esModule: true,
  default: ({ backUrl }: { backUrl?: string }) => <a href={backUrl}>Go back</a>,
}));

const exam = (patch: object = {}) => ({
  id: 'e1',
  title: 'ชุดทดสอบ',
  category: 'tgat',
  durationMinutes: 60,
  passages: [],
  questions: [{ id: 'q1', question: '1+1', type: 'short_answer', correctAnswer: '2', choices: [] }],
  ...patch,
});

function renderPage() {
  render(<RealExamPage params={Promise.resolve({ examId: 'e1' })} />);
}

describe('หน้าทำข้อสอบจับเวลา — ปุ่มย้อนกลับของชุด Mock (task 11 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('ชุด Mock → "Go back" ไปหน้ารายละเอียด Mock Exam', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam({ isMock: true }));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/dashboard/mock-exams/e1');
  });

  it('ชุดปกติ → "Go back" ไป /dashboard/exam เหมือนเดิม', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam({ isMock: false }));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/dashboard/exam');
  });

  it('API เก่าไม่มี isMock → /dashboard/exam', async () => {
    (getPublicExam as jest.Mock).mockResolvedValue(exam());
    renderPage();
    expect(await screen.findByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/dashboard/exam');
  });

  it('โหลดข้อสอบไม่ได้ → ปุ่ม "กลับหน้าข้อสอบจริง" (ยังไม่รู้ว่าเป็น Mock)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getPublicExam as jest.Mock).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'กลับหน้าข้อสอบจริง' })).toBeInTheDocument();
  });
});
