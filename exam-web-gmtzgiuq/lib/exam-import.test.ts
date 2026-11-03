import { strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import {
  buildCreateExamInput,
  importImagesToUpload,
  normalizeZipPath,
  parseImportFile,
  resolveImport,
  type ParsedImport,
  type ResolvedImport,
} from './exam-import';
import type { Category } from '@/lib/api/categories';
import type { Subject } from '@/lib/api/curriculum';
// สำเนาของ docs/dev-loop/fixtures/01-sample-exam.json (ไฟล์ตัวอย่างจากลูกค้า)
import sample from './__fixtures__/exam-import-sample.json';

// ห่อ unzipSync ของจริงไว้ เพื่อดูว่าแตกไฟล์ไหนบ้าง
jest.mock('fflate', () => {
  const actual = jest.requireActual('fflate');
  return { ...actual, unzipSync: jest.fn((data, opts) => actual.unzipSync(data, opts)) };
});
const mockedUnzip = unzipSync as jest.MockedFunction<typeof unzipSync>;

// PNG 1x1 (เนื้อไฟล์ไม่สำคัญ แค่ให้มีไบต์)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

type Json = Record<string, unknown>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function zipOf(files: Record<string, Uint8Array | string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    entries[name] = typeof data === 'string' ? strToU8(data) : data;
  }
  return zipSync(entries);
}

function sampleZip(json: unknown = sample, prefix = ''): Uint8Array {
  return zipOf({
    [`${prefix}exam.json`]: JSON.stringify(json),
    [`${prefix}images/q02-venn.png`]: PNG,
    [`${prefix}images/q10-rugby-sections.png`]: PNG,
  });
}

function jsonBytes(json: unknown): Uint8Array {
  return strToU8(JSON.stringify(json));
}

const categories: Category[] = [
  { id: 'c1', name: 'A-LEVEL MATH', slug: 'a-level-math', orderIndex: 0, createdAt: '', updatedAt: '' },
  { id: 'c2', name: 'TGAT', slug: 'tgat', orderIndex: 1, createdAt: '', updatedAt: '' },
];

function subject(id: string, chapterId: string, topics: { id: string; name: string }[]): Subject {
  return {
    id,
    name: `วิชา ${id}`,
    description: null,
    color: '#000',
    iconEmoji: null,
    orderIndex: 0,
    isActive: true,
    createdAt: '',
    chapters: [
      {
        id: chapterId,
        subjectId: id,
        name: '_default',
        description: null,
        orderIndex: 0,
        isActive: true,
        createdAt: '',
        topics: topics.map((t) => ({
          ...t,
          chapterId,
          description: null,
          orderIndex: 0,
          isActive: true,
          createdAt: '',
        })),
      },
    ],
  };
}

const subjects: Subject[] = [
  subject('math', 'ch-math', [
    { id: 't-set', name: 'เซต' },
    { id: 't-exp', name: 'เลขยกกำลัง' },
    { id: 't-count', name: 'การนับ' },
    { id: 't-stat', name: 'สถิติ' },
  ]),
  subject('sci', 'ch-sci', [{ id: 't-sci-stat', name: 'สถิติ' }]),
];

function resolve(parsed: ParsedImport, subjectId: string | null = 'math', cats = categories): ResolvedImport {
  return resolveImport(parsed, { categories: cats, subjects, subjectId });
}

function messages(r: { issues: { level: string; message: string }[] }, level?: string): string[] {
  return r.issues.filter((i) => !level || i.level === level).map((i) => i.message);
}

