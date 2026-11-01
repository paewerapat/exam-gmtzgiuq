import { strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import {
  buildCreateExamInput,
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
    // passage_groups ระดับไฟล์ → เตือน
    expect(parsed.fileIssues.map((i) => i.level)).toEqual(['warning']);
    expect(parsed.fileIssues[0].message).toContain('บทอ่านร่วม');
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
    expect(q1.imagePath).toBe('images/q02-venn.png');
    expect(q1.hint).toContain('\n');
    expect(q1.status).toBe('ok');
  });

  it('ข้อ 3 แสดง review_note เป็นหมายเหตุ (ไม่ใช่ error)', () => {
    const q3 = resolved.questions[2];
    expect(messages(q3, 'note')).toEqual(['ยังไม่มีเฉลยทางการยืนยัน (180 ตามรูป, ฉบับก่อนหน้าตอบ 120)']);
    expect(q3.status).toBe('ok');
    expect(q3.imagePath).toBe('images/q10-rugby-sections.png');
  });

  it('ข้อ 5 เป็นอัตนัย correctAnswer "90"', () => {
    const q5 = resolved.questions[4];
    expect(q5.type).toBe('short_answer');
    expect(q5.correctAnswer).toBe('90');
  });

  it('ข้อ 6 เตือนบทอ่านร่วม', () => {
    expect(resolved.questions[5].status).toBe('warning');
    expect(messages(resolved.questions[5], 'warning').join()).toContain('บทอ่านร่วม');
  });

  it('ข้อ 7 correct_multi ["B","C","D"] → b,c,d ถูก ไม่มี warning "ยังไม่รองรับ" (task 06 AC6)', () => {
    const q7 = resolved.questions[6];
    expect(q7.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['b', 'c', 'd']);
    expect(messages(q7).join()).not.toContain('ยังไม่รองรับ');
    expect(messages(q7, 'error')).toEqual([]);
    // เหลือแค่เตือน topic ไม่มีในหลักสูตร
    expect(messages(q7, 'warning').join()).not.toContain('correct');
  });

  it('รูปที่ต้องอัปมี 2 รูป (รูปของ passage_groups ไม่นับ)', () => {
    expect(resolved.images.map((i) => [i.path, i.mimeType, i.usedBy])).toEqual([
      ['images/q02-venn.png', 'image/png', [1]],
      ['images/q10-rugby-sections.png', 'image/png', [3]],
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
    expect(r.questions[0].imagePath).toBe('images/q02-venn.png');
    expect(r.questions[2].imagePath).toBe('images/q10-rugby-sections.png');
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
    expect(q3.imagePath).toBeNull();
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
    expect(r.errorQuestionCount).toBe(2);
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
    expect(messages(r.questions[3], 'error')[0]).toContain('ใหญ่เกิน 5MB');
    expect(messages(r.questions[3], 'warning').join()).toContain('ใช้ได้แค่รูปแรก');
    expect(r.images).toHaveLength(0);
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
    expect(r.questions[0].imagePath).toBe('images/q02-venn.png');
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

  it('รูปในตัวเลือก / ไม่มีคำอธิบายเฉลย → เตือน', () => {
    const json = clone(sample) as Json;
    const q = (json.questions as Json[])[1];
    (q.choices as Json[])[0].image = 'images/c.png';
    q.explanation = '';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    const w = messages(r.questions[1], 'warning').join();
    expect(w).toContain('รูปในตัวเลือก');
    expect(w).toContain('ไม่มีคำอธิบายเฉลย');
    expect(r.questions[1].status).toBe('warning');
  });

  it('duration ไม่ถูกต้อง → เตือนแล้วใช้ null, status ในไฟล์ไม่มีผล', () => {
    const json = clone(sample) as Json;
    (json.exam as Json).duration_minutes = 0;
    (json.exam as Json).status = 'published';
    const r = resolve(parseImportFile('x.zip', sampleZip(json)));
    expect(r.exam?.durationMinutes).toBeNull();
    expect(r.fileIssues.map((i) => i.level)).toEqual(['warning', 'note', 'warning']);
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
