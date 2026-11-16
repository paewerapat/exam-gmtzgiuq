import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExamContainer from './ExamContainer';
import QuestionReview from './QuestionReview';
import { PassageContent } from './PassagePanel';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import type { ExamPassage, Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

// task 25: เนื้อหาข้อสอบ (โจทย์ ตัวเลือก เฉลย คำใบ้ บทอ่าน) ใช้ class `font-question` (Noto Sans / Noto Sans Thai)
// ส่วนอื่น (เลขข้อ ตัวอักษร A–D ป้าย "คำใบ้"/"คำอธิบาย" ปุ่ม) ต้องไม่อยู่ใต้ class นี้

jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));

const FONT = 'font-question';
const inQuestionFont = (el: HTMLElement) => el.closest(`.${FONT}`) !== null;

function makeQuestion(): Question {
  return {
    id: 'q1',
    question: 'โจทย์ทดสอบฟอนต์ $x^2$',
    choices: ['a', 'b', 'c', 'd'].map((c, i) => ({
      id: c,
      text: `ตัวเลือกที่ ${i + 1}`,
      isCorrect: c === 'a',
    })),
    explanation: 'เฉลยทดสอบฟอนต์',
    hint: 'คำใบ้ทดสอบฟอนต์',
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

function makeSession(): ExamSession {
  return {
    id: 'session-font',
    examId: 'exam-1',
    examTitle: 'ชุดทดสอบ',
    category: 'general_knowledge',
    questionIds: ['q1'],
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'in_progress',
  };
}

function Harness({ mode }: { mode: 'practice' | 'exam' }) {
  const { initExam, state } = useExam();
  useEffect(() => {
    initExam(makeSession(), [makeQuestion()]);
  }, [initExam]);
  // ExamContainer มี hooks หลัง early return (BUG-11) จึง render หลัง init แล้วเท่านั้นเหมือนหน้าจริง
  return state.session.id ? <ExamContainer onComplete={jest.fn()} mode={mode} /> : null;
}

function renderContainer(mode: 'practice' | 'exam') {
  render(
    <ExamProvider>
      <Harness mode={mode} />
    </ExamProvider>,
  );
  return userEvent.setup();
}

describe('ฟอนต์เนื้อหาข้อสอบ (task 25)', () => {
  beforeEach(() => localStorage.clear());

  it('practice: โจทย์ ตัวเลือก คำใบ้ เฉลย ใช้ font-question ส่วนเลขข้อ/ตัวอักษร/ป้าย/ปุ่ม ไม่ใช้', async () => {
    const user = renderContainer('practice');

    const question = await screen.findByText(/โจทย์ทดสอบฟอนต์/);
    expect(inQuestionFont(question)).toBe(true);
    // สูตรอยู่ใต้ class เดียวกัน แต่ KaTeX กำหนดฟอนต์ของ .katex เอง
    expect(question.closest(`.${FONT}`)!.querySelector('.katex')).not.toBeNull();

    expect(inQuestionFont(screen.getByText('ตัวเลือกที่ 1'))).toBe(true);
    expect(inQuestionFont(screen.getByText('A'))).toBe(false);
    expect(inQuestionFont(screen.getByText('1'))).toBe(false); // เลขข้อ

    await user.click(screen.getByTitle('คำใบ้'));
    expect(inQuestionFont(screen.getByText('คำใบ้ทดสอบฟอนต์'))).toBe(true);
    expect(inQuestionFont(screen.getByText('คำใบ้', { selector: 'span' }))).toBe(false);

    await user.click(screen.getByRole('button', { name: /ตัวเลือกที่ 1/ }));
    const checkButton = screen.getByRole('button', { name: 'ตรวจคำตอบ' });
    expect(inQuestionFont(checkButton)).toBe(false);
    await user.click(checkButton);
    expect(inQuestionFont(screen.getByText('เฉลยทดสอบฟอนต์'))).toBe(true);
    expect(inQuestionFont(screen.getByText('คำตอบถูกต้อง !'))).toBe(false);
  });

  it('exam (จับเวลา): โจทย์และตัวเลือกใช้ font-question', async () => {
    renderContainer('exam');
    expect(inQuestionFont(await screen.findByText(/โจทย์ทดสอบฟอนต์/))).toBe(true);
    expect(inQuestionFont(screen.getByText('ตัวเลือกที่ 2'))).toBe(true);
  });

  it('หน้าผล/ทบทวน (QuestionReview): โจทย์ ตัวเลือก คำอธิบาย ใช้ font-question หัวข้อ "คำอธิบาย" ไม่ใช้', async () => {
    render(<QuestionReview question={makeQuestion()} userAnswer="b" questionNumber={1} />);
    await userEvent.click(screen.getByRole('button'));

    expect(inQuestionFont(screen.getByText(/โจทย์ทดสอบฟอนต์/))).toBe(true);
    expect(inQuestionFont(screen.getByText('ตัวเลือกที่ 3'))).toBe(true);
    expect(inQuestionFont(screen.getByText('เฉลยทดสอบฟอนต์'))).toBe(true);
    expect(inQuestionFont(screen.getByText('คำอธิบาย'))).toBe(false);
  });

  it('บทอ่าน: เนื้อความใช้ font-question', () => {
    const passage: ExamPassage = { id: 'p1', title: 'หัวบทอ่าน', body: 'เนื้อบทอ่านทดสอบ', images: [] };
    render(<PassageContent passage={passage} />);
    expect(inQuestionFont(screen.getByText('เนื้อบทอ่านทดสอบ'))).toBe(true);
  });
});
