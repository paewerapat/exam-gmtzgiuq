import {
  RESERVATION_HOLD_MS,
  computeDiscountSatang,
  discountScopeError,
  discountStateError,
  discountedAmounts,
  isLiveReservation,
  normalizeDiscountCode,
  renewalTotalOf,
} from './pro-discount-rules';

const NOW = new Date('2026-11-15T05:00:00.000Z');

describe('Pro discount rules (task 19)', () => {
  it('normalizeDiscountCode: trims spaces, upper case, A–Z 0–9 - _ 3–40', () => {
    expect(normalizeDiscountCode(' newyear20 ')).toBe('NEWYEAR20');
    expect(normalizeDiscountCode('new year_2026-x')).toBe('NEWYEAR_2026-X');
    expect(normalizeDiscountCode('ab')).toBeNull();
    expect(normalizeDiscountCode('A'.repeat(41))).toBeNull();
    expect(normalizeDiscountCode('ลดราคา')).toBeNull();
    expect(normalizeDiscountCode('NEW#20')).toBeNull();
    expect(normalizeDiscountCode(20)).toBeNull();
    expect(normalizeDiscountCode(undefined)).toBeNull();
    expect(normalizeDiscountCode('A'.repeat(101))).toBeNull();
  });

  it('computeDiscountSatang: percent rounded, amount capped at the price', () => {
    expect(computeDiscountSatang('percent', 20, 19900)).toBe(3980);
    expect(computeDiscountSatang('percent', 15, 19950)).toBe(2993); // 2992.5
    expect(computeDiscountSatang('percent', 100, 19900)).toBe(19900);
    expect(computeDiscountSatang('percent', 150, 19900)).toBe(19900);
    expect(computeDiscountSatang('amount', 5000, 19900)).toBe(5000);
    expect(computeDiscountSatang('amount', 99900, 19900)).toBe(19900);
  });

  it('discountedAmounts: VAT on the price after the discount; total ≥ 20 baht; whole price → too large', () => {
    expect(discountedAmounts(19900, true, 3980)).toEqual({
      subtotalSatang: 19900,
      discountSatang: 3980,
      vatSatang: 1114,
      totalSatang: 17034,
    });
    expect(discountedAmounts(19900, false, 5000)).toEqual({
      subtotalSatang: 19900,
      discountSatang: 5000,
      vatSatang: 0,
      totalSatang: 14900,
    });
    expect(discountedAmounts(19900, false, 0)).toEqual({
      subtotalSatang: 19900,
      discountSatang: 0,
      vatSatang: 0,
      totalSatang: 19900,
    });
    // 20 baht exactly is fine, 19.99 is not
    expect(discountedAmounts(19900, false, 17900)).toMatchObject({
      totalSatang: 2000,
    });
    expect(discountedAmounts(19900, false, 17901)).toEqual({
      error: 'AMOUNT_TOO_LOW',
    });
    // VAT can lift it over the minimum
    expect(discountedAmounts(19900, true, 18000)).toMatchObject({
      vatSatang: 133,
      totalSatang: 2033,
    });
    expect(discountedAmounts(19900, true, 19900)).toEqual({
      error: 'DISCOUNT_TOO_LARGE',
    });
  });

  it('discountStateError: off, not started, ended; endsAt itself still valid', () => {
    const base = { isActive: 1, startsAt: null, endsAt: null };
    expect(discountStateError(base, NOW)).toBeNull();
    expect(discountStateError({ ...base, isActive: 0 }, NOW)).toBe(
      'DISCOUNT_INACTIVE',
    );
    expect(discountStateError({ ...base, isActive: false }, NOW)).toBe(
      'DISCOUNT_INACTIVE',
    );
    expect(
      discountStateError(
        { ...base, startsAt: new Date(NOW.getTime() + 1) },
        NOW,
      ),
    ).toBe('DISCOUNT_NOT_STARTED');
    expect(
      discountStateError({ ...base, startsAt: new Date(NOW) }, NOW),
    ).toBeNull();
    expect(
      discountStateError({ ...base, endsAt: new Date(NOW.getTime() - 1) }, NOW),
    ).toBe('DISCOUNT_EXPIRED');
    expect(discountStateError({ ...base, endsAt: new Date(NOW) }, NOW)).toBe(
      null,
    );
  });

  it('discountScopeError: venue / plan must match when set', () => {
    const plan = { id: 'p1', venueId: 'v1' };
    expect(
      discountScopeError({ venueId: null, planId: null }, plan),
    ).toBeNull();
    expect(
      discountScopeError({ venueId: 'v1', planId: null }, plan),
    ).toBeNull();
    expect(
      discountScopeError({ venueId: 'v1', planId: 'p1' }, plan),
    ).toBeNull();
    expect(discountScopeError({ venueId: 'v2', planId: null }, plan)).toBe(
      'DISCOUNT_NOT_APPLICABLE',
    );
    expect(discountScopeError({ venueId: 'v1', planId: 'p2' }, plan)).toBe(
      'DISCOUNT_NOT_APPLICABLE',
    );
  });

  it('renewalTotalOf: full price + VAT when the payment was discounted, else its total', () => {
    expect(
      renewalTotalOf({
        subtotalSatang: 19900,
        discountSatang: 3980,
        vatSatang: 1114,
        totalSatang: 17034,
      }),
    ).toBe(21293);
    expect(
      renewalTotalOf({
        subtotalSatang: 19900,
        discountSatang: 5000,
        vatSatang: 0,
        totalSatang: 14900,
      }),
    ).toBe(19900);
    // no discount: unchanged (task 18 behaviour)
    expect(
      renewalTotalOf({
        subtotalSatang: 18598,
        discountSatang: 0,
        vatSatang: 1302,
        totalSatang: 19900,
      }),
    ).toBe(19900);
  });

  it('isLiveReservation: pending and not expired (no expiry → made within a day)', () => {
    const pending = { status: 'pending', expiresAt: null, createdAt: NOW };
    expect(isLiveReservation(pending, NOW)).toBe(true);
    expect(isLiveReservation({ ...pending, status: 'failed' }, NOW)).toBe(
      false,
    );
    expect(isLiveReservation({ ...pending, status: 'successful' }, NOW)).toBe(
      false,
    );
    expect(isLiveReservation(null, NOW)).toBe(false);
    expect(
      isLiveReservation(
        { ...pending, expiresAt: new Date(NOW.getTime() + 1000) },
        NOW,
      ),
    ).toBe(true);
    expect(
      isLiveReservation({ ...pending, expiresAt: new Date(NOW) }, NOW),
    ).toBe(false);
    expect(
      isLiveReservation(
        {
          ...pending,
          createdAt: new Date(NOW.getTime() - RESERVATION_HOLD_MS - 1),
        },
        NOW,
      ),
    ).toBe(false);
  });
});
