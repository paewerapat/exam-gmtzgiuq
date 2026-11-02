import {
  createPassageId,
  packQuestionPassages,
  PACKED_PASSAGE_FLAG,
  unpackQuestionPassages,
  getQuestionPassage,
  passageFormFromApi,
  passageHasContent,
  passageLabel,
  PASSAGE_ID_PATTERN,
  questionNumbersUsingPassage,
  toPassageInput,
  validatePassageForms,
  withResolvedPassages,
  type PassageForm,
} from './exam-passages';
import type { ExamPassage } from '@/lib/api/questions';

const p1: ExamPassage = { id: 'p1', title: 'บทอ่าน A', body: 'เนื้อหา A', images: [] };
const p2: ExamPassage = { id: 'p2', title: null, body: null, images: ['/uploads/x.png'] };

describe('getQuestionPassage', () => {
  it('ใช้ q.passage ที่ API resolve มาให้ก่อน', () => {
    expect(getQuestionPassage({ passageId: 'p1', passage: p1 })).toBe(p1);
  });

  it('ไม่มี q.passage → หาใน exam.passages ด้วย passageId', () => {
    expect(getQuestionPassage({ passageId: 'p2' }, { passages: [p1, p2] })).toBe(p2);
    expect(getQuestionPassage({ passageId: 'p2', passage: null }, { passages: [p1, p2] })).toBe(p2);
  });

  it('ไม่มี passageId / ไม่เจอ / ไม่มี exam → null', () => {
    expect(getQuestionPassage({}, { passages: [p1] })).toBeNull();
    expect(getQuestionPassage({ passageId: null }, { passages: [p1] })).toBeNull();
    expect(getQuestionPassage({ passageId: 'p9' }, { passages: [p1] })).toBeNull();
    expect(getQuestionPassage({ passageId: 'p1' })).toBeNull();
    expect(getQuestionPassage({ passageId: 'p1' }, { passages: null })).toBeNull();
    expect(getQuestionPassage(null)).toBeNull();
  });

  it('บทอ่านไม่มีทั้งเนื้อหาและรูป / ข้อมูลเพี้ยน → null; images ไม่ใช่ array → []', () => {
    expect(getQuestionPassage({ passage: { id: 'e', title: 'ว่าง', body: '  ', images: [] } })).toBeNull();
    expect(getQuestionPassage({ passage: { id: '', title: null, body: 'x', images: [] } })).toBeNull();
    const loose = { id: 'l', title: 't', body: 'x' } as unknown as ExamPassage;
    expect(getQuestionPassage({ passage: loose })).toEqual({ id: 'l', title: 't', body: 'x', images: [] });
  });
});

describe('withResolvedPassages', () => {
  it('เติม passage ให้ทุกข้อ และ passages null → []', () => {
    const exam = {
      id: 'e',
      passages: [p1],
      questions: [{ id: 'q1', passageId: 'p1' }, { id: 'q2', passageId: null }],
    };
    const out = withResolvedPassages(exam);
    expect(out.questions.map((q) => (q as { passage?: ExamPassage | null }).passage)).toEqual([p1, null]);
    expect(withResolvedPassages({ passages: null, questions: [] }).passages).toEqual([]);
    // ข้อสอบเก่าไม่มี key passages
    const old = withResolvedPassages<{ passages?: ExamPassage[]; questions: { passageId?: string }[] }>({
      questions: [{}],
    });
    expect(old.passages).toEqual([]);
    expect((old.questions[0] as { passage?: unknown }).passage).toBeNull();
  });
});

