import {
  createQbSession,
  getQbSubject,
  getQbVenueOverview,
  getQbVenues,
  isLockedQuestion,
  QB_ERROR_LOGIN_REQUIRED,
} from './question-bank';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('lib/api/question-bank (task 20)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getQbVenues: GET /question-bank/venues?mode= ส่ง token ถ้ามี', async () => {
    localStorage.setItem('token', 't1');
    const fetchMock = mockFetch([{ id: 'v1', key: 'netsat', name: 'NETSAT', extra: 1 }]);
    const venues = await getQbVenues('challenge');
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url);
    expect(u.pathname).toBe('/question-bank/venues');
    expect(u.searchParams.get('mode')).toBe('challenge');
    expect(init.headers.Authorization).toBe('Bearer t1');
    expect(venues).toEqual([{ id: 'v1', key: 'netsat', name: 'NETSAT' }]);
  });

  it('getQbVenueOverview: normalize ตัวเลข (string จาก COUNT) และ stats null สำหรับ guest', async () => {
    const fetchMock = mockFetch({
      venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
      mode: 'bank',
      subjects: [{ id: 's1', label: 'ชีวะ', color: '#f59e0b', iconEmoji: null, total: '360', answered: '48', percent: 13 }],
      stats: null,
      challengeUnlocked: false,
    });
    const res = await getQbVenueOverview('net sat', 'bank');
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/question-bank/venues/net%20sat');
    expect(fetchMock.mock.calls[0][0]).toContain('mode=bank');
    expect(res.subjects[0]).toEqual({ id: 's1', label: 'ชีวะ', color: '#f59e0b', iconEmoji: null, total: 360, answered: 48, percent: 13 });
    expect(res.stats).toBeNull();
    expect(res.challengeUnlocked).toBe(false);
  });

  it('getQbVenueOverview: stats + weekly; accuracy null คงเป็น null', async () => {
    mockFetch({
      venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
      mode: 'challenge',
      subjects: [],
      stats: { answered: 5, accuracy: null, streakDays: 2, weekly: [{ weekStart: '2026-11-09', correct: '3', wrong: 1 }] },
      challengeUnlocked: true,
    });
    const res = await getQbVenueOverview('netsat', 'challenge');
    expect(res.mode).toBe('challenge');
    expect(res.stats).toEqual({ answered: 5, accuracy: null, streakDays: 2, weekly: [{ weekStart: '2026-11-09', correct: 3, wrong: 1 }] });
  });

  it('getQbSubject: groups/topics/counts (โหมด challenge ไม่มี easy/medium)', async () => {
    const fetchMock = mockFetch({
      subject: { id: 's1', label: 'ชีวะ', color: '#f59e0b' },
      venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
      mode: 'challenge',
      totals: { all: 24, easy: 0, medium: 0, hardChallenge: 24 },
      groups: [{ gradeLabel: 'ม.4', term: 1, label: 'ม.4 เทอม 1', topics: [{ id: 't1', name: 'บทที่ 1', total: 2, answered: 1, accuracy: 100, counts: { hardChallenge: 2 } }] }],
      challengeUnlocked: false,
    });
    const res = await getQbSubject('s1', 'challenge');
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/question-bank/subjects/s1');
    expect(res.groups[0]).toEqual({
      gradeLabel: 'ม.4',
      term: 1,
      label: 'ม.4 เทอม 1',
      topics: [{ id: 't1', name: 'บทที่ 1', total: 2, answered: 1, accuracy: 100, counts: { hardChallenge: 2 } }],
    });
    expect(res.totals.all).toBe(24);
  });

  it('getQbSubject: 404 → ApiError พร้อม errorCode', async () => {
    mockFetch({ statusCode: 404, message: 'ไม่พบวิชา', errorCode: 'QB_SUBJECT_NOT_FOUND' }, 404);
    await expect(getQbSubject('x', 'bank')).rejects.toMatchObject({ status: 404, errorCode: 'QB_SUBJECT_NOT_FOUND', message: 'ไม่พบวิชา' });
  });

  it('createQbSession: body ตามสัญญา — ไม่ส่งค่าว่าง/ค่าเริ่มต้น, difficulties เฉพาะโหมด bank', async () => {
    const fetchMock = mockFetch({ venueKey: 'netsat', subjectLabel: 'ชีวะ', total: 0, questions: [] });
    await createQbSession({ subjectId: 's1', mode: 'bank', topicIds: ['t1'], difficulties: ['easy', 'hard_challenge'], progress: 'undone', limit: 50 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/question-bank/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      subjectId: 's1',
      mode: 'bank',
      topicIds: ['t1'],
      difficulties: ['easy', 'hard_challenge'],
      progress: 'undone',
      limit: 50,
    });

    await createQbSession({ subjectId: 's1', mode: 'challenge', topicIds: [], difficulties: ['easy'], progress: 'all' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ subjectId: 's1', mode: 'challenge' });
  });

  it('createQbSession: placeholder ของข้อที่ล็อก → stub ที่ไม่มีโจทย์/ตัวเลือก/เฉลย', async () => {
    mockFetch({
      venueKey: 'netsat',
      venueName: 'NETSAT',
      subjectLabel: 'ชีวะ',
      total: '80',
      questions: [
        { id: 'q1', question: 'โจทย์', type: 'multiple_choice', choices: [{ id: 'a', text: 'ก', isCorrect: true }] },
        { id: 'q2', topicId: 't1', locked: true, isChallenge: true },
      ],
    });
    const res = await createQbSession({ subjectId: 's1', mode: 'bank' });
    expect(res.total).toBe(80);
    expect(res.venueName).toBe('NETSAT');
    expect(isLockedQuestion(res.questions[0])).toBe(false);
    expect(res.questions[1]).toMatchObject({ id: 'q2', topicId: 't1', locked: true, isChallenge: true, question: '', choices: [] });
    expect(res.questions[1].correctAnswer).toBeUndefined();
    expect(res.questions[1].explanation).toBeUndefined();
  });

  it('createQbSession: 401 ไม่ล้าง token / ไม่พาไป login แต่คืน ApiError QB_LOGIN_REQUIRED', async () => {
    localStorage.setItem('token', 'expired');
    mockFetch({ statusCode: 401, message: 'ต้องเข้าสู่ระบบ', errorCode: QB_ERROR_LOGIN_REQUIRED }, 401);
    const err = await createQbSession({ subjectId: 's1', mode: 'bank', progress: 'wrong' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorCode).toBe(QB_ERROR_LOGIN_REQUIRED);
    expect(localStorage.getItem('token')).toBe('expired');
  });
});
