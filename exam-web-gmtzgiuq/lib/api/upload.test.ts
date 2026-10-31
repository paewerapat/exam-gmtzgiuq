import { uploadImage, deleteUploadedImage } from './upload';

describe('upload API', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'tkn');
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('uploadImage ส่ง multipart โดยไม่ตั้ง Content-Type เอง และแนบ Bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ url: 'http://localhost:3001/uploads/1-a.png', filename: '1-a.png' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    const res = await uploadImage(file);

    expect(res).toEqual({ url: 'http://localhost:3001/uploads/1-a.png', filename: '1-a.png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/upload$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
    expect(init.headers).toEqual({ Authorization: 'Bearer tkn' });
  });

  it('uploadImage โยน error พร้อมข้อความจาก API เมื่อไม่สำเร็จ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Only image files are allowed' }),
    }) as unknown as typeof fetch;

    await expect(uploadImage(new File(['x'], 'a.txt'))).rejects.toThrow('Only image files are allowed');
  });

  it('deleteUploadedImage เรียก DELETE /upload/:filename', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await deleteUploadedImage('1-a.png');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/upload\/1-a\.png$/);
    expect(init.method).toBe('DELETE');
  });

  it('JSON request เดิมยังได้ Content-Type: application/json', async () => {
    const { fetchWithAuth } = await import('./authFetch');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchWithAuth('http://x/y', { method: 'POST', body: '{}' });

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tkn',
    });
  });
});
