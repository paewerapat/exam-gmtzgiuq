import { createUnlockBatch, getUnlockBatch, normalizeRedeemResult, redeemUnlockCode } from './unlockCodes';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const lastBody = (fetchMock: jest.Mock) => {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return JSON.parse(String(init.body));
};

describe('unlockCodes API — โค้ดแบบให้แพ็กเกจ Pro (task 19 สัญญา)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'tok');
  });

  it('redeem ไม่มี examId (หน้า Upgrade) → body มีแค่ code / ผล kind pro', async () => {
    const fetchMock = mockFetch({
      kind: 'pro',
      venue: { key: 'netsat', name: 'NETSAT' },
      plan: { name: 'PRO' },
      currentPeriodEnd: '2026-11-20T00:00:00.000Z',
    });
    const res = await redeemUnlockCode({ code: 'PRO7DAYS' });
    expect(lastBody(fetchMock)).toEqual({ code: 'PRO7DAYS' });
    expect(res).toEqual({
      kind: 'pro',
      venue: { key: 'netsat', name: 'NETSAT' },
      plan: { name: 'PRO' },
      currentPeriodEnd: '2026-11-20T00:00:00.000Z',
      autoRenewDatesDiffer: false,
    });
    expect(
      normalizeRedeemResult({ kind: 'pro', venue: {}, plan: {}, currentPeriodEnd: '', autoRenewDatesDiffer: true }),
    ).toMatchObject({ kind: 'pro', autoRenewDatesDiffer: true });
    // ค่าที่ไม่ใช่ true → false
    expect(normalizeRedeemResult({ kind: 'pro', autoRenewDatesDiffer: 'true' })).toMatchObject({ autoRenewDatesDiffer: false });
  });

  it('redeem ในหน้าชุด (มี examId) ได้ทั้ง kind exam และ pro / API เก่าที่ไม่ส่ง kind = exam', async () => {
    const fetchMock = mockFetch({ kind: 'exam', unlockedExamIds: ['e1'], expiresAt: '2026-12-01T00:00:00.000Z' });
    const res = await redeemUnlockCode({ code: 'X', examId: 'e1' });
    expect(lastBody(fetchMock)).toEqual({ code: 'X', examId: 'e1' });
    expect(res).toEqual({ kind: 'exam', unlockedExamIds: ['e1'], expiresAt: '2026-12-01T00:00:00.000Z' });
    expect(normalizeRedeemResult({ unlockedExamIds: ['e2'], expiresAt: 'x' })).toEqual({
      kind: 'exam',
      unlockedExamIds: ['e2'],
      expiresAt: 'x',
    });
    expect(normalizeRedeemResult(null)).toEqual({ kind: 'exam', unlockedExamIds: [], expiresAt: '' });
  });

  it('409 ALREADY_HIGHER_PLAN → ApiError (โค้ดไม่ถูกใช้)', async () => {
    mockFetch({ statusCode: 409, message: 'มีแพ็กเกจสูงกว่า', errorCode: 'ALREADY_HIGHER_PLAN' }, 409);
    const err = await redeemUnlockCode({ code: 'PRO7DAYS' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, errorCode: 'ALREADY_HIGHER_PLAN' });
  });

  it('createUnlockBatch kind pro: ส่ง kind + proPlanId ไม่ส่ง examIds/allMock', async () => {
    const fetchMock = mockFetch(
      {
        id: 'b1',
        name: 'PRO 7 วัน',
        kind: 'pro',
        proPlan: { id: 'p1', name: 'PRO', venue: { key: 'netsat', name: 'NETSAT' } },
        allMock: false,
        exams: [],
        codeCount: 5,
        usedCount: 0,
        accessDays: 7,
        codeExpiresAt: null,
        isActive: true,
        createdAt: '2026-11-13T00:00:00.000Z',
      },
      201,
    );
    const batch = await createUnlockBatch({
      name: 'PRO 7 วัน',
      kind: 'pro',
      proPlanId: 'p1',
      examIds: ['ignored'],
      allMock: true,
      count: 5,
      accessDays: 7,
    });
    expect(lastBody(fetchMock)).toEqual({ name: 'PRO 7 วัน', kind: 'pro', proPlanId: 'p1', count: 5, accessDays: 7 });
    expect(batch.kind).toBe('pro');
    expect(batch.proPlan).toEqual({ id: 'p1', name: 'PRO', venue: { key: 'netsat', name: 'NETSAT' } });
  });

  it('getUnlockBatch: แคมเปญเดิมที่ไม่มี kind → exam, proPlan null', async () => {
    mockFetch({ id: 'b0', name: 'เดิม', allMock: true, exams: [], codeCount: 1, usedCount: 0, accessDays: 30, isActive: true });
    const batch = await getUnlockBatch('b0');
    expect(batch).toMatchObject({ kind: 'exam', proPlan: null, allMock: true });
  });
});
