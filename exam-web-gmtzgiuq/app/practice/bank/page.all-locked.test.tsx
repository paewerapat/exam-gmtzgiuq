import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import BankPracticePage from './page';
import { createQbSession, toLockedQuestion } from '@/lib/api/question-bank';
import { logPracticeAnswers } from '@/lib/api/answer-logs';

// QA task 20: ผู้ใช้ที่ไม่มี Pro เริ่มฝึก Challenge ได้ (ปุ่มเริ่มฝึกในหน้า 2 กดได้) → ทุกข้อเป็น placeholder ที่ล็อก
// ข้ามครบทุกข้อแล้วส่ง: ผลต้องไม่มี NaN, นับข้อที่ล็อก, ไม่ส่ง answer log ที่มีข้อที่ล็อก

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

describe('/practice/bank — session ที่ล็อกทุกข้อ (QA task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    mockSearch = new URLSearchParams('subject=bio&mode=challenge');
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
  });

  it('ข้ามทุกข้อแล้วส่ง → ผล 0 ข้อที่ทำได้ ไม่มี NaN, ข้อที่ล็อก 2 ข้อ, ลิงก์ Unlock ตามสนาม, log ไม่มีข้อที่ล็อก', async () => {
    (createQbSession as jest.Mock).mockResolvedValue({
      venueKey: 'posn',
      subjectLabel: 'เคมี',
      total: 2,
      questions: [toLockedQuestion({ id: 'L1', topicId: 't1' }), toLockedQuestion({ id: 'L2', topicId: 't1' })],
    });
    const user = userEvent.setup();
    render(<BankPracticePage />);

    let dialog = await screen.findByRole('dialog', { name: 'คุณเจอข้อ Challenge แล้ว' }, FIND);
    expect(within(dialog).getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=posn');
    await user.click(within(dialog).getByRole('button', { name: 'ข้ามข้อ' }));

    dialog = await screen.findByRole('dialog', { name: 'คุณเจอข้อ Challenge แล้ว' }, FIND);
    await user.click(within(dialog).getByRole('button', { name: 'ข้ามข้อและส่ง' }));

    expect(await screen.findByText('ผลการฝึก', undefined, FIND)).toBeInTheDocument();
    expect(screen.getByText('ข้อ Challenge ที่ล็อก 2 ข้อ ไม่นับคะแนน')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
    // round 2: ผลแบบกลาง ๆ — ไม่มีวงคะแนน 0 สีแดง / ช่องถูกผิด และ confirm ไม่บอกว่า "ตอบครบทุกข้อแล้ว"
    expect(screen.getByText('ชุดนี้มีแต่ข้อ Challenge สำหรับสมาชิก Pro จึงยังไม่มีคะแนน')).toBeInTheDocument();
    expect(screen.queryByText('คะแนน')).not.toBeInTheDocument();
    expect(screen.queryByText('ไม่ตอบ')).not.toBeInTheDocument();
    const confirm = (Swal.fire as jest.Mock).mock.calls[0][0];
    expect(confirm.html).not.toContain('ตอบครบทุกข้อแล้ว');
    expect(confirm.confirmButtonText).toBe('จบการฝึก');
    expect(screen.getByRole('link', { name: 'Unlock ข้อ Challenge' })).toHaveAttribute('href', '/upgrade?venue=posn');

    await waitFor(() => expect(logPracticeAnswers).toHaveBeenCalledTimes(1));
    const sent = (logPracticeAnswers as jest.Mock).mock.calls[0][0];
    expect(sent.questionIds).toEqual([]);
    expect(sent.answers).toEqual({});
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });
});
