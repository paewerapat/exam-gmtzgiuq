import { fetchClockOffset } from './serverTime';

describe('fetchClockOffset', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 0 when the client clock already matches the server', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1000);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ now: 1000 }),
    }) as any;

    const offset = await fetchClockOffset();

    expect(offset).toBe(0);
  });

  it('reports a positive offset when the client clock is behind the server', async () => {
    // request sent at client time 1000, response received at client time 1000 (negligible round trip)
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1000);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ now: 6000 }),
    }) as any;

    const offset = await fetchClockOffset();

    expect(offset).toBe(5000);
  });

  it('throws when the server responds with a non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

    await expect(fetchClockOffset()).rejects.toThrow('HTTP 500');
  });
});
