import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { ExamProvider, useExam } from './ExamContext';
import { calculateExamResult } from '@/lib/exam-utils';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

// task 21 review รอบ 4: ช่วงหยุดชั่วคราวต้องไม่ถูกนับเป็นเวลาของข้อ (timePerQuestion ถูก autosave ขึ้น server
// แล้วใช้คิดเวลาที่ใช้ไปตอนทำต่อจากเครื่องอื่น) + REBASE_CLOCK ปรับ totalPausedMs ตาม offset จริง

const q = (id: string): Question =>
  ({
    id,
    question: id,
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
const questions = [q('q1'), q('q2')];

const session = (patch: Partial<ExamSession> = {}): ExamSession => ({
  id: 's1',
  examId: 'e1',
  examTitle: 'ชุด',
  category: 'general_knowledge',
  questionIds: ['q1', 'q2'],
  currentIndex: 0,
  answers: {},
  markedForReview: [],
  timePerQuestion: {},
  startedAt: new Date().toISOString(),
  durationSeconds: 3600,
  status: 'in_progress',
  ...patch,
});

const wrapper = ({ children }: { children: ReactNode }) => <ExamProvider>{children}</ExamProvider>;

describe('ExamContext — หยุดชั่วคราวไม่นับเวลา (task 21 review 4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ช่วงหยุดไม่ถูกบวกลง currentTimer / timePerQuestion / totalTime', () => {
    const { result } = renderHook(() => useExam(), { wrapper });
    act(() => result.current.initExam(session(), questions));

    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.state.currentTimer).toBe(3);

    act(() => result.current.pauseTimer());
    act(() => jest.advanceTimersByTime(50_000));
    expect(result.current.state.isPaused).toBe(true);
    expect(result.current.state.currentTimer).toBe(3);

    act(() => result.current.resumeTimer());
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.state.currentTimer).toBe(5);
    // ช่วงหยุดไปอยู่ใน totalPausedMs (ใช้กับนาฬิกาถอยหลังแบบ wall clock)
    expect(result.current.state.session.totalPausedMs).toBeGreaterThanOrEqual(50_000);

    // เปลี่ยนข้อ → เวลาของข้อ 1 = 5 วินาที ไม่ใช่ 55
    act(() => result.current.nextQuestion());
    expect(result.current.state.session.timePerQuestion.q1).toBe(5);

    // หยุดอีกรอบระหว่างข้อ 2 แล้วส่ง
    act(() => jest.advanceTimersByTime(1000));
    act(() => result.current.pauseTimer());
    act(() => jest.advanceTimersByTime(30_000));
    let finished: ExamSession | undefined;
    act(() => {
      finished = result.current.completeExam().session;
    });
    expect(finished!.timePerQuestion).toEqual({ q1: 5, q2: 1 });
    expect(calculateExamResult(finished!, questions).totalTime).toBe(6);
  });

  it('autosave ลง localStorage ระหว่างหยุด เก็บเวลาข้อปัจจุบันที่ไม่รวมช่วงหยุด', () => {
    const { result } = renderHook(() => useExam(), { wrapper });
    act(() => result.current.initExam(session(), questions));
    act(() => jest.advanceTimersByTime(4000));
    act(() => result.current.pauseTimer());
    act(() => jest.advanceTimersByTime(20_000));
    const saved = JSON.parse(localStorage.getItem('exam_current_session') || '{}');
    expect(saved.timePerQuestion).toEqual({ q1: 4 });
  });
});

describe('ExamContext — REBASE_CLOCK (task 21 review 4)', () => {
  it('มี clockOffsetBasisMs → totalPausedMs += offset − basis แล้วล้าง basis ; เรียกซ้ำไม่เปลี่ยน', () => {
    const { result } = renderHook(() => useExam(), { wrapper });
    act(() => result.current.initExam(session({ totalPausedMs: 1000, clockOffsetBasisMs: 0 }), questions));
    act(() => result.current.rebaseClock(-120_000));
    expect(result.current.state.session.totalPausedMs).toBe(1000 - 120_000);
    expect(result.current.state.session.clockOffsetBasisMs).toBeNull();
    act(() => result.current.rebaseClock(5000));
    expect(result.current.state.session.totalPausedMs).toBe(1000 - 120_000);
  });

  it('ไม่มี basis (session ปกติ) → ไม่เปลี่ยน', () => {
    const { result } = renderHook(() => useExam(), { wrapper });
    act(() => result.current.initExam(session({ totalPausedMs: 1000 }), questions));
    const before = result.current.state.session;
    act(() => result.current.rebaseClock(-120_000));
    expect(result.current.state.session).toBe(before);
  });
});
