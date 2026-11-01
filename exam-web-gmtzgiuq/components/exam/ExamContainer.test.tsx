import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import ExamContainer from './ExamContainer';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { calculateExamResult, EXAM_STORAGE_KEYS } from '@/lib/exam-utils';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn() },
}));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));

const mockedFire = Swal.fire as jest.Mock;

const THAI = ['ก', 'ข', 'ค', 'ง', 'จ'];

function mcq(id: string, correctIds: string[]): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    choices: ['a', 'b', 'c', 'd', 'e'].map((c, i) => ({
      id: c,
      text: `ตัวเลือก ${THAI[i]}`,
      isCorrect: correctIds.includes(c),
    })),
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

const multiQ = mcq('m', ['b', 'c', 'd']);
const singleQ = mcq('s', ['a']);

function makeSession(questionIds: string[], answers: Record<string, string> = {}): ExamSession {
  return {
    id: 'session-1',
    examId: 'exam-1',
    examTitle: 'ชุดทดสอบ',
    category: 'general_knowledge',
    questionIds,
    currentIndex: 0,
    answers,
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'in_progress',
  };
}

function Harness({
  session,
  questions,
  mode,
  onComplete,
}: {
  session: ExamSession;
  questions: Question[];
  mode: 'practice' | 'exam';
  onComplete: () => void;
}) {
  const { initExam, state } = useExam();
  useEffect(() => {
    initExam(session, questions);
  }, [initExam, session, questions]);
  // ExamContainer มี hooks หลัง early return (BUG-11) จึง render หลัง init แล้วเท่านั้นเหมือนหน้าจริง
  return state.session.id ? <ExamContainer onComplete={onComplete} mode={mode} /> : null;
}

function setup(questions: Question[], mode: 'practice' | 'exam' = 'practice', answers: Record<string, string> = {}) {
  const onComplete = jest.fn();
  const session = makeSession(questions.map((q) => q.id), answers);
  const utils = render(
    <ExamProvider>
      <Harness session={session} questions={questions} mode={mode} onComplete={onComplete} />
    </ExamProvider>,
  );
  return { ...utils, onComplete, user: userEvent.setup() };
}

const choice = (thai: string) => screen.getByRole('button', { name: new RegExp(`ตัวเลือก ${thai}`) });

