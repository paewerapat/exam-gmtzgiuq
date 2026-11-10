import {
  createUnlockBatch,
  downloadUnlockBatchCsv,
  getUnlockBatch,
  getUnlockBatchCodes,
  getUnlockBatches,
  redeemUnlockCode,
  updateUnlockBatch,
  updateUnlockCode,
} from './unlockCodes';
import { ApiError, isExamLockedError, toApiError } from './apiError';

type FetchInit = RequestInit & { headers: Record<string, string> };

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    blob: async () => new Blob([String(body)], { type: 'text/csv' }),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const call = (fetchMock: jest.Mock, i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, FetchInit];
  return { url: new URL(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

const rawBatch = {
  id: 'b1',
  name: 'แคมเปญ 1',
  allMock: false,
  exams: [{ id: 'e1', title: 'ชุด 1' }],
  codeCount: '5000',
  usedCount: 12,
  accessDays: 30,
  codeExpiresAt: null,
  isActive: true,
  createdAt: '2026-11-10T00:00:00.000Z',
};

describe('unlockCodes API (task 15 สัญญา)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'tok');
  });

  it('redeemUnlockCode: POST /unlock-codes/redeem {code, examId} + Bearer token', async () => {
    const fetchMock = mockFetch({ unlockedExamIds: ['e1', 'e2'], expiresAt: '2026-12-10T00:00:00.000Z' });
    const res = await redeemUnlockCode({ code: 'LUMO-ABCD', examId: 'e1' });
    const { url, init, body } = call(fetchMock);
    expect(url.pathname).toBe('/unlock-codes/redeem');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(body).toEqual({ code: 'LUMO-ABCD', examId: 'e1' });
    expect(res).toEqual({ unlockedExamIds: ['e1', 'e2'], expiresAt: '2026-12-10T00:00:00.000Z' });
  });

  it('redeemUnlockCode: error → ApiError มี status/errorCode/message จาก API', async () => {
    mockFetch({ statusCode: 409, message: 'โค้ดนี้ถูกใช้ไปแล้ว', errorCode: 'USED' }, 409);
    const err = await redeemUnlockCode({ code: 'X', examId: 'e1' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, errorCode: 'USED', message: 'โค้ดนี้ถูกใช้ไปแล้ว' });
  });

  it('getUnlockBatches: query page/limit/search + แปลง count string → number', async () => {
    const fetchMock = mockFetch({ items: [rawBatch], total: 1, page: 2, limit: 20, totalPages: 3 });
    const res = await getUnlockBatches({ page: 2, search: ' net ' });
    const { url } = call(fetchMock);
    expect(url.pathname).toBe('/unlock-codes/admin/batches');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('search')).toBe('net');
    expect(res.items[0]).toEqual({ ...rawBatch, codeCount: 5000 });
    expect(res).toMatchObject({ total: 1, page: 2, totalPages: 3 });
  });

  it('createUnlockBatch: เลือกชุด → ส่ง examIds / ทุกชุด Mock → ไม่ส่ง examIds; codeExpiresAt ส่งเมื่อมี', async () => {
    let fetchMock = mockFetch(rawBatch, 201);
    await createUnlockBatch({ name: 'n', allMock: false, examIds: ['e1', 'e2'], count: 5000, accessDays: 30 });
    let req = call(fetchMock);
    expect(req.url.pathname).toBe('/unlock-codes/admin/batches');
    expect(req.init.method).toBe('POST');
    expect(req.body).toEqual({ name: 'n', allMock: false, examIds: ['e1', 'e2'], count: 5000, accessDays: 30 });

    fetchMock = mockFetch({ ...rawBatch, allMock: true, exams: [] }, 201);
    const batch = await createUnlockBatch({
      name: 'n',
      allMock: true,
      examIds: ['ignored'],
      count: 10,
      accessDays: 7,
      codeExpiresAt: '2026-12-31T16:59:00.000Z',
    });
    req = call(fetchMock);
    expect(req.body).toEqual({ name: 'n', allMock: true, count: 10, accessDays: 7, codeExpiresAt: '2026-12-31T16:59:00.000Z' });
    expect(batch.allMock).toBe(true);
  });

  it('getUnlockBatch / updateUnlockBatch: path + PATCH body ตามที่ส่ง (null = ไม่หมดอายุ)', async () => {
    let fetchMock = mockFetch(rawBatch);
    await getUnlockBatch('b1');
    expect(call(fetchMock).url.pathname).toBe('/unlock-codes/admin/batches/b1');

    fetchMock = mockFetch({ ...rawBatch, isActive: false });
    const updated = await updateUnlockBatch('b1', { isActive: false, codeExpiresAt: null });
    const req = call(fetchMock);
    expect(req.init.method).toBe('PATCH');
    expect(req.body).toEqual({ isActive: false, codeExpiresAt: null });
    expect(updated.isActive).toBe(false);
  });

  it('getUnlockBatch 404 → ApiError status 404', async () => {
    mockFetch({ statusCode: 404, message: 'Not Found' }, 404);
    await expect(getUnlockBatch('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('getUnlockBatchCodes: status/search/page/limit + usedBy', async () => {
    const fetchMock = mockFetch({
      items: [
        {
          id: 'c1',
          code: 'ABCD',
          isActive: true,
          usedAt: '2026-11-10T01:00:00.000Z',
          usedBy: { id: 'u1', email: 'a@x.com', firstName: 'เอ', lastName: null },
        },
        { id: 'c2', code: 'EFGH', isActive: false, usedAt: null, usedBy: null },
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    const res = await getUnlockBatchCodes('b1', { status: 'used', search: 'ab' });
    const { url } = call(fetchMock);
    expect(url.pathname).toBe('/unlock-codes/admin/batches/b1/codes');
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'used', search: 'ab', page: '1', limit: '50' });
    expect(res.items).toEqual([
      {
        id: 'c1',
        code: 'ABCD',
        isActive: true,
        usedAt: '2026-11-10T01:00:00.000Z',
        usedBy: { id: 'u1', email: 'a@x.com', firstName: 'เอ', lastName: null },
      },
      { id: 'c2', code: 'EFGH', isActive: false, usedAt: null, usedBy: null },
    ]);
  });

  it('updateUnlockCode: PATCH /unlock-codes/admin/codes/:id {isActive}', async () => {
    const fetchMock = mockFetch({ id: 'c1', code: 'ABCD', isActive: false, usedAt: null, usedBy: null });
    const res = await updateUnlockCode('c1', { isActive: false });
    const req = call(fetchMock);
    expect(req.url.pathname).toBe('/unlock-codes/admin/codes/c1');
    expect(req.init.method).toBe('PATCH');
    expect(req.body).toEqual({ isActive: false });
    expect(res.isActive).toBe(false);
  });

  it('downloadUnlockBatchCsv: GET codes.csv พร้อม token, ชื่อไฟล์จาก header หรือชื่อแคมเปญ', async () => {
    let fetchMock = mockFetch('code,status\n', 200, {
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('แคมเปญ.csv')}`,
    });
    let res = await downloadUnlockBatchCsv('b1', 'ชื่อ');
    const req = call(fetchMock);
    expect(req.url.pathname).toBe('/unlock-codes/admin/batches/b1/codes.csv');
    expect(req.init.headers.Authorization).toBe('Bearer tok');
    expect(res.filename).toBe('แคมเปญ.csv');
    expect(res.blob).toBeInstanceOf(Blob);

    // รูปแบบจริงของ API: filename (ASCII) + filename*=UTF-8'' → ใช้ชื่อ UTF-8 (RFC 5987)
    mockFetch('x', 200, {
      'content-disposition': `attachment; filename="unlock-codes-FE15_NETSAT_._._69.csv"; filename*=UTF-8''${encodeURIComponent(
        'unlock-codes-[FE15] NETSAT พ.ย. 69.csv',
      )}`,
    });
    res = await downloadUnlockBatchCsv('b1', 'ชื่อแคมเปญ');
    expect(res.filename).toBe('unlock-codes-[FE15] NETSAT พ.ย. 69.csv');

    // header ไม่ถูก expose (CORS) → ชื่อแคมเปญ
    fetchMock = mockFetch('x', 200);
    res = await downloadUnlockBatchCsv('b1', 'แคมเปญ/1');
    expect(res.filename).toBe('แคมเปญ_1.csv');
  });
});

describe('apiError', () => {
  it('toApiError: message array รวมด้วย ", " / ไม่มี message → fallback / body ไม่ใช่ JSON', async () => {
    const res = (body: unknown, status: number) =>
      ({ status, json: async () => body }) as unknown as Response;
    expect(await toApiError(res({ message: ['a', 'b'] }, 400), 'f')).toMatchObject({ message: 'a, b', errorCode: null });
    expect(await toApiError(res({}, 500), 'fallback')).toMatchObject({ message: 'fallback', status: 500 });
    const bad = { status: 502, json: async () => Promise.reject(new Error('not json')) } as unknown as Response;
    expect(await toApiError(bad, 'f')).toMatchObject({ message: 'f', status: 502, errorCode: null });
  });

  it('isExamLockedError: 403 + EXAM_LOCKED เท่านั้น', () => {
    expect(isExamLockedError(new ApiError('x', 403, 'EXAM_LOCKED'))).toBe(true);
    expect(isExamLockedError(new ApiError('x', 403, 'DISABLED'))).toBe(false);
    expect(isExamLockedError(new ApiError('x', 404, 'EXAM_LOCKED'))).toBe(false);
    expect(isExamLockedError(new Error('EXAM_LOCKED'))).toBe(false);
  });
});
