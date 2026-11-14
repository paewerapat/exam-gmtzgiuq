import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import ExamContainer from './ExamContainer';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { fetchClockOffset } from '@/lib/api/serverTime';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

// task 21 review รอบ 4 ข้อ 2: นาฬิกาถอยหลังของข้อสอบจริงต้องไม่ส่งอัตโนมัติก่อน sync เวลา server ครั้งแรก
// และ session ที่หน้าคำนวณด้วย offset หนึ่ง (clockOffsetBasisMs) ต้องได้เวลาที่เหลือเท่าเดิมเมื่อ container sync ได้ offset อื่น

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn(), isVisible: jest.fn(() => false), close: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn() }));

const question: Question = {
  id: 'q1',
  question: 'โจทย์ q1',
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

function Harness({ session, onComplete }: { session: ExamSession; onComplete: () => void }) {
  const { initExam, state } = useExam();
  useEffect(() => {
    initExam(session, [question]);
  }, [initExam, session]);
  return state.session.id ? <ExamContainer onComplete={onComplete} mode="exam" /> : null;
}

const SKEW = -120_000; // นาฬิกาเครื่องเร็วกว่า server 2 นาที (offset = server − client)

function setup(patch: Partial<ExamSession>) {
  const onComplete = jest.fn();
  const session: ExamSession = {
    id: 's1',
    examId: 'e1',
    examTitle: 'ชุด',
    category: 'general_knowledge',
    questionIds: ['q1'],
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date(Date.now()).toISOString(),
    durationSeconds: 60,
    status: 'in_progress',
    ...patch,
  };
  render(
    <ExamProvider>
      <Harness session={session} onComplete={onComplete} />
    </ExamProvider>,
  );
  return { onComplete };
}

/** เวลาที่แสดง (วินาที) */
function shown(): number {
  const el = document.querySelector('span.tabular-nums');
  const m = /(\d+):(\d{2})/.exec(el?.textContent ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function deferred() {
  let resolve!: (v: number) => void;
  const promise = new Promise<number>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('ExamContainer — sync เวลา server ก่อนส่งอัตโนมัติ (task 21 review 4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('หน้าคำนวณด้วย offset จริง (basis) แต่ container ยังไม่ sync → ใช้ basis แสดงเวลาที่เหลือถูก ไม่ส่งทันที', async () => {
    const d = deferred();
    (fetchClockOffset as jest.Mock).mockReturnValue(d.promise);
    // หน้า: totalPausedMs = (now + offset) − startedAt − ใช้ไป 0 → SKEW
    const { onComplete } = setup({ totalPausedMs: SKEW, clockOffsetBasisMs: SKEW });
    await advance(2000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(shown()).toBeGreaterThanOrEqual(57);
    expect(shown()).toBeLessThanOrEqual(60);

    await act(async () => d.resolve(SKEW));
    await advance(1000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(shown()).toBeGreaterThanOrEqual(56);
    expect(shown()).toBeLessThanOrEqual(58);
  });

  it('หน้า sync ล้ม (basis 0) แต่ container sync ได้ทีหลัง → ปรับ totalPausedMs ให้เวลาที่เหลือเท่าเดิม (ไม่ได้เพิ่ม/ลดเท่า skew)', async () => {
    const d = deferred();
    (fetchClockOffset as jest.Mock).mockReturnValue(d.promise);
    const { onComplete } = setup({ totalPausedMs: 0, clockOffsetBasisMs: 0 });
    await advance(1000);
    const before = shown();
    expect(before).toBeGreaterThanOrEqual(58);

    await act(async () => d.resolve(SKEW));
    await advance(1000);
    // ถ้าไม่ rebase จะกลายเป็น ~178 วินาที
    expect(shown()).toBeGreaterThanOrEqual(57);
    expect(shown()).toBeLessThanOrEqual(before);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('session ปกติที่เวลาหมดแล้ว: ไม่ส่งก่อน sync ครั้งแรกจบ แล้วส่งเมื่อ sync เสร็จ', async () => {
    const d = deferred();
    (fetchClockOffset as jest.Mock).mockReturnValue(d.promise);
    const { onComplete } = setup({ startedAt: new Date(Date.now() - 120_000).toISOString() });
    await advance(2000);
    expect(shown()).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => d.resolve(0));
    await advance(1000);
    expect(onComplete).toHaveBeenCalled();
  });

  it('sync ไม่ตอบเลย → หลัง 5 วินาทีถือว่า sync จบ (ใช้ offset เดิม) แล้วส่งได้', async () => {
    (fetchClockOffset as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { onComplete } = setup({ startedAt: new Date(Date.now() - 120_000).toISOString() });
    await advance(4000);
    expect(onComplete).not.toHaveBeenCalled();
    await advance(2000);
    expect(onComplete).toHaveBeenCalled();
  });

  it('session ปกติที่ยังมีเวลา + sync ได้ offset → นับถอยหลังตามเวลา server แบบเดิม', async () => {
    (fetchClockOffset as jest.Mock).mockResolvedValue(-10_000); // เครื่องเร็ว 10 วินาที → เหลือมากขึ้น 10 วินาที
    const { onComplete } = setup({});
    await advance(1000);
    expect(shown()).toBeGreaterThanOrEqual(68);
    expect(shown()).toBeLessThanOrEqual(70);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
