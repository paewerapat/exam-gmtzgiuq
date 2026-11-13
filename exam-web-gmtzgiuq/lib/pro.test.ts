import type { Comparison, ProPlanInput } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import {
  addGroup,
  displayUserName,
  proErrorMessage,
  addRow,
  bahtToSatang,
  changeCellType,
  COMPARISON_LIMITS,
  DEFAULT_ENTITLEMENTS,
  effectiveSubscriptionStatus,
  findLiveSubscription,
  formatSatang,
  moveGroup,
  moveItem,
  moveRow,
  removeGroup,
  removeRow,
  satangToBahtInput,
  setCell,
  subscriptionStatusLabel,
  updateGroupTitle,
  updateRow,
  validateComparison,
  validatePlanInput,
  validateVenueInput,
} from './pro';

const NOW = new Date('2026-11-12T00:00:00.000Z');
const FUTURE = '2026-12-12T00:00:00.000Z';
const PAST = '2026-11-01T00:00:00.000Z';

const base = (): Comparison => ({
  groups: [
    {
      title: 'PREDICTED EXAM',
      rows: [
        { label: 'แถว A', cells: { free: { type: 'cross' }, pro: { type: 'check' } } },
        { label: 'แถว B', cells: { pro: { type: 'text', text: '2 ชุด', subtext: 'ต่อ 1 วิชา' } } },
        { label: 'แถว C', cells: {} },
      ],
    },
    { title: 'ANALYTICS', rows: [] },
  ],
});

const plan = (patch: Partial<ProPlanInput> = {}): ProPlanInput => ({
  code: 'pro',
  rank: 1,
  name: 'PRO',
  tagline: null,
  priceSatang: 19900,
  priceUnit: '/ เดือน',
  priceNote: null,
  periodDays: 30,
  buttonText: 'สมัคร PRO',
  badge: null,
  highlight: false,
  sortOrder: 1,
  isVisible: true,
  isPurchasable: true,
  entitlements: { ...DEFAULT_ENTITLEMENTS },
  ...patch,
});

describe('ราคา', () => {
  it('formatSatang: ไม่มีทศนิยมเมื่อลงตัว / มีทศนิยม 2 ตำแหน่งเมื่อไม่ลงตัว / มีคั่นหลักพัน', () => {
    expect(formatSatang(0)).toBe('฿0');
    expect(formatSatang(19900)).toBe('฿199');
    expect(formatSatang(19950)).toBe('฿199.50');
    expect(formatSatang(129900)).toBe('฿1,299');
    expect(formatSatang(Number.NaN)).toBe('฿0');
  });

  it('bahtToSatang / satangToBahtInput', () => {
    expect(bahtToSatang('199')).toBe(19900);
    expect(bahtToSatang('199.5')).toBe(19950);
    expect(bahtToSatang('1,299.99')).toBe(129999);
    expect(bahtToSatang('-1')).toBeNull();
    expect(bahtToSatang('1.234')).toBeNull();
    expect(bahtToSatang('abc')).toBeNull();
    expect(satangToBahtInput(19900)).toBe('199');
    expect(satangToBahtInput(19950)).toBe('199.50');
  });
});

describe('สถานะสิทธิ์', () => {
  it('findLiveSubscription: เฉพาะ active ที่ยังไม่หมดอายุของสนามนั้น', () => {
    const my = [
      { venueId: 'v1', planId: 'p-old', planCode: 'pro', status: 'active', currentPeriodEnd: PAST, autoRenew: false },
      { venueId: 'v1', planId: 'p-max', planCode: 'max', status: 'active', currentPeriodEnd: FUTURE, autoRenew: false },
      { venueId: 'v2', planId: 'p-x', planCode: 'pro', status: 'revoked', currentPeriodEnd: FUTURE, autoRenew: false },
    ];
    expect(findLiveSubscription(my, 'v1', NOW)?.planId).toBe('p-max');
    expect(findLiveSubscription(my, 'v2', NOW)).toBeNull();
    expect(findLiveSubscription(my, 'v3', NOW)).toBeNull();
  });

  it('effectiveSubscriptionStatus: active ที่เลยวันหมดอายุ → expired + ป้ายไทย', () => {
    expect(effectiveSubscriptionStatus({ status: 'active', currentPeriodEnd: PAST }, NOW)).toBe('expired');
    expect(effectiveSubscriptionStatus({ status: 'active', currentPeriodEnd: FUTURE }, NOW)).toBe('active');
    expect(effectiveSubscriptionStatus({ status: 'revoked', currentPeriodEnd: FUTURE }, NOW)).toBe('revoked');
    expect(subscriptionStatusLabel('active')).toBe('ใช้งานอยู่');
    expect(subscriptionStatusLabel('expired')).toBe('หมดอายุ');
    expect(subscriptionStatusLabel('revoked')).toBe('ถอนสิทธิ์แล้ว');
  });
});

