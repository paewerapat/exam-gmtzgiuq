import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TopicPracticePage from './page';
import SubjectPracticePage from '@/app/practice/subject/[subjectId]/page';
import ChapterPracticePage from '@/app/practice/chapter/[chapterId]/page';
import { getQuestionsByChapter, getQuestionsBySubject, getQuestionsByTopic } from '@/lib/api/questions';
import { getChapter, getPublicCurriculumTree, getTopic } from '@/lib/api/curriculum';
import { logPracticeAnswers } from '@/lib/api/answer-logs';
import type { ExamSession } from '@/types/exam';

// หน้าเหล่านี้ใช้ use(params) ของ React 19 (Next) แต่ Jest ใช้ React 18.3 → ให้ use อ่านค่าที่แนบไว้กับ params
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, use: (p: { value: unknown }) => p.value };
});
const params = <T,>(value: T) => Object.assign(Promise.resolve(value), { value });

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/lib/api/questions', () => ({
  getQuestionsByTopic: jest.fn(),
  getQuestionsBySubject: jest.fn(),
  getQuestionsByChapter: jest.fn(),
}));
jest.mock('@/lib/api/curriculum', () => ({
  getTopic: jest.fn(),
  getChapter: jest.fn(),
  getPublicCurriculumTree: jest.fn(),
}));
jest.mock('@/lib/api/answer-logs', () => ({ logPracticeAnswers: jest.fn().mockResolvedValue(0) }));
// ExamContainer แทนด้วยปุ่มที่ทำแบบเดียวกับของจริง: ตอบ / เปลี่ยนข้อ / ส่ง (completeExam → เก็บ storage → onComplete)
jest.mock('@/components/exam', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExam } = require('@/contexts/ExamContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { saveExamSession } = require('@/lib/exam-utils');
  function FakeExamContainer({ onComplete }: { onComplete: () => void | Promise<void> }) {
    const { state, selectAnswer, nextQuestion, completeExam } = useExam();
    const qid = state.session.questionIds[state.session.currentIndex];
    return (
      <div>
        <span>{`เวลาข้อนี้ ${state.currentTimer}`}</span>
        <button type="button" onClick={() => selectAnswer(qid, 'a')}>
          ตอบข้อนี้
        </button>
        <button type="button" onClick={nextQuestion}>
          ถัดไป
        </button>
        <button
          type="button"
          onClick={async () => {
            const { session, questions } = completeExam();
            saveExamSession(session, questions);
            await onComplete();
          }}
        >
          ส่งข้อสอบ
        </button>
      </div>
    );
  }
  return { ExamContainer: FakeExamContainer };
});

const FIND = { timeout: 5000 };
const TEST_TIMEOUT = 15000;

const mcq = (id: string) => ({
  id,
  question: id,
  type: 'multiple_choice',
  category: 'general_knowledge',
  choices: [
    { id: 'a', text: 'ก', isCorrect: true },
    { id: 'b', text: 'ข', isCorrect: false },
  ],
});
const questions = [mcq('q1'), mcq('q2'), mcq('q3')];

const pages = [
  {
    name: '/practice/topic/[topicId]',
    render: () => render(<TopicPracticePage params={params({ topicId: 't1' })} />),
    sessionKey: 'topic_t1',
    setup: () => {
      (getQuestionsByTopic as jest.Mock).mockResolvedValue(questions);
      (getTopic as jest.Mock).mockResolvedValue({ id: 't1', name: 'หัวข้อทดสอบ' });
    },
    finished: () => screen.findByText('ผลการทำข้อสอบ', undefined, FIND),
  },
  {
    name: '/practice/subject/[subjectId]',
    render: () => render(<SubjectPracticePage params={params({ subjectId: 'sub1' })} />),
    sessionKey: 'subject_sub1',
    setup: () => {
      (getQuestionsBySubject as jest.Mock).mockResolvedValue(questions);
      (getPublicCurriculumTree as jest.Mock).mockResolvedValue([{ id: 'sub1', name: 'วิชาทดสอบ', chapters: [] }]);
    },
    finished: () => screen.findByText('ผลการทำข้อสอบ', undefined, FIND),
  },
  {
    name: '/practice/chapter/[chapterId]',
    render: () => render(<ChapterPracticePage params={params({ chapterId: 'ch1' })} />),
    sessionKey: 'chapter_ch1',
    setup: () => {
      (getQuestionsByChapter as jest.Mock).mockResolvedValue(questions);
      (getChapter as jest.Mock).mockResolvedValue({ id: 'ch1', name: 'บททดสอบ' });
    },
    finished: () => waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard/library'), FIND),
  },
];

describe.each(pages)('$name — ฝึกแบบไม่มี attempt → บันทึกคำตอบผ่าน answer-logs (task 16)', (page) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 't');
    page.setup();
  });

  it('ส่งแล้วเรียก logPracticeAnswers ครั้งเดียวด้วย session ที่จบแล้ว (คำตอบ + เวลาข้อสุดท้าย)', async () => {
    page.render();
    await screen.findByText('เวลาข้อนี้ 0', undefined, FIND);

    // ตอบข้อ 1 → ไปข้อ 2 (ไม่ตอบ) → ไปข้อ 3 ตอบ รอให้นาฬิกาเดิน แล้วส่ง
    fireEvent.click(screen.getByRole('button', { name: 'ตอบข้อนี้' }));
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    fireEvent.click(screen.getByRole('button', { name: 'ตอบข้อนี้' }));
    await screen.findByText('เวลาข้อนี้ 1', undefined, FIND);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งข้อสอบ' }));

    await page.finished();
    await waitFor(() => expect(logPracticeAnswers).toHaveBeenCalledTimes(1), FIND);
    const sent = (logPracticeAnswers as jest.Mock).mock.calls[0][0] as ExamSession;
    expect(sent.examId).toBe(page.sessionKey);
    expect(sent.status).toBe('completed');
    expect(sent.answers).toEqual({ q1: 'a', q3: 'a' });
    // BUG-22: เวลาของข้อที่เปิดอยู่ตอนส่ง (ข้อ 3) ถูกนับ
    expect(sent.timePerQuestion.q3).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);
});
