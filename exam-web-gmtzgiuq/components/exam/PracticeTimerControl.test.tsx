import { useEffect } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import ExamContainer from './ExamContainer';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { EXAM_STORAGE_KEYS } from '@/lib/exam-utils';
import type { Question } from '@/lib/api/questions';
import type { ExamSession, PracticeTimerSettings } from '@/types/exam';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn(), isVisible: jest.fn(() => false), close: jest.fn() },
}));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));
jest.mock('react-toastify', () => ({ toast: { info: jest.fn(), warning: jest.fn(), success: jest.fn(), error: jest.fn() } }));

function mcq(id: string): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    choices: ['a', 'b', 'c', 'd'].map((c) => ({ id: c, text: `ตัวเลือก ${c}`, isCorrect: c === 'a' })),
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

const questions = [mcq('q1'), mcq('q2')];

function makeSession(patch: Partial<ExamSession> = {}): ExamSession {
  return {
    id: 'session-1',
    examId: 'exam-1',
    examTitle: 'ชุดทดสอบ',
    category: 'general_knowledge',
    questionIds: questions.map((q) => q.id),
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'in_progress',
    ...patch,
  };
}

function Harness({
  session,
  mode,
  onComplete,
  timerSettings,
}: {
  session: ExamSession;
  mode: 'practice' | 'exam';
  onComplete: () => void;
  timerSettings?: { recommendedMinutes?: number | null };
}) {
  const { initExam, state } = useExam();
  useEffect(() => {
    initExam(session, questions);
  }, [initExam, session]);
  return state.session.id ? (
    <ExamContainer onComplete={onComplete} mode={mode} timerSettings={timerSettings} />
  ) : null;
}

function setup({
  session = makeSession(),
  mode = 'practice' as 'practice' | 'exam',
  timerSettings = { recommendedMinutes: 90 } as { recommendedMinutes?: number | null } | null,
} = {}) {
  const onComplete = jest.fn();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const utils = render(
    <ExamProvider>
      <Harness session={session} mode={mode} onComplete={onComplete} timerSettings={timerSettings ?? undefined} />
    </ExamProvider>,
  );
  return { ...utils, user, onComplete };
}

const timerButton = () => screen.getByRole('button', { name: /^ตั้งค่าเวลา/ });
const timerValue = () => screen.getByTestId('practice-timer-value');
const tick = (seconds: number) =>
  act(() => {
    jest.advanceTimersByTime(seconds * 1000);
  });

async function setCountdown(
  user: ReturnType<typeof userEvent.setup>,
  minutes: string,
  { autoSubmit = true }: { autoSubmit?: boolean } = {},
) {
  await user.click(timerButton());
  const dialog = screen.getByRole('dialog', { name: 'ตั้งค่าเวลา' });
  await user.click(within(dialog).getByLabelText('นับถอยหลัง (ตั้งเวลาเอง)'));
  const input = within(dialog).getByLabelText('ตั้งเวลา');
  await user.clear(input);
  await user.type(input, minutes);
  const auto = within(dialog).getByRole('checkbox', { name: 'ส่งข้อสอบอัตโนมัติเมื่อหมดเวลา' });
  if ((auto as HTMLInputElement).checked !== autoSubmit) await user.click(auto);
  await user.click(within(dialog).getByRole('button', { name: 'ใช้เวลานี้' }));
}

function storedSession(): ExamSession | null {
  const raw = localStorage.getItem(EXAM_STORAGE_KEYS.SESSION);
  return raw ? (JSON.parse(raw) as ExamSession) : null;
}

