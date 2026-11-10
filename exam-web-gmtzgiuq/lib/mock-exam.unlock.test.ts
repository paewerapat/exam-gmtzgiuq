import {
  canStartMock,
  codeStepError,
  createCodeStep,
  createMockExamForm,
  mockFormFromExam,
  mockFormHasSettings,
  normalizeMockAccess,
  toCodeInstructions,
  toMockExamInput,
  validateMockForm,
  type MockExamForm,
} from './mock-exam';

const codeForm = (patch: Partial<MockExamForm> = {}): MockExamForm => ({
  ...createMockExamForm(),
  isMock: true,
  accessType: 'code',
  ...patch,
});

describe('สิทธิ์ของบัญชี (task 15)', () => {
  it('normalizeMockAccess: ชุดฟรี → free เสมอ / ไม่มี access (API เก่า) → locked', () => {
    expect(normalizeMockAccess({ status: 'unlocked', expiresAt: 'x' }, 'free')).toEqual({ status: 'free', expiresAt: null });
    expect(normalizeMockAccess(undefined, 'code')).toEqual({ status: 'locked', expiresAt: null });
    expect(normalizeMockAccess({ status: 'unlocked', expiresAt: '2026-12-01T00:00:00Z' }, 'purchase')).toEqual({
      status: 'unlocked',
      expiresAt: '2026-12-01T00:00:00Z',
    });
  });

  it('canStartMock: ฟรี หรือ unlocked เท่านั้น', () => {
    expect(canStartMock({ accessType: 'free' })).toBe(true);
    expect(canStartMock({ accessType: 'code' }, { status: 'unlocked', expiresAt: null })).toBe(true);
    expect(canStartMock({ accessType: 'code' }, { status: 'expired', expiresAt: null })).toBe(false);
    expect(canStartMock({ accessType: 'purchase' }, { status: 'locked', expiresAt: null })).toBe(false);
    expect(canStartMock({ accessType: 'code' })).toBe(false);
  });
});

