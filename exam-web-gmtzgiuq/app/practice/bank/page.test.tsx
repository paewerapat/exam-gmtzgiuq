import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import BankPracticePage from './page';
import { createQbSession, toLockedQuestion } from '@/lib/api/question-bank';
import { logPracticeAnswers } from '@/lib/api/answer-logs';
import { ApiError } from '@/lib/api/apiError';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

const mockPush = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockSearch,
}));
jest.mock('@/lib/api/question-bank', () => {
  const actual = jest.requireActual('@/lib/api/question-bank');
  return { ...actual, createQbSession: jest.fn() };
});
jest.mock('@/lib/api/answer-logs', () => ({ logPracticeAnswers: jest.fn().mockResolvedValue(0) }));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));

const FIND = { timeout: 5000 };
jest.setTimeout(20000);

function mcq(id: string): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    topicId: 't1',
    choices: [
      { id: 'a', text: 'ตัวเลือก ก', isCorrect: true },
      { id: 'b', text: 'ตัวเลือก ข', isCorrect: false },
    ],
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

describe('/practice/bank — ฝึกจาก Question Bank (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    mockSearch = new URLSearchParams('subject=bio&mode=bank&topics=t1,t2&diff=easy,hard_challenge&progress=undone');
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
  });

  it('เรียก session ตามตัวกรองใน URL ครั้งเดียว', async () => {
    (createQbSession as jest.Mock).mockResolvedValue({
      venueKey: 'netsat',
      subjectLabel: 'ชีวะ',
      total: 1,
      questions: [mcq('q1')],
    });
    render(<BankPracticePage />);
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(createQbSession).toHaveBeenCalledTimes(1);
    expect(createQbSession).toHaveBeenCalledWith({
      subjectId: 'bio',
      mode: 'bank',
      topicIds: ['t1', 't2'],
      difficulties: ['easy', 'hard_challenge'],
      progress: 'undone',
      limit: 50,
    });
  });

  it('ข้อที่ล็อก: modal Unlock ไป /upgrade?venue= ของ session, ข้ามข้อ → ข้อถัดไป ; ผลและ log ไม่นับข้อที่ล็อก', async () => {
    (createQbSession as jest.Mock).mockResolvedValue({
      venueKey: 'netsat',
      subjectLabel: 'ชีวะ',
      total: 3,
      questions: [mcq('q1'), toLockedQuestion({ id: 'L1', topicId: 't1' }), mcq('q3')],
    });
    const user = userEvent.setup();
    render(<BankPracticePage />);

    // ข้อ 1 ตอบถูก
    await user.click(await screen.findByRole('button', { name: /ตัวเลือก ก/ }, FIND));
    await user.click(screen.getByRole('button', { name: /ข้อถัดไป/ }));

    // ข้อ 2 ล็อก
    const dialog = await screen.findByRole('dialog', { name: 'คุณเจอข้อ Challenge แล้ว' }, FIND);
    expect(within(dialog).getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    await user.click(within(dialog).getByRole('button', { name: 'ข้ามข้อ' }));

    // ข้อ 3 ตอบผิด แล้วส่ง
    expect(await screen.findByText('โจทย์ q3', undefined, FIND)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ตัวเลือก ข/ }));
    await user.click(screen.getAllByRole('button', { name: 'ส่งข้อสอบ' })[0]);

    expect(await screen.findByText('ผลการฝึก', undefined, FIND)).toBeInTheDocument();
    expect((Swal.fire as jest.Mock).mock.calls[0][0].html).toContain('ตอบครบทุกข้อแล้ว');
    expect(screen.getByText('ข้อ Challenge ที่ล็อก 1 ข้อ ไม่นับคะแนน')).toBeInTheDocument();
    // ถูก 1 ผิด 1 ไม่ตอบ 0 (ข้อที่ล็อกไม่ถูกนับ) → 50 คะแนน
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unlock ข้อ Challenge' })).toHaveAttribute('href', '/upgrade?venue=netsat');

    await waitFor(() => expect(logPracticeAnswers).toHaveBeenCalledTimes(1));
    const sent = (logPracticeAnswers as jest.Mock).mock.calls[0][0] as ExamSession;
    expect(sent.questionIds).toEqual(['q1', 'q3']);
    expect(sent.answers).toEqual({ q1: 'a', q3: 'b' });
    expect(sent.timePerQuestion).not.toHaveProperty('L1');
    // BUG-22: เวลาของข้อที่เปิดอยู่ตอนส่ง (ข้อ 3) ถูก flush เข้า session ก่อนส่ง log
    expect(sent.timePerQuestion).toHaveProperty('q3');
    expect(sent.status).toBe('completed');
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('round 2: ชื่อชุดใช้ venueName, venueKey อยู่ใน session (ไม่มี key `_venue` แยก) และ resume ยังได้ลิงก์ Unlock ถูกสนาม', async () => {
    (createQbSession as jest.Mock).mockResolvedValue({
      venueKey: 'a-level',
      venueName: 'A-Level',
      subjectLabel: 'ชีวะ',
      total: 2,
      questions: [mcq('q1'), toLockedQuestion({ id: 'L1', topicId: 't1' })],
    });
    const user = userEvent.setup();
    const first = render(<BankPracticePage />);
    await screen.findByText('โจทย์ q1', undefined, FIND);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('exam_current_session') ?? '{}');
      expect(saved.examTitle).toBe('A-Level ชีวะ');
      expect(saved.venueKey).toBe('a-level');
    });
    expect(Object.keys(localStorage).some((k) => k.endsWith('_venue'))).toBe(false);
    first.unmount();

    // เปิดลิงก์เดิมอีกครั้ง → กล่องทำต่อใช้ชื่อ venueName และไม่เรียก session ใหม่
    render(<BankPracticePage />);
    expect(await screen.findByText('A-Level ชีวะ', undefined, FIND)).toBeInTheDocument();
    expect(createQbSession).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /ทำต่อจากข้อที่ 1/ }));
    await user.click(await screen.findByRole('button', { name: /ข้อถัดไป/ }, FIND));
    const dialog = await screen.findByRole('dialog', undefined, FIND);
    expect(within(dialog).getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=a-level');
  });

  it('ไม่มีข้อที่ตรงตัวกรอง → ข้อความ + ปุ่มกลับไปหน้าเลือกบท', async () => {
    (createQbSession as jest.Mock).mockResolvedValue({ venueKey: 'netsat', subjectLabel: 'ชีวะ', total: 0, questions: [] });
    const user = userEvent.setup();
    render(<BankPracticePage />);
    expect(await screen.findByText('ไม่มีข้อที่ตรงกับตัวเลือกนี้ ลองเปลี่ยนบทหรือตัวกรอง', undefined, FIND)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'กลับไปเลือกบท' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/question-bank/bio');
  });

  it('ตัวกรองต้อง login (QB_LOGIN_REQUIRED) → ชวนเข้าสู่ระบบ', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (createQbSession as jest.Mock).mockRejectedValue(new ApiError('ต้องเข้าสู่ระบบ', 401, 'QB_LOGIN_REQUIRED'));
    mockSearch = new URLSearchParams('subject=bio&mode=challenge&progress=wrong');
    render(<BankPracticePage />);
    expect(await screen.findByText('ตัวกรองนี้ต้องเข้าสู่ระบบก่อน', undefined, FIND)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/dashboard/challenge/bio')}`,
    );
  });

  it('ไม่มี subject ใน URL → ลิงก์ไม่ถูกต้อง ไม่เรียก API', async () => {
    mockSearch = new URLSearchParams('mode=bank');
    render(<BankPracticePage />);
    expect(await screen.findByText('ลิงก์ฝึกไม่ถูกต้อง กรุณาเลือกบทใหม่')).toBeInTheDocument();
    expect(createQbSession).not.toHaveBeenCalled();
  });
});
