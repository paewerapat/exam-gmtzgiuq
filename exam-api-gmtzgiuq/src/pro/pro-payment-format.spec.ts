import {
  DEFAULT_CARD_FAILURE,
  DEFAULT_PROMPTPAY_FAILURE,
  addYearsToDate,
  bangkokDate,
  computeAmounts,
  parseOmiseDate,
  thaiFailureMessage,
} from './pro-payment-format';

describe('pro-payment-format (task 18)', () => {
  it('VAT off: total = price (AC2)', () => {
    expect(computeAmounts(19900, false)).toEqual({
      subtotalSatang: 19900,
      vatSatang: 0,
      totalSatang: 19900,
    });
  });

  it('VAT on: price + round(price × 7%) (AC2)', () => {
    expect(computeAmounts(29900, true)).toEqual({
      subtotalSatang: 29900,
      vatSatang: 2093,
      totalSatang: 31993,
    });
    // 19950 × 7% = 1396.5 → 1397 (half up)
    expect(computeAmounts(19950, true).vatSatang).toBe(1397);
    // 19921 × 7% = 1394.47 → 1394
    expect(computeAmounts(19921, true).vatSatang).toBe(1394);
  });

  it('Thai messages for the common Opn failure codes, a fallback for the rest', () => {
    for (const code of [
      'insufficient_fund',
      'stolen_or_lost_card',
      'failed_processing',
      'payment_rejected',
      'invalid_security_code',
      'failed_fraud_check',
    ]) {
      const text = thaiFailureMessage(code, 'card');
      expect(text).toMatch(/[฀-๿]/);
      expect(text).not.toBe(DEFAULT_CARD_FAILURE);
    }
    expect(thaiFailureMessage('something_new', 'card')).toBe(
      DEFAULT_CARD_FAILURE,
    );
    expect(thaiFailureMessage(null, 'promptpay')).toBe(
      DEFAULT_PROMPTPAY_FAILURE,
    );
    // round 2: a PromptPay failure never gets a card message
    expect(thaiFailureMessage('payment_rejected', 'promptpay')).toBe(
      DEFAULT_PROMPTPAY_FAILURE,
    );
    expect(DEFAULT_PROMPTPAY_FAILURE).toContain(
      'ชำระด้วย PromptPay ไม่สำเร็จ กรุณาสร้าง QR ใหม่',
    );
    expect(DEFAULT_CARD_FAILURE).toBe(
      'ทำรายการไม่สำเร็จ กรุณาลองบัตรอื่นหรือติดต่อธนาคาร',
    );
  });

  it('schedule dates are Thai calendar dates', () => {
    // 2026-12-13 17:30 UTC = 2026-12-14 00:30 in Bangkok
    expect(bangkokDate(new Date('2026-12-13T17:30:00Z'))).toBe('2026-12-14');
    expect(bangkokDate(new Date('2026-12-13T16:59:59Z'))).toBe('2026-12-13');
    expect(addYearsToDate('2026-12-13', 5)).toBe('2031-12-13');
    expect(addYearsToDate('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('Opn dates → whole seconds, junk → null', () => {
    expect(parseOmiseDate('2026-11-14T07:27:48Z')).toEqual(
      new Date('2026-11-14T07:27:48Z'),
    );
    expect(parseOmiseDate('')).toBeNull();
    expect(parseOmiseDate(null)).toBeNull();
    expect(parseOmiseDate('nope')).toBeNull();
  });
});
