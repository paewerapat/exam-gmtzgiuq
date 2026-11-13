import {
  BATCH_KIND_LABELS,
  createUnlockBatchForm,
  firstBatchErrorField,
  proRedeemErrorMessage,
  proRedeemSuccessMessage,
  validateUnlockBatchForm,
} from './unlock-codes';
import { bangkokInputToIso } from './release-date';

describe('โค้ดแบบให้แพ็กเกจ Pro (task 19)', () => {
  it('ข้อความสำเร็จ: "ได้รับแพ็กเกจ <แพ็กเกจ> <สนาม> ถึง <วันที่ไทย>" (ชื่อแพ็กเกจมีชื่อสนามแล้วไม่ต่อซ้ำ)', () => {
    const end = '2026-11-30T05:00:00.000Z';
    expect(proRedeemSuccessMessage({ venue: { name: 'NETSAT' }, plan: { name: 'PRO' }, currentPeriodEnd: end })).toBe(
      'ได้รับแพ็กเกจ PRO NETSAT ถึง 30 พ.ย. 2569',
    );
    expect(
      proRedeemSuccessMessage({ venue: { name: 'NETSAT' }, plan: { name: 'PRO NETSAT' }, currentPeriodEnd: end }),
    ).toBe('ได้รับแพ็กเกจ PRO NETSAT ถึง 30 พ.ย. 2569');
    expect(proRedeemSuccessMessage({ venue: { name: '' }, plan: { name: 'MAX' }, currentPeriodEnd: '' })).toBe('ได้รับแพ็กเกจ MAX');
  });

  it('error ในหน้า Upgrade: โค้ดของชุดข้อสอบ (NOT_FOR_THIS_EXAM) → ให้ไปกรอกที่หน้าชุด / มีแพ็กเกจสูงกว่า / อื่น ๆ', () => {
    expect(proRedeemErrorMessage('NOT_FOR_THIS_EXAM', 'x')).toBe('โค้ดนี้ใช้กับชุดข้อสอบ กรุณากรอกที่หน้าชุดข้อสอบ');
    expect(proRedeemErrorMessage('ALREADY_HIGHER_PLAN')).toBe(
      'คุณมีแพ็กเกจของสนามนี้ที่ระดับสูงกว่าหรือเท่ากันอยู่แล้ว โค้ดนี้จึงยังไม่ถูกใช้',
    );
    expect(proRedeemErrorMessage('BATCH_ALREADY_USED')).toBe('บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว');
    expect(proRedeemErrorMessage('PLAN_UNAVAILABLE', 'แพ็กเกจของโค้ดนี้ไม่เปิดให้ใช้แล้ว')).toBe('แพ็กเกจของโค้ดนี้ไม่เปิดให้ใช้แล้ว');
    expect(proRedeemErrorMessage(null, 'Internal')).toBe('ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });

  it('ชื่อประเภทไม่มีคำว่า "ปลดล็อก"', () => {
    expect(BATCH_KIND_LABELS).toEqual({ exam: 'Unlock ชุดข้อสอบ', pro: 'ให้แพ็กเกจ Pro' });
    expect(Object.values(BATCH_KIND_LABELS).join(' ')).not.toContain('ปลดล็อก');
  });

  it('ฟอร์มแคมเปญ kind pro: ต้องเลือกแพ็กเกจ ไม่ต้องเลือกชุด', () => {
    const now = new Date('2026-11-10T00:00:00.000Z');
    const form = { ...createUnlockBatchForm(), name: 'PRO 7 วัน', kind: 'pro' as const, accessDays: '7' };
    const errors = validateUnlockBatchForm(form, bangkokInputToIso, now);
    expect(errors).toEqual({ proPlan: 'กรุณาเลือกแพ็กเกจ' });
    expect(firstBatchErrorField(errors)).toBe('proPlan');
    expect(validateUnlockBatchForm({ ...form, venueId: 'v1', proPlanId: 'p1' }, bangkokInputToIso, now)).toEqual({});
    expect(validateUnlockBatchForm({ ...form, proPlanId: 'p1', accessDays: '0' }, bangkokInputToIso, now)).toEqual({
      accessDays: 'จำนวนวันของแพ็กเกจต้องเป็น 1–3,650',
    });
  });
});
