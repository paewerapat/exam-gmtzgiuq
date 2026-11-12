import {
  ANSWER_LOG_BATCH_SIZE,
  buildPracticeAnswerLogItems,
  logPracticeAnswers,
  postAnswerLogs,
} from './answer-logs';
import { ApiError } from './apiError';
import type { ExamSession } from '@/types/exam';

type FetchInit = RequestInit & { headers: Record<string, string> };

function mockFetch(impl: (body: { items: unknown[] }) => { status: number; body: unknown }) {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: FetchInit) => {
    const { status, body } = impl(JSON.parse(String(init.body)));
    return { ok: status < 400, status, json: async () => body };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const call = (fetchMock: jest.Mock, i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, FetchInit];
  return { url: new URL(url), init, body: JSON.parse(String(init.body)) as { items: Record<string, unknown>[] } };
};

let sessionSeq = 0;
function session(partial: Partial<ExamSession> = {}): ExamSession {
  sessionSeq += 1;
  return {
    id: `s-${sessionSeq}`,
    examId: 'topic_t1',
    examTitle: 'ฝึกตามหัวข้อ',
    category: 'general_knowledge',
    questionIds: [],
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date(0).toISOString(),
    status: 'completed',
    ...partial,
  };
}

/** session ที่ตอบทุกข้อ n ข้อ */
function answeredSession(n: number): ExamSession {
  const questionIds = Array.from({ length: n }, (_, i) => `q${i + 1}`);
  return session({
    questionIds,
    answers: Object.fromEntries(questionIds.map((id) => [id, 'a'])),
    timePerQuestion: Object.fromEntries(questionIds.map((id) => [id, 3])),
  });
}

describe('postAnswerLogs — POST /answer-logs', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'tok');
  });

  it('ส่ง { items } พร้อม Bearer token และคืน saved', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { saved: 1 } }));
    const items = [{ questionId: 'q1', selected: 'b,c', timeSpentSec: 4, mode: 'practice' as const }];
    await expect(postAnswerLogs(items)).resolves.toEqual({ saved: 1 });
    const { url, init, body } = call(fetchMock);
    expect(url.pathname).toBe('/answer-logs');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(body).toEqual({ items });
  });

  it('API ตอบ 400 → throw ApiError พร้อม status', async () => {
    mockFetch(() => ({ status: 400, body: { statusCode: 400, message: ['mode must be practice'] } }));
    const err = await postAnswerLogs([{ questionId: 'q1', selected: 'a', timeSpentSec: 0, mode: 'practice' }]).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });

  it('saved ไม่ใช่ตัวเลข → 0', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    await expect(postAnswerLogs([{ questionId: 'q1', selected: 'a', timeSpentSec: 0, mode: 'practice' }])).resolves.toEqual({
      saved: 0,
    });
  });
});

describe('buildPracticeAnswerLogItems', () => {
  it('เฉพาะข้อที่ตอบ ตามลำดับข้อ ไม่ซ้ำ เวลาเป็นจำนวนเต็ม ≥ 0 คำตอบส่งตามรูปแบบ attempt.answers', () => {
    const s = session({
      questionIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q1', 'q6'],
      answers: {
        q1: 'c',
        q2: '',
        q3: '   ',
        q4: 'b,c,d',
        q5: 'x'.repeat(501),
        q6: '\\frac{1}{2}',
        notInExam: 'a',
      },
      timePerQuestion: { q1: 12.6, q4: -3, q6: Number.NaN },
    });
    expect(buildPracticeAnswerLogItems(s)).toEqual([
      { questionId: 'q1', selected: 'c', timeSpentSec: 13, mode: 'practice' },
      { questionId: 'q4', selected: 'b,c,d', timeSpentSec: 0, mode: 'practice' },
      { questionId: 'q6', selected: '\\frac{1}{2}', timeSpentSec: 0, mode: 'practice' },
    ]);
  });

  it('ไม่ได้ตอบเลย → []', () => {
    expect(buildPracticeAnswerLogItems(session({ questionIds: ['q1', 'q2'] }))).toEqual([]);
  });

  it('คำตอบยาว 500 ตัวพอดียังส่ง', () => {
    const s = session({ questionIds: ['q1'], answers: { q1: '1'.repeat(500) } });
    expect(buildPracticeAnswerLogItems(s)).toHaveLength(1);
  });
});

describe('logPracticeAnswers', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'tok');
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('ไม่ได้ login → ไม่ส่ง', async () => {
    localStorage.removeItem('token');
    const fetchMock = mockFetch(() => ({ status: 200, body: { saved: 1 } }));
    await expect(logPracticeAnswers(answeredSession(2))).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ไม่มีข้อที่ตอบ → ไม่ส่ง', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { saved: 0 } }));
    await logPracticeAnswers(session({ questionIds: ['q1'] }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('450 ข้อ → แบ่ง 3 ก้อน (200, 200, 50) และรวม saved', async () => {
    const fetchMock = mockFetch(({ items }) => ({ status: 200, body: { saved: items.length } }));
    await expect(logPracticeAnswers(answeredSession(450))).resolves.toBe(450);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => call(fetchMock, i).body.items.length)).toEqual([ANSWER_LOG_BATCH_SIZE, 200, 50]);
    expect(call(fetchMock, 2).body.items[49].questionId).toBe('q450');
  });

  it('ก้อนแรกล้ม → console.warn แล้วส่งก้อนถัดไป ไม่ throw', async () => {
    let n = 0;
    const fetchMock = mockFetch(({ items }) => {
      n += 1;
      return n === 1 ? { status: 500, body: { message: 'boom' } } : { status: 200, body: { saved: items.length } };
    });
    await expect(logPracticeAnswers(answeredSession(201))).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('network error → เงียบ (console.warn) ไม่ throw', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    await expect(logPracticeAnswers(answeredSession(1))).resolves.toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('token หมดอายุ (401) → เงียบ ไม่ล้าง token/user ไม่เปลี่ยนหน้า (round 2)', async () => {
    localStorage.setItem('user', '{"id":"u1"}');
    window.history.pushState({}, '', '/practice/subject/sub1');
    const hrefBefore = window.location.href;
    const fetchMock = mockFetch(() => ({ status: 401, body: { statusCode: 401, message: 'Unauthorized' } }));
    await expect(logPracticeAnswers(answeredSession(2))).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBe('tok');
    expect(localStorage.getItem('user')).toBe('{"id":"u1"}');
    expect(window.location.href).toBe(hrefBefore);
  });

  it('postAnswerLogs ได้ 401 → throw ApiError status 401 (ไม่ redirect)', async () => {
    mockFetch(() => ({ status: 401, body: { statusCode: 401, message: 'Unauthorized' } }));
    const err = await postAnswerLogs([{ questionId: 'q1', selected: 'a', timeSpentSec: 0, mode: 'practice' }]).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it('session เดิมเรียกซ้ำ → ส่งครั้งเดียว', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { saved: 1 } }));
    const s = answeredSession(1);
    await logPracticeAnswers(s);
    await logPracticeAnswers({ ...s });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
