import { ApiError } from './api/apiError';
import {
  checkoutHref,
  formatCardLabel,
  formatCountdown,
  isSafeHttpsUrl,
  loginHref,
  msUntil,
  NETWORK_ERROR_MESSAGE,
  paymentErrorMessage,
  paymentMethodLabel,
  paymentStatusClass,
  paymentStatusLabel,
  resultHref,
} from './pro-payments';

describe('lib/pro-payments (task 18)', () => {
  it('ลิงก์ checkout / result / login (encode ค่า)', () => {
    expect(checkoutHref('p 1')).toBe('/upgrade/checkout?plan=p%201');
    expect(resultHref('pay1')).toBe('/upgrade/result?payment=pay1');
    expect(resultHref('pay1', 'p1')).toBe('/upgrade/result?payment=pay1&plan=p1');
    expect(loginHref('/upgrade/checkout?plan=p1')).toBe('/login?redirect=%2Fupgrade%2Fcheckout%3Fplan%3Dp1');
  });

  it('ป้ายสถานะ/วิธีชำระภาษาไทย ค่าที่ไม่รู้จักแสดงตามเดิม และทุก class มี dark:', () => {
    expect(paymentStatusLabel('pending')).toBe('รอชำระ');
    expect(paymentStatusLabel('successful')).toBe('สำเร็จ');
    expect(paymentStatusLabel('failed')).toBe('ไม่สำเร็จ');
    expect(paymentStatusLabel('expired')).toBe('หมดอายุ');
    expect(paymentStatusLabel('weird')).toBe('weird');
    expect(paymentMethodLabel('card')).toBe('บัตรเครดิต/เดบิต');
    expect(paymentMethodLabel('promptpay')).toBe('PromptPay');
    for (const s of ['pending', 'successful', 'failed', 'expired', 'other']) {
      expect(paymentStatusClass(s)).toMatch(/dark:bg-/);
    }
  });

  it('formatCardLabel: ยี่ห้อ + •••• เลขท้าย 4 ตัว / ไม่มีเลข → null', () => {
    expect(formatCardLabel('Visa', '4242')).toBe('Visa •••• 4242');
    expect(formatCardLabel(null, '1234')).toBe('บัตร •••• 1234');
    expect(formatCardLabel('MasterCard', '00001111')).toBe('MasterCard •••• 1111');
    expect(formatCardLabel('Visa', null)).toBeNull();
    expect(formatCardLabel('Visa', '')).toBeNull();
  });

  it('นับถอยหลัง: msUntil + formatCountdown', () => {
    const now = Date.parse('2026-11-13T10:00:00Z');
    expect(msUntil('2026-11-13T10:12:34Z', now)).toBe(754000);
    expect(msUntil('2026-11-13T09:00:00Z', now)).toBe(0);
    expect(msUntil(null, now)).toBeNull();
    expect(msUntil('not a date', now)).toBeNull();
    expect(formatCountdown(754000)).toBe('12:34');
    expect(formatCountdown(3723000)).toBe('1:02:03');
    expect(formatCountdown(500)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('isSafeHttpsUrl: https เท่านั้น (กัน javascript: / http)', () => {
    expect(isSafeHttpsUrl('https://api.omise.co/payments/x/authorize')).toBe(true);
    expect(isSafeHttpsUrl('http://example.com')).toBe(false);
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('/relative')).toBe(false);
    expect(isSafeHttpsUrl(null)).toBe(false);
  });

  it('paymentErrorMessage: ข้อความไทยจาก API > ข้อความของ errorCode > เน็ตหลุด > fallback', () => {
    expect(paymentErrorMessage(new ApiError('ยอดเงินในบัตรไม่พอ', 400, 'CARD_DECLINED'), 'x')).toBe('ยอดเงินในบัตรไม่พอ');
    expect(paymentErrorMessage(new ApiError('Service Unavailable', 503, 'OMISE_UNAVAILABLE'), 'x')).toBe(
      'ระบบชำระเงินขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
    );
    expect(paymentErrorMessage(new TypeError('Failed to fetch'), 'x')).toBe(NETWORK_ERROR_MESSAGE);
    expect(paymentErrorMessage(new Error('boom'), 'ลองใหม่')).toBe('ลองใหม่');
  });
});

describe('สถานะ canceled (task 19 รอบ 2)', () => {
  it('ป้าย "ยกเลิกแล้ว" สีเทาพร้อม dark: + ข้อความเหตุผล', async () => {
    const { paymentStatusLabel, paymentStatusClass, PAYMENT_CANCELED_MESSAGE } = await import('./pro-payments');
    expect(paymentStatusLabel('canceled')).toBe('ยกเลิกแล้ว');
    expect(paymentStatusClass('canceled')).toContain('dark:bg-gray-700');
    expect(PAYMENT_CANCELED_MESSAGE).toBe('ถูกแทนที่ด้วยรายการชำระใหม่');
  });
});
