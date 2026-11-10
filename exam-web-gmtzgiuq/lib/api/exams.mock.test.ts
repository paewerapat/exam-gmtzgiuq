import { getLockableMockExams, getMockExam, getMockExamCategories, getMockExams, getPublicExam } from './exams';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const rawItem = {
  id: 'm1',
  title: 'TGAT Mock 1',
  category: 'tgat',
  categoryName: 'TGAT',
  subjectId: 's1',
  subjectName: 'ภาษาอังกฤษ',
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 60,
  level: 'medium',
  accessType: 'purchase',
  price: '150.00',
  releaseDate: '2026-11-01T00:00:00.000Z',
};

describe('exams API — Mock Exam (task 11)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getMockExams: ส่ง category(slug)/page/limit, คืน categoryName และแปลง price string → number', async () => {
    const fetchMock = mockFetch({ items: [rawItem], total: 1, page: 2, limit: 12, totalPages: 3 });
    const res = await getMockExams({ category: 'a&level', page: 2 });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/exams/mock');
    expect(url.searchParams.get('category')).toBe('a&level');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('12');
    expect(res).toEqual({
      // API ก่อน task 15 ไม่มี access → ชุดไม่ฟรีถือว่า locked
      items: [{ ...rawItem, price: 150, access: { status: 'locked', expiresAt: null } }],
      total: 1,
      page: 2,
      limit: 12,
      totalPages: 3,
    });
  });

  it('getMockExams: ไม่เลือกสนามสอบ → ไม่ส่ง category, price number คงเดิม, ค่าแปลก → ค่าเริ่มต้น', async () => {
    const fetchMock = mockFetch({
      items: [{ ...rawItem, price: 99.5, accessType: undefined, level: 'xxx', durationMinutes: null }],
      total: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    const res = await getMockExams();
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('category')).toBe(false);
    expect(res.items[0]).toMatchObject({ price: 99.5, accessType: 'free', level: null, durationMinutes: null });
  });

  it('getMockExams: แนบ token ถ้า login (fetchWithAuth)', async () => {
    localStorage.setItem('token', 'tkn');
    const fetchMock = mockFetch({ items: [], total: 0, page: 1, limit: 12, totalPages: 0 });
    await getMockExams();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tkn');
  });

  it('getMockExams: error → throw', async () => {
    mockFetch({}, 500);
    await expect(getMockExams()).rejects.toThrow();
  });

  it('getMockExamCategories: คืน name/slug/count (ไม่มี slug → ทิ้ง, ไม่มีชื่อ → ใช้ slug)', async () => {
    const fetchMock = mockFetch([
      { name: 'TGAT', slug: 'tgat', count: 2 },
      { name: '', slug: 'alevel', count: '1' },
      { name: 'ไม่มี slug', count: 1 },
    ]);
    const res = await getMockExamCategories();
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/exams/mock/categories');
    expect(res).toEqual([
      { name: 'TGAT', slug: 'tgat', count: 2 },
      { name: 'alevel', slug: 'alevel', count: 1 },
    ]);
  });

  it('getMockExam: คืน description + detailBlocks (null → [])', async () => {
    const fetchMock = mockFetch({ ...rawItem, description: 'อธิบาย', detailBlocks: null });
    const res = await getMockExam('m1');
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/exams/mock/m1');
    expect(res).toMatchObject({ id: 'm1', price: 150, description: 'อธิบาย', detailBlocks: [] });
  });

  it('getMockExam: block ตามลำดับ', async () => {
    const blocks = [
      { type: 'text', text: 'ก' },
      { type: 'image', url: '/uploads/a.png' },
      { type: 'text', text: 'ข' },
    ];
    mockFetch({ ...rawItem, detailBlocks: blocks });
    expect((await getMockExam('m1'))?.detailBlocks).toEqual(blocks);
  });

  it('getMockExam: 404 → null, error อื่น → throw', async () => {
    mockFetch({ message: 'Not Found' }, 404);
    await expect(getMockExam('nope')).resolves.toBeNull();
    mockFetch({}, 500);
    await expect(getMockExam('m1')).rejects.toThrow();
  });
});