describe('parseImportFile — fixture zip', () => {
  const parsed = parseImportFile('exam.zip', sampleZip());
  const resolved = resolve(parsed);

  it('อ่านชุดข้อสอบได้โดยไม่มี error ระดับไฟล์', () => {
    expect(resolved.hasFileError).toBe(false);
    expect(parsed.exam).toEqual({
      title: 'A-LEVEL MATH2 2567 (ตัวอย่าง 7 ข้อ)',
      description: 'คำอธิบายและคำใบ้เขียนโดย AI ไม่ใช่เฉลยทางการ',
      categoryText: 'A-LEVEL MATH',
      durationMinutes: 90,
    });
    // task 08: passage_groups นำเข้าได้แล้ว ไม่มีคำเตือนระดับไฟล์ "ยังไม่รองรับ"
    expect(parsed.fileIssues).toEqual([]);
  });

  it('ได้ 7 ข้อเรียงตาม no และทุกข้อไม่มี error', () => {
    expect(resolved.questions.map((q) => q.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(resolved.questions.map((q) => q.orderIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(resolved.errorQuestionCount).toBe(0);
  });

  it('จับคู่หมวดหมู่ด้วยชื่อ (ไม่สนตัวพิมพ์) และไม่เจอ → null', () => {
    expect(resolved.matchedCategorySlug).toBe('a-level-math');
    expect(resolve(parsed, 'math', [categories[1]]).matchedCategorySlug).toBeNull();
    const lower = clone(sample) as Json;
    (lower.exam as Json).category = '  a-level-math ';
    expect(resolve(parseImportFile('x.json', jsonBytes(lower))).matchedCategorySlug).toBe('a-level-math');
  });

  it('ข้อ 1: ปรนัย choices a–e, isCorrect ตรง correct, มีรูป, hint หลายบรรทัด', () => {
    const q1 = resolved.questions[0];
    expect(q1.type).toBe('multiple_choice');
    expect(q1.choices.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(q1.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['d']);
    expect(q1.imagePaths).toEqual(['images/q02-venn.png']);
    expect(q1.hint).toContain('\n');
    expect(q1.status).toBe('ok');
  });

  it('ข้อ 3 แสดง review_note เป็นหมายเหตุ (ไม่ใช่ error)', () => {
    const q3 = resolved.questions[2];
    expect(messages(q3, 'note')).toEqual(['ยังไม่มีเฉลยทางการยืนยัน (180 ตามรูป, ฉบับก่อนหน้าตอบ 120)']);
    expect(q3.status).toBe('ok');
    expect(q3.imagePaths).toEqual(['images/q10-rugby-sections.png']);
  });

  it('ข้อ 5 เป็นอัตนัย correctAnswer "90"', () => {
    const q5 = resolved.questions[4];
    expect(q5.type).toBe('short_answer');
    expect(q5.correctAnswer).toBe('90');
  });

  it('ข้อ 6 ผูกบทอ่าน reading-1 ไม่มีคำเตือน "ยังไม่รองรับ" (task 08 AC8)', () => {
    const q6 = resolved.questions[5];
    expect(q6.passageGroupRef).toBe('reading-1');
    expect(q6.passageId).toBe('reading-1');
    expect(messages(q6).join()).not.toContain('ยังไม่รองรับ');
    expect(messages(q6, 'error')).toEqual([]);
    // ข้ออื่นไม่มีบทอ่าน
    expect(resolved.questions.filter((q) => q.passageId).map((q) => q.no)).toEqual([6]);
  });

  it('ข้อ 7 correct_multi ["B","C","D"] → b,c,d ถูก ไม่มี warning "ยังไม่รองรับ" (task 06 AC6)', () => {
    const q7 = resolved.questions[6];
    expect(q7.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['b', 'c', 'd']);
    expect(messages(q7).join()).not.toContain('ยังไม่รองรับ');
    expect(messages(q7, 'error')).toEqual([]);
    // เหลือแค่เตือน topic ไม่มีในหลักสูตร
    expect(messages(q7, 'warning').join()).not.toContain('correct');
  });

  it('รูปที่ต้องอัปมี 2 รูป (รูปบทอ่านซ้ำกับรูปข้อ 1 อัปครั้งเดียว)', () => {
    expect(resolved.images.map((i) => [i.path, i.mimeType, i.usedBy, i.usedByPassages])).toEqual([
      ['images/q02-venn.png', 'image/png', [1], ['reading-1']],
      ['images/q10-rugby-sections.png', 'image/png', [3], []],
    ]);
  });

  it('topic จับคู่ในวิชาที่เลือก ได้ topicId/chapterId/chapter', () => {
    const q1 = resolved.questions[0];
    expect([q1.topicId, q1.chapterId, q1.chapter, q1.topicMatched]).toEqual(['t-set', 'ch-math', 'เซต', true]);
    // ข้อ 6 topic ไม่มีในหลักสูตร → เตือน + chapter = ข้อความ topic
    const q6 = resolved.questions[5];
    expect(q6.topicId).toBeNull();
    expect(q6.chapterId).toBeNull();
    expect(q6.chapter).toBe('(ตัวอย่างโครงสร้างข้อชุดบทอ่าน ไม่ใช่ข้อสอบจริง)');
    expect(messages(q6, 'warning').join()).toContain('ไม่พบหัวข้อ');
  });

  it('ไม่ได้เลือกวิชา: ชื่อ topic ไม่ซ้ำจับคู่ได้ ชื่อซ้ำหลายวิชา → เตือน', () => {
    const r = resolve(parsed, null);
    expect(r.questions[0].topicId).toBe('t-set');
    const q4 = r.questions[3]; // สถิติ มีทั้ง math และ sci
    expect(q4.topicId).toBeNull();
    expect(q4.chapter).toBe('สถิติ');
    expect(messages(q4, 'warning').join()).toContain('หลายวิชา');
  });

  it('buildCreateExamInput: draft, 7 ข้อ, url รูป, correctAnswer', () => {
    const input = buildCreateExamInput(resolved, {
      category: 'a-level-math',
      subjectId: 'math',
      imageUrls: {
        'images/q02-venn.png': 'http://api/uploads/a.png',
        'images/q10-rugby-sections.png': 'http://api/uploads/b.png',
      },
    });
    expect(input.status).toBe('draft');
    expect(input.title).toBe('A-LEVEL MATH2 2567 (ตัวอย่าง 7 ข้อ)');
    expect(input.category).toBe('a-level-math');
    expect(input.subjectId).toBe('math');
    expect(input.durationMinutes).toBe(90);
    expect(input.questions).toHaveLength(7);
    expect(input.questions.map((q) => q.orderIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(input.questions[0].questionImage).toBe('http://api/uploads/a.png');
    expect(input.questions[2].questionImage).toBe('http://api/uploads/b.png');
    expect(input.questions[1].questionImage).toBeUndefined();
    expect(input.questions[4]).toMatchObject({ type: 'short_answer', correctAnswer: '90', choices: [] });
    expect(input.questions[0]).toMatchObject({ topicId: 't-set', chapterId: 'ch-math', chapter: 'เซต' });
    expect(input.questions[6].hint).toBeUndefined(); // hint ว่าง
    expect(input.questions[6].choices!.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('parseImportFile — correct_multi (task 06)', () => {
  function q7With(patch: Json): ResolvedImport {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[6] = { ...qs[6], ...patch };
    return resolve(parseImportFile('x.zip', sampleZip(json)));
  }
  const correctIds = (r: ResolvedImport) => r.questions[6].choices.filter((c) => c.isCorrect).map((c) => c.id);

  it('label ที่ไม่มีในตัวเลือก → error ระบุ label', () => {
    const r = q7With({ correct_multi: ['B', 'F', 'Z'] });
    expect(r.questions[6].status).toBe('error');
    const e = messages(r.questions[6], 'error').join();
    expect(e).toContain('"F"');
    expect(e).toContain('"Z"');
    expect(e).toContain('correct_multi');
    expect(correctIds(r)).toEqual(['b']);
  });

  it('ไม่มี correct แต่มี correct_multi → ไม่ error, ตัวพิมพ์เล็ก/ซ้ำ → ตัดซ้ำ', () => {
    const r = q7With({ correct: null, correct_multi: ['d', 'B', 'b', ' C '] });
    expect(messages(r.questions[6], 'error')).toEqual([]);
    expect(correctIds(r)).toEqual(['b', 'c', 'd']);
  });

  it('correct_multi ตัวเดียว = ข้อปกติ', () => {
    const r = q7With({ correct: null, correct_multi: ['E'] });
    expect(messages(r.questions[6], 'error')).toEqual([]);
    expect(correctIds(r)).toEqual(['e']);
  });

  it('correct ไม่อยู่ใน correct_multi → เตือน แล้วใช้ correct_multi', () => {
    const r = q7With({ correct: 'A', correct_multi: ['B', 'C'] });
    expect(messages(r.questions[6], 'warning').join()).toContain('ไม่อยู่ใน correct_multi');
    expect(correctIds(r)).toEqual(['b', 'c']);
  });

  it('correct_multi ว่าง → ใช้ correct เหมือนเดิม', () => {
    const r = q7With({ correct: 'A', correct_multi: [] });
    expect(correctIds(r)).toEqual(['a']);
    const none = q7With({ correct: null, correct_multi: [] });
    expect(messages(none.questions[6], 'error').join()).toContain('ไม่ได้ระบุคำตอบที่ถูก');
  });

  it('correct_multi ไม่ใช่ array (เช่น "B,C,D") → เตือน แล้วใช้ correct', () => {
    const r = q7With({ correct: 'B', correct_multi: 'B,C,D' });
    expect(messages(r.questions[6], 'warning').join()).toContain('correct_multi ต้องเป็น array');
    expect(correctIds(r)).toEqual(['b']);
    const ok = q7With({ correct: 'B', correct_multi: null });
    expect(messages(ok.questions[6]).join()).not.toContain('correct_multi');
  });

  it('grading ไม่ใช่ all_or_none → เตือน', () => {
    const r = q7With({ grading: 'partial' });
    expect(messages(r.questions[6], 'warning').join()).toContain('รองรับเฉพาะ all_or_none');
    expect(correctIds(r)).toEqual(['b', 'c', 'd']);
  });
});

describe('parseImportFile — รูปแบบไฟล์', () => {
  it('รับ exam.json ในโฟลเดอร์ชั้นเดียว และ path แบบ ./ หรือ \\', () => {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    (qs[0].images as Json[])[0].file = './images/q02-venn.png';
    (qs[2].images as Json[])[0].file = 'images\\q10-rugby-sections.png';
    const r = resolve(parseImportFile('set.zip', sampleZip(json, 'my-set/')));
    expect(r.hasFileError).toBe(false);
    expect(r.questions[0].imagePaths).toEqual(['images/q02-venn.png']);
    expect(r.questions[2].imagePaths).toEqual(['images/q10-rugby-sections.png']);
    expect(r.images).toHaveLength(2);
  });

  it('เรียงตาม no แม้ในไฟล์สลับลำดับ', () => {
    const json = clone(sample) as Json;
    json.questions = [...(json.questions as Json[])].reverse();
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions.map((q) => q.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('รูปเดียวกันหลายข้ออัปครั้งเดียว', () => {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[1].images = [{ file: 'images/q02-venn.png' }];
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.images.find((i) => i.path === 'images/q02-venn.png')?.usedBy).toEqual([1, 2]);
    expect(r.images).toHaveLength(2);
  });

  it('รูปที่อ้างถึงไม่มีใน zip → error "ไม่พบรูป" แต่ยังสร้างได้ (ไม่มีรูป)', () => {
    const bytes = zipOf({ 'exam.json': JSON.stringify(sample), 'images/q02-venn.png': PNG });
    const r = resolve(parseImportFile('x.zip', bytes));
    expect(r.hasFileError).toBe(false);
    const q3 = r.questions[2];
    expect(q3.status).toBe('error');
    expect(messages(q3, 'error')[0]).toContain('ไม่พบรูป "images/q10-rugby-sections.png"');
    expect(q3.imagePaths).toEqual([]);
    expect(r.errorQuestionCount).toBe(1);
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    expect(input.questions[2].questionImage).toBeUndefined();
    expect(input.subjectId).toBeNull();
  });

  it('.json เดี่ยว: ข้อที่มีรูป error รูปหาย', () => {
    const r = resolve(parseImportFile('exam.json', jsonBytes(sample)));
    expect(r.hasFileError).toBe(false);
    expect(r.images).toHaveLength(0);
    expect(r.questions[0].status).toBe('error');
    expect(messages(r.questions[0], 'error')[0]).toContain('ไม่พบรูป');
    // ข้อ 6: บทอ่าน reading-1 มีแต่รูป (หาย) → บทอ่านใช้ไม่ได้ ข้อที่ผูกถูกแจ้ง error (ไม่บล็อกทั้งไฟล์)
    expect(r.passages[0].usable).toBe(false);
    expect(messages(r.questions[5], 'error')[0]).toContain('บทอ่าน "reading-1" มีข้อผิดพลาด');
    expect(r.errorQuestionCount).toBe(3);
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    expect(input.passages).toEqual([]);
    expect(input.questions[5].passageId).toBeNull();
  });

  it('path มี .. / ขึ้นต้นด้วย / / นามสกุลไม่รองรับ / ใหญ่เกิน 5MB → error รายข้อ', () => {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[0].images = [{ file: '../secret.png' }];
    qs[1].images = [{ file: '/etc/x.png' }];
    qs[2].images = [{ file: 'images/pic.bmp' }];
    qs[3].images = [{ file: 'images/big.png' }, { file: 'images/q02-venn.png' }];
    const bytes = zipOf({
      'exam.json': JSON.stringify(json),
      'images/pic.bmp': PNG,
      'images/big.png': new Uint8Array(5 * 1024 * 1024 + 1),
      'images/q02-venn.png': PNG,
    });
    const r = resolve(parseImportFile('x.zip', bytes));
    expect(messages(r.questions[0], 'error')[0]).toContain('path รูปไม่ถูกต้อง');
    expect(messages(r.questions[1], 'error')[0]).toContain('path รูปไม่ถูกต้อง');
    expect(messages(r.questions[2], 'error')[0]).toContain('ไม่รองรับไฟล์รูปชนิดนี้');
    expect(messages(r.questions[3], 'error')[0]).toContain('รูปที่ 1: รูป "images/big.png" ใหญ่เกิน 5MB');
    // หลายรูปใช้ได้แล้ว (task 07): ไม่มี warning "ใช้ได้แค่รูปแรก" รูปที่ 2 ที่ถูกต้องยังใช้ได้
    expect(messages(r.questions[3]).join()).not.toContain('ใช้ได้แค่รูปแรก');
    expect(r.questions[3].imagePaths).toEqual(['images/q02-venn.png']);
    expect(r.images.map((i) => i.path)).toEqual(['images/q02-venn.png']);
  });

  it('normalizeZipPath', () => {
    expect(normalizeZipPath('./images/a.png')).toBe('images/a.png');
    expect(normalizeZipPath('images\\a.png')).toBe('images/a.png');
    expect(normalizeZipPath('images/../a.png')).toBeNull();
    expect(normalizeZipPath('/a.png')).toBeNull();
    expect(normalizeZipPath('C:\\a.png')).toBeNull();
    // ยุบ ./ หลายชั้น และ / ซ้ำ
    expect(normalizeZipPath('images/././a.png')).toBe('images/a.png');
    expect(normalizeZipPath('././images//./a.png')).toBe('images/a.png');
    expect(normalizeZipPath('./')).toBeNull();
    expect(normalizeZipPath('images/./../a.png')).toBeNull();
  });

  it('path รูปแบบ images/././a.png หาไฟล์ใน zip เจอ', () => {
    const json = clone(sample) as Json;
    (((json.questions as Json[])[0].images as Json[])[0]).file = 'images/././q02-venn.png';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions[0].imagePaths).toEqual(['images/q02-venn.png']);
    expect(r.questions[0].status).toBe('ok');
  });
});

describe('parseImportFile — error ระดับไฟล์ (สร้างไม่ได้)', () => {
  const fileErrors = (p: ParsedImport) => p.fileIssues.filter((i) => i.level === 'error').map((i) => i.message);

  it('zip ที่ไม่มี exam.json', () => {
    const p = parseImportFile('x.zip', zipOf({ 'images/a.png': PNG, 'readme.txt': 'hi' }));
    expect(fileErrors(p)[0]).toContain('ไม่พบไฟล์ exam.json');
    expect(resolve(p).hasFileError).toBe(true);
  });

  it('exam.json ลึกเกินหนึ่งชั้นไม่นับ', () => {
    const p = parseImportFile('x.zip', zipOf({ 'a/b/exam.json': JSON.stringify(sample) }));
    expect(fileErrors(p)[0]).toContain('ไม่พบไฟล์ exam.json');
  });

  it('JSON พัง', () => {
    const p = parseImportFile('x.zip', zipOf({ 'exam.json': '{ "exam": ' }));
    expect(fileErrors(p)[0]).toContain('ไม่ใช่ JSON ที่ถูกต้อง');
    const p2 = parseImportFile('exam.json', strToU8('{oops'));
    expect(fileErrors(p2)[0]).toContain('ไม่ใช่ JSON ที่ถูกต้อง');
  });

  it('ไม่ใช่ zip / json', () => {
    const p = parseImportFile('photo.png', PNG);
    expect(fileErrors(p)[0]).toContain('ไม่ใช่ .zip หรือ .json');
  });

  it('zip เสีย', () => {
    const broken = sampleZip().slice(0, 40);
    const p = parseImportFile('x.zip', broken);
    expect(fileErrors(p)).toHaveLength(1);
  });

  it('ไม่มี title', () => {
    const json = clone(sample) as Json;
    (json.exam as Json).title = '   ';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.hasFileError).toBe(true);
    expect(r.fileIssues.find((i) => i.level === 'error')?.message).toContain('exam.title');
    expect(() => buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} })).toThrow();
  });

  it('ไม่มี questions / questions ว่าง', () => {
    const json = clone(sample) as Json;
    json.questions = [];
    expect(fileErrors(parseImportFile('x.json', jsonBytes(json)))[0]).toContain('questions ว่าง');
    delete json.questions;
    expect(fileErrors(parseImportFile('x.json', jsonBytes(json)))[0]).toContain('questions ว่าง');
  });

  it('ไม่มี exam', () => {
    expect(fileErrors(parseImportFile('x.json', jsonBytes({ questions: [] })))[0]).toContain('exam');
  });
});

describe('parseImportFile — error / warning รายข้อ', () => {
  function withQuestion(patch: Json, index = 0): ResolvedImport {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[index] = { ...qs[index], ...patch };
    return resolve(parseImportFile('x.zip', sampleZip(json)));
  }

  it('mcq ที่ correct ไม่ตรง label', () => {
    const r = withQuestion({ correct: 'F' }, 1);
    expect(r.questions[1].status).toBe('error');
    expect(messages(r.questions[1], 'error').join()).toContain('"F" ไม่ตรงกับตัวเลือกใด');
    expect(r.questions[1].choices.every((c) => !c.isCorrect)).toBe(true);
  });

  it('mcq ที่ correct ว่าง', () => {
    const r = withQuestion({ correct: null }, 1);
    expect(messages(r.questions[1], 'error').join()).toContain('ไม่ได้ระบุคำตอบที่ถูก');
  });

  it('choices < 2', () => {
    const r = withQuestion({ choices: [{ label: 'A', text: '1' }], correct: 'A' }, 1);
    expect(messages(r.questions[1], 'error').join()).toContain('ต้องมีตัวเลือก 2–6 ตัว (พบ 1 ตัว)');
  });

  it('label ซ้ำ / นอก A–F', () => {
    const r = withQuestion(
      {
        choices: [
          { label: 'A', text: '1' },
          { label: 'A', text: '2' },
          { label: 'G', text: '3' },
        ],
        correct: 'A',
      },
      1,
    );
    const errs = messages(r.questions[1], 'error').join();
    expect(errs).toContain('ซ้ำ');
    expect(errs).toContain('"G"');
    // id สำรองตามลำดับให้หน้าแก้ไขเปิดได้
    expect(r.questions[1].choices.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('numeric ที่ไม่มี correct_value', () => {
    const r = withQuestion({ correct_value: null }, 4);
    expect(r.questions[4].status).toBe('error');
    expect(messages(r.questions[4], 'error').join()).toContain('correct_value');
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    expect(input.questions[4].correctAnswer).toBe('');
  });

  it('type ไม่รองรับ / stem ว่าง', () => {
    const r = withQuestion({ type: 'essay', stem: '  ' }, 1);
    const errs = messages(r.questions[1], 'error').join();
    expect(errs).toContain('"essay" ไม่รองรับ');
    expect(errs).toContain('ไม่มีโจทย์');
  });

  it('ไม่มีคำอธิบายเฉลย → เตือน', () => {
    const json = clone(sample) as Json;
    const q = (json.questions as Json[])[1];
    q.explanation = '';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    const w = messages(r.questions[1], 'warning').join();
    expect(w).toContain('ไม่มีคำอธิบายเฉลย');
    expect(r.questions[1].status).toBe('warning');
  });

  it('duration ไม่ถูกต้อง → เตือนแล้วใช้ null, status ในไฟล์ไม่มีผล', () => {
    const json = clone(sample) as Json;
    (json.exam as Json).duration_minutes = 0;
    (json.exam as Json).status = 'published';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.exam?.durationMinutes).toBeNull();
    expect(r.fileIssues.map((i) => i.level)).toEqual(['warning', 'note']);
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    expect(input.status).toBe('draft');
    expect(input.durationMinutes).toBeNull();
  });
});

describe('รอบ 2 — แตกเฉพาะไฟล์ที่ใช้, เลขข้อ string, ตัวเลือกเกิน 6', () => {
  beforeEach(() => mockedUnzip.mockClear());

  it('แตก zip เฉพาะ exam.json และรูปที่ข้อสอบอ้างถึง', () => {
    const bytes = zipOf({
      'exam.json': JSON.stringify(sample),
      'images/q02-venn.png': PNG,
      'images/q10-rugby-sections.png': PNG,
      'images/unused.png': PNG,
      'video/big.bin': new Uint8Array(1024),
      'notes.json': '{}',
    });
    const r = resolve(parseImportFile('x.zip', bytes));
    expect(r.hasFileError).toBe(false);

    const extracted = mockedUnzip.mock.results.flatMap((res) => Object.keys(res.value as object));
    expect(extracted.sort()).toEqual(['exam.json', 'images/q02-venn.png', 'images/q10-rugby-sections.png']);
    expect(mockedUnzip).toHaveBeenCalledTimes(2);
  });

  it('ไม่มีรูปที่อ้างถึงใน zip → แตกรอบเดียว (เฉพาะ exam.json)', () => {
    const json = clone(sample) as Json;
    for (const q of json.questions as Json[]) q.images = [];
    for (const g of json.passage_groups as Json[]) g.images = [];
    parseImportFile('x.zip', zipOf({ 'exam.json': JSON.stringify(json), 'images/q02-venn.png': PNG }));
    expect(mockedUnzip).toHaveBeenCalledTimes(1);
  });

  it('รูปที่อ้างถึงรวมกันเกิน 200MB → error ระดับไฟล์ และไม่แตกรูป', () => {
    // จำลอง zip ที่ประกาศขนาดรูป 41 × 5MB โดยไม่ต้องสร้างไฟล์จริง
    const json = clone(sample) as Json;
    const base = (json.questions as Json[])[1];
    json.questions = Array.from({ length: 41 }, (_, i) => ({
      ...base,
      no: i + 1,
      images: [{ file: `images/p${i}.png` }],
    }));
    const examBytes = new Uint8Array(strToU8(JSON.stringify(json)));
    const fakeZip = zipOf({ 'exam.json': '{}' }); // ให้ผ่านการเช็ก magic bytes
    mockedUnzip.mockImplementationOnce((_data, opts) => {
      const infos = [
        { name: 'exam.json', size: 1, originalSize: examBytes.length, compression: 8 },
        ...Array.from({ length: 41 }, (_, i) => ({
          name: `images/p${i}.png`,
          size: 1,
          originalSize: 5 * 1024 * 1024,
          compression: 8,
        })),
      ];
      const out: Unzipped = {};
      for (const info of infos) {
        if (opts?.filter?.(info) && info.name === 'exam.json') out[info.name] = examBytes;
      }
      return out;
    });

    const p = parseImportFile('x.zip', fakeZip);
    expect(p.fileIssues.map((i) => i.level)).toEqual(['error']);
    expect(p.fileIssues[0].message).toContain('200MB');
    expect(mockedUnzip).toHaveBeenCalledTimes(1);
  });

  it('รับเลขข้อ (no) ที่เป็น string ตัวเลข', () => {
    const json = clone(sample) as Json;
    const qs = (json.questions as Json[]).reverse();
    qs.forEach((q) => {
      q.no = ` ${String(q.no)} `;
    });
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions.map((q) => q.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.questions.flatMap((q) => messages(q, 'warning')).join()).not.toContain('ไม่มีเลขข้อ');
  });

  it('no ที่ไม่ใช่ตัวเลข → เตือนและไปท้าย', () => {
    const json = clone(sample) as Json;
    (json.questions as Json[])[0].no = 'abc';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions.map((q) => q.no)).toEqual([2, 3, 4, 5, 6, 7, 7]);
    expect(messages(r.questions[6], 'warning').join()).toContain('ไม่มีเลขข้อ');
  });

  it('mcq ตัวเลือกเกิน 6 → error แต่ payload ใช้ 6 ตัวแรก id a–f', () => {
    const json = clone(sample) as Json;
    const q = (json.questions as Json[])[1];
    q.choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((label) => ({ label, text: `ตัวเลือก ${label}` }));
    q.correct = 'B';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions[1].status).toBe('error');
    expect(messages(r.questions[1], 'error').join()).toContain('(พบ 7 ตัว)');
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    const choices = input.questions[1].choices!;
    expect(choices.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(choices.map((c) => c.text)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'].map((l) => `ตัวเลือก ${l}`));
    expect(choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['b']);
  });
});

describe('รูปหลายรูปต่อข้อ + รูปในตัวเลือก (task 07 AC6)', () => {
  function multiImageJson(): Json {
    return {
      exam: { title: 'มิติสัมพันธ์', category: 'TGAT', duration_minutes: 30 },
      questions: [
        {
          no: 1,
          type: 'mcq',
          stem: 'วงจรและกราฟในรูป ข้อใดถูก',
          images: [{ file: 'images/q1-circuit.png', alt: 'วงจร' }, { file: 'images/q1-graph.png' }],
          choices: [
            { label: 'A', text: '', image: 'images/q1-a.png' },
            { label: 'B', text: '', image: { file: 'images/q1-b.png', alt: 'รูป B' } },
            { label: 'C', text: 'ข้อความกับรูป', image: './images/q1-graph.png' },
            { label: 'D', text: 'ข้อความอย่างเดียว' },
          ],
          correct: 'B',
          explanation: 'เฉลย',
        },
        {
          no: 2,
          type: 'mcq',
          stem: 'ใช้รูปซ้ำกับข้อ 1',
          images: [{ file: 'images/q1-circuit.png' }],
          choices: [
            { label: 'A', text: 'หนึ่ง', image: 'images/q1-a.png' },
            { label: 'B', text: 'สอง' },
          ],
          correct: 'A',
          explanation: 'เฉลย',
        },
      ],
    };
  }
  const allImages: Record<string, Uint8Array> = {
    'images/q1-circuit.png': PNG,
    'images/q1-graph.png': PNG,
    'images/q1-a.png': PNG,
    'images/q1-b.png': PNG,
  };
  const without = (path: string) =>
    Object.fromEntries(Object.entries(allImages).filter(([p]) => p !== path));
  const zipWith = (json: Json, files: Record<string, Uint8Array> = allImages) =>
    parseImportFile('x.zip', zipOf({ 'exam.json': JSON.stringify(json), ...files }));
  const urlsFor = (r: ResolvedImport) =>
    Object.fromEntries(r.images.map((i) => [i.path, `http://api/uploads/${i.fileName}`]));

  it('images 2 รูป + รูปตัวเลือก (string และ {file}) → ได้ครบ ไม่มี warning เดิม', () => {
    const r = resolve(zipWith(multiImageJson()), null);
    const q1 = r.questions[0];
    expect(q1.imagePaths).toEqual(['images/q1-circuit.png', 'images/q1-graph.png']);
    expect(q1.imageRefs).toEqual(['images/q1-circuit.png', 'images/q1-graph.png']);
    expect(q1.choices.map((c) => c.imagePath)).toEqual([
      'images/q1-a.png',
      'images/q1-b.png',
      'images/q1-graph.png',
      null,
    ]);
    const all = messages(q1).join('|');
    expect(all).not.toContain('ใช้ได้แค่รูปแรก');
    expect(all).not.toContain('ยังไม่รองรับรูปในตัวเลือก');
    // ตัวเลือกรูปล้วนไม่ต้องเตือนว่าไม่มีข้อความ
    expect(all).not.toContain('ไม่มีข้อความ');
    expect(messages(q1, 'error')).toEqual([]);
  });

  it('อัปรูปซ้ำครั้งเดียวต่อ path (ใช้ทั้งโจทย์/ตัวเลือก/หลายข้อ) usedBy ไม่ซ้ำ', () => {
    const r = resolve(zipWith(multiImageJson()), null);
    expect(r.images.map((i) => [i.path, i.usedBy])).toEqual([
      ['images/q1-circuit.png', [1, 2]],
      ['images/q1-graph.png', [1]],
      ['images/q1-a.png', [1, 2]],
      ['images/q1-b.png', [1]],
    ]);
  });

  it('แตกเฉพาะรูปที่อ้างถึง รวมรูปตัวเลือก', () => {
    mockedUnzip.mockClear();
    zipWith(multiImageJson(), { ...allImages, 'images/unused.png': PNG });
    const extracted = mockedUnzip.mock.results.flatMap((res) => Object.keys(res.value as Unzipped));
    expect(extracted.sort()).toEqual([
      'exam.json',
      'images/q1-a.png',
      'images/q1-b.png',
      'images/q1-circuit.png',
      'images/q1-graph.png',
    ]);
  });

  it('buildCreateExamInput: questionImages ตามลำดับ, questionImage = รูปแรก, choices[].image เป็น URL', () => {
    const r = resolve(zipWith(multiImageJson()), null);
    const input = buildCreateExamInput(r, { category: 'tgat', subjectId: null, imageUrls: urlsFor(r) });
    const [q1, q2] = input.questions;
    expect(q1.questionImages).toEqual(['http://api/uploads/q1-circuit.png', 'http://api/uploads/q1-graph.png']);
    expect(q1.questionImage).toBe('http://api/uploads/q1-circuit.png');
    expect(q1.choices).toEqual([
      { id: 'a', text: '', isCorrect: false, image: 'http://api/uploads/q1-a.png' },
      { id: 'b', text: '', isCorrect: true, image: 'http://api/uploads/q1-b.png' },
      { id: 'c', text: 'ข้อความกับรูป', isCorrect: false, image: 'http://api/uploads/q1-graph.png' },
      { id: 'd', text: 'ข้อความอย่างเดียว', isCorrect: false },
    ]);
    expect(q2.questionImages).toEqual(['http://api/uploads/q1-circuit.png']);
    expect(q2.choices?.[0].image).toBe('http://api/uploads/q1-a.png');
  });

  it('ข้อไม่มีรูป → ส่ง questionImages: [] ไม่มี questionImage', () => {
    const json = multiImageJson();
    delete (json.questions as Json[])[1].images;
    const r = resolve(zipWith(json), null);
    const input = buildCreateExamInput(r, { category: 'tgat', subjectId: null, imageUrls: urlsFor(r) });
    expect(input.questions[1].questionImages).toEqual([]);
    expect(input.questions[1].questionImage).toBeUndefined();
  });

  it('รูปตัวเลือกหายจาก zip → error ระบุตัวเลือก และไม่ส่ง image ของตัวนั้น', () => {
    const r = resolve(zipWith(multiImageJson(), without('images/q1-b.png')), null);
    const q1 = r.questions[0];
    expect(q1.status).toBe('error');
    expect(messages(q1, 'error')).toEqual(['ตัวเลือก B: ไม่พบรูป "images/q1-b.png" ใน zip']);
    expect(q1.choices[1].imagePath).toBeNull();
    expect(q1.choices[1].imageRef).toBe('images/q1-b.png');
    const input = buildCreateExamInput(r, { category: 'tgat', subjectId: null, imageUrls: urlsFor(r) });
    expect(input.questions[0].choices?.[1]).toEqual({ id: 'b', text: '', isCorrect: true });
  });

  it('รูปตัวเลือก path ผิด / ชนิดไม่รองรับ / ใหญ่เกิน / ระบุไม่ได้ → error ตามตัวเลือก', () => {
    const json = multiImageJson();
    const choices = (json.questions as Json[])[0].choices as Json[];
    choices[0].image = '../x.png';
    choices[1].image = 'images/b.bmp';
    choices[2].image = { file: 'images/big.png' };
    choices[3].image = 42;
    const r = resolve(
      zipWith(json, { ...allImages, 'images/b.bmp': PNG, 'images/big.png': new Uint8Array(5 * 1024 * 1024 + 1) }),
      null,
    );
    const errs = messages(r.questions[0], 'error');
    expect(errs[0]).toContain('ตัวเลือก A: path รูปไม่ถูกต้อง');
    expect(errs[1]).toContain('ตัวเลือก B: ไม่รองรับไฟล์รูปชนิดนี้');
    expect(errs[2]).toContain('ตัวเลือก C: รูป "images/big.png" ใหญ่เกิน 5MB');
    expect(errs[3]).toContain('ตัวเลือก D: ไม่ได้ระบุไฟล์รูป');
  });

  it('image ว่าง / null ถือว่าไม่มีรูป', () => {
    const json = multiImageJson();
    const choices = (json.questions as Json[])[0].choices as Json[];
    choices[0].image = '';
    choices[0].text = 'ก';
    choices[1].image = null;
    choices[1].text = 'ข';
    const r = resolve(zipWith(json), null);
    expect(r.questions[0].choices.slice(0, 2).map((c) => [c.imageRef, c.imagePath])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(messages(r.questions[0], 'error')).toEqual([]);
  });

  it('ตัวเลือกไม่มีทั้งข้อความและรูป → ยังเตือนเหมือนเดิม', () => {
    const json = multiImageJson();
    delete ((json.questions as Json[])[0].choices as Json[])[0].image;
    const r = resolve(zipWith(json), null);
    expect(messages(r.questions[0], 'warning').join()).toContain('ตัวเลือก A ไม่มีข้อความ');
  });

  it('รูปโจทย์เกิน 6 รูป → error และใช้แค่ 6 รูปแรก', () => {
    const json = multiImageJson();
    (json.questions as Json[])[0].images = Array.from({ length: 7 }, (_, i) => ({ file: `images/p${i}.png` }));
    const files: Record<string, Uint8Array> = { ...allImages };
    for (let i = 0; i < 7; i++) files[`images/p${i}.png`] = PNG;
    const r = resolve(zipWith(json, files), null);
    const q1 = r.questions[0];
    expect(messages(q1, 'error').join()).toContain('มีรูป 7 รูป เกินสูงสุด 6 รูปต่อข้อ');
    expect(q1.imagePaths).toEqual([0, 1, 2, 3, 4, 5].map((i) => `images/p${i}.png`));
    expect(r.images.some((i) => i.path === 'images/p6.png')).toBe(false);
  });

  it('รูปโจทย์รูปที่ 2 หาย → error ระบุรูปที่ 2 รูปแรกยังใช้ได้', () => {
    const json = multiImageJson();
    ((json.questions as Json[])[0].choices as Json[])[2].image = null;
    const r = resolve(zipWith(json, without('images/q1-graph.png')), null);
    const q1 = r.questions[0];
    expect(messages(q1, 'error')).toEqual(['รูปที่ 2: ไม่พบรูป "images/q1-graph.png" ใน zip']);
    expect(q1.imagePaths).toEqual(['images/q1-circuit.png']);
  });

  it('.json เดี่ยว + รูปตัวเลือก → error ให้ใช้ .zip', () => {
    const json = multiImageJson();
    delete (json.questions as Json[])[0].images;
    const r = resolve(parseImportFile('exam.json', jsonBytes(json)), null);
    expect(messages(r.questions[0], 'error')[0]).toBe(
      'ตัวเลือก A: ไม่พบรูป "images/q1-a.png" (นำเข้าไฟล์ .json เดี่ยวจะไม่มีรูป ให้ใช้ .zip)',
    );
    expect(r.images).toHaveLength(0);
  });
});

describe('passage_groups — บทอ่านร่วม (task 08)', () => {
  function withGroups(groups: unknown, mutate?: (qs: Json[]) => void): Json {
    const json = clone(sample) as Json;
    json.passage_groups = groups;
    if (mutate) mutate(json.questions as Json[]);
    return json;
  }
  const byNo = (r: ResolvedImport, no: number) => r.questions.find((q) => q.no === no)!;

  it('AC8: fixture zip → บทอ่าน reading-1 1 ชุดผูกข้อ 6 และส่งไปกับ payload', () => {
    const r = resolve(parseImportFile('exam.zip', sampleZip()));
    expect(r.hasFileError).toBe(false);
    expect(r.passages).toHaveLength(1);
    const p = r.passages[0];
    expect([p.id, p.title, p.body, p.imagePaths, p.usedBy, p.usable, p.exampleOnly]).toEqual([
      'reading-1',
      'บทอ่านที่ 1 (ตัวอย่าง)',
      null,
      ['images/q02-venn.png'],
      [6],
      true,
      true,
    ]);
    expect(messages(p, 'warning').join()).toContain('เป็นข้อตัวอย่าง');
    expect(messages(p, 'error')).toEqual([]);

    const input = buildCreateExamInput(r, {
      category: 'a',
      subjectId: null,
      imageUrls: { 'images/q02-venn.png': 'http://api/uploads/venn.png' },
    });
    expect(input.passages).toEqual([
      {
        id: 'reading-1',
        title: 'บทอ่านที่ 1 (ตัวอย่าง)',
        body: null,
        images: ['http://api/uploads/venn.png'],
        lineNumbers: false,
      },
    ]);
    expect(input.questions.map((q) => q.passageId)).toEqual([null, null, null, null, null, 'reading-1', null]);
  });

  it('อ้าง passage_group ที่ไม่มี → error ที่ข้อ และข้อนั้นไม่มีบทอ่าน', () => {
    const json = withGroups(sample.passage_groups, (qs) => {
      qs[5].passage_group = 'reading-9';
    });
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    const q6 = byNo(r, 6);
    expect(q6.passageId).toBeNull();
    expect(q6.status).toBe('error');
    expect(messages(q6, 'error')[0]).toContain('อ้างบทอ่าน "reading-9"');
    // reading-1 ยังมี applies_to [6] แต่ passage_group ของข้อเป็นหลัก → ไม่ผูกตาม applies_to
    expect(r.passages[0].usedBy).toEqual([]);
    expect(messages(r.passages[0], 'warning').join()).toContain('ไม่มีข้อใดใช้บทอ่านนี้');
    expect(r.hasFileError).toBe(false);
  });

  it('ไม่มี passage_group แต่อยู่ใน applies_to → ผูกตาม applies_to (body หลายบรรทัด + ตาราง)', () => {
    const body = 'ย่อหน้าแรก\n\nย่อหน้าสอง\n| ปี | ค่า |\n|---|---|\n| 2566 | 10 |';
    const json = withGroups([{ id: 'sit_A', title: 'ใช้สถานการณ์ต่อไปนี้ตอบข้อ 2–4', body, applies_to: [2, 3, '4'] }], (qs) => {
      for (const q of qs) delete q.passage_group;
    });
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.questions.filter((q) => q.passageId === 'sit_A').map((q) => q.no)).toEqual([2, 3, 4]);
    expect(r.passages[0].body).toBe(body);
    expect(r.passages[0].usedBy).toEqual([2, 3, 4]);
    expect(r.passages[0].status).toBe('ok');
  });

  it('passage_group ขัดกับ applies_to ของบทอ่านอื่น → เตือนแล้วใช้ passage_group', () => {
    const json = withGroups(
      [
        { id: 'a', body: 'บทอ่าน A', applies_to: [] },
        { id: 'b', body: 'บทอ่าน B', applies_to: [6, 7] },
      ],
      (qs) => {
        qs[5].passage_group = 'a';
      },
    );
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(byNo(r, 6).passageId).toBe('a');
    expect(messages(byNo(r, 6), 'warning').join()).toContain('passage_group "a" ขัดกับ applies_to ของบทอ่าน "b"');
    expect(byNo(r, 7).passageId).toBe('b');
    expect(r.passages.map((p) => p.usedBy)).toEqual([[6], [7]]);
  });

  it('id ผิด regex / ซ้ำ / ไม่มี → error ที่บทอ่าน ชุดนั้นไม่ถูกนำเข้า (ไม่บล็อกทั้งไฟล์)', () => {
    const json = withGroups(
      [
        { id: 'reading-1', body: 'ชุดแรก', applies_to: [] },
        { id: 'reading-1', body: 'ซ้ำ', applies_to: [] },
        { id: 'มี space', body: 'id ไทย', applies_to: [] },
        { body: 'ไม่มี id' },
        'ไม่ใช่ object',
      ],
    );
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.hasFileError).toBe(false);
    expect(r.passages.map((p) => p.usable)).toEqual([true, false, false, false, false]);
    expect(messages(r.passages[1], 'error')[0]).toContain('ซ้ำ');
    expect(messages(r.passages[2], 'error')[0]).toContain('ไม่ถูกต้อง');
    expect(messages(r.passages[3], 'error')[0]).toContain('ไม่มี id');
    // ข้อ 6 (passage_group reading-1) ผูกกับชุดแรกที่ใช้ได้
    expect(byNo(r, 6).passageId).toBe('reading-1');
    const input = buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });
    expect(input.passages?.map((p) => [p.id, p.body])).toEqual([['reading-1', 'ชุดแรก']]);
  });

  it('บทอ่านไม่มีทั้ง body และรูป → error, ข้อที่ผูกได้ error "มีข้อผิดพลาด"', () => {
    const json = withGroups([{ id: 'reading-1', title: 'ว่าง', body: '  ', images: [] }]);
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.passages[0].usable).toBe(false);
    expect(messages(r.passages[0], 'error')[0]).toContain('ไม่มีทั้งเนื้อหา (body) และรูป');
    expect(byNo(r, 6).passageId).toBeNull();
    expect(messages(byNo(r, 6), 'error')[0]).toContain('บทอ่าน "reading-1" มีข้อผิดพลาด');
  });

  it('รูปบทอ่านหายแต่มี body → error รูป บทอ่านยังนำเข้าได้ (ไม่มีรูปนั้น)', () => {
    const json = withGroups([{ id: 'reading-1', body: 'เนื้อหา', images: [{ file: 'images/none.png' }], applies_to: [6] }]);
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    const p = r.passages[0];
    expect(messages(p, 'error')[0]).toContain('ไม่พบรูป "images/none.png" ใน zip');
    expect(p.usable).toBe(true);
    expect(byNo(r, 6).passageId).toBe('reading-1');
  });

  it('applies_to อ้างข้อที่ไม่มี / passage_groups ไม่ใช่ array', () => {
    const r = resolve(
      parseImportFile('x.zip', sampleZip(withGroups([{ id: 'reading-1', body: 'x', applies_to: [6, 99] }]))),
    );
    expect(messages(r.passages[0], 'warning').join()).toContain('applies_to อ้างข้อ 99 ที่ไม่มีในไฟล์');

    const bad = resolve(parseImportFile('x.zip', sampleZip(withGroups({ id: 'x' }))));
    expect(bad.hasFileError).toBe(true);
    expect(bad.fileIssues.map((i) => i.message)).toContain('passage_groups ต้องเป็น array');
  });

  it('ไม่มี passage_groups → passages ว่าง ข้อที่มี passage_group ได้ error อ้าง id ที่ไม่มี', () => {
    const json = clone(sample) as Json;
    delete json.passage_groups;
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.passages).toEqual([]);
    expect(messages(byNo(r, 6), 'error')[0]).toContain('ที่ไม่มีใน passage_groups');
  });
});

describe('passage_groups — รอบ 2 (applies_to กับบทอ่านที่ใช้ไม่ได้ / รูปที่อัป / applies_to ไม่ตรง passage_group)', () => {
  function withGroups(groups: unknown, mutate?: (qs: Json[]) => void): Json {
    const json = clone(sample) as Json;
    json.passage_groups = groups;
    if (mutate) mutate(json.questions as Json[]);
    return json;
  }
  const byNo = (r: ResolvedImport, no: number) => r.questions.find((q) => q.no === no)!;
  const noGroups = (qs: Json[]) => qs.forEach((q) => delete q.passage_group);

  it('ผูกผ่าน applies_to อย่างเดียวกับบทอ่านที่ใช้ไม่ได้ → error ที่ข้อ (id ผิด / ไม่มีเนื้อหาและรูป / id ซ้ำ)', () => {
    const json = withGroups(
      [
        { id: 'ok', body: 'ใช้ได้', applies_to: [1] },
        { id: 'bad id', body: 'id ผิด', applies_to: [2] },
        { id: 'empty', body: '', applies_to: [3] },
        { id: 'ok', body: 'ซ้ำ', applies_to: [4] },
      ],
      noGroups,
    );
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(byNo(r, 1).passageId).toBe('ok');
    for (const [no, id] of [[2, 'bad id'], [3, 'empty'], [4, 'ok']] as const) {
      expect(byNo(r, no).passageId).toBeNull();
      expect(messages(byNo(r, no), 'error').join()).toContain(`บทอ่าน "${id}" (applies_to) มีข้อผิดพลาด`);
    }
  });

  it('applies_to ชี้บทอ่านที่ใช้ไม่ได้ แต่มีบทอ่านที่ใช้ได้ชี้ข้อเดียวกัน → ผูกกับชุดที่ใช้ได้ ไม่ error', () => {
    const json = withGroups(
      [
        { id: 'empty', body: '', applies_to: [5] },
        { id: 'ok', body: 'ใช้ได้', applies_to: [5] },
      ],
      noGroups,
    );
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(byNo(r, 5).passageId).toBe('ok');
    expect(messages(byNo(r, 5), 'error')).toEqual([]);
  });

  it('รูปของบทอ่านที่ใช้ไม่ได้ไม่อยู่ในรายการอัป (importImagesToUpload) รูปที่ข้อ/บทอ่านที่ใช้ได้อ้างยังอัป', () => {
    const json = withGroups(
      [
        { id: 'bad id', body: 'x', images: [{ file: 'images/only-bad.png' }], applies_to: [] },
        { id: 'good', body: 'y', images: [{ file: 'images/good.png' }], applies_to: [6] },
      ],
      noGroups,
    );
    const zip = zipOf({
      'exam.json': JSON.stringify(json),
      'images/q02-venn.png': PNG,
      'images/q10-rugby-sections.png': PNG,
      'images/only-bad.png': PNG,
      'images/good.png': PNG,
    });
    const r = resolve(parseImportFile('x.zip', zip));
    expect(r.images.map((i) => i.path)).toContain('images/only-bad.png');
    expect(importImagesToUpload(r).map((i) => i.path).sort()).toEqual([
      'images/good.png',
      'images/q02-venn.png',
      'images/q10-rugby-sections.png',
    ]);
  });

  it('passage_group X แต่ข้อไม่อยู่ใน applies_to ของ X → เตือนไม่ตรงกัน (ยังผูกตาม passage_group)', () => {
    const json = withGroups([{ id: 'reading-1', body: 'x', applies_to: [5] }], (qs) => {
      qs[4].passage_group = 'reading-1';
      qs[5].passage_group = 'reading-1';
    });
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(byNo(r, 6).passageId).toBe('reading-1');
    expect(messages(byNo(r, 6), 'warning').join()).toContain('ไม่อยู่ใน applies_to');
    expect(messages(byNo(r, 5), 'warning').join()).not.toContain('ไม่ตรงกัน');
  });

  it('applies_to มีข้อที่ไม่ได้ระบุ passage_group ขณะที่ข้ออื่นระบุ → เตือนไม่ตรงกัน (ผูกตาม applies_to)', () => {
    const json = withGroups([{ id: 'reading-1', body: 'x', applies_to: [6, 7] }]);
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(byNo(r, 7).passageId).toBe('reading-1');
    expect(messages(byNo(r, 7), 'warning').join()).toContain('ไม่ได้ระบุ passage_group');
    // ข้อ 6 ระบุตรงกันทั้งสองแหล่ง → ไม่เตือน
    expect(messages(byNo(r, 6), 'warning').join()).not.toContain('ไม่ตรงกัน');
  });
});

describe('passage_groups[].line_numbers — เลขบรรทัด (task 09)', () => {
  const body = Array.from({ length: 12 }, (_, i) => `บรรทัดที่ ${i + 1}`).join('\n');
  function parseWith(lineNumbers: unknown, omit = false) {
    const json = clone(sample) as Json;
    const group: Json = { id: 'read-1', title: 'อ่านแล้วตอบ', body, applies_to: [6] };
    if (!omit) group.line_numbers = lineNumbers;
    json.passage_groups = [group];
    for (const q of json.questions as Json[]) delete q.passage_group;
    return resolve(parseImportFile('x.zip', sampleZip(json)));
  }
  const build = (r: ResolvedImport) => buildCreateExamInput(r, { category: 'a', subjectId: null, imageUrls: {} });

  it('line_numbers: true → lineNumbers true และส่งใน payload ไม่มีคำเตือน', () => {
    const r = parseWith(true);
    expect(r.passages[0].lineNumbers).toBe(true);
    expect(messages(r.passages[0], 'warning').join()).not.toContain('line_numbers');
    expect(r.passages[0].status).toBe('ok');
    expect(build(r).passages?.[0]).toMatchObject({ id: 'read-1', body, lineNumbers: true });
  });

  it('ไม่มี key / null / false → false ไม่เตือน', () => {
    for (const r of [parseWith(undefined, true), parseWith(null), parseWith(false)]) {
      expect(r.passages[0].lineNumbers).toBe(false);
      expect(r.passages[0].status).toBe('ok');
      expect(build(r).passages?.[0].lineNumbers).toBe(false);
    }
  });

  it('ค่าไม่ใช่ boolean ("yes", 1) → warning แล้วใช้ false (ยังนำเข้าบทอ่านได้)', () => {
    for (const v of ['yes', 1]) {
      const r = parseWith(v);
      const p = r.passages[0];
      expect(p.lineNumbers).toBe(false);
      expect(p.usable).toBe(true);
      expect(p.status).toBe('warning');
      expect(messages(p, 'warning').join()).toContain('line_numbers ต้องเป็น true หรือ false');
      expect(build(r).passages?.[0].lineNumbers).toBe(false);
    }
  });

  it('ข้อความเตือนแสดงค่าแบบ JSON (object ไม่เป็น [object Object]) และตัดค่าที่ยาวเกิน', () => {
    const [objMsg] = messages(parseWith({ on: true }).passages[0], 'warning');
    expect(objMsg).toContain('(ได้ {"on":true})');
    expect(objMsg).not.toContain('[object Object]');
    expect(messages(parseWith('yes').passages[0], 'warning')[0]).toContain('(ได้ "yes")');
    const [longMsg] = messages(parseWith('ก'.repeat(500)).passages[0], 'warning');
    expect(longMsg).toContain(`(ได้ "${'ก'.repeat(39)}…)`);
    expect(longMsg.length).toBeLessThan(150);
  });
});
