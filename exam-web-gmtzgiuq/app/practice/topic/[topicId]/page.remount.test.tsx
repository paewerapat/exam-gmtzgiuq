import { useEffect, useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopicPracticePage from './page';
import SubjectPracticePage from '@/app/practice/subject/[subjectId]/page';
import ChapterPracticePage from '@/app/practice/chapter/[chapterId]/page';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getQuestionsByChapter, getQuestionsBySubject, getQuestionsByTopic } from '@/lib/api/questions';
import { getChapter, getPublicCurriculumTree, getTopic } from '@/lib/api/curriculum';
import { EXAM_STORAGE_KEYS, saveExamSession } from '@/lib/exam-utils';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

// task 21 Q2: เข้าครั้งแรกในเบราว์เซอร์ใหม่ขึ้น "ทำค้างอยู่ … ทำต่อจากข้อที่ 1"
// ต้นเหตุ: ThemeProvider เดิมทำให้ทั้งแอป remount 1 ครั้งทุก hard load → instance ที่ 2 เจอ session ที่ instance แรกเพิ่งสร้าง

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

/**
 * จำลอง provider แบบเดิมที่ทำให้ลูกทั้งหมด remount หลัง mount
 * (คืน children เปล่าก่อน แล้วค่อยครอบด้วย element คนละชนิด — เหมือน ThemeProvider ก่อนแก้)
 */
function RemountingProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // ตั้งใจเลียนแบบ ThemeProvider เดิมทุกจังหวะ (setState ใน effect ตอน mount) เพื่อทดสอบหน้าที่ถูก remount
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{children}</>;
  return <div data-testid="remounted">{children}</div>;
}

const pages = [
  {
    name: '/practice/topic/[topicId]',
    element: () => <TopicPracticePage params={params({ topicId: 't1' })} />,
    sessionKey: 'topic_t1',
    fetcher: getQuestionsByTopic as jest.Mock,
    setup: () => {
      (getQuestionsByTopic as jest.Mock).mockResolvedValue(questions);
      (getTopic as jest.Mock).mockResolvedValue({ id: 't1', name: 'หัวข้อทดสอบ' });
    },
  },
  {
    name: '/practice/subject/[subjectId]',
    element: () => <SubjectPracticePage params={params({ subjectId: 'sub1' })} />,
    sessionKey: 'subject_sub1',
    fetcher: getQuestionsBySubject as jest.Mock,
    setup: () => {
      (getQuestionsBySubject as jest.Mock).mockResolvedValue(questions);
      (getPublicCurriculumTree as jest.Mock).mockResolvedValue([{ id: 'sub1', name: 'วิชาทดสอบ', chapters: [] }]);
    },
  },
  {
    name: '/practice/chapter/[chapterId]',
    element: () => <ChapterPracticePage params={params({ chapterId: 'ch1' })} />,
    sessionKey: 'chapter_ch1',
    fetcher: getQuestionsByChapter as jest.Mock,
    setup: () => {
      (getQuestionsByChapter as jest.Mock).mockResolvedValue(questions);
      (getChapter as jest.Mock).mockResolvedValue({ id: 'ch1', name: 'บททดสอบ' });
    },
  },
];

function storedSession(): ExamSession {
  return JSON.parse(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION) || '{}');
}

