import { getBlogBySlug } from './blogs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

describe('getBlogBySlug — แนบ token ถ้ามี (task 14 / SEC-9: แอดมินดู draft ได้)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'b1', slug: 'my-post' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('มี token (เช่นแอดมินกด "ดูบทความ" ของ draft) → ส่ง Authorization: Bearer', async () => {
    localStorage.setItem('token', 'admin-jwt');
    await expect(getBlogBySlug('my-post')).resolves.toEqual({ id: 'b1', slug: 'my-post' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/blogs/slug/my-post`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer admin-jwt' });
  });

  it('ไม่มี token (ผู้เยี่ยมชม) → เรียกแบบ public ไม่มี Authorization', async () => {
    await getBlogBySlug('my-post');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.method).toBe('GET');
  });

  it('404 (draft สำหรับคนทั่วไป / ไม่มีบทความ) → throw ให้หน้าแสดง "ไม่พบบทความ"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(getBlogBySlug('draft-post')).rejects.toThrow('Blog not found');
  });
});