describe('ฟอร์มแอดมิน', () => {
  it('createPassageId ตรง regex และไม่ซ้ำ', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(createPassageId(ids));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(PASSAGE_ID_PATTERN);
  });

  it('toPassageInput: title/body ว่าง → null, body เก็บตามที่พิมพ์ (ไม่ตัดบรรทัด)', () => {
    expect(toPassageInput({ id: 'a', title: '  ', body: '\nบรรทัด 1\n\nบรรทัด 2\n', images: ['', '/u/1.png'] })).toEqual({
      id: 'a',
      title: null,
      body: '\nบรรทัด 1\n\nบรรทัด 2\n',
      images: ['/u/1.png'],
    });
    expect(toPassageInput({ id: 'b', title: ' ชื่อ ', body: ' ', images: [] })).toEqual({
      id: 'b',
      title: 'ชื่อ',
      body: null,
      images: [],
    });
  });

  it('passageFormFromApi: null → สตริงว่าง', () => {
    expect(passageFormFromApi(p2)).toEqual({ id: 'p2', title: '', body: '', images: ['/uploads/x.png'] });
  });

  it('validatePassageForms: ต้องมีเนื้อหาหรือรูป / id ซ้ำ / เกินขนาด', () => {
    const ok: PassageForm = { id: 'a', title: '', body: 'x', images: [] };
    expect(validatePassageForms([ok, { id: 'b', title: '', body: '', images: ['/u.png'] }])).toBeNull();
    expect(validatePassageForms([ok, { id: 'b', title: 'มีแต่ชื่อ', body: '  ', images: [] }])).toBe(
      'บทอ่านที่ 2: ต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง',
    );
    expect(validatePassageForms([ok, { ...ok }])).toContain('บทอ่านที่ 2: รหัสบทอ่าน');
    expect(validatePassageForms([{ ...ok, id: 'มี space' }])).toContain('บทอ่านที่ 1: รหัสบทอ่าน');
    expect(validatePassageForms([{ ...ok, title: 'ก'.repeat(256) }])).toContain('ชื่อบทอ่านยาวเกิน 255');
    expect(validatePassageForms([{ ...ok, body: 'ก'.repeat(100_001) }])).toContain('เนื้อหายาวเกิน');
    expect(validatePassageForms([{ ...ok, images: Array(7).fill('/u.png') }])).toContain('ไม่เกิน 6 รูป');
    expect(validatePassageForms([{ ...ok, images: [`/${'a'.repeat(255)}`] }])).toContain('URL รูปยาวได้ไม่เกิน 255');
    const many = Array.from({ length: 51 }, (_, i) => ({ ...ok, id: `p${i}` }));
    expect(validatePassageForms(many)).toContain('ไม่เกิน 50 ชุด');
  });

  it('passageLabel / questionNumbersUsingPassage / passageHasContent', () => {
    expect(passageLabel({ title: '  ' }, 1)).toBe('บทอ่านที่ 2');
    expect(passageLabel({ title: 'สถานการณ์' }, 0)).toBe('สถานการณ์');
    expect(questionNumbersUsingPassage([{ passageId: '' }, { passageId: 'a' }, { passageId: 'a' }], 'a')).toEqual([2, 3]);
    expect(passageHasContent({ body: '', images: [''] })).toBe(false);
    expect(passageHasContent({ body: null, images: ['/u.png'] })).toBe(true);
  });
});

describe('pack/unpackQuestionPassages (localStorage)', () => {
  const big: ExamPassage = { id: 'big', title: 'ยาว', body: 'ก'.repeat(5000), images: [] };
  const qs = [
    { id: 'q1', passageId: null, passage: null },
    { id: 'q2', passageId: 'big', passage: big },
    { id: 'q3', passageId: 'big', passage: { ...big } },
    { id: 'q4', passageId: 'big', passage: { ...big } },
  ];

  it('เก็บบทอ่านเต็มครั้งเดียวต่อกลุ่ม แล้วอ่านกลับได้ครบทุกข้อ', () => {
    const raw = JSON.stringify(packQuestionPassages(qs));
    expect(raw.split('ก'.repeat(5000)).length - 1).toBe(1);
    const back = unpackQuestionPassages(JSON.parse(raw));
    expect(back.map((q) => q.passage?.id ?? null)).toEqual([null, 'big', 'big', 'big']);
    expect(back[3].passage?.body).toBe(big.body);
  });

  it('id ซ้ำแต่เนื้อหาต่าง (ฝึกตาม topic หลายข้อสอบ) → เก็บแยก ไม่ปน', () => {
    const other: ExamPassage = { id: 'big', title: 'อีกข้อสอบ', body: 'เนื้อหาอื่น', images: [] };
    const mixed = [qs[1], { id: 'x', passageId: 'big', passage: other }, qs[2]];
    const back = unpackQuestionPassages(JSON.parse(JSON.stringify(packQuestionPassages(mixed))));
    expect(back.map((q) => q.passage?.title)).toEqual(['ยาว', 'อีกข้อสอบ', 'ยาว']);
  });

  it('ข้อที่ตัดบทอ่านมี flag และ unpack ลบ flag ออก; ข้อจากแหล่งอื่นที่ไม่มี key passage (ไม่มี flag) ไม่ได้บทอ่านของข้อก่อนหน้า', () => {
    const packed = packQuestionPassages(qs) as Record<string, unknown>[];
    expect(packed[2][PACKED_PASSAGE_FLAG]).toBe(true);
    expect('passage' in packed[2]).toBe(false);
    expect(packed[1][PACKED_PASSAGE_FLAG]).toBeUndefined();
    const back = unpackQuestionPassages(JSON.parse(JSON.stringify(packed))) as Record<string, unknown>[];
    expect(back.some((q) => PACKED_PASSAGE_FLAG in q)).toBe(false);

    const foreign = [qs[1], { id: 'f', passageId: 'big' }];
    const out = unpackQuestionPassages(foreign as typeof qs);
    expect(out[1]).toBe(foreign[1]);
    expect('passage' in out[1]).toBe(false);
  });

  it('ข้อมูลเก่า (คัดลอกทุกข้อ) อ่านได้เหมือนเดิม', () => {
    const back = unpackQuestionPassages(JSON.parse(JSON.stringify(qs)));
    expect(back.map((q) => q.passage?.id ?? null)).toEqual([null, 'big', 'big', 'big']);
  });
});
