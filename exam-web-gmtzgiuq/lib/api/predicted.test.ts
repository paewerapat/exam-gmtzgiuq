import {
  createPredictedSeries,
  deletePredictedSeries,
  getAdminPredictedSeries,
  getAdminPredictedSeriesById,
  getPredicted,
  normalizePredictedPage,
  searchPredictedExamOptions,
  updatePredictedSeries,
  type PredictedSeriesInput,
} from './predicted';
import { getPublicExam } from './exams';
import { ApiError } from './apiError';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

function mockFetch(...responses: unknown[]) {
  const fetchMock = jest.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const rawSet = (patch: Record<string, unknown> = {}) => ({
  setNo: 1,
  examId: 'e1',
  title: 'ชุด 1',
  questionCount: 40,
  durationMinutes: 90,
  access: 'free',
  previewCount: 20,
  viewerAccess: 'preview',
  myProgress: null,
  ...patch,
});

describe('GET /predicted (task 22)', () => {
  beforeEach(() => localStorage.clear());

  it('ส่ง venue/subject + token และ normalize ตามสัญญา (ชุดเรียงตาม setNo)', async () => {
    localStorage.setItem('token', 'tok');
    const fetchMock = mockFetch(
      ok({
        venues: [{ key: 'netsat', name: 'NETSAT' }, { key: '' }],
        subjects: [{ id: 's1', name: 'คณิต', count: 4 }],
        series: [
          {
            id: 'sr1',
            title: 'NETSAT MATH JAN PREDICTED',
            description: null,
            color: '#5b4cf0',
            venueKey: 'netsat',
            subject: { id: 's1', name: 'คณิตศาสตร์' },
            sets: [rawSet({ setNo: 2, examId: 'e2', access: 'pro', previewCount: null, viewerAccess: 'locked' }), rawSet()],
          },
        ],
        total: 4,
        venueKey: 'netsat',
      }),
    );
    const data = await getPredicted({ venue: 'netsat', subject: 's1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/predicted?venue=netsat&subject=s1');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(data.venues).toEqual([{ key: 'netsat', name: 'NETSAT' }]);
    expect(data.subjects).toEqual([{ id: 's1', name: 'คณิต', count: 4 }]);
    expect(data.total).toBe(4);
    expect(data.venue).toBe('netsat');
    expect(data.viewerHasPaidPlan).toBeNull();
    expect(data.series[0].sets.map((s) => s.setNo)).toEqual([1, 2]);
    expect(data.series[0].sets[1]).toMatchObject({ access: 'pro', previewCount: null, viewerAccess: 'locked' });
  });

  it('ไม่ส่ง venue → ไม่มี query / error → ApiError ข้อความไทย', async () => {
    const fetchMock = mockFetch(ok({}), fail(500, {}));
    const data = await getPredicted();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/predicted');
    expect(data).toEqual({ venue: null, venues: [], subjects: [], series: [], total: 0, viewerHasPaidPlan: null });
    await expect(getPredicted()).rejects.toThrow('โหลดชุด Predicted Exam ไม่สำเร็จ');
  });

  it('normalize: สีไม่ใช่ hex → null, ซีรีส์ไม่มี id ทิ้ง, total ไม่มี = นับจากชุด, venue (object) อ่าน key', () => {
    const data = normalizePredictedPage({
      venue: { key: 'alevel' },
      viewerHasPaidPlan: true,
      series: [{ id: 'a', color: 'red', sets: [rawSet(), { title: 'ไม่มี examId' }] }, { title: 'ไม่มี id' }],
    });
    expect(data.series).toHaveLength(1);
    expect(data.series[0].color).toBeNull();
    expect(data.series[0].subject).toBeNull();
    expect(data.series[0].sets).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.venue).toBe('alevel');
    expect(data.viewerHasPaidPlan).toBe(true);
  });
});

describe('GET /exams/:id ของชุด Predicted', () => {
  it('normalize field predicted (preview) / ชุดปกติ → null', async () => {
    mockFetch(
      ok({ id: 'e1', questions: [], passages: [], predicted: { access: 'preview', previewCount: 5, totalQuestions: 20, seriesId: 's', setNo: 1 } }),
      ok({ id: 'e2', questions: [], passages: [] }),
    );
    expect((await getPublicExam('e1')).predicted).toMatchObject({ access: 'preview', previewCount: 5, totalQuestions: 20 });
    expect((await getPublicExam('e2')).predicted).toBeNull();
  });

  it('403 PREDICTED_LOCKED → ApiError มี errorCode + details', async () => {
    mockFetch(fail(403, { statusCode: 403, message: 'ชุดข้อสอบนี้สำหรับสมาชิก Pro', errorCode: 'PREDICTED_LOCKED' }));
    const err = await getPublicExam('e1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorCode).toBe('PREDICTED_LOCKED');
    expect(err.details).toMatchObject({ errorCode: 'PREDICTED_LOCKED' });
  });
});

describe('แอดมิน /admin/predicted', () => {
  const input: PredictedSeriesInput = {
    title: 'S',
    description: null,
    venueId: 'v1',
    subjectId: null,
    color: null,
    sortOrder: 0,
    isActive: true,
    sets: [{ examId: 'e1', setNo: 1, access: 'pro', previewCount: 10 }],
  };

  const rawSeries = (patch: Record<string, unknown> = {}) => ({
    id: 'sr1',
    title: 'S',
    venueId: 'v1',
    venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
    subjectId: 's1',
    subject: { id: 's1', name: 'คณิต' },
    sortOrder: 2,
    isActive: false,
    sets: [{ examId: 'e1', setNo: 1, access: 'pro', previewCount: 10, exam: { id: 'e1', title: 'ชุด A', questionCount: 40, status: 'published' } }],
    ...patch,
  });

  it('รายการ: รับทั้ง array และ { items } + ดึงชื่อสนาม/วิชา/ชุดจาก relation', async () => {
    const fetchMock = mockFetch(ok([rawSeries()]), ok({ items: [rawSeries({ id: 'sr2', sets: [], setCount: 3 })] }));
    const [s] = await getAdminPredictedSeries();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/admin/predicted/series');
    expect(s).toMatchObject({
      id: 'sr1',
      venueKey: 'netsat',
      venueName: 'NETSAT',
      subjectName: 'คณิต',
      sortOrder: 2,
      isActive: false,
      setCount: 1,
    });
    expect(s.sets[0]).toEqual({
      examId: 'e1',
      setNo: 1,
      access: 'pro',
      previewCount: 10,
      title: 'ชุด A',
      questionCount: 40,
      status: 'published',
    });
    const [s2] = await getAdminPredictedSeries();
    expect(s2.setCount).toBe(3);
  });

  it('ดูซีรีส์ / แก้ (PUT ทั้งชุด) / ลบ — method + URL + body', async () => {
    const fetchMock = mockFetch(ok(rawSeries()), ok(rawSeries()), ok(null, 204));
    await getAdminPredictedSeriesById('sr1');
    await updatePredictedSeries('sr1', input);
    await deletePredictedSeries('sr1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/admin/predicted/series/sr1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(input);
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
  });

  it('สร้าง: POST พร้อม sets / API ตอบกลับโดยไม่มีชุด → PUT ตามอีกครั้ง', async () => {
    let fetchMock = mockFetch(ok(rawSeries()));
    await createPredictedSeries(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);

    fetchMock = mockFetch(ok(rawSeries({ sets: [] })), ok(rawSeries()));
    const saved = await createPredictedSeries(input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3001/admin/predicted/series/sr1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(saved?.sets).toHaveLength(1);
  });

  it('409/400 → ApiError ข้อความไทยจาก API', async () => {
    mockFetch(fail(409, { statusCode: 409, message: 'ชุด "A" อยู่ในซีรีส์อื่นแล้ว' }));
    await expect(updatePredictedSeries('sr1', input)).rejects.toMatchObject({
      status: 409,
      message: 'ชุด "A" อยู่ในซีรีส์อื่นแล้ว',
    });
  });

  it('ค้นหาชุด: ?search= (ตัดช่องว่าง) / ว่าง = ไม่มี query', async () => {
    const fetchMock = mockFetch(
      ok([{ id: 'e9', title: 'ชุด 9', questionCount: 25, subject: { name: 'เคมี' } }, { title: 'ไม่มี id' }]),
      ok({ items: [] }),
    );
    const options = await searchPredictedExamOptions(' เคมี ');
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3001/admin/predicted/exams?search=${encodeURIComponent('เคมี')}`);
    expect(options).toEqual([
      { id: 'e9', title: 'ชุด 9', questionCount: 25, status: null, subjectName: 'เคมี', categoryName: null },
    ]);
    await searchPredictedExamOptions('');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3001/admin/predicted/exams');
  });
});
