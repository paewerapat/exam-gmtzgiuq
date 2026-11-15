// task 23: paymentsOpen จาก GET /pro/upgrade, GET /pro/me, GET /pro/admin/config และ PUT /pro/admin/page
import { getMyPro, getMyProData, getProAdminConfig, getProUpgrade, updateProPage } from './pro';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('lib/api/pro — paymentsOpen (task 23)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 't1');
  });

  it('getProUpgrade: paymentsOpen ระดับบน (boolean / tinyint) หรือใน page; ไม่ส่งเลย = true (API เก่า)', async () => {
    mockFetch({ page: { title: 'T' }, venues: [], my: [], paymentsOpen: false });
    expect((await getProUpgrade()).paymentsOpen).toBe(false);
    mockFetch({ page: { title: 'T' }, venues: [], my: [], paymentsOpen: 0 });
    expect((await getProUpgrade()).paymentsOpen).toBe(false);
    mockFetch({ page: { title: 'T', paymentsOpen: false }, venues: [], my: [] });
    const fromPage = await getProUpgrade();
    expect(fromPage.paymentsOpen).toBe(false);
    expect(fromPage.page.paymentsOpen).toBe(false);
    mockFetch({ page: { title: 'T' }, venues: [], my: [], paymentsOpen: true });
    expect((await getProUpgrade()).paymentsOpen).toBe(true);
    mockFetch({ page: { title: 'T' }, venues: [], my: [] });
    expect((await getProUpgrade()).paymentsOpen).toBe(true);
  });

  it('getMyProData: รับทั้ง { items, paymentsOpen } และ array เดิม (= true); getMyPro คืนแค่ items', async () => {
    mockFetch({ items: [{ id: 's1', venueId: 'v1', autoRenew: 1 }], paymentsOpen: false });
    const data = await getMyProData();
    expect(data.paymentsOpen).toBe(false);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ id: 's1', autoRenew: true });

    mockFetch({ items: [{ id: 's2' }], paymentsOpen: 1 });
    expect(await getMyProData()).toMatchObject({ paymentsOpen: true, items: [{ id: 's2' }] });

    mockFetch([{ id: 's3' }]);
    expect(await getMyProData()).toMatchObject({ paymentsOpen: true, items: [{ id: 's3' }] });

    mockFetch({ items: [{ id: 's4' }], paymentsOpen: false });
    const items = await getMyPro();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].id).toBe('s4');
  });

  it('getProAdminConfig: page.paymentsOpen / updateProPage ส่ง paymentsOpen และอ่านค่ากลับ', async () => {
    mockFetch({ page: { title: 'T', paymentsOpen: 0 }, venues: [] });
    expect((await getProAdminConfig()).page.paymentsOpen).toBe(false);

    const fetchMock = mockFetch({ title: 'T', subtitle: '', venuePickerTitle: '', footerNote: '', vatEnabled: 0, paymentsOpen: 1 });
    const page = await updateProPage({ title: 'T', subtitle: '', venuePickerTitle: '', footerNote: '', paymentsOpen: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).pathname).toBe('/pro/admin/page');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ paymentsOpen: true });
    expect(page.paymentsOpen).toBe(true);
  });
});