describe('PracticeTimerControl — ตั้งค่าเวลาโหมดฝึก (task 21)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ค่าเริ่มต้นนับขึ้น: ปุ่มนาฬิกามีป้าย "นับขึ้น" และเปิดหน้าต่าง (dialog) แบบ portal', async () => {
    const { user, container } = setup();
    expect(timerButton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(timerButton()).toHaveAttribute('aria-expanded', 'false');
    expect(timerButton()).toHaveTextContent('นับขึ้น');
    tick(3);
    expect(timerValue()).toHaveTextContent('00:03');

    await user.click(timerButton());
    const dialog = screen.getByRole('dialog', { name: 'ตั้งค่าเวลา' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.contains(dialog)).toBe(false); // render ไป document.body
    expect(timerButton()).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByLabelText('นับขึ้น')).toBeChecked();
    expect(within(dialog).getByLabelText('นับขึ้น')).toHaveFocus();
  });

  it('เลือกนับถอยหลัง: ค่าเริ่มต้น = เวลาสอบจริงของชุด + ข้อความค่าแนะนำ + ปุ่มลัด 30/60/90/120 + ติ๊กส่งอัตโนมัติไว้', async () => {
    const { user } = setup();
    await user.click(timerButton());
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByLabelText('นับถอยหลัง (ตั้งเวลาเอง)'));
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveValue(90);
    expect(dialog.getByText(/ค่าแนะนำเท่าเวลาสอบจริงของชุดนี้ 90 นาที/)).toBeInTheDocument();
    expect(dialog.getByRole('checkbox', { name: 'ส่งข้อสอบอัตโนมัติเมื่อหมดเวลา' })).toBeChecked();

    const presets = within(dialog.getByRole('group', { name: 'ปุ่มลัดเวลา' })).getAllByRole('button');
    expect(presets.map((b) => b.textContent)).toEqual(['3030 นาที', '6060 นาที', '9090 นาที', '120120 นาที']);
    expect(dialog.getByRole('button', { name: '90 นาที' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(dialog.getByRole('button', { name: '30 นาที' }));
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveValue(30);
    expect(dialog.getByRole('button', { name: '30 นาที' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ชุดไม่มี durationMinutes → ค่าเริ่มต้น 60 และไม่แสดงบรรทัดค่าแนะนำ', async () => {
    const { user } = setup({ timerSettings: {} });
    await user.click(timerButton());
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByLabelText('นับถอยหลัง (ตั้งเวลาเอง)'));
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveValue(60);
    expect(dialog.queryByText(/ค่าแนะนำ/)).not.toBeInTheDocument();
  });

  it('นาทีนอกช่วง 1–600 → แจ้ง error ใต้ช่อง (role=alert, aria-invalid) ไม่ปิดหน้าต่าง', async () => {
    const { user } = setup();
    await setCountdown(user, '601');
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('alert')).toHaveTextContent('กรุณาใส่เวลาเป็นจำนวนเต็ม 1–600 นาที');
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveAttribute('aria-invalid', 'true');
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveFocus();
  });

  it('Escape / ยกเลิก → ปิดโดยไม่เปลี่ยนโหมด และ focus กลับที่ปุ่มนาฬิกา', async () => {
    const { user } = setup();
    await user.click(timerButton());
    await user.click(within(screen.getByRole('dialog')).getByLabelText('นับถอยหลัง (ตั้งเวลาเอง)'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(timerButton()).toHaveFocus();
    expect(timerButton()).toHaveTextContent('นับขึ้น');

    await user.click(timerButton());
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(timerButton()).toHaveTextContent('นับขึ้น');
  });

  it('นับถอยหลัง 1 นาที + ส่งอัตโนมัติ → หมดเวลาแล้วส่งข้อสอบครั้งเดียว (session completed ใน storage)', async () => {
    const { user, onComplete } = setup();
    tick(5); // ใช้เวลาไปแล้ว — นับถอยหลังเริ่มใหม่จากค่าที่ตั้ง ไม่ลบเวลานี้
    await setCountdown(user, '1');
    expect(timerButton()).toHaveTextContent('นับถอยหลัง');
    expect(timerValue()).toHaveTextContent('01:00');
    tick(30);
    expect(timerValue()).toHaveTextContent('00:30');
    expect(onComplete).not.toHaveBeenCalled();
    tick(30);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith('หมดเวลาที่ตั้งไว้ ระบบส่งข้อสอบให้อัตโนมัติ');
    const saved = storedSession();
    expect(saved?.status).toBe('completed');
    // เวลาที่ใช้จริงนับต่อเนื่อง (5 วินาทีก่อนตั้ง + 60 วินาที)
    expect(saved?.timePerQuestion.q1).toBeGreaterThanOrEqual(65);
    tick(10);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ไม่ติ๊กส่งอัตโนมัติ → 00:00 สีแดง + toast "หมดเวลาที่ตั้งไว้" และทำต่อได้ (ไม่ส่ง)', async () => {
    const { user, onComplete } = setup();
    await setCountdown(user, '1', { autoSubmit: false });
    tick(61);
    expect(timerValue()).toHaveTextContent('00:00');
    expect(timerValue().className).toMatch(/text-red-600/);
    expect(timerValue().className).toMatch(/dark:text-red-400/);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('หมดเวลาที่ตั้งไว้');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('practice-timer-live')).toHaveTextContent('หมดเวลาที่ตั้งไว้ ทำข้อสอบต่อได้');
    tick(30);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    // ยังเลือกคำตอบได้
    await user.click(screen.getByRole('button', { name: /ตัวเลือก a/ }));
    expect(screen.getByRole('button', { name: /ตัวเลือก a/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ไม่ส่งอัตโนมัติ: แจ้งหมดเวลาแล้วจำไว้ใน session → reload/resume ไม่ toast ซ้ำ แต่ยัง 00:00 แดง (R7)', async () => {
    const { user, unmount } = setup();
    await setCountdown(user, '1', { autoSubmit: false });
    tick(61);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    tick(1); // autosave (debounce 500ms)
    const saved = storedSession();
    expect(saved?.practiceTimer).toMatchObject({ mode: 'down', minutes: 1, autoSubmit: false, expiredNotified: true });
    unmount();

    // reload: session จาก storage (หมดเวลาแล้ว + แจ้งแล้ว)
    setup({ session: saved! });
    expect(timerValue()).toHaveTextContent('00:00');
    expect(timerValue().className).toMatch(/text-red-600/);
    tick(5);
    expect(toast.warning).toHaveBeenCalledTimes(1);

    // ตั้งนับถอยหลังใหม่ → หมดเวลาครั้งใหม่แจ้งอีกครั้ง
    await setCountdown(user, '1', { autoSubmit: false });
    tick(61);
    expect(toast.warning).toHaveBeenCalledTimes(2);
  });

  it('session ที่หมดเวลาแต่ยังไม่เคยแจ้ง (ค่าตั้งเก่า) → แจ้งครั้งเดียวตอนเปิด', () => {
    const practiceTimer: PracticeTimerSettings = { mode: 'down', minutes: 1, autoSubmit: false, startTotalSec: 0 };
    setup({ session: makeSession({ practiceTimer, timePerQuestion: { q1: 90 } }) });
    expect(timerValue()).toHaveTextContent('00:00');
    expect(toast.warning).toHaveBeenCalledTimes(1);
    tick(3);
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('ค่าตั้งเก็บใน session → resume แล้วโหมดและเวลาที่เหลือถูก (นับจากเวลาทำจริง)', async () => {
    const practiceTimer: PracticeTimerSettings = { mode: 'down', minutes: 2, autoSubmit: true, startTotalSec: 30 };
    // เวลาทำรวม 50 วินาที ตั้งไว้ตอน 30 → ใช้ไป 20 → เหลือ 100 วินาที
    const { onComplete } = setup({ session: makeSession({ practiceTimer, timePerQuestion: { q1: 50 } }) });
    expect(timerButton()).toHaveTextContent('นับถอยหลัง');
    expect(timerValue()).toHaveTextContent('01:40');
    tick(1);
    expect(storedSession()?.practiceTimer).toEqual(practiceTimer);
    tick(99);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ตั้งนับถอยหลังแล้วกลับไปนับขึ้นได้ระหว่างทำ (จำนาทีที่ตั้งไว้)', async () => {
    const { user } = setup();
    await setCountdown(user, '45');
    expect(timerValue()).toHaveTextContent('45:00');
    tick(2);
    await user.click(timerButton());
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('นับถอยหลัง (ตั้งเวลาเอง)')).toBeChecked();
    expect(dialog.getByLabelText('ตั้งเวลา')).toHaveValue(45);
    await user.click(dialog.getByLabelText('นับขึ้น'));
    await user.click(dialog.getByRole('button', { name: 'ใช้เวลานี้' }));
    expect(timerButton()).toHaveTextContent('นับขึ้น');
    tick(1); // autosave ลง storage (debounce 500ms)
    expect(storedSession()?.practiceTimer).toMatchObject({ mode: 'up', minutes: 45 });
  });

  it('โหมดสอบจริง / หน้าที่ไม่เปิดใช้ → ไม่มีปุ่มตั้งค่าเวลา (นาฬิกาแบบเดิม)', () => {
    const { unmount } = setup({ mode: 'exam' });
    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();
    unmount();
    setup({ timerSettings: null });
    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();
  });

  it('session เก่าที่จับเวลาถอยหลังตาม durationSeconds → คงนาฬิกาแบบเดิม ไม่มีปุ่มตั้งค่า', () => {
    setup({ session: makeSession({ durationSeconds: 600 }) });
    expect(screen.queryByTestId('practice-timer')).not.toBeInTheDocument();
  });
});
