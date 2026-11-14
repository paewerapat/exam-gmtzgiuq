import { useEffect } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import ExamContainer from './ExamContainer';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { toLockedQuestion } from '@/lib/api/question-bank';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));

const mockedFire = Swal.fire as jest.Mock;

function mcq(id: string): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
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

function Harness({ questions, onComplete }: { questions: Question[]; onComplete: () => void }) {
  const { initExam, state } = useExam();
  useEffect(() => {
    const session: ExamSession = {
      id: 'session-1',
      examId: 'bank_x',
      examTitle: 'NETSAT ชีวะ',
      category: 'general_knowledge',
      questionIds: questions.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      markedForReview: [],
      timePerQuestion: {},
      startedAt: new Date().toISOString(),
      status: 'in_progress',
    };
    initExam(session, questions);
  }, [initExam, questions]);
  return state.session.id ? (
    <ExamContainer onComplete={onComplete} mode="practice" lockedUpgradeHref="/upgrade?venue=netsat" />
  ) : null;
}

function setup(questions: Question[]) {
  const onComplete = jest.fn();
  render(
    <ExamProvider>
      <Harness questions={questions} onComplete={onComplete} />
    </ExamProvider>,
  );
  return { onComplete, user: userEvent.setup() };
}

describe('ExamContainer — ข้อ Challenge ที่ล็อก (task 20)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedFire.mockReset();
  });

  it('ข้อที่ล็อก: การ์ดล็อกแทนโจทย์ + modal (portal) ปุ่ม Unlock ไป /upgrade?venue= ; ไม่มีปุ่มตรวจคำตอบ', async () => {
    setup([toLockedQuestion({ id: 'L1', topicId: 't' }), mcq('q2')]);
    const dialog = await screen.findByRole('dialog', { name: 'คุณเจอข้อ Challenge แล้ว' });
    expect(dialog).toHaveAccessibleDescription(/ข้อนี้เป็นข้อ Challenge สำหรับสมาชิก Pro/);
    expect(within(dialog).getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    // modal อยู่ใต้ body โดยตรง (createPortal) ไม่อยู่ใน transform ของหน้า
    expect(dialog.closest('.fixed')?.parentElement).toBe(document.body);
    expect(screen.getByText('ข้อนี้เป็นข้อ Challenge สำหรับสมาชิก Pro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ตรวจคำตอบ' })).not.toBeInTheDocument();
    expect(screen.queryByText('โจทย์ q2')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('กด "ข้ามข้อ" ใน modal → ไปข้อถัดไป (modal ปิด)', async () => {
    const { user } = setup([toLockedQuestion({ id: 'L1', topicId: 't' }), mcq('q2')]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'ข้ามข้อ' }));
    expect(await screen.findByText('โจทย์ q2')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ปิด modal (Escape) แล้วยังเหลือการ์ดล็อกที่มีปุ่ม Unlock / ข้ามข้อ', async () => {
    const { user } = setup([toLockedQuestion({ id: 'L1', topicId: 't' }), mcq('q2')]);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    await user.click(screen.getByRole('button', { name: 'ข้ามข้อ' }));
    expect(await screen.findByText('โจทย์ q2')).toBeInTheDocument();
  });

  it('ข้อที่ล็อกเป็นข้อสุดท้าย: ปุ่มเป็น "ข้ามข้อและส่ง" และตอนส่งไม่นับข้อที่ล็อกเป็นข้อที่ยังไม่ตอบ', async () => {
    mockedFire.mockResolvedValue({ isConfirmed: true });
    const { user, onComplete } = setup([mcq('q1'), toLockedQuestion({ id: 'L2', topicId: 't' })]);
    await user.click(await screen.findByRole('button', { name: /ตัวเลือก ก/ }));
    await user.click(screen.getByRole('button', { name: /ข้อถัดไป/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'ข้ามข้อและส่ง' }));
    await waitFor(() => expect(mockedFire).toHaveBeenCalledTimes(1));
    expect(mockedFire.mock.calls[0][0].html).toContain('ตอบครบทุกข้อแล้ว');
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('round 2: modal ล็อกการเลื่อนหน้าระหว่างเปิด และปิดแล้วคืนโฟกัสให้ปุ่มเดิม', async () => {
    const { user } = setup([mcq('q1'), toLockedQuestion({ id: 'L2', topicId: 't' }), mcq('q3')]);
    const next = await screen.findByRole('button', { name: /ข้อถัดไป/ });
    await user.click(next);
    const dialog = await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');
    expect(within(dialog).getByRole('link', { name: 'Unlock' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('button', { name: /ข้อถัดไป/ })).toHaveFocus();
  });

  it('เมื่อมาถึงข้อที่ล็อกอีกครั้ง modal เปิดใหม่', async () => {
    const { user } = setup([toLockedQuestion({ id: 'L1', topicId: 't' }), mcq('q2')]);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'ข้ามข้อ' }));
    await screen.findByText('โจทย์ q2');
    await user.click(screen.getByRole('button', { name: /ข้อก่อนหน้า/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