describe('editor ตารางเปรียบเทียบ (pure)', () => {
  it('moveItem: สลับกับเพื่อนบ้าน ขอบคืนของเดิม', () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem(a, 2, -1)).toEqual([1, 3, 2]);
    expect(moveItem(a, 0, -1)).toBe(a);
    expect(moveItem(a, 2, 1)).toBe(a);
  });

  it('เพิ่ม/ลบ/เลื่อน/เปลี่ยนชื่อกลุ่ม โดยไม่แก้ของเดิม', () => {
    const c = base();
    const added = addGroup(c, 'QUESTION BANK');
    expect(added.groups.map((g) => g.title)).toEqual(['PREDICTED EXAM', 'ANALYTICS', 'QUESTION BANK']);
    expect(added.groups[2].id).toBeTruthy();
    expect(c.groups).toHaveLength(2);
    expect(moveGroup(c, 1, -1).groups.map((g) => g.title)).toEqual(['ANALYTICS', 'PREDICTED EXAM']);
    expect(removeGroup(c, 0).groups.map((g) => g.title)).toEqual(['ANALYTICS']);
    expect(updateGroupTitle(c, 1, 'X').groups[1].title).toBe('X');
  });

  it('เพิ่ม/ลบ/เลื่อน/แก้แถว', () => {
    const c = base();
    expect(addRow(c, 1).groups[1].rows).toHaveLength(1);
    expect(moveRow(c, 0, 0, 1).groups[0].rows.map((r) => r.label)).toEqual(['แถว B', 'แถว A', 'แถว C']);
    expect(moveRow(c, 0, 2, -1).groups[0].rows.map((r) => r.label)).toEqual(['แถว A', 'แถว C', 'แถว B']);
    expect(removeRow(c, 0, 1).groups[0].rows.map((r) => r.label)).toEqual(['แถว A', 'แถว C']);
    expect(updateRow(c, 0, 2, { sublabel: 'รวม 4 วิชา' }).groups[0].rows[2].sublabel).toBe('รวม 4 วิชา');
    expect(c.groups[0].rows.map((r) => r.label)).toEqual(['แถว A', 'แถว B', 'แถว C']);
  });

  it('ขีดจำกัดกลุ่ม/แถว: เพิ่มเกินไม่ได้', () => {
    let c: Comparison = { groups: [] };
    for (let i = 0; i < COMPARISON_LIMITS.groups + 3; i++) c = addGroup(c, `G${i}`);
    expect(c.groups).toHaveLength(COMPARISON_LIMITS.groups);
    for (let i = 0; i < COMPARISON_LIMITS.rowsPerGroup + 3; i++) c = addRow(c, 0);
    expect(c.groups[0].rows).toHaveLength(COMPARISON_LIMITS.rowsPerGroup);
  });

  it('setCell / changeCellType: ✓ ✕ ข้อความ ว่าง และเก็บข้อความเดิมไว้เมื่อสลับชนิด', () => {
    const c = base();
    expect(setCell(c, 0, 2, 'max', { type: 'check' }).groups[0].rows[2].cells).toEqual({ max: { type: 'check' } });
    expect(changeCellType(c, 0, 0, 'free', 'none').groups[0].rows[0].cells).toEqual({ pro: { type: 'check' } });
    const toCheck = changeCellType(c, 0, 1, 'pro', 'check');
    expect(toCheck.groups[0].rows[1].cells.pro.type).toBe('check');
    const back = changeCellType(toCheck, 0, 1, 'pro', 'text');
    expect(back.groups[0].rows[1].cells.pro).toEqual({ type: 'text', text: '2 ชุด', subtext: 'ต่อ 1 วิชา' });
    expect(changeCellType(c, 0, 2, 'free', 'text').groups[0].rows[2].cells.free).toMatchObject({ type: 'text', text: '' });
  });

  it('validateComparison: ข้อความไทยระบุกลุ่ม/แถว', () => {
    expect(validateComparison(base())).toBeNull();
    expect(validateComparison(updateGroupTitle(base(), 0, ' '))).toBe('กลุ่มที่ 1: กรุณากรอกชื่อกลุ่ม');
    expect(validateComparison(updateRow(base(), 0, 1, { label: '' }))).toBe('กลุ่มที่ 1 แถวที่ 2: กรุณากรอกชื่อแถว');
    expect(validateComparison(updateRow(base(), 0, 0, { label: 'x'.repeat(151) }))).toMatch(/ยาวเกิน 150/);
    expect(validateComparison(setCell(base(), 0, 0, 'pro', { type: 'text', text: '' }))).toMatch(/ต้องมีข้อความ/);
    expect(validateComparison(setCell(base(), 0, 0, 'pro', { type: 'text', text: 'x'.repeat(51) }))).toMatch(/ยาวเกิน 50/);
    expect(validateComparison(setCell(base(), 0, 0, 'pro', { type: 'text', text: 'ok', subtext: 'x'.repeat(101) }))).toMatch(/ยาวเกิน 100/);
  });
});

