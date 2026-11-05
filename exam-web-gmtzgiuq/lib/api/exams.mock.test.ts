import { getMockExam, getMockExamCategories, getMockExams } from './exams';

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
      items: [{ ...rawItem, price: 150 }],
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
