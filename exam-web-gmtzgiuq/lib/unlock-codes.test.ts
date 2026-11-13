import {
  daysRemaining,
  filenameFromContentDisposition,
  firstBatchErrorField,
  formatAccessUntil,
  formatCodeInput,
  formatUserName,
  normalizeCodeForSubmit,
  REDEEM_ERROR_MESSAGES,
  redeemErrorMessage,
  redeemSuccessMessage,
  safeCsvFilename,
  UNLOCK_TEXT,
  createUnlockBatchForm,
  validateUnlockBatchForm,
} from './unlock-codes';
import { bangkokInputToIso } from './release-date';

describe('ข้อความ error ของการกรอกโค้ด', () => {
  it('ทุก errorCode ในสัญญามีข้อความไทยตรงตาม task file', () => {
    expect(REDEEM_ERROR_MESSAGES).toEqual({
      INVALID_FORMAT: 'รูปแบบโค้ดไม่ถูกต้อง',
      NOT_FOUND: 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง',
      DISABLED: 'โค้ดนี้ถูกปิดใช้งานแล้ว',
      EXPIRED: 'โค้ดนี้หมดอายุแล้ว',
      USED: 'โค้ดนี้ถูกใช้ไปแล้ว',
      ALREADY_REDEEMED: 'คุณใช้โค้ดนี้ไปแล้ว ใช้ซ้ำไม่ได้',
      BATCH_ALREADY_USED: 'บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว',
      NOT_FOR_THIS_EXAM: 'โค้ดนี้ใช้กับชุดข้อสอบนี้ไม่ได้',
      TOO_MANY_ATTEMPTS: 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่',
      ALREADY_HIGHER_PLAN: 'คุณมีแพ็กเกจของสนามนี้ที่ระดับสูงกว่าหรือเท่ากันอยู่แล้ว โค้ดนี้จึงยังไม่ถูกใช้',
    });
  });

  it('รหัสที่รู้จัก → ข้อความของเว็บ / ไม่รู้จัก + ข้อความไทยจาก API → ใช้ของ API / อื่น ๆ → ข้อความทั่วไป', () => {
    expect(redeemErrorMessage('USED', 'whatever')).toBe('โค้ดนี้ถูกใช้ไปแล้ว');
    expect(redeemErrorMessage('NEW_CODE', 'ข้อความใหม่จาก API')).toBe('ข้อความใหม่จาก API');
    expect(redeemErrorMessage(null, 'Internal server error')).toBe('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    expect(redeemErrorMessage(undefined)).toBe('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });

  it('ข้อความที่ผู้ใช้เห็นไม่มีคำว่า "ปลดล็อก"', () => {
    const all = [
      ...Object.values(UNLOCK_TEXT),
      ...Object.values(REDEEM_ERROR_MESSAGES),
      redeemSuccessMessage(1),
      redeemSuccessMessage(3),
    ];
    for (const t of all) expect(t).not.toMatch(/ปลดล็อก/);
  });

  it('toast สำเร็จ: หลายชุด → บอกจำนวน', () => {
    expect(redeemSuccessMessage(1)).toBe('Unlock สำเร็จ เริ่มทำข้อสอบได้เลย');
    expect(redeemSuccessMessage(0)).toBe('Unlock สำเร็จ เริ่มทำข้อสอบได้เลย');
    expect(redeemSuccessMessage(2)).toBe('Unlock สำเร็จ 2 ชุด เริ่มทำข้อสอบได้เลย');
  });
});

describe('ช่องกรอกโค้ด', () => {
  it('แสดงเป็นตัวพิมพ์ใหญ่ ส่งแบบตัดช่องว่างหัวท้าย (ขีด/ช่องว่างกลางให้ API จัดการ)', () => {
    expect(formatCodeInput('lumo-ab cd')).toBe('LUMO-AB CD');
    expect(normalizeCodeForSubmit('  LUMO-AB CD  ')).toBe('LUMO-AB CD');
    expect(normalizeCodeForSubmit('   ')).toBe('');
  });
});

describe('วันหมดสิทธิ์', () => {
  const now = new Date('2026-11-08T05:00:00.000Z'); // 12:00 เวลาไทย

  it('daysRemaining ปัดขึ้น หมดแล้ว = 0 ค่าไม่ถูกต้อง = null', () => {
    expect(daysRemaining('2026-11-30T16:59:00.000Z', now)).toBe(23);
    expect(daysRemaining('2026-11-08T08:00:00.000Z', now)).toBe(1);
    expect(daysRemaining('2026-11-08T04:00:00.000Z', now)).toBe(0);
    expect(daysRemaining(null, now)).toBeNull();
    expect(daysRemaining('nope', now)).toBeNull();
  });

  it('formatAccessUntil: "ทำได้ถึง <วันที่ไทย> · เหลือ N วัน" (เวลาไทย)', () => {
    // 30 พ.ย. 23:59 เวลาไทย = 16:59 UTC
    expect(formatAccessUntil('2026-11-30T16:59:00.000Z', now)).toBe('ทำได้ถึง 30 พ.ย. 2569 · เหลือ 23 วัน');
    // 1 ธ.ค. 00:30 เวลาไทย (ยังเป็น 30 พ.ย. ใน UTC) → วันที่ตามเวลาไทย
    expect(formatAccessUntil('2026-11-30T17:30:00.000Z', now)).toMatch(/^ทำได้ถึง 1 ธ\.ค\. 2569/);
    expect(formatAccessUntil('2026-11-08T04:00:00.000Z', now)).toMatch(/เหลือไม่ถึง 1 วัน$/);
    expect(formatAccessUntil(null, now)).toBe('ทำได้ไม่จำกัดเวลา');
  });
});

describe('validateUnlockBatchForm', () => {
  const now = new Date('2026-11-10T00:00:00.000Z');
  const valid = { ...createUnlockBatchForm(), name: 'แคมเปญ 1', examIds: ['e1'] };

  it('ค่าเริ่มต้น: 100 โค้ด 30 วัน ไม่หมดอายุ', () => {
    expect(createUnlockBatchForm()).toEqual({
      name: '',
      kind: 'exam',
      venueId: '',
      proPlanId: '',
      allMock: false,
      examIds: [],
      count: '100',
      accessDays: '30',
      codeExpiresAt: '',
    });
  });

  it('ฟอร์มถูกต้อง → {} / ทุกชุด Mock ไม่ต้องเลือกชุด', () => {
    expect(validateUnlockBatchForm(valid, bangkokInputToIso, now)).toEqual({});
    expect(validateUnlockBatchForm({ ...valid, examIds: [], allMock: true }, bangkokInputToIso, now)).toEqual({});
  });

  it('error แยกช่อง + ช่องแรกที่ผิดตามลำดับฟอร์ม', () => {
    const errors = validateUnlockBatchForm(
      { ...createUnlockBatchForm(), name: ' ', allMock: false, examIds: [], count: '5001', accessDays: '0', codeExpiresAt: '2026-11-01T10:00' },
      bangkokInputToIso,
      now,
    );
    expect(errors).toEqual({
      name: 'กรุณาตั้งชื่อแคมเปญ',
      exams: 'กรุณาเลือกชุดข้อสอบอย่างน้อย 1 ชุด',
      count: 'จำนวนโค้ดต้องเป็นจำนวนเต็ม 1–5,000',
      accessDays: 'อายุการเข้าถึงต้องเป็นจำนวนวัน 1–3,650',
      codeExpiresAt: 'วันหมดอายุโค้ดต้องเป็นเวลาในอนาคต',
    });
    expect(firstBatchErrorField(errors)).toBe('name');
    expect(firstBatchErrorField({ accessDays: 'x', count: 'y' })).toBe('count');
    expect(firstBatchErrorField({})).toBeNull();
  });

  it('ขอบเขต: 1 และ 5,000 โค้ด / 3,650 วัน ผ่าน; ทศนิยม/ชื่อยาวเกิน/วันที่ผิดรูป ไม่ผ่าน', () => {
    expect(validateUnlockBatchForm({ ...valid, count: '1', accessDays: '3650' }, bangkokInputToIso, now)).toEqual({});
    expect(validateUnlockBatchForm({ ...valid, count: '5000' }, bangkokInputToIso, now)).toEqual({});
    expect(validateUnlockBatchForm({ ...valid, count: '1.5' }, bangkokInputToIso, now).count).toBeDefined();
    expect(validateUnlockBatchForm({ ...valid, accessDays: '3651' }, bangkokInputToIso, now).accessDays).toBeDefined();
    expect(validateUnlockBatchForm({ ...valid, name: 'ก'.repeat(151) }, bangkokInputToIso, now).name).toMatch(/150/);
    expect(
      validateUnlockBatchForm({ ...valid, codeExpiresAt: '2026-02-31T10:00' }, bangkokInputToIso, now).codeExpiresAt,
    ).toBe('วันหมดอายุโค้ดไม่ถูกต้อง');
    expect(validateUnlockBatchForm({ ...valid, codeExpiresAt: '2026-12-31T23:59' }, bangkokInputToIso, now)).toEqual({});
  });
});

describe('อื่น ๆ', () => {
  it('formatUserName: ชื่อ-นามสกุล / ไม่มี → null', () => {
    expect(formatUserName({ firstName: 'สมชาย', lastName: 'ใจดี' })).toBe('สมชาย ใจดี');
    expect(formatUserName({ firstName: 'สมชาย', lastName: null })).toBe('สมชาย');
    expect(formatUserName({ firstName: ' ', lastName: '' })).toBeNull();
    expect(formatUserName(null)).toBeNull();
  });

  it('ชื่อไฟล์ CSV จาก Content-Disposition (UTF-8 / ธรรมดา) หรือชื่อแคมเปญ', () => {
    expect(
      filenameFromContentDisposition(
        `attachment; filename="campaign.csv"; filename*=UTF-8''${encodeURIComponent('แคมเปญ 1.csv')}`,
        'x.csv',
      ),
    ).toBe('แคมเปญ 1.csv');
    expect(filenameFromContentDisposition('attachment; filename="codes.csv"', 'x.csv')).toBe('codes.csv');
    expect(filenameFromContentDisposition(null, 'x.csv')).toBe('x.csv');
    expect(safeCsvFilename('NETSAT/Math: "พ.ย."')).toBe('NETSAT_Math_ _พ.ย._.csv');
    expect(safeCsvFilename('   ')).toBe('unlock-codes.csv');
  });
});
