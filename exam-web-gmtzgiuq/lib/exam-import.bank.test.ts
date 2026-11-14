import { strToU8 } from 'fflate';
import { buildCreateExamInput, parseImportFile, resolveImport } from './exam-import';
import sample from './__fixtures__/exam-import-bank-sample.json';

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const bytes = (json: unknown) => strToU8(JSON.stringify(json));
const resolve = (json: unknown) =>
  resolveImport(parseImportFile('exam.json', bytes(json)), { categories: [], subjects: [], subjectId: null });
const build = (json: unknown, bankOnly?: boolean) =>
  buildCreateExamInput(resolve(json), { category: 'netsat', subjectId: null, imageUrls: {}, bankOnly });

describe('นำเข้า — Question Bank (task 20)', () => {
  it('fixture: bank_only + is_challenge ต่อข้อ ไม่มีคำเตือนระดับไฟล์', () => {
    const r = resolve(sample);
    expect(r.hasFileError).toBe(false);
    expect(r.fileIssues).toEqual([]);
    expect(r.bankOnly).toBe(true);
    expect(r.questions.map((q) => q.isChallenge)).toEqual([false, false, true]);
    const input = build(sample);
    expect(input.bankOnly).toBe(true);
    expect(input.questions.map((q) => q.isChallenge)).toEqual([false, false, true]);
  });

  it('รับชื่อแบบ camelCase (bankOnly / isChallenge) ด้วย', () => {
    const json = clone(sample) as Json;
    const exam = json.exam as Json;
    delete exam.bank_only;
    exam.bankOnly = true;
    const qs = json.questions as Json[];
    delete qs[2].is_challenge;
    delete qs[0].is_challenge;
    qs[0].isChallenge = true;
    const input = build(json);
    expect(input.bankOnly).toBe(true);
    expect(input.questions.map((q) => q.isChallenge)).toEqual([true, false, false]);
  });

  it('ชุดปกติ (ไม่มี bank_only): ข้อ is_challenge ส่งเป็น false (กัน API 400) ; แอดมินเปิดสวิตช์ในหน้านำเข้าได้', () => {
    const json = clone(sample) as Json;
    delete (json.exam as Json).bank_only;
    const r = resolve(json);
    expect(r.bankOnly).toBe(false);
    expect(r.questions[2].isChallenge).toBe(true);
    const normal = build(json);
    expect(normal.bankOnly).toBe(false);
    expect(normal.questions.every((q) => q.isChallenge === false)).toBe(true);
    const overridden = build(json, true);
    expect(overridden.bankOnly).toBe(true);
    expect(overridden.questions[2].isChallenge).toBe(true);
    // ปิดสวิตช์ทั้งที่ไฟล์บอก bank_only
    expect(build(sample, false).questions[2].isChallenge).toBe(false);
  });

  it('ค่าที่ไม่ใช่ boolean → คำเตือน แล้วใช้ false', () => {
    const json = clone(sample) as Json;
    (json.exam as Json).bank_only = 'yes';
    (json.questions as Json[])[2].is_challenge = 1;
    const r = resolve(json);
    expect(r.bankOnly).toBe(false);
    expect(r.fileIssues).toEqual([{ level: 'warning', message: expect.stringContaining('bank_only ต้องเป็น true หรือ false') }]);
    expect(r.hasFileError).toBe(false);
    expect(r.questions[2].isChallenge).toBe(false);
    expect(r.questions[2].status).toBe('warning');
    expect(r.questions[2].issues.map((i) => i.message).join(' ')).toContain('is_challenge ต้องเป็น true หรือ false');
  });

  it('round 2: difficulty ต่อข้อ (easy/medium/hard หรือภาษาไทย) ไม่ใส่ = medium ส่งทุกข้อ', () => {
    expect(build(sample).questions.map((q) => q.difficulty)).toEqual(['easy', 'medium', 'hard']);
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[0].difficulty = 'ยาก';
    qs[1].difficulty = ' Easy ';
    qs[2].difficulty = 'ปานกลาง';
    const r = resolve(json);
    expect(r.questions.map((q) => q.difficulty)).toEqual(['hard', 'easy', 'medium']);
    expect(r.questions.flatMap((q) => q.issues).some((i) => i.message.includes('difficulty'))).toBe(false);
  });

  it('round 2: difficulty ที่ไม่รู้จัก → คำเตือนภาษาไทย แล้วใช้ medium', () => {
    const json = clone(sample) as Json;
    (json.questions as Json[])[0].difficulty = 'insane';
    (json.questions as Json[])[1].difficulty = 3;
    const r = resolve(json);
    expect(r.questions[0].difficulty).toBe('medium');
    expect(r.questions[0].status).toBe('warning');
    expect(r.questions[0].issues.map((i) => i.message)).toContain(
      'ระดับความยาก (difficulty) "insane" ไม่รองรับ (ใช้ได้ easy, medium, hard) จะนำเข้าเป็นปานกลาง',
    );
    expect(r.questions[1].issues.map((i) => i.message).join(' ')).toContain('ระดับความยาก (difficulty) 3 ไม่รองรับ');
    expect(r.hasFileError).toBe(false);
  });

  it('difficulty ที่ตรงกับชื่อใน prototype ("constructor", "__proto__", "toString") → ไม่ใช้ได้ เตือนแล้วใช้ medium', () => {
    const json = clone(sample) as Json;
    const qs = json.questions as Json[];
    qs[0].difficulty = 'constructor';
    qs[1].difficulty = '__proto__';
    qs[2].difficulty = 'toString';
    const r = resolve(json);
    expect(r.questions.map((q) => q.difficulty)).toEqual(['medium', 'medium', 'medium']);
    expect(r.questions[0].issues.map((i) => i.message)).toContain(
      'ระดับความยาก (difficulty) "constructor" ไม่รองรับ (ใช้ได้ easy, medium, hard) จะนำเข้าเป็นปานกลาง',
    );
    expect(r.questions[1].issues.map((i) => i.message).join(' ')).toContain('"__proto__" ไม่รองรับ');
    expect(r.questions[2].issues.map((i) => i.message).join(' ')).toContain('"toString" ไม่รองรับ');
  });

  it('ไฟล์อ่านไม่ได้ → bankOnly false', () => {
    expect(parseImportFile('x.json', strToU8('{bad')).bankOnly).toBe(false);
  });
});
