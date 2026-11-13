import {
  cancelProRenewal,
  changeProCard,
  createCheckout,
  getCheckoutQuote,
  getMyPro,
  getMyProPayments,
  getProAdminPayments,
  getProPayment,
  getProUpgrade,
  updateProPage,
} from './pro';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const lastCall = (fetchMock: jest.Mock) => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: new URL(url as string), init: (init ?? {}) as RequestInit };
};

describe('lib/api/pro — ชำระเงิน (task 18)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 't1');
  });

  it('getCheckoutQuote: GET /pro/checkout/quote?planId= + normalize', async () => {
    const fetchMock = mockFetch({
      plan: { id: 'p1', code: 'pro', name: 'PRO', venue: { id: 'v1', key: 'netsat', name: 'NETSAT' } },
      subtotalSatang: '19900',
      vatSatang: 1393,
      totalSatang: 21293,
      vatEnabled: 1,
      current: { planId: 'p0', currentPeriodEnd: '2026-12-01T00:00:00Z', autoRenew: 0 },
      changesPlan: true,
    });
    const q = await getCheckoutQuote('p1');
    const { url, init } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/checkout/quote');
    expect(url.searchParams.get('planId')).toBe('p1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t1');
    expect(q).toEqual({
      plan: { id: 'p1', code: 'pro', name: 'PRO', periodDays: 0, venue: { id: 'v1', key: 'netsat', name: 'NETSAT' } },
      subtotalSatang: 19900,
      vatSatang: 1393,
      totalSatang: 21293,
      vatEnabled: true,
      current: { planId: 'p0', currentPeriodEnd: '2026-12-01T00:00:00Z', autoRenew: false, source: '' },
      changesPlan: true,
    });
  });

  it('getCheckoutQuote: 400 PLAN_NOT_PURCHASABLE → ApiError พร้อม errorCode', async () => {
    mockFetch({ statusCode: 400, message: 'แพ็กเกจนี้ซื้อไม่ได้', errorCode: 'PLAN_NOT_PURCHASABLE' }, 400);
    await expect(getCheckoutQuote('p1')).rejects.toMatchObject({ status: 400, errorCode: 'PLAN_NOT_PURCHASABLE' });
  });

  it('createCheckout: card ส่งแค่ planId/method/cardToken (ไม่มี amount) / promptpay ไม่ส่ง cardToken', async () => {
    const fetchMock = mockFetch({ paymentId: 'pay1', status: 'pending', authorizeUri: 'https://pay.example/3ds' });
    const res = await createCheckout({ planId: 'p1', method: 'card', cardToken: 'tokn_1' });
    const { url } = lastCall(fetchMock);
    let { init } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ planId: 'p1', method: 'card', cardToken: 'tokn_1' });
    expect(res).toEqual({
      paymentId: 'pay1',
      status: 'pending',
      authorizeUri: 'https://pay.example/3ds',
      qrImageUrl: null,
      expiresAt: null,
      failureMessage: null,
    });

    mockFetch({ paymentId: 'pay2', status: 'pending', qrImageUrl: 'https://qr', expiresAt: '2026-11-14T00:00:00Z' });
    await createCheckout({ planId: 'p1', method: 'promptpay', cardToken: 'tokn_ignored' });
    ({ init } = lastCall(global.fetch as jest.Mock));
    expect(JSON.parse(init.body as string)).toEqual({ planId: 'p1', method: 'promptpay' });
  });

  it('createCheckout: 503 OMISE_UNAVAILABLE → ApiError', async () => {
    mockFetch({ statusCode: 503, message: 'ระบบชำระเงินขัดข้อง', errorCode: 'OMISE_UNAVAILABLE' }, 503);
    await expect(createCheckout({ planId: 'p1', method: 'promptpay' })).rejects.toEqual(expect.any(ApiError));
  });

  it('getProPayment: GET /pro/payments/:id + normalize (subscription null ได้)', async () => {
    const fetchMock = mockFetch({
      id: 'pay/1',
      status: 'successful',
      method: 'card',
      totalSatang: 21293,
      subtotalSatang: 19900,
      vatSatang: 1393,
      plan: { name: 'PRO' },
      venue: { name: 'NETSAT' },
      subscription: { currentPeriodEnd: '2026-12-13T00:00:00Z', autoRenew: 1 },
    });
    const d = await getProPayment('pay/1');
    expect(lastCall(fetchMock).url.pathname).toBe('/pro/payments/pay%2F1');
    expect(d).toMatchObject({
      status: 'successful',
      plan: { id: '', name: 'PRO' },
      venue: { name: 'NETSAT' },
      subscription: { currentPeriodEnd: '2026-12-13T00:00:00Z', autoRenew: true },
      qrImageUrl: null,
    });
    mockFetch({ id: 'x', status: 'pending', subscription: null });
    expect((await getProPayment('x')).subscription).toBeNull();
  });

  it('getMyProPayments: page/limit ≤50, รับทั้ง {items,total} และ array', async () => {
    const fetchMock = mockFetch({
      items: [{ id: 'a', status: 'failed', method: 'card', isRenewal: 1, totalSatang: 100, subscriptionId: 's1', plan: { id: 'p1', name: 'PRO' }, venue: null }],
      total: 31,
    });
    const res = await getMyProPayments({ page: 2, limit: 500 });
    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/payments/me');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '2', limit: '50' });
    expect(res.total).toBe(31);
    expect(res.items[0]).toMatchObject({ isRenewal: true, subscriptionId: 's1', plan: { id: 'p1', name: 'PRO' }, venue: null, refundRequired: false });

    mockFetch([{ id: 'b', status: 'successful' }]);
    expect(await getMyProPayments()).toMatchObject({ total: 1, items: [{ id: 'b' }] });
  });

  it('cancelProRenewal / changeProCard: POST ไป subscription ของฉัน ส่งแค่ token', async () => {
    let fetchMock = mockFetch({ id: 's1', autoRenew: false });
    await cancelProRenewal('s1');
    let { url, init } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/subscriptions/s1/cancel-renewal');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();

    fetchMock = mockFetch({ cardBrand: 'Visa', cardLastDigits: '1111', autoRenewFailed: ['s2', 5, ''] });
    await expect(changeProCard('s1', 'tokn_2')).resolves.toEqual({ cardBrand: 'Visa', cardLastDigits: '1111', autoRenewFailed: ['s2'] });
    ({ url, init } = lastCall(fetchMock));
    expect(url.pathname).toBe('/pro/subscriptions/s1/change-card');
    expect(JSON.parse(init.body as string)).toEqual({ cardToken: 'tokn_2' });

    mockFetch({ statusCode: 404, message: 'ไม่พบ' }, 404);
    await expect(cancelProRenewal('other')).rejects.toMatchObject({ status: 404 });
  });

  it('getMyPro: เพิ่ม id / บัตร / canceledAt', async () => {
    mockFetch([{ id: 's1', venueId: 'v1', source: 'card', cardBrand: 'Visa', cardLastDigits: '4242', canceledAt: null, autoRenew: 1 }]);
    expect((await getMyPro())[0]).toMatchObject({ id: 's1', cardBrand: 'Visa', cardLastDigits: '4242', canceledAt: null, autoRenew: true, renewalFailedAt: null });
    mockFetch([{ id: 's1', renewalFailedAt: '2026-11-14T00:00:00Z' }]);
    expect((await getMyPro())[0].renewalFailedAt).toBe('2026-11-14T00:00:00Z');
  });

  it('getProUpgrade: page.vatEnabled + my[].source', async () => {
    mockFetch({ page: { title: 'T', vatEnabled: true }, venues: [], my: [{ venueId: 'v1', source: 'promptpay' }] });
    const res = await getProUpgrade();
    expect(res.page.vatEnabled).toBe(true);
    expect(res.my[0].source).toBe('promptpay');
  });

  it('updateProPage: ส่ง vatEnabled ไปด้วย และอ่านค่ากลับ', async () => {
    const fetchMock = mockFetch({ title: 'T', subtitle: '', venuePickerTitle: '', footerNote: '', vatEnabled: 1 });
    const page = await updateProPage({ title: 'T', subtitle: '', venuePickerTitle: '', footerNote: '', vatEnabled: true });
    expect(JSON.parse(lastCall(fetchMock).init.body as string)).toMatchObject({ vatEnabled: true });
    expect(page.vatEnabled).toBe(true);
  });

  it('getProAdminPayments: query ตัวกรอง (limit ≤100) + normalize', async () => {
    const fetchMock = mockFetch({
      items: [
        {
          id: 'a',
          user: null,
          venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
          plan: { id: 'p1', code: 'pro', name: 'PRO' },
          method: 'promptpay',
          status: 'successful',
          isRenewal: 0,
          totalSatang: '21293',
          vatSatang: 1393,
          omiseChargeId: 'chrg_test_1',
          failureMessage: null,
          paidAt: '2026-11-13T01:00:00Z',
          createdAt: '2026-11-13T00:59:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    const res = await getProAdminPayments({ page: 1, limit: 999, status: 'successful', method: 'promptpay', venueId: 'v1', search: ' chrg ' });
    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/pro/admin/payments');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '1', limit: '100', status: 'successful', method: 'promptpay', venueId: 'v1', search: 'chrg' });
    expect(res.items[0]).toMatchObject({ user: null, totalSatang: 21293, isRenewal: false, omiseChargeId: 'chrg_test_1', refundRequired: false });
    mockFetch({ items: [{ id: 'b', refundRequired: 1 }], total: 1 });
    expect((await getProAdminPayments()).items[0].refundRequired).toBe(true);
  });
});
