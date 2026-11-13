import {
  createDiscountForm,
  diffDiscountInput,
  discountCodeState,
  discountErrorMessage,
  discountFormToInput,
  discountScopeLabel,
  discountValueToApi,
  firstDiscountErrorField,
  formatDiscountCodeInput,
  formatDiscountPeriod,
  formatDiscountUsage,
  formatDiscountValue,
  isDiscountErrorCode,
  redemptionStatusLabel,
  validateDiscountForm,
  type DiscountCodeForm,
} from './pro-discounts';
import { bangkokInputToIso } from './release-date';
import type { ProAdminVenue, ProDiscountCode } from './api/pro';

const venue = (patch: Partial<ProAdminVenue> = {}): ProAdminVenue => ({
  id: 'v1',
  key: 'netsat',
  name: 'NETSAT',
  description: null,
  sortOrder: 0,
  isActive: true,
  comparison: { groups: [] },
  plans: [
    {
      id: 'p-pro',
      venueId: 'v1',
      code: 'pro',
      rank: 1,
      name: 'PRO',
      tagline: null,
      priceSatang: 19900,
      priceUnit: null,
      priceNote: null,
      buttonText: '',
      badge: null,
      highlight: false,
      isPurchasable: true,
      periodDays: 30,
      sortOrder: 0,
      isVisible: true,
      entitlements: { challenge: false, beyond: false, predictedSets: 0, solutions: false, analytics: false, mockPurchase: true },
    },
  ],
  ...patch,
});

const code = (patch: Partial<ProDiscountCode> = {}): ProDiscountCode => ({
  id: 'd1',
  code: 'NEWYEAR20',
  description: 'ปีใหม่',
  discountType: 'percent',
  discountValue: 20,
  venueId: 'v1',
  planId: 'p-pro',
  venue: null,
  plan: null,
  startsAt: null,
  endsAt: '2026-12-31T16:59:00.000Z',
  maxRedemptions: 100,
  perUserLimit: 1,
  isActive: true,
  redeemedCount: 3,
  reservedCount: 0,
  status: '',
  createdAt: '2026-11-13T00:00:00.000Z',
  updatedAt: '2026-11-13T00:00:00.000Z',
  ...patch,
});

const validForm = (patch: Partial<DiscountCodeForm> = {}): DiscountCodeForm => ({
  ...createDiscountForm(),
  code: 'NEWYEAR20',
  value: '20',
  ...patch,
});

describe('โค้ดส่วนลด — ข้อความ error (task 19)', () => {
  it('errorCode ที่รู้จัก → ข้อความของเว็บ / ไม่รู้จัก + ไทยจาก API → ของ API / อื่น ๆ → fallback', () => {
    expect(discountErrorMessage('DISCOUNT_EXPIRED', 'x')).toBe('โค้ดส่วนลดนี้หมดอายุแล้ว');
    expect(discountErrorMessage('DISCOUNT_ALREADY_USED')).toBe('คุณใช้โค้ดส่วนลดนี้ครบจำนวนครั้งที่กำหนดแล้ว');
    expect(discountErrorMessage('AMOUNT_TOO_LOW')).toContain('20 บาท');
    expect(discountErrorMessage('NEW_CODE', 'ข้อความใหม่')).toBe('ข้อความใหม่');
    expect(discountErrorMessage(null, 'Bad Request')).toBe('ใช้โค้ดส่วนลดนี้ไม่ได้');
    for (const c of [
      'DISCOUNT_NOT_FOUND',
      'DISCOUNT_INACTIVE',
      'DISCOUNT_NOT_STARTED',
      'DISCOUNT_NOT_APPLICABLE',
      'DISCOUNT_USED_UP',
      'DISCOUNT_TOO_LARGE',
      'TOO_MANY_ATTEMPTS',
    ]) {
      expect(discountErrorMessage(c)).toMatch(/[ก-๙]/);
    }
  });

  it('isDiscountErrorCode: DISCOUNT_* และ AMOUNT_TOO_LOW เท่านั้น', () => {
    expect(isDiscountErrorCode('DISCOUNT_USED_UP')).toBe(true);
    expect(isDiscountErrorCode('AMOUNT_TOO_LOW')).toBe(true);
    expect(isDiscountErrorCode('CARD_DECLINED')).toBe(false);
    expect(isDiscountErrorCode(null)).toBe(false);
  });
});

