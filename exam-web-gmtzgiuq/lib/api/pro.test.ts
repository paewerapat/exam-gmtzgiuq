import {
  getProAdminConfig,
  getProSubscriptions,
  getProUpgrade,
  grantProSubscription,
  normalizeComparison,
  revokeProSubscription,
  toComparisonPayload,
  updateProVenue,
} from './pro';
import { ApiError } from './apiError';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('lib/api/pro (task 17)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getProUpgrade: GET /pro/upgrade ส่ง token ถ้ามี, normalize ค่า (tinyint, null, comparison string)', async () => {
    localStorage.setItem('token', 't1');
    const fetchMock = mockFetch({
      page: { title: 'แพ็กเกจ LUMO', subtitle: 's', venuePickerTitle: 'เลือกสนาม', footerNote: null },
      venues: [
        {
          id: 'v1',
          key: 'netsat',
          name: 'NETSAT',
          description: null,
          comparison: JSON.stringify({ groups: [{ title: 'G', rows: [{ label: 'R', cells: { pro: { type: 'check' }, bad: { type: 'x' } } }] }] }),
          plans: [{ id: 'p1', code: 'pro', rank: '1', name: 'PRO', priceSatang: '19900', highlight: 1, isPurchasable: 0, buttonText: 'สมัคร' }],
        },
      ],
      my: [{ venueId: 'v1', planId: 'p1', planCode: 'pro', status: 'active', currentPeriodEnd: '2026-12-01T00:00:00Z', autoRenew: 0 }],
    });
    const res = await getProUpgrade();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/pro/upgrade');
    expect(init.headers.Authorization).toBe('Bearer t1');
    expect(res.page.footerNote).toBe('');
    expect(res.venues[0].plans[0]).toMatchObject({ rank: 1, priceSatang: 19900, highlight: true, isPurchasable: false, tagline: null });
    expect(res.venues[0].comparison.groups[0].rows[0].cells).toEqual({ pro: { type: 'check' } });
    expect(res.my[0]).toMatchObject({ planId: 'p1', autoRenew: false });
  });

  it('getProUpgrade: error → ApiError พร้อมข้อความจาก API', async () => {
    mockFetch({ statusCode: 500, message: 'ระบบขัดข้อง' }, 500);
    await expect(getProUpgrade()).rejects.toEqual(expect.any(ApiError));
  });

  it('normalizeComparison: null / รูปผิด → { groups: [] }', () => {
    expect(normalizeComparison(null)).toEqual({ groups: [] });
    expect(normalizeComparison('not json')).toEqual({ groups: [] });
    expect(normalizeComparison({ groups: 'x' })).toEqual({ groups: [] });
  });

  it('getProAdminConfig: รองรับ plans ระดับบน (venueId) และ venues[].plans เรียง sortOrder + entitlements', async () => {
    mockFetch({
      page: { title: 'T' },
      venues: [
        { id: 'v2', key: 'tgat', name: 'TGAT', sortOrder: 2, isActive: 0 },
        { id: 'v1', key: 'netsat', name: 'NETSAT', sortOrder: 1, plans: [{ id: 'a', code: 'max', sortOrder: 2 }, { id: 'b', code: 'pro', sortOrder: 1, entitlements: '{"challenge":true,"predictedSets":null,"extra":"keep"}' }] },
      ],
      plans: [{ id: 'c', venueId: 'v2', code: 'free', sortOrder: 0 }],
    });
    const cfg = await getProAdminConfig();
    expect(cfg.venues.map((v) => v.key)).toEqual(['netsat', 'tgat']);
    expect(cfg.venues[0].plans.map((p) => p.code)).toEqual(['pro', 'max']);
    expect(cfg.venues[0].plans[0].entitlements).toMatchObject({ challenge: true, predictedSets: null, extra: 'keep', mockPurchase: false });
    expect(cfg.venues[1].plans.map((p) => p.code)).toEqual(['free']);
    expect(cfg.venues[1].isActive).toBe(false);
  });

  it('toComparisonPayload: ตัด id ภายใน editor และ sublabel/subtext ว่าง', () => {
    expect(
      toComparisonPayload({
        groups: [{ id: 'g-1', title: 'G', rows: [{ id: 'r-1', label: 'R', sublabel: '', cells: { pro: { type: 'text', text: '2 ชุด', subtext: '' }, max: { type: 'check', text: 'old' } } }] }],
      }),
    ).toEqual({ groups: [{ title: 'G', rows: [{ label: 'R', cells: { pro: { type: 'text', text: '2 ชุด' }, max: { type: 'check' } } }] }] });
  });

  it('updateProVenue: PUT /pro/admin/venues/:id ส่ง comparison ที่ไม่มี id', async () => {
    const fetchMock = mockFetch({ id: 'v1', key: 'netsat', name: 'NETSAT' });
    await updateProVenue('v1', {
      key: 'netsat',
      name: 'NETSAT',
      description: null,
      sortOrder: 0,
      isActive: true,
      comparison: { groups: [{ id: 'g-9', title: 'G', rows: [] }] },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/pro/admin/venues/v1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body).comparison).toEqual({ groups: [{ title: 'G', rows: [] }] });
  });

  it('getProSubscriptions: query ครบ, limit ไม่เกิน 100, normalize รายการ', async () => {
    const fetchMock = mockFetch({
      items: [{ id: 's1', user: { id: 'u1', email: 'a@x.com', firstName: null }, venue: { id: 'v1', key: 'netsat', name: 'NETSAT' }, plan: null, status: 'revoked', source: 'admin', note: '' }],
      total: '41',
    });
    const res = await getProSubscriptions({ page: 3, limit: 500, venueId: 'v1', planId: 'p1', status: 'revoked', search: ' a@x ' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/pro/admin/subscriptions');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '3', limit: '100', venueId: 'v1', planId: 'p1', status: 'revoked', search: 'a@x' });
    expect(res.total).toBe(41);
    expect(res.items[0]).toMatchObject({ id: 's1', plan: null, note: null, user: { email: 'a@x.com', firstName: null, lastName: null } });

    // ผู้ใช้ถูกลบ → user: null
    mockFetch({ items: [{ id: 's2', user: null, status: 'active' }], total: 1 });
    expect((await getProSubscriptions()).items[0].user).toBeNull();
  });

  it('grantProSubscription: POST body (ตัดช่องว่าง, ไม่ส่ง note ว่าง) / 404 → ApiError ข้อความไทย', async () => {
    const fetchMock = mockFetch({ id: 's1', status: 'active' });
    await grantProSubscription({ email: ' a@x.com ', planId: 'p1', days: 30, note: '  ' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/pro/admin/subscriptions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@x.com', planId: 'p1', days: 30 });

    mockFetch({ statusCode: 404, message: 'ไม่พบผู้ใช้', errorCode: 'USER_NOT_FOUND' }, 404);
    await expect(grantProSubscription({ email: 'b@x.com', planId: 'p1', days: 30 })).rejects.toMatchObject({
      status: 404,
      message: 'ไม่พบผู้ใช้',
    });
  });

  it('revokeProSubscription: POST /pro/admin/subscriptions/:id/revoke พร้อม note', async () => {
    const fetchMock = mockFetch({ id: 's 1', status: 'revoked' });
    await revokeProSubscription('s 1', ' ขอคืนเงิน ');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/pro\/admin\/subscriptions\/s%201\/revoke$/);
    expect(JSON.parse(init.body)).toEqual({ note: 'ขอคืนเงิน' });
  });
});