describe('ExamContainer — ข้อที่ตอบถูกหลายตัว (task 06)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('practice: ป้าย "เลือกได้มากกว่า 1 ข้อ", กดเลือก/ยกเลิกได้หลายตัว, มี checkbox', async () => {
    const { user, unmount } = setup([multiQ]);
    expect(await screen.findByText('เลือกได้มากกว่า 1 ข้อ')).toBeInTheDocument();
    expect(screen.getAllByTestId('choice-checkbox')).toHaveLength(5);
    // a11y: กลุ่มตัวเลือกอ้างถึงป้าย
    expect(screen.getByRole('group')).toHaveAccessibleDescription('เลือกได้มากกว่า 1 ข้อ');

    await user.click(choice('ข'));
    await user.click(choice('ค'));
    expect(choice('ข')).toHaveAttribute('aria-pressed', 'true');
    expect(choice('ค')).toHaveAttribute('aria-pressed', 'true');

    await user.click(choice('ข')); // กดซ้ำ = ยกเลิก
    expect(choice('ข')).toHaveAttribute('aria-pressed', 'false');
    expect(choice('ค')).toHaveAttribute('aria-pressed', 'true');
    unmount();
  });

  it('practice: ตรวจคำตอบ → ไฮไลต์ถูก/ผิด/ถูกแต่ไม่ได้เลือก และล็อกการเปลี่ยนคำตอบ', async () => {
    const { user, unmount } = setup([multiQ]);
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');

    await user.click(choice('ค')); // ถูก
    await user.click(choice('จ')); // ผิด
    await user.click(screen.getByRole('button', { name: 'ตรวจคำตอบ' }));

    expect(screen.getByText('คำตอบไม่ถูกต้อง !')).toBeInTheDocument();
    expect(screen.getByText('B, C, D')).toBeInTheDocument();
    // ข และ ง ถูกแต่ไม่ได้เลือก
    expect(screen.getAllByText('ข้อที่ถูก (ไม่ได้เลือก)')).toHaveLength(2);
    expect(choice('ข')).toHaveTextContent('ข้อที่ถูก (ไม่ได้เลือก)');
    expect(choice('ง')).toHaveTextContent('ข้อที่ถูก (ไม่ได้เลือก)');
    expect(choice('ค')).not.toHaveTextContent('ไม่ได้เลือก');
    expect(choice('ค').className).toContain('border-green-400');
    expect(choice('จ').className).toContain('border-red-400');
    expect(choice('ก').className).not.toMatch(/green|red/);

    // ล็อกหลังตรวจ
    expect(choice('ก')).toBeDisabled();
    await user.click(choice('ก'));
    expect(choice('ก')).toHaveAttribute('aria-pressed', 'false');
    unmount();
  });

  it('practice: เลือกครบชุด → คำตอบถูกต้อง', async () => {
    const { user, unmount } = setup([multiQ]);
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');
    await user.click(choice('ง'));
    await user.click(choice('ข'));
    await user.click(choice('ค'));
    await user.click(screen.getByRole('button', { name: 'ตรวจคำตอบ' }));
    expect(screen.getByText('คำตอบถูกต้อง !')).toBeInTheDocument();
    expect(screen.queryByText('ข้อที่ถูก (ไม่ได้เลือก)')).not.toBeInTheDocument();
    unmount();
  });

  it('ข้อปกติ: ไม่มีป้าย ไม่มี checkbox กดเลือกแทนที่เหมือนเดิม', async () => {
    const { user, unmount } = setup([singleQ]);
    await screen.findByText('โจทย์ s');
    expect(screen.queryByText('เลือกได้มากกว่า 1 ข้อ')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('choice-checkbox')).toHaveLength(0);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    await user.click(choice('ก'));
    await user.click(choice('ข'));
    expect(choice('ก')).toHaveAttribute('aria-pressed', 'false');
    expect(choice('ข')).toHaveAttribute('aria-pressed', 'true');
    unmount();
  });

  it('resume: session ที่มี "b,d" คืนสถานะตัวที่เลือกไว้', async () => {
    const { unmount } = setup([multiQ], 'exam', { m: 'b,d' });
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');
    expect(choice('ข')).toHaveAttribute('aria-pressed', 'true');
    expect(choice('ง')).toHaveAttribute('aria-pressed', 'true');
    expect(choice('ค')).toHaveAttribute('aria-pressed', 'false');
    unmount();
  });

  it('exam: เลือกหลายตัว → ส่ง → เก็บ "b,c,d" และคิดคะแนนแบบ all-or-none', async () => {
    mockedFire.mockResolvedValue({ isConfirmed: true });
    const { user, onComplete, unmount } = setup([multiQ, singleQ], 'exam');
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');
    // โหมดข้อสอบจริงไม่มีปุ่มตรวจคำตอบ
    expect(screen.queryByRole('button', { name: 'ตรวจคำตอบ' })).not.toBeInTheDocument();

    await user.click(choice('ง'));
    await user.click(choice('ข'));
    await user.click(choice('ค'));
    await user.click(screen.getByRole('button', { name: 'ข้อถัดไป' }));
    await screen.findByText('โจทย์ s');
    await user.click(choice('ข')); // ผิด

    await user.click(screen.getAllByRole('button', { name: 'ส่งข้อสอบ' })[0]);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());

    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION)!) as ExamSession;
    expect(saved.answers).toEqual({ m: 'b,c,d', s: 'b' });
    const result = calculateExamResult(saved, [multiQ, singleQ]);
    expect(result.correctAnswers).toBe(1);
    expect(result.incorrectAnswers).toBe(1);
    unmount();
  });

  it('เลือกออกหมด = ยังไม่ตอบ (ลบ key)', async () => {
    mockedFire.mockResolvedValue({ isConfirmed: true });
    const { user, onComplete, unmount } = setup([multiQ], 'exam');
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');
    await user.click(choice('ข'));
    await user.click(choice('ข'));
    await user.click(screen.getAllByRole('button', { name: 'ส่งข้อสอบ' })[0]);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    // ยังมีข้อที่ไม่ได้ตอบ → popup เตือน
    expect(mockedFire.mock.calls[0][0].icon).toBe('warning');
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION)!) as ExamSession;
    expect(saved.answers).toEqual({});
    unmount();
  });
});