describe('โค้ดส่วนลด — การแสดงผล', () => {
  it('มูลค่า / การใช้ / ช่วงเวลา / โค้ดในช่องกรอก', () => {
    expect(formatDiscountValue('percent', 20)).toBe('20%');
    expect(formatDiscountValue('amount', 5000)).toBe('฿50');
    expect(formatDiscountUsage(3, 0, 100)).toBe('ใช้แล้ว 3 / 100');
    expect(formatDiscountUsage(3, 2, 100)).toBe('ใช้แล้ว 3 (+2 จอง) / 100');
    expect(formatDiscountUsage(1200, 0, null)).toBe('ใช้แล้ว 1,200 / ไม่จำกัด');
    expect(formatDiscountPeriod(null, null)).toBe('ไม่จำกัดเวลา');
    expect(formatDiscountPeriod(null, '2026-12-31T16:59:00.000Z')).toMatch(/^ถึง /);
    expect(formatDiscountPeriod('2026-12-01T00:00:00.000Z', null)).toMatch(/^ตั้งแต่ /);
    expect(formatDiscountCodeInput(' new year20 ')).toBe('NEWYEAR20');
  });

  it('ขอบเขต: ทุกสนาม / สนาม · ทุกแพ็กเกจ / สนาม · แพ็กเกจ (หาชื่อจาก config ถ้า API ไม่ส่ง)', () => {
    const venues = [venue()];
    expect(discountScopeLabel(code({ venueId: null, planId: null }), venues)).toBe('ทุกสนาม');
    expect(discountScopeLabel(code({ planId: null }), venues)).toBe('NETSAT · ทุกแพ็กเกจ');
    expect(discountScopeLabel(code(), venues)).toBe('NETSAT · PRO');
    expect(
      discountScopeLabel(
        code({ venue: { id: 'v1', key: 'netsat', name: 'NETSAT (API)' }, plan: { id: 'p-pro', code: 'pro', name: 'PRO (API)' } }),
        [],
      ),
    ).toBe('NETSAT (API) · PRO (API)');
  });

  it('สถานะ: ปิด > หมดอายุ > ใช้ครบ > ยังไม่เริ่ม > ใช้งานได้', () => {
    const now = new Date('2026-11-13T00:00:00.000Z');
    expect(discountCodeState(code(), now)).toBe('active');
    expect(discountCodeState(code({ isActive: false }), now)).toBe('inactive');
    expect(discountCodeState(code({ endsAt: '2026-11-01T00:00:00.000Z' }), now)).toBe('expired');
    expect(discountCodeState(code({ redeemedCount: 100 }), now)).toBe('usedUp');
    expect(discountCodeState(code({ startsAt: '2026-12-01T00:00:00.000Z' }), now)).toBe('scheduled');
    // ใช้ + จองรวมกันครบ max → ใช้ครบ (เมื่อ API ไม่ส่ง status)
    expect(discountCodeState(code({ redeemedCount: 98, reservedCount: 2 }), now)).toBe('usedUp');
    expect(redemptionStatusLabel('reserved')).toBe('รอชำระ');
    expect(redemptionStatusLabel('used')).toBe('ใช้แล้ว');
    expect(redemptionStatusLabel('released')).toBe('คืนสิทธิ์');
  });
});

describe('โค้ดส่วนลด — สถานะจาก API (รอบ 2)', () => {
  it('ใช้ status ของ API ก่อน (used_up → ใช้ครบแล้ว) / ค่าไม่รู้จักหรือว่าง → คิดเอง', () => {
    const now = new Date('2026-11-13T00:00:00.000Z');
    expect(discountCodeState(code({ status: 'used_up' }), now)).toBe('usedUp');
    expect(discountCodeState(code({ status: 'scheduled' }), now)).toBe('scheduled');
    expect(discountCodeState(code({ status: 'expired' }), now)).toBe('expired');
    expect(discountCodeState(code({ status: 'inactive', isActive: true }), now)).toBe('inactive');
    expect(discountCodeState(code({ status: 'active', isActive: false }), now)).toBe('active');
    expect(discountCodeState(code({ status: 'weird', isActive: false }), now)).toBe('inactive');
  });
});

