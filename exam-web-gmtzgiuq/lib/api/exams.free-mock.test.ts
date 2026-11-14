import { getAllMockExams, getMockExam, getMockExams, normalizeBannerColor } from './exams';

function mockFetchSequence(bodies: unknown[]) {
  const fetchMock = jest.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const raw = (patch: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'NETSAT Campaign 1',
  category: 'netsat',
  categoryName: 'NETSAT',
  subjectId: 's1',
  subjectName: 'คณิตศาสตร์',
  bannerImage: null,
  questionCount: 40,
  durationMinutes: 90,
  level: null,
  accessType: 'code',
  price: null,
  releaseDate: '2026-11-01T00:00:00.000Z',
  access: { status: 'locked', expiresAt: null },
  venueKey: 'netsat',
  ...patch,
});

const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  limit: 100,
  totalPages: 1,
  ...extra,
});

describe('exams API — Free Mock (task 21)', () => {
  beforeEach(() => localStorage.clear());

  it('getMockExams: ส่ง sort และ venue ตามสัญญา (ไม่ส่ง = ไม่ใส่ query)', async () => {
    const fetchMock = mockFetchSequence([page([]), page([])]);
    await getMockExams({ sort: 'name', venue: 'a-level' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('sort')).toBe('name');
    expect(url.searchParams.get('venue')).toBe('a-level');

    await getMockExams();
    const url2 = new URL(fetchMock.mock.calls[1][0]);
    expect(url2.searchParams.has('sort')).toBe(false);
    expect(url2.searchParams.has('venue')).toBe(false);
  });

  it('แปลง campaign / subjectLabel / color / myProgress — ค่าผิดรูปเป็น null', async () => {
    mockFetchSequence([
      page([
        raw({
          id: 'a',
          campaign: { status: 'open', startsAt: null, endsAt: '2026-11-30T16:59:00.000Z', daysLeft: 16, daysUntilOpen: null },
          subjectLabel: 'NETSAT คณิตศาสตร์',
          color: '#6366F1',
          myProgress: { status: 'in_progress', answered: 12, total: 20, scorePercent: null, attemptId: 'att-1' },
        }),
        raw({ id: 'b', campaign: { status: 'weird' }, color: 'red; background:url(x)', myProgress: { status: 'completed' } }),
        // ชุดฟรีที่ API ส่ง campaign มา (ไม่ควรเกิด) → null
        raw({
          id: 'c',
          accessType: 'free',
          campaign: { status: 'open' },
          myProgress: { status: 'completed', mode: 'practice', answered: 40, total: 40, scorePercent: 82.5, attemptId: 'att-2' },
        }),
      ]),
    ]);
    const res = await getMockExams();
    const [a, b, c] = res.items;
    expect(a.campaign).toEqual({
      status: 'open',
      startsAt: null,
      endsAt: '2026-11-30T16:59:00.000Z',
      daysLeft: 16,
      daysUntilOpen: null,
    });
    expect(a.subjectLabel).toBe('NETSAT คณิตศาสตร์');
    expect(a.color).toBe('#6366F1');
    // ไม่มี mode → exam
    expect(a.myProgress).toEqual({
      status: 'in_progress',
      mode: 'exam',
      answered: 12,
      total: 20,
      scorePercent: null,
      attemptId: 'att-1',
    });
    expect(b.campaign).toBeNull();
    expect(b.color).toBeNull();
    expect(b.myProgress).toBeNull();
    expect(c.campaign).toBeNull();
    expect(c.myProgress).toMatchObject({ scorePercent: 82.5, mode: 'practice' });
  });

  it('getMockExam: topicBreakdown เรียงมากไปน้อย ชื่อว่าง → "อื่น ๆ" ตัดแถวผิดรูป / API เก่า → []', async () => {
    mockFetchSequence([
      {
        ...raw({ accessType: 'free' }),
        description: null,
        topicBreakdown: [
          { topicId: 't2', name: 'สถิติ', count: 6 },
          { topicId: null, name: '', count: 2 },
          { topicId: 't1', name: 'ฟังก์ชัน', count: 8 },
          { topicId: 't3', name: 'ไม่มีข้อ', count: 0 },
          'ผิดรูป',
        ],
      },
      { ...raw(), description: null },
    ]);
    const detail = await getMockExam('m1');
    expect(detail?.topicBreakdown).toEqual([
      { topicId: 't1', name: 'ฟังก์ชัน', count: 8 },
      { topicId: 't2', name: 'สถิติ', count: 6 },
      { topicId: null, name: 'อื่น ๆ', count: 2 },
    ]);
    expect((await getMockExam('m1'))?.topicBreakdown).toEqual([]);
  });

  it('getAllMockExams: ไล่ทุกหน้า (limit 100) จน totalPages และคงลำดับของ API', async () => {
    const fetchMock = mockFetchSequence([
      page([raw({ id: '1' }), raw({ id: '2' })], { totalPages: 2 }),
      page([raw({ id: '3' })], { page: 2, totalPages: 2 }),
    ]);
    const items = await getAllMockExams({ sort: 'recommended', venue: 'netsat' });
    expect(items.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('sort')).toBe('recommended');
    expect(url.searchParams.get('venue')).toBe('netsat');
  });

  it('normalizeBannerColor รับเฉพาะ hex', () => {
    expect(normalizeBannerColor('#abc')).toBe('#abc');
    expect(normalizeBannerColor(' #A1B2C3 ')).toBe('#A1B2C3');
    expect(normalizeBannerColor('rgb(0,0,0)')).toBeNull();
    expect(normalizeBannerColor('#12345')).toBeNull();
    expect(normalizeBannerColor(null)).toBeNull();
  });
});