describe('ExamContainer — หลายรูปต่อข้อ + รูปในตัวเลือก (task 07 AC5)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ตัวเลือก A–E เป็นรูปล้วน ข้อถูก B และ D (ข้อหลายคำตอบจาก task 06)
  const imageQ: Question = {
    ...mcq('img', ['b', 'd']),
    questionImage: '/uploads/q1.png',
    questionImages: ['/uploads/q1.png', '/uploads/q2.png', '/uploads/q3.png'],
    choices: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      text: '',
      isCorrect: id === 'b' || id === 'd',
      image: `/uploads/choice-${id}.png`,
    })),
  };
  const legacyQ: Question = { ...mcq('old', ['a']), questionImage: '/uploads/old.png', questionImages: null };
  const imgChoice = (letter: string) => screen.getByRole('button', { name: new RegExp(`รูปตัวเลือก ${letter}`) });

  it('แสดงรูปโจทย์ทุกรูปตามลำดับ และรูปในทุกตัวเลือก', async () => {
    const { unmount } = setup([imageQ]);
    await screen.findByText('โจทย์ img');
    const questionImgs = screen.getAllByRole('img', { name: /รูปประกอบโจทย์/ });
    expect(questionImgs.map((img) => img.getAttribute('src'))).toEqual([
      '/uploads/q1.png',
      '/uploads/q2.png',
      '/uploads/q3.png',
    ]);
    expect(questionImgs.map((img) => img.getAttribute('alt'))).toEqual([
      'รูปประกอบโจทย์ 1',
      'รูปประกอบโจทย์ 2',
      'รูปประกอบโจทย์ 3',
    ]);
    ['A', 'B', 'C', 'D', 'E'].forEach((l) =>
      expect(screen.getByRole('img', { name: `รูปตัวเลือก ${l}` })).toHaveAttribute(
        'src',
        `/uploads/choice-${l.toLowerCase()}.png`,
      ),
    );
    unmount();
  });

  it('practice: เลือกตัวเลือกรูปล้วนได้ ตรวจแล้วไฮไลต์ถูก/ผิด/ถูกแต่ไม่ได้เลือก', async () => {
    const { user, unmount } = setup([imageQ]);
    await screen.findByText('เลือกได้มากกว่า 1 ข้อ');
    await user.click(imgChoice('B'));
    await user.click(imgChoice('C'));
    expect(imgChoice('B')).toHaveAttribute('aria-pressed', 'true');
    expect(imgChoice('C')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'ตรวจคำตอบ' }));
    expect(screen.getByText('คำตอบไม่ถูกต้อง !')).toBeInTheDocument();
    expect(imgChoice('B').className).toContain('border-green-400');
    expect(imgChoice('C').className).toContain('border-red-400');
    expect(imgChoice('D')).toHaveTextContent('ข้อที่ถูก (ไม่ได้เลือก)');
    unmount();
  });

  it('exam: ข้อเดี่ยวที่ตัวเลือกเป็นรูปล้วน เลือกได้', async () => {
    const single: Question = { ...imageQ, id: 'single', choices: imageQ.choices.map((c) => ({ ...c, isCorrect: c.id === 'c' })) };
    const { user, unmount } = setup([single], 'exam');
    await screen.findByText('โจทย์ img');
    await user.click(imgChoice('C'));
    expect(imgChoice('C')).toHaveAttribute('aria-pressed', 'true');
    expect(imgChoice('C').className).toContain('border-indigo-400');
    unmount();
  });

  it('ข้อเก่าที่มีแค่ questionImage ยังแสดงรูปเดียว', async () => {
    const { unmount } = setup([legacyQ]);
    await screen.findByText('โจทย์ old');
    const imgs = screen.getAllByRole('img', { name: /รูปประกอบโจทย์/ });
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', '/uploads/old.png');
    expect(imgs[0]).toHaveAttribute('alt', 'รูปประกอบโจทย์');
    unmount();
  });
});