describe('โค้ดส่วนลด — ฟอร์มแอดมิน', () => {
  it('มูลค่า: percent 1–100 (จำนวนเต็ม) / amount บาท ≥ 1 → สตางค์', () => {
    expect(discountValueToApi('percent', '20')).toBe(20);
    expect(discountValueToApi('percent', '0')).toBeNull();
    expect(discountValueToApi('percent', '101')).toBeNull();
    expect(discountValueToApi('percent', '12.5')).toBeNull();
    expect(discountValueToApi('amount', '50')).toBe(5000);
    expect(discountValueToApi('amount', '49.50')).toBe(4950);
    expect(discountValueToApi('amount', '0.99')).toBeNull();
    expect(discountValueToApi('amount', '1')).toBe(100);
  });

  it('validate: โค้ด A–Z0–9-_ 3–40, มูลค่า, ช่วงเวลา, จำนวนครั้ง', () => {
    expect(validateDiscountForm(validForm(), bangkokInputToIso)).toEqual({});
    expect(validateDiscountForm(validForm({ code: 'ab' }), bangkokInputToIso).code).toBeTruthy();
    expect(validateDiscountForm(validForm({ code: 'NEW*YEAR' }), bangkokInputToIso).code).toBeTruthy();
    expect(validateDiscountForm(validForm({ code: 'A'.repeat(41) }), bangkokInputToIso).code).toBeTruthy();
    // ตัวพิมพ์เล็กแปลงเป็นใหญ่ก่อนตรวจ
    expect(validateDiscountForm(validForm({ code: 'new-year_20' }), bangkokInputToIso)).toEqual({});
    const errors = validateDiscountForm(
      validForm({
        code: '',
        discountType: 'amount',
        value: '0.5',
        startsAt: '2026-12-31T10:00',
        endsAt: '2026-12-01T10:00',
        maxRedemptions: '0',
        perUserLimit: '',
      }),
      bangkokInputToIso,
    );
    expect(errors).toEqual({
      code: 'กรุณากรอกโค้ด',
      value: 'ส่วนลดต้องเป็นจำนวนบาทตั้งแต่ 1 บาทขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)',
      endsAt: 'วันสิ้นสุดต้องอยู่หลังวันเริ่ม',
      maxRedemptions: 'จำนวนครั้งสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 1 (ว่าง = ไม่จำกัด)',
      perUserLimit: 'ใช้ได้ต่อบัญชีต้องเป็นจำนวนเต็ม 1–1,000',
    });
    expect(firstDiscountErrorField(errors)).toBe('code');
  });

  it('ฟอร์ม → body: บาทเป็นสตางค์, เวลาไทยเป็น ISO, ว่าง = null, ไม่เลือกสนาม → ไม่ส่ง planId', () => {
    expect(
      discountFormToInput(
        validForm({
          code: 'baht50',
          description: '  ',
          discountType: 'amount',
          value: '50',
          venueId: '',
          planId: 'p-pro',
          endsAt: '2026-12-31T23:59',
          maxRedemptions: '',
          perUserLimit: '2',
          isActive: false,
        }),
        bangkokInputToIso,
      ),
    ).toEqual({
      code: 'BAHT50',
      description: null,
      discountType: 'amount',
      discountValue: 5000,
      venueId: null,
      planId: null,
      startsAt: null,
      endsAt: '2026-12-31T16:59:00.000Z',
      maxRedemptions: null,
      perUserLimit: 2,
      isActive: false,
    });
  });

  it('แก้ไข: โหลดค่าเดิมเข้าฟอร์ม และส่งเฉพาะฟิลด์ที่เปลี่ยน (ไม่แตะโค้ด/มูลค่า → ไม่ส่ง)', () => {
    const original = code({ discountType: 'amount', discountValue: 5000 });
    const form = createDiscountForm(original);
    expect(form).toMatchObject({ code: 'NEWYEAR20', value: '50', venueId: 'v1', planId: 'p-pro', endsAt: '2026-12-31T23:59', maxRedemptions: '100' });
    // ไม่เปลี่ยนอะไร → {}
    expect(diffDiscountInput(original, discountFormToInput(form, bangkokInputToIso))).toEqual({});
    // เปลี่ยนจำนวนครั้งสูงสุด + ปิด → ส่งแค่ 2 ฟิลด์
    expect(
      diffDiscountInput(original, discountFormToInput({ ...form, maxRedemptions: '', isActive: false }, bangkokInputToIso)),
    ).toEqual({ maxRedemptions: null, isActive: false });
    // เปลี่ยนมูลค่า → ส่ง discountValue (API ตอบ 409 ถ้ามีการใช้แล้ว)
    expect(diffDiscountInput(original, discountFormToInput({ ...form, value: '60' }, bangkokInputToIso))).toEqual({
      discountValue: 6000,
    });
  });
});
