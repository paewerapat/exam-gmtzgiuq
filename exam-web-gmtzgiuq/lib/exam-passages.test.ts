import {
  createEmptyPassage,
  createPassageId,
  passageShowsLineNumbers,
  splitPassageLines,
  type PassageLine,
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
    expect(
      toPassageInput({ id: 'a', title: '  ', body: '\nบรรทัด 1\n\nบรรทัด 2\n', images: ['', '/u/1.png'], lineNumbers: true }),
    ).toEqual({
      id: 'a',
      title: null,
      body: '\nบรรทัด 1\n\nบรรทัด 2\n',
      images: ['/u/1.png'],
      lineNumbers: true,
    });
    expect(toPassageInput({ id: 'b', title: ' ชื่อ ', body: ' ', images: [], lineNumbers: false })).toEqual({
      id: 'b',
      title: 'ชื่อ',
      body: null,
      images: [],
      lineNumbers: false,
    });
  });

  it('passageFormFromApi: null → สตริงว่าง', () => {
    expect(passageFormFromApi(p2)).toEqual({
      id: 'p2',
      title: '',
      body: '',
      images: ['/uploads/x.png'],
      lineNumbers: false,
    });
    // เปิดแก้ข้อสอบที่เปิดเลขบรรทัดไว้ → checkbox ติ๊กอยู่ และบันทึกกลับส่ง true
    const form = passageFormFromApi({ ...p1, lineNumbers: true });
    expect(form.lineNumbers).toBe(true);
    expect(toPassageInput(form).lineNumbers).toBe(true);
    expect(createEmptyPassage([]).lineNumbers).toBe(false);
  });

  it('validatePassageForms: ต้องมีเนื้อหาหรือรูป / id ซ้ำ / เกินขนาด', () => {
    const ok: PassageForm = { id: 'a', title: '', body: 'x', images: [], lineNumbers: false };
    expect(validatePassageForms([ok, { ...ok, id: 'b', body: '', images: ['/u.png'] }])).toBeNull();
    expect(validatePassageForms([ok, { ...ok, id: 'b', title: 'มีแต่ชื่อ', body: '  ' }])).toBe(
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

  it('task 09: pack/unpack คง lineNumbers ของบทอ่านทุกข้อในกลุ่ม', () => {
    const numbered: ExamPassage = { ...big, lineNumbers: true };
    const group = [
      { id: 'q1', passageId: 'big', passage: numbered },
      { id: 'q2', passageId: 'big', passage: { ...numbered } },
    ];
    const packed = packQuestionPassages(group) as Record<string, unknown>[];
    expect(packed[1][PACKED_PASSAGE_FLAG]).toBe(true);
    const back = unpackQuestionPassages(JSON.parse(JSON.stringify(packed)));
    expect(back.map((q) => q.passage?.lineNumbers)).toEqual([true, true]);
  });

  it('task 09: id/เนื้อหาเดียวกันแต่ lineNumbers ต่างกัน → ไม่รวมกัน', () => {
    const mixed = [
      { id: 'q1', passageId: 'big', passage: { ...big, lineNumbers: true } },
      { id: 'q2', passageId: 'big', passage: { ...big } },
    ];
    const back = unpackQuestionPassages(JSON.parse(JSON.stringify(packQuestionPassages(mixed))));
    expect(back.map((q) => passageShowsLineNumbers(q.passage))).toEqual([true, false]);
  });
});

describe('task 09: normalize คง lineNumbers', () => {
  it('ข้อมูลครบ → ตัวเดิม (มี lineNumbers)', () => {
    const p: ExamPassage = { ...p1, lineNumbers: true };
    expect(getQuestionPassage({ passage: p })).toBe(p);
  });

  it('ต้องสร้าง object ใหม่ (images ไม่ใช่ array) → ยังคง lineNumbers: true', () => {
    const loose = { id: 'l', title: 't', body: 'x', lineNumbers: true } as unknown as ExamPassage;
    expect(getQuestionPassage({ passage: loose })).toEqual({ id: 'l', title: 't', body: 'x', images: [], lineNumbers: true });
  });

  it('withResolvedPassages เติม passage ที่มี lineNumbers ให้ข้อ', () => {
    const out = withResolvedPassages({ passages: [{ ...p1, lineNumbers: true }], questions: [{ passageId: 'p1' }] });
    expect((out.questions[0] as { passage?: ExamPassage }).passage?.lineNumbers).toBe(true);
  });

  it('ค่าไม่ใช่ boolean (localStorage เพี้ยน) → ถือว่าปิด; ไม่มี key → ปิด', () => {
    const odd = { ...p1, lineNumbers: 'yes' } as unknown as ExamPassage;
    const n = getQuestionPassage({ passage: odd });
    expect(passageShowsLineNumbers(n)).toBe(false);
    expect(passageShowsLineNumbers(p1)).toBe(false);
    expect(passageShowsLineNumbers(null)).toBe(false);
  });
});

describe('splitPassageLines (task 09)', () => {
  const numbers = (lines: PassageLine[]) => lines.flatMap((l) => (l.kind === 'line' ? [l.no] : []));
  const kinds = (lines: PassageLine[]) => lines.map((l) => l.kind);

  it('ข้อความ 12 บรรทัด → เลข 1–12 ตรงข้อความ', () => {
    const body = Array.from({ length: 12 }, (_, i) => `บรรทัด ${i + 1}`).join('\n');
    const lines = splitPassageLines(body);
    expect(numbers(lines)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(lines[11]).toEqual({ kind: 'line', no: 12, text: 'บรรทัด 12' });
  });

  it('บรรทัดว่าง / มีแต่ช่องว่าง = เว้นย่อหน้า ไม่นับเลข', () => {
    const lines = splitPassageLines('ก\n\nข\n   \t\nค');
    expect(kinds(lines)).toEqual(['line', 'blank', 'line', 'blank', 'line']);
    expect(lines.filter((l) => l.kind === 'line')).toEqual([
      { kind: 'line', no: 1, text: 'ก' },
      { kind: 'line', no: 2, text: 'ข' },
      { kind: 'line', no: 3, text: 'ค' },
    ]);
  });

  it('AC3: 14 บรรทัด (ว่างคั่น 1 + สูตร) → เลข 1–13 สูตรอยู่ในบรรทัดเดิม', () => {
    const text = Array.from({ length: 13 }, (_, i) => (i === 4 ? 'ค่าของ $x^2$ เมื่อ x = 3' : `ข้อความ ${i + 1}`));
    const body = [...text.slice(0, 6), '', ...text.slice(6)].join('\n');
    const lines = splitPassageLines(body);
    expect(lines).toHaveLength(14);
    expect(numbers(lines)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(lines[6]).toEqual({ kind: 'blank' });
    expect(lines[4]).toEqual({ kind: 'line', no: 5, text: 'ค่าของ $x^2$ เมื่อ x = 3' });
  });

  it('\\r\\n และ \\r → ขึ้นบรรทัดเหมือน \\n (ไม่มี \\r ค้างในข้อความ)', () => {
    const lines = splitPassageLines('หนึ่ง\r\nสอง\r\n\r\nสาม\rสี่');
    expect(kinds(lines)).toEqual(['line', 'line', 'blank', 'line', 'line']);
    expect(lines.some((l) => l.kind !== 'blank' && l.text.includes('\r'))).toBe(false);
    expect(numbers(lines)).toEqual([1, 2, 3, 4]);
  });

  it('ตาราง Markdown ทั้งบล็อก = block ไม่นับเลข บรรทัดหลังตารางนับต่อ', () => {
    const table = '| ปี | ค่า |\n|---|:--:|\n| 2566 | 10 |\n| 2567 | 12 |';
    const lines = splitPassageLines(`ก่อนตาราง\n${table}\nหลังตาราง`);
    expect(lines).toEqual([
      { kind: 'line', no: 1, text: 'ก่อนตาราง' },
      { kind: 'block', text: table },
      { kind: 'line', no: 2, text: 'หลังตาราง' },
    ]);
  });

  it('บรรทัดขึ้นต้นด้วย | ที่ไม่ใช่ตาราง (ไม่มีเส้นคั่น / จำนวนช่องไม่ตรง) → นับเป็นบรรทัดปกติ', () => {
    expect(kinds(splitPassageLines('| ไม่ใช่ตาราง |\nบรรทัดถัดไป'))).toEqual(['line', 'line']);
    expect(kinds(splitPassageLines('| a | b | c |\n|---|---|'))).toEqual(['line', 'line']);
  });

  it('$$ ... $$ คร่อมหลายบรรทัด → รวมเป็น 1 บรรทัด', () => {
    const lines = splitPassageLines('ก\n$$\nx^2 + y^2\n= 1\n$$\nข');
    expect(lines).toEqual([
      { kind: 'line', no: 1, text: 'ก' },
      { kind: 'line', no: 2, text: '$$\nx^2 + y^2\n= 1\n$$' },
      { kind: 'line', no: 3, text: 'ข' },
    ]);
    // $$ เปิด-ปิดในบรรทัดเดียว → บรรทัดปกติ
    expect(numbers(splitPassageLines('$$a$$\n$$b$$'))).toEqual([1, 2]);
    // ไม่มีตัวปิด → นับทีละบรรทัดตามปกติ
    expect(numbers(splitPassageLines('$$ ค้าง\nต่อ'))).toEqual([1, 2]);
  });

  it('body ว่าง/null/มีแต่บรรทัดว่าง → []', () => {
    expect(splitPassageLines(null)).toEqual([]);
    expect(splitPassageLines('')).toEqual([]);
    expect(splitPassageLines('\n \n\r\n')).toEqual([]);
  });

  it('บรรทัดว่างหัว/ท้าย body ถูกตัด (ไม่มีที่ว่างเกิน) บรรทัดว่างคั่นกลางยังอยู่ เลขไม่เปลี่ยน', () => {
    expect(splitPassageLines('ก\nข\n')).toEqual([
      { kind: 'line', no: 1, text: 'ก' },
      { kind: 'line', no: 2, text: 'ข' },
    ]);
    const lines = splitPassageLines('\n\n  \nก\n\nข\r\n\r\n');
    expect(kinds(lines)).toEqual(['line', 'blank', 'line']);
    expect(numbers(lines)).toEqual([1, 2]);
  });
});