describe('ฟอร์ม "วิธีรับโค้ด" (task 15)', () => {
  it('ฟอร์มเริ่มต้นไม่มีขั้นตอน → codeInstructions null', () => {
    expect(createMockExamForm()).toMatchObject({ codeSteps: [], codeNote: '' });
    expect(toMockExamInput(codeForm()).codeInstructions).toBeNull();
  });

  it('mockFormFromExam ↔ toMockExamInput: ขั้นตอนเรียงตามเดิม ช่องว่างไม่ส่ง ตัดช่องว่างหัวท้าย', () => {
    const form = mockFormFromExam({
      isMock: true,
      accessType: 'code',
      codeInstructions: {
        steps: [
          { title: 'ติดตามเพจ', description: 'กดติดตาม', linkLabel: 'ไปที่ IG', linkUrl: 'https://instagram.com/x' },
          { title: 'รับโค้ด' },
        ],
        note: 'หมายเหตุ',
      },
    });
    expect(form.codeSteps.map((s) => s.title)).toEqual(['ติดตามเพจ', 'รับโค้ด']);
    expect(new Set(form.codeSteps.map((s) => s.key)).size).toBe(2);
    expect(form.codeNote).toBe('หมายเหตุ');
    expect(mockFormHasSettings({ ...createMockExamForm(), codeSteps: form.codeSteps })).toBe(true);

    form.codeSteps[1] = { ...form.codeSteps[1], title: '  รับโค้ด  ', description: '   ' };
    expect(validateMockForm(form)).toBeNull();
    expect(toMockExamInput(form).codeInstructions).toEqual({
      steps: [
        { title: 'ติดตามเพจ', description: 'กดติดตาม', linkLabel: 'ไปที่ IG', linkUrl: 'https://instagram.com/x' },
        { title: 'รับโค้ด' },
      ],
      note: 'หมายเหตุ',
    });
  });

  it('API ไม่มี codeInstructions → ฟอร์มว่าง', () => {
    expect(mockFormFromExam({ isMock: true })).toMatchObject({ codeSteps: [], codeNote: '' });
    expect(mockFormFromExam({ isMock: true, codeInstructions: null })).toMatchObject({ codeSteps: [], codeNote: '' });
  });

  it('codeStepError: หัวข้อบังคับ, ความยาวตามสัญญา, ลิงก์ http(s) เท่านั้น, ข้อความปุ่มต้องมีลิงก์', () => {
    expect(codeStepError(createCodeStep({ title: 'ok' }))).toBeNull();
    expect(codeStepError(createCodeStep({ title: ' ' }))).toBe('กรุณาใส่หัวข้อหรือลบขั้นตอนนี้');
    expect(codeStepError(createCodeStep({ title: 'ก'.repeat(101) }))).toMatch(/100/);
    expect(codeStepError(createCodeStep({ title: 'a', description: 'ก'.repeat(301) }))).toMatch(/300/);
    expect(codeStepError(createCodeStep({ title: 'a', linkLabel: 'ก'.repeat(41), linkUrl: 'https://x' }))).toMatch(/40/);
    expect(codeStepError(createCodeStep({ title: 'a', linkLabel: 'ไป' }))).toBe('ใส่ลิงก์ของปุ่ม หรือลบข้อความปุ่ม');
    expect(codeStepError(createCodeStep({ title: 'a', linkUrl: 'javascript:alert(1)' }))).toBe(
      'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://',
    );
    expect(codeStepError(createCodeStep({ title: 'a', linkUrl: `https://x.com/${'a'.repeat(500)}` }))).toMatch(/500/);
    expect(codeStepError(createCodeStep({ title: 'a', linkUrl: 'https://x.com' }))).toBeNull();
  });

  it('validateMockForm (ชุดโค้ด): บอกขั้นที่ผิด, เกิน 10 ขั้น, หมายเหตุเกิน 300', () => {
    expect(validateMockForm(codeForm({ codeSteps: [createCodeStep({ title: 'a' }), createCodeStep()] }))).toBe(
      'วิธีรับโค้ด ขั้นที่ 2: กรุณาใส่หัวข้อหรือลบขั้นตอนนี้',
    );
    const eleven = Array.from({ length: 11 }, (_, i) => createCodeStep({ title: `ขั้น ${i + 1}` }));
    expect(validateMockForm(codeForm({ codeSteps: eleven }))).toBe('วิธีรับโค้ด: มีได้ไม่เกิน 10 ขั้นตอน');
    expect(validateMockForm(codeForm({ codeNote: 'ก'.repeat(301) }))).toBe(
      'วิธีรับโค้ด: หมายเหตุยาวได้ไม่เกิน 300 ตัวอักษร',
    );
  });

  it('ชุดที่ไม่ใช่โค้ด: ไม่ตรวจ "วิธีรับโค้ด" แต่ส่งเฉพาะขั้นตอนที่ถูกต้อง (ค่ายังถูกเก็บ ไม่ให้ API 400)', () => {
    const form = codeForm({
      accessType: 'free',
      codeSteps: [createCodeStep(), createCodeStep({ title: 'เก็บ' }), createCodeStep({ title: 'x', linkUrl: 'ftp://x' })],
      codeNote: 'ก'.repeat(301),
    });
    expect(validateMockForm(form)).toBeNull();
    expect(toMockExamInput(form).codeInstructions).toEqual({ steps: [{ title: 'เก็บ' }] });
    expect(toMockExamInput({ ...form, isMock: false }).codeInstructions).toEqual({ steps: [{ title: 'เก็บ' }] });
  });

  it('toCodeInstructions: มีแต่หมายเหตุ → steps [] + note', () => {
    expect(toCodeInstructions({ codeSteps: [], codeNote: ' ดูที่เพจ ' })).toEqual({ steps: [], note: 'ดูที่เพจ' });
  });
});
