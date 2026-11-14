import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopicPracticePage from './page';
import SubjectPracticePage from '@/app/practice/subject/[subjectId]/page';
import ChapterPracticePage from '@/app/practice/chapter/[chapterId]/page';
import { getQuestionsByChapter, getQuestionsBySubject, getQuestionsByTopic } from '@/lib/api/questions';
import { getChapter, getPublicCurriculumTree, getTopic } from '@/lib/api/curriculum';
import { EXAM_STORAGE_KEYS, saveExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

// หน้าเหล่านี้ใช้ use(params) ของ React 19 (Next) แต่ Jest ใช้ React 18.3 → ให้ use อ่านค่าที่แนบไว้กับ params
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, use: (p: { value: unknown }) => p.value };
});
const params = <T,>(value: T) => Object.assign(Promise.resolve(value), { value });

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
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
// ExamContainer ของจริง (ปุ่มตั้งค่าเวลาอยู่ในนี้)
jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn(), isVisible: jest.fn(() => false), close: jest.fn() },
}));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));
jest.mock('react-toastify', () => ({ toast: { info: jest.fn(), warning: jest.fn(), success: jest.fn(), error: jest.fn() } }));
jest.setTimeout(20000);

const FIND = { timeout: 8000 };

const mcq = (id: string): Question =>
  ({
    id,
    question: `โจทย์ ${id}`,
    type: 'multiple_choice',
    category: 'general_knowledge',
    difficulty: 'medium',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
    choices: [
      { id: 'a', text: 'ก', isCorrect: true },
      { id: 'b', text: 'ข', isCorrect: false },
    ],
  }) as Question;
const questions = [mcq('q1'), mcq('q2')];

const pages = [
  {
    name: '/practice/topic/[topicId]',
    render: () =>
      render(
        <StrictMode>
          <TopicPracticePage params={params({ topicId: 't1' })} />
        </StrictMode>,
      ),
    sessionKey: 'topic_t1',
    fetcher: getQuestionsByTopic as jest.Mock,
    setup: () => {
      (getQuestionsByTopic as jest.Mock).mockResolvedValue(questions);
      (getTopic as jest.Mock).mockResolvedValue({ id: 't1', name: 'หัวข้อทดสอบ' });
    },
  },
  {
    name: '/practice/subject/[subjectId]',
    render: () =>
      render(
        <StrictMode>
          <SubjectPracticePage params={params({ subjectId: 'sub1' })} />
        </StrictMode>,
      ),
    sessionKey: 'subject_sub1',
    fetcher: getQuestionsBySubject as jest.Mock,
    setup: () => {
      (getQuestionsBySubject as jest.Mock).mockResolvedValue(questions);
      (getPublicCurriculumTree as jest.Mock).mockResolvedValue([{ id: 'sub1', name: 'วิชาทดสอบ', chapters: [] }]);
    },
  },
  {
    name: '/practice/chapter/[chapterId]',
    render: () =>
      render(
        <StrictMode>
          <ChapterPracticePage params={params({ chapterId: 'ch1' })} />
        </StrictMode>,
      ),
    sessionKey: 'chapter_ch1',
    fetcher: getQuestionsByChapter as jest.Mock,
    setup: () => {
      (getQuestionsByChapter as jest.Mock).mockResolvedValue(questions);
      (getChapter as jest.Mock).mockResolvedValue({ id: 'ch1', name: 'บททดสอบ' });
    },
  },
];

function pendingSession(sessionKey: string): ExamSession {
  return {
    id: 'old-session',
    examId: sessionKey,
    examTitle: 'ค้างไว้',
    category: 'general_knowledge',
    questionIds: questions.map((q) => q.id),
    currentIndex: 1,
    answers: { q1: 'a' },
    markedForReview: [],
    timePerQuestion: { q1: 12 },
    startedAt: new Date().toISOString(),
    status: 'in_progress',
  };
}

const timerButton = () => screen.findByRole('button', { name: /^ตั้งค่าเวลา/ }, FIND);

describe.each(pages)('$name — ปุ่มตั้งค่าเวลา (task 21 / QA b3b)', (page) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    page.setup();
  });

  it('เข้าครั้งแรก (ไม่มี session ค้าง) ใน StrictMode → ไม่ขึ้น "ทำค้างอยู่" ผิด ๆ, เห็นปุ่มตั้งค่าเวลา, โหลดคำถามครั้งเดียว', async () => {
    page.render();
    expect(await timerButton()).toHaveTextContent('นับขึ้น');
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(page.fetcher).toHaveBeenCalledTimes(1);
  });

  it('มี session ค้าง → กด "ทำต่อ" แล้วเห็นปุ่มตั้งค่าเวลา และทำต่อจากข้อเดิม', async () => {
    saveExamSession(pendingSession(page.sessionKey), questions);
    page.render();
    fireEvent.click(await screen.findByRole('button', { name: 'ทำต่อจากข้อที่ 2' }, FIND));
    expect(await timerButton()).toBeInTheDocument();
    expect(screen.getByText('โจทย์ q2')).toBeInTheDocument();
  });

  it('มี session ค้าง → กด "เริ่มทำใหม่" แล้วเห็นปุ่มตั้งค่าเวลา (session ใหม่)', async () => {
    saveExamSession(pendingSession(page.sessionKey), questions);
    page.render();
    fireEvent.click(await screen.findByRole('button', { name: /เริ่มทำใหม่/ }, FIND));
    expect(await timerButton()).toBeInTheDocument();
    expect(screen.getByText('โจทย์ q1')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
    expect(saved.id).not.toBe('old-session');
  });
});
