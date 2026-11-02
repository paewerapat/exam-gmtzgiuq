import { createExam, getPublicExam, updateExam } from './exams';

function mockFetch(body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('exams API — บทอ่านร่วม (task 08)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getPublicExam เติม question.passage จาก exam.passages (ตามสัญญา: /exams/:id คืน passages + passageId)', async () => {
    const passage = { id: 'reading-1', title: 'บทอ่าน', body: 'เนื้อหา', images: [] };
    mockFetch({
      id: 'e1',
      passages: [passage],
      questions: [
        { id: 'q1', passageId: null },
        { id: 'q2', passageId: 'reading-1' },
      ],
    });
    const exam = await getPublicExam('e1');
    expect(exam.passages).toEqual([passage]);
    expect(exam.questions.map((q) => q.passage)).toEqual([null, passage]);
  });

  it('getPublicExam: ข้อสอบเก่า passages = null → [] ทุกข้อ passage null', async () => {
    mockFetch({ id: 'e1', passages: null, questions: [{ id: 'q1' }] });
    const exam = await getPublicExam('e1');
    expect(exam.passages).toEqual([]);
    expect(exam.questions[0].passage).toBeNull();
  });

  it('createExam / updateExam ส่ง passages + questions[].passageId ตามที่ได้รับ', async () => {
    const fetchMock = mockFetch({ id: 'e1' });
    const input = {
      title: 't',
      category: 'c',
      passages: [{ id: 'p-1', title: null, body: 'x', images: [] }],
      questions: [{ question: 'q', passageId: 'p-1' }],
    };
    await createExam(input);
    await updateExam('e1', input);
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(init.body);
      expect(body.passages).toEqual(input.passages);
      expect(body.questions[0].passageId).toBe('p-1');
    }
  });
});