describe('validatePlanInput / validateVenueInput', () => {
  it('แพ็กเกจปกติผ่าน', () => {
    expect(validatePlanInput(plan())).toBeNull();
    expect(validatePlanInput(plan({ code: 'free', rank: 0, priceSatang: 0, isPurchasable: false }))).toBeNull();
  });

  it('rank 0 ต้องราคา 0 และซื้อไม่ได้ / รหัสซ้ำ / รหัสผิดรูป / predictedSets', () => {
    expect(validatePlanInput(plan({ rank: 0, priceSatang: 100, isPurchasable: false }))).toBe('แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0');
    expect(validatePlanInput(plan({ rank: 0, priceSatang: 0, isPurchasable: true }))).toBe('แพ็กเกจระดับ 0 (ฟรี) เปิดให้ซื้อไม่ได้');
    expect(validatePlanInput(plan(), ['pro'])).toBe('รหัสแพ็กเกจนี้มีอยู่แล้วในสนามนี้');
    expect(validatePlanInput(plan({ code: 'PRO' }))).toMatch(/a-z/);
    expect(validatePlanInput(plan({ code: '-pro' }))).toMatch(/a-z/);
    expect(validatePlanInput(plan({ periodDays: 0 }))).toMatch(/อายุแพ็กเกจ/);
    expect(validatePlanInput(plan({ entitlements: { ...DEFAULT_ENTITLEMENTS, predictedSets: -1 } }))).toMatch(/Predicted/);
    expect(validatePlanInput(plan({ entitlements: { ...DEFAULT_ENTITLEMENTS, predictedSets: null } }))).toBeNull();
    expect(validatePlanInput(plan({ buttonText: ' ' }))).toBe('กรุณากรอกข้อความปุ่ม');
  });

  it('รอบ 2: ระดับ 0 + mockPurchase / มีแพ็กเกจฟรีแล้ว / เปิดขายแต่ราคา 0', () => {
    const free = plan({ code: 'free', rank: 0, priceSatang: 0, isPurchasable: false });
    expect(validatePlanInput({ ...free, entitlements: { ...DEFAULT_ENTITLEMENTS, mockPurchase: true } })).toMatch(
      /ระดับ 0 \(ฟรี\) ให้สิทธิ์ "ชุด Mock ที่ต้องซื้อ" ไม่ได้/,
    );
    expect(validatePlanInput(free, [], true)).toBe('สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อยู่แล้ว มีได้สนามละ 1 แพ็กเกจ');
    expect(validatePlanInput(plan(), [], true)).toBeNull();
    expect(validatePlanInput(plan({ priceSatang: 0 }))).toBe('แพ็กเกจที่เปิดให้ซื้อต้องมีราคามากกว่า 0');
    expect(validatePlanInput(plan({ priceSatang: 0, isPurchasable: false }))).toBeNull();
  });

  it('proErrorMessage: errorCode ที่รู้จัก → ไทย / ข้อความไทยจาก API → ตามนั้น / อังกฤษ → fallback', () => {
    expect(proErrorMessage(new ApiError('Failed to create plan', 409, 'FREE_PLAN_EXISTS'), 'x')).toBe(
      'สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อยู่แล้ว มีได้สนามละ 1 แพ็กเกจ',
    );
    expect(proErrorMessage(new ApiError('อื่น ๆ', 400, 'SOMETHING'), 'x')).toBe('อื่น ๆ');
    expect(proErrorMessage(new ApiError('Failed to update plan', 500), 'บันทึกไม่สำเร็จ')).toBe('บันทึกไม่สำเร็จ');
    expect(proErrorMessage(new Error('Session expired. Please log in again.'), 'บันทึกไม่สำเร็จ')).toBe('บันทึกไม่สำเร็จ');
    expect(proErrorMessage(null, 'f')).toBe('f');
  });

  it('displayUserName: null (ผู้ใช้ถูกลบ) / ไม่มีชื่อ → อีเมล', () => {
    expect(displayUserName(null)).toBe('(ผู้ใช้ถูกลบ)');
    expect(displayUserName({ email: 'a@x.com', firstName: null, lastName: null })).toBe('a@x.com');
    expect(displayUserName({ email: 'a@x.com', firstName: 'ก', lastName: 'ข' })).toBe('ก ข');
  });

  it('สนาม: key ซ้ำ/ผิดรูป ชื่อว่าง', () => {
    expect(validateVenueInput({ key: 'netsat', name: 'NETSAT', description: null })).toBeNull();
    expect(validateVenueInput({ key: 'netsat', name: 'NETSAT', description: null }, ['netsat'])).toBe('key นี้มีสนามอื่นใช้แล้ว');
    expect(validateVenueInput({ key: 'Net Sat', name: 'NETSAT', description: null })).toMatch(/a-z/);
    expect(validateVenueInput({ key: 'netsat', name: '', description: null })).toBe('กรุณากรอกชื่อสนาม');
  });
});
