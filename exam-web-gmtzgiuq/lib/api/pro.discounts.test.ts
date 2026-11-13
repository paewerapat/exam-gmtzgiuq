import {
  createCheckout,
  getProPayment,
  createProDiscountCode,
  getCheckoutQuote,
  getProAdminPayments,
  getProDiscountCodes,
  getProDiscountRedemptions,
  updateProDiscountCode,
} from './pro';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const lastCall = (fetchMock: jest.Mock) => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const req = (init ?? {}) as RequestInit;
  return { url: new URL(url as string), init: req, body: req.body ? JSON.parse(String(req.body)) : undefined };
};

const rawQuote = {
  plan: { id: 'p1', code: 'pro', name: 'PRO', venue: { id: 'v1', key: 'netsat', name: 'NETSAT' } },
  subtotalSatang: 19900,
  vatSatang: 1114,
  totalSatang: 17034,
  vatEnabled: true,
  current: null,
  changesPlan: false,
};

describe('lib/api/pro — โค้ดส่วนลด (task 19 สัญญา)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 't1');
  });

  it('getCheckoutQuote + code: ส่ง ?code= (ตัดช่องว่าง) และอ่าน discount / renewalTotalSatang', async () => {
    const fetchMock = mockFetch({
      ...rawQuote,
      discount: { code: 'NEWYEAR20', type: 'percent', value: 20, discountSatang: '3980' },
      discountError: null,
      renewalTotalSatang: 21293,
    });
    const q = await getCheckoutQuote('p1', undefined, ' NEWYEAR20 ');
    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/checkout/quote');
    expect(url.searchParams.get('planId')).toBe('p1');
    expect(url.searchParams.get('code')).toBe('NEWYEAR20');
    expect(q.discount).toEqual({ code: 'NEWYEAR20', type: 'percent', value: 20, discountSatang: 3980 });
    expect(q.discountError).toBeNull();
    expect(q.renewalTotalSatang).toBe(21293);
  });

  it('getCheckoutQuote: โค้ดใช้ไม่ได้ → discount null + discountError / ไม่ส่งโค้ด → ไม่มี ?code= และ renewal = total', async () => {
    let fetchMock = mockFetch({
      ...rawQuote,
      totalSatang: 21293,
      discount: null,
      discountError: { errorCode: 'DISCOUNT_EXPIRED', message: 'โค้ดส่วนลดนี้หมดอายุแล้ว' },
      renewalTotalSatang: 21293,
    });
    let q = await getCheckoutQuote('p1', undefined, 'OLD');
    expect(q.discount).toBeNull();
    expect(q.discountError).toEqual({ errorCode: 'DISCOUNT_EXPIRED', message: 'โค้ดส่วนลดนี้หมดอายุแล้ว' });

    fetchMock = mockFetch({ ...rawQuote, totalSatang: 21293 });
    q = await getCheckoutQuote('p1');
    expect(lastCall(fetchMock).url.searchParams.has('code')).toBe(false);
    expect(q).toMatchObject({ discount: null, discountError: null, renewalTotalSatang: 21293 });
  });

  it('createCheckout: discountCode ติดไปทั้งบัตรและ PromptPay (ไม่ส่งยอดเงิน) / ไม่มีโค้ด → ไม่ส่งฟิลด์', async () => {
    let fetchMock = mockFetch({ paymentId: 'pay1', status: 'successful' });
    await createCheckout({ planId: 'p1', method: 'card', cardToken: 'tokn_1', discountCode: 'NEWYEAR20' });
    expect(lastCall(fetchMock).body).toEqual({ planId: 'p1', method: 'card', cardToken: 'tokn_1', discountCode: 'NEWYEAR20' });

    fetchMock = mockFetch({ paymentId: 'pay2', status: 'pending' });
    await createCheckout({ planId: 'p1', method: 'promptpay', discountCode: 'BAHT50' });
    expect(lastCall(fetchMock).body).toEqual({ planId: 'p1', method: 'promptpay', discountCode: 'BAHT50' });

    fetchMock = mockFetch({ paymentId: 'pay3', status: 'pending' });
    await createCheckout({ planId: 'p1', method: 'promptpay', discountCode: undefined });
    expect(lastCall(fetchMock).body).toEqual({ planId: 'p1', method: 'promptpay' });
  });

  it('createCheckout: โค้ดผิดตอน checkout → ApiError มี errorCode', async () => {
    mockFetch({ statusCode: 400, message: 'โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว', errorCode: 'DISCOUNT_USED_UP' }, 400);
    const err = await createCheckout({ planId: 'p1', method: 'promptpay', discountCode: 'X' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, errorCode: 'DISCOUNT_USED_UP' });
  });

  it('getProAdminPayments: อ่าน discountSatang + discountCode (string หรือ { code })', async () => {
    mockFetch({
      items: [
        { id: 'a1', discountSatang: '3980', discountCode: 'NEWYEAR20' },
        { id: 'a2', discountSatang: 5000, discountCode: { id: 'd2', code: 'BAHT50' } },
        { id: 'a3' },
      ],
      total: 3,
    });
    const res = await getProAdminPayments();
    expect(res.items.map((p) => [p.discountSatang, p.discountCode])).toEqual([
      [3980, 'NEWYEAR20'],
      [5000, 'BAHT50'],
      [0, null],
    ]);
  });

  it('getProDiscountCodes: query page/limit/search/isActive + normalize', async () => {
    const fetchMock = mockFetch({
      items: [
        {
          id: 'd1',
          code: 'NEWYEAR20',
          description: null,
          discountType: 'percent',
          discountValue: 20,
          venueId: 'v1',
          planId: null,
          startsAt: null,
          endsAt: '2026-12-31T16:59:00.000Z',
          maxRedemptions: null,
          perUserLimit: 1,
          isActive: 1,
          redeemedCount: '4',
          createdAt: '2026-11-13T00:00:00.000Z',
          updatedAt: '2026-11-13T00:00:00.000Z',
        },
      ],
      total: 1,
    });
    const res = await getProDiscountCodes({ page: 2, limit: 500, search: ' new ', isActive: false });
    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/admin/discount-codes');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('search')).toBe('new');
    expect(url.searchParams.get('isActive')).toBe('false');
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      reservedCount: 0,
      status: '',
      code: 'NEWYEAR20',
      discountType: 'percent',
      discountValue: 20,
      venueId: 'v1',
      planId: null,
      maxRedemptions: null,
      perUserLimit: 1,
      isActive: true,
      redeemedCount: 4,
    });

    mockFetch({ items: [], total: 0 });
    await getProDiscountCodes();
    expect(lastCall(global.fetch as jest.Mock).url.searchParams.has('isActive')).toBe(false);
  });

  it('create (POST) / update (PUT เฉพาะที่ส่ง) / redemptions (GET ?page&limit)', async () => {
    let fetchMock = mockFetch({ id: 'd1', code: 'BAHT50', discountType: 'amount', discountValue: 5000, perUserLimit: 1 }, 201);
    const input = {
      code: 'BAHT50',
      description: null,
      discountType: 'amount' as const,
      discountValue: 5000,
      venueId: null,
      planId: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perUserLimit: 1,
      isActive: true,
    };
    const created = await createProDiscountCode(input);
    let req = lastCall(fetchMock);
    expect(req.url.pathname).toBe('/pro/admin/discount-codes');
    expect(req.init.method).toBe('POST');
    expect(req.body).toEqual(input);
    expect(created).toMatchObject({ code: 'BAHT50', discountType: 'amount', discountValue: 5000 });

    fetchMock = mockFetch({ id: 'd1', code: 'BAHT50', isActive: false });
    const updated = await updateProDiscountCode('d1', { isActive: false });
    req = lastCall(fetchMock);
    expect(req.url.pathname).toBe('/pro/admin/discount-codes/d1');
    expect(req.init.method).toBe('PUT');
    expect(req.body).toEqual({ isActive: false });
    expect(updated.isActive).toBe(false);

    fetchMock = mockFetch({
      items: [
        { user: { id: 'u1', email: 'a@x.com', firstName: 'A', lastName: null }, paymentId: 'pay1', amountSatang: '3980', status: 'used', createdAt: '2026-11-13T00:00:00.000Z' },
        { user: null, paymentId: 'pay2', amountSatang: 3980, status: 'released', createdAt: '2026-11-12T00:00:00.000Z' },
      ],
      total: 2,
    });
    const page = await getProDiscountRedemptions('d1', { page: 1, limit: 200 });
    req = lastCall(fetchMock);
    expect(req.url.pathname).toBe('/pro/admin/discount-codes/d1/redemptions');
    expect(req.url.searchParams.get('limit')).toBe('100');
    expect(page.items[0]).toMatchObject({ paymentId: 'pay1', amountSatang: 3980, status: 'used' });
    expect(page.items[1].user).toBeNull();
  });

  it('update หลังมีการใช้แล้ว → ApiError 409 พร้อมข้อความไทยจาก API', async () => {
    mockFetch({ statusCode: 409, message: 'โค้ดนี้มีการใช้แล้ว แก้ตัวโค้ด ประเภท หรือมูลค่าส่วนลดไม่ได้', errorCode: 'DISCOUNT_IN_USE' }, 409);
    const err = await updateProDiscountCode('d1', { discountValue: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, errorCode: 'DISCOUNT_IN_USE' });
  });

  it('รอบ 2: list อ่าน status + reservedCount จาก API', async () => {
    mockFetch({ items: [{ id: 'd1', code: 'X1', reservedCount: '2', redeemedCount: 1, maxRedemptions: 3, status: 'used_up' }], total: 1 });
    const res = await getProDiscountCodes();
    expect(res.items[0]).toMatchObject({ reservedCount: 2, redeemedCount: 1, maxRedemptions: 3, status: 'used_up' });
  });

  it('รอบ 2: payment canceled (ถูกแทนที่) → status canceled ไม่ส่ง QR ต่อแม้ API จะส่งมา', async () => {
    mockFetch({
      id: 'pay1',
      status: 'canceled',
      method: 'promptpay',
      totalSatang: 21293,
      qrImageUrl: 'https://cdn.omise.co/qr/old.png',
      failureMessage: 'ถูกแทนที่ด้วยรายการชำระใหม่',
      plan: { id: 'p1', name: 'PRO' },
      venue: { name: 'NETSAT' },
    });
    const d = await getProPayment('pay1');
    expect(d).toMatchObject({ status: 'canceled', qrImageUrl: null, failureMessage: 'ถูกแทนที่ด้วยรายการชำระใหม่' });
  });

  it('รอบ 3: payment detail อ่าน refundRequired (ไม่ส่ง = false)', async () => {
    mockFetch({ id: 'pay1', status: 'successful', refundRequired: 1 });
    expect((await getProPayment('pay1')).refundRequired).toBe(true);
    mockFetch({ id: 'pay2', status: 'successful' });
    expect((await getProPayment('pay2')).refundRequired).toBe(false);
  });
});