describe('exams API — โค้ด Unlock (task 15)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getMockExams: access ตาม API (unlocked + expiresAt) / ชุดฟรี → free เสมอ / ค่าแปลก → locked', async () => {
    mockFetch({
      items: [
        { ...rawItem, id: 'a', accessType: 'code', access: { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' } },
        { ...rawItem, id: 'b', accessType: 'code', access: { status: 'expired', expiresAt: '2026-10-01T00:00:00.000Z' } },
        { ...rawItem, id: 'c', accessType: 'free', access: { status: 'locked', expiresAt: null } },
        { ...rawItem, id: 'd', accessType: 'purchase', access: { status: 'weird' } },
        { ...rawItem, id: 'e', accessType: 'code', access: { status: 'free', expiresAt: null } },
      ],
      total: 5,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    const res = await getMockExams();
    expect(res.items.map((i) => [i.id, i.access])).toEqual([
      ['a', { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' }],
      ['b', { status: 'expired', expiresAt: '2026-10-01T00:00:00.000Z' }],
      ['c', { status: 'free', expiresAt: null }],
      ['d', { status: 'locked', expiresAt: null }],
      ['e', { status: 'locked', expiresAt: null }],
    ]);
  });

  it('getMockExam: codeInstructions ตามสัญญา (ลิงก์ไม่ใช่ http(s) ไม่แสดง, ขั้นตอนไม่มีหัวข้อทิ้ง) / null → null', async () => {
    mockFetch({
      ...rawItem,
      accessType: 'code',
      codeInstructions: {
        steps: [
          { title: 'ติดตามเพจ', description: 'กดติดตาม', linkLabel: 'ไปที่ IG', linkUrl: 'https://instagram.com/x' },
          { title: 'ลิงก์อันตราย', linkLabel: 'คลิก', linkUrl: 'javascript:alert(1)' },
          { description: 'ไม่มีหัวข้อ' },
          null,
        ],
        note: 'หมายเหตุ',
      },
    });
    expect((await getMockExam('m1'))?.codeInstructions).toEqual({
      steps: [
        { title: 'ติดตามเพจ', description: 'กดติดตาม', linkLabel: 'ไปที่ IG', linkUrl: 'https://instagram.com/x' },
        { title: 'ลิงก์อันตราย' },
      ],
      note: 'หมายเหตุ',
    });
    mockFetch({ ...rawItem, codeInstructions: null });
    expect((await getMockExam('m1'))?.codeInstructions).toBeNull();
    mockFetch({ ...rawItem, codeInstructions: { steps: [], note: '' } });
    expect((await getMockExam('m1'))?.codeInstructions).toBeNull();
  });

  it('getPublicExam: ส่ง token + 403 EXAM_LOCKED → ApiError ที่มี errorCode', async () => {
    localStorage.setItem('token', 'tkn');
    const fetchMock = mockFetch({ statusCode: 403, message: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน', errorCode: 'EXAM_LOCKED' }, 403);
    const err = await getPublicExam('m1').catch((e) => e);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tkn');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, errorCode: 'EXAM_LOCKED' });
  });

  it('getLockableMockExams: ไล่ทุกหน้าของ /exams/admin/all แล้วเหลือเฉพาะ Mock ที่ไม่ฟรี', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 'a', title: 'Mock โค้ด', isMock: true, accessType: 'code', price: null, status: 'published' },
            { id: 'b', title: 'Mock ฟรี', isMock: true, accessType: 'free', status: 'published' },
            { id: 'c', title: 'ข้อสอบปกติ', isMock: false, accessType: 'code', status: 'published' },
          ],
          totalPages: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 'd', title: 'Mock ซื้อ', isMock: true, accessType: 'purchase', price: '150.00', status: 'draft' }],
          totalPages: 2,
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await getLockableMockExams();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.pathname).toBe('/exams/admin/all');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(res).toEqual([
      { id: 'a', title: 'Mock โค้ด', accessType: 'code', price: null, status: 'published' },
      { id: 'd', title: 'Mock ซื้อ', accessType: 'purchase', price: 150, status: 'draft' },
    ]);
  });
});
