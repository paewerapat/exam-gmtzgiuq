import { fetchWithAuth } from './authFetch';

// jsdom เปลี่ยนหน้าจริงไม่ได้: การตั้ง window.location.href ถูกรายงานเป็น console.error "Not implemented: navigation"
describe('fetchWithAuth — 401', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'expired');
    localStorage.setItem('user', '{"id":"u1"}');
    window.history.pushState({}, '', '/practice/topic/t1');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => error.mockRestore());

  const navigations = () =>
    error.mock.calls.filter((args: unknown[]) =>
      args.some((a) => String((a as { message?: unknown } | null)?.message ?? a).includes('navigation')),
    );

  it('ค่าเริ่มต้น (พฤติกรรมเดิม): ล้าง token/user, พาไป /login และ throw', async () => {
    await expect(fetchWithAuth('http://api.test/x')).rejects.toThrow('Session expired');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(navigations().length).toBeGreaterThan(0);
  });

  it('redirectOnUnauthorized: false → คืน response 401 ไม่ล้าง token ไม่เปลี่ยนหน้า', async () => {
    const res = await fetchWithAuth('http://api.test/x', { method: 'POST' }, { redirectOnUnauthorized: false });
    expect(res.status).toBe(401);
    expect(localStorage.getItem('token')).toBe('expired');
    expect(localStorage.getItem('user')).toBe('{"id":"u1"}');
    expect(navigations()).toHaveLength(0);
    expect(window.location.pathname).toBe('/practice/topic/t1');
  });
});