describe.each(pages)('$name — เข้าครั้งแรก/remount ไม่ขึ้น "ทำค้างอยู่" ผิด ๆ (task 21 Q2)', (page) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    page.setup();
  });

  it('ครอบด้วย ThemeProvider จริง (hard load) → เข้าหน้าข้อสอบเลย โหลดคำถามครั้งเดียว', async () => {
    render(<ThemeProvider>{page.element()}</ThemeProvider>);
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(page.fetcher).toHaveBeenCalledTimes(1);
  });

  it('provider ที่ remount ลูกหลัง mount (แบบ ThemeProvider เดิม) → ยังไม่ขึ้น "ทำค้างอยู่" และใช้ session เดียว', async () => {
    render(<RemountingProvider>{page.element()}</RemountingProvider>);
    await screen.findByTestId('remounted');
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    // รอให้ instance ทั้งสองโหลดเสร็จ (instance แรกถูก unmount ระหว่างรอ API)
    await waitFor(() => expect(page.fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(storedSession().examId).toBe(page.sessionKey));
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ทำต่อจากข้อที่/ })).not.toBeInTheDocument();
  });

  it('ออกแล้วเข้าใหม่ขณะ session ยังไม่ได้ตอบ (ข้อ 1) → ใช้ session เดิมต่อเลย ไม่ถาม', async () => {
    const first = render(page.element());
    await screen.findByText('โจทย์ q1', undefined, FIND);
    const firstId = storedSession().id;
    first.unmount();

    render(page.element());
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(storedSession().id).toBe(firstId);
  });

  it('session ที่ตอบแล้วแต่ยังอยู่ข้อ 1 → ยังถาม "ทำค้างอยู่" (ไม่ทิ้งคำตอบเงียบ ๆ)', async () => {
    saveExamSession(
      {
        id: 'answered',
        examId: page.sessionKey,
        examTitle: 'ค้างไว้',
        category: 'general_knowledge',
        questionIds: questions.map((q) => q.id),
        currentIndex: 0,
        answers: { q1: 'a' },
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        status: 'in_progress',
      },
      questions,
    );
    render(page.element());
    expect(await screen.findByText('ทำค้างอยู่', undefined, FIND)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ทำต่อจากข้อที่ 1' }));
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(storedSession().id).toBe('answered');
  });

  // ── task 21 M1: แอดมินแก้ชุด (id ข้อไม่ตรงกับที่ API ส่งมา) ──
  const staleSession = (patch: Partial<ExamSession> = {}): ExamSession => ({
    id: 'stale',
    examId: page.sessionKey,
    examTitle: 'ชุดเก่า',
    category: 'general_knowledge',
    questionIds: ['old1', 'q1'],
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    ...patch,
  });

  it('M1: session ที่ยังไม่ได้ตอบแต่ข้อไม่ตรงกับชุดใหม่จาก API → เริ่มชุดใหม่ ไม่ถาม', async () => {
    saveExamSession(staleSession(), [mcq('old1'), mcq('q1')]);
    render(page.element());
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    await waitFor(() => expect(storedSession().id).not.toBe('stale'));
    expect(storedSession().questionIds).toEqual(['q1', 'q2']);
  });

  it('M1: session ที่ยังไม่ได้ตอบ ข้อชุดเดียวกัน (ลำดับต่างได้) → ใช้ session เดิม', async () => {
    saveExamSession(staleSession({ questionIds: ['q2', 'q1'] }), questions);
    render(page.element());
    expect(await screen.findByText('โจทย์ q2', undefined, FIND)).toBeInTheDocument();
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(storedSession().id).toBe('stale');
  });

  it('M1: session ที่ตอบแล้วแต่ข้อไม่ตรง → ยังถาม "ทำค้างอยู่" แบบเดิม', async () => {
    saveExamSession(staleSession({ answers: { q1: 'a' } }), [mcq('old1'), mcq('q1')]);
    render(page.element());
    expect(await screen.findByText('ทำค้างอยู่', undefined, FIND)).toBeInTheDocument();
    expect(storedSession().id).toBe('stale');
  });

  it('M4: คำตอบว่าง (\'\') ไม่นับว่าตอบแล้ว → ใช้ session เดิมต่อ ไม่ถาม', async () => {
    saveExamSession(staleSession({ questionIds: ['q1', 'q2'], answers: { q1: '' } }), questions);
    render(page.element());
    expect(await screen.findByText('โจทย์ q1', undefined, FIND)).toBeInTheDocument();
    expect(screen.queryByText('ทำค้างอยู่')).not.toBeInTheDocument();
    expect(storedSession().id).toBe('stale');
  });
});
