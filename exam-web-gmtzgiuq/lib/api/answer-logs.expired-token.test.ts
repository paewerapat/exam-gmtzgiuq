// QA task 16: ส่ง answer log ตอนจบการฝึก (topic/subject/chapter) ด้วย token ที่หมดอายุ
// สัญญา: "เรียกล้ม → เงียบ (console.warn) ไม่ขวางผู้ใช้" → ต้องไม่พาออกจากหน้าผลไป /login
// jsdom เปลี่ยนหน้าจริงไม่ได้ การตั้ง window.location.href จะถูกรายงานเป็น
// console.error "Not implemented: navigation" ใช้ตรงนี้ตรวจว่ามีการ redirect หรือไม่
import { logPracticeAnswers } from './answer-logs';
import type { ExamSession } from '@/types/exam';

const session = (id: string): ExamSession => ({
  id,
  examId: 'topic_t1',
  examTitle: 'ฝึกตามหัวข้อ',
  category: 'general_knowledge',
  questionIds: ['q1', 'q2'],
  currentIndex: 1,
  answers: { q1: 'a', q2: '3.5' },
  markedForReview: [],
  timePerQuestion: { q1: 4, q2: 6 },
  startedAt: new Date(0).toISOString(),
  status: 'completed',
});

describe('logPracticeAnswers with an expired token (POST /answer-logs → 401)', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'expired.jwt.token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'u1@example.test' }));
    window.history.pushState({}, '', '/practice/topic/t1');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized', statusCode: 401 }),
    }) as unknown as typeof fetch;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  const navigationAttempts = () =>
    error.mock.calls.filter((args: unknown[]) =>
      args.some((a) => String((a as { message?: unknown } | null)?.message ?? a).includes('navigation')),
    );

  it('does not throw and reports 0 saved', async () => {
    await expect(logPracticeAnswers(session('qa16-expired-1'))).resolves.toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the user on the result screen (no redirect to /login)', async () => {
    await logPracticeAnswers(session('qa16-expired-2'));
    expect(navigationAttempts()).toHaveLength(0);
    expect(window.location.pathname).toBe('/practice/topic/t1');
  });
});
