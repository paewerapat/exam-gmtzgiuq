import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OMISE_API_VERSION,
  OMISE_TIMEOUT_MS,
  OmiseClient,
  OmiseError,
  isOmiseId,
} from './omise.client';

const KEY = 'skey_test_unit_only_000';

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('OmiseClient (task 18)', () => {
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;
  let key: string | undefined;
  let client: OmiseClient;

  beforeEach(() => {
    key = KEY;
    fetchMock = jest.fn(() => respond(200, { object: 'charge', id: 'x' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    client = new OmiseClient({
      get: (name: string) => (name === 'OMISE_SECRET_KEY' ? key : undefined),
    } as unknown as ConfigService);
  });

  afterEach(() => warn.mockRestore());

  const logged = () =>
    warn.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('Basic auth with the secret key, pinned API version, JSON body, 15 s timeout', async () => {
    await client.createCharge({
      amount: 19900,
      currency: 'thb',
      source: { type: 'promptpay' },
      metadata: { paymentId: 'p1' },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.omise.co/charges');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString('base64')}`,
    );
    expect(headers['Omise-Version']).toBe(OMISE_API_VERSION);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 19900,
      currency: 'thb',
      source: { type: 'promptpay' },
      metadata: { paymentId: 'p1' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(OMISE_TIMEOUT_MS).toBe(15000);
  });

  it('timeout / network error → OmiseError unavailable; key never logged', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('t'), { name: 'TimeoutError' }),
    );
    const err = await client
      .getCharge('chrg_test_abc')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OmiseError);
    expect(err).toMatchObject({ unavailable: true, code: 'timeout' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.getEvent('evnt_test_1')).rejects.toMatchObject({
      unavailable: true,
      code: 'network',
    });
    expect(logged()).toContain('/charges/chrg_test_abc');
    expect(logged()).not.toContain(KEY);
    expect(logged()).not.toContain('Basic');
  });

  it('5xx / 429 → unavailable; 4xx → refused with Opn code (message kept out of logs)', async () => {
    fetchMock.mockReturnValueOnce(respond(502, {}));
    await expect(client.getCharge('chrg_test_a')).rejects.toMatchObject({
      unavailable: true,
      status: 502,
    });
    fetchMock.mockReturnValueOnce(respond(429, {}));
    await expect(client.getCharge('chrg_test_a')).rejects.toMatchObject({
      unavailable: true,
    });
    fetchMock.mockReturnValueOnce(
      respond(400, {
        object: 'error',
        code: 'used_token',
        message: 'token tokn_test_secret was already used',
      }),
    );
    const err = (await client
      .createCustomer({ card: 'tokn_test_secret' })
      .catch((e: unknown) => e)) as OmiseError;
    expect(err).toMatchObject({
      unavailable: false,
      status: 400,
      code: 'used_token',
    });
    expect(err.message).not.toContain('tokn_');
    expect(logged()).not.toContain('tokn_');
  });

  it('404 about the customer vs about the token', async () => {
    fetchMock.mockReturnValueOnce(
      respond(404, {
        code: 'not_found',
        message: 'customer cust_test_x was not found',
      }),
    );
    const a = (await client
      .updateCustomer('cust_test_x', { card: 'tokn_test_1' })
      .catch((e: unknown) => e)) as OmiseError;
    expect(a.notFound && a.customerNotFound).toBe(true);
    fetchMock.mockReturnValueOnce(
      respond(404, {
        code: 'not_found',
        message: 'token tokn_test_1 was not found',
      }),
    );
    const b = (await client
      .updateCustomer('cust_test_x', { card: 'tokn_test_1' })
      .catch((e: unknown) => e)) as OmiseError;
    expect(b.notFound).toBe(true);
    expect(b.customerNotFound).toBe(false);
  });

  it('ids in the path are checked (no path injection from a webhook body)', async () => {
    await expect(client.getEvent('../charges/x')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      client.getCharge('chrg_test_1/../../x'),
    ).rejects.toBeInstanceOf(OmiseError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isOmiseId('event', 'evnt_test_69nxozi2zjgnz6c6o5m')).toBe(true);
    expect(isOmiseId('schedule', 'schd_69nxozozicpb7764i5v')).toBe(true);
    expect(isOmiseId('charge', 'CHRG_x')).toBe(false);
  });

  it('no secret key → not configured, unavailable without calling Opn', async () => {
    key = '';
    expect(client.isConfigured()).toBe(false);
    await expect(client.getCharge('chrg_test_a')).rejects.toMatchObject({
      unavailable: true,
      code: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('customer calls (under the user lock) time out after 8 s, others 15 s', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    await client.createCustomer({ card: 'tokn_test_1' });
    await client.updateCustomer('cust_test_1', { card: 'tokn_test_1' });
    await client.getCharge('chrg_test_1');
    expect(timeout.mock.calls).toEqual([[8000], [8000], [15000]]);
    timeout.mockRestore();
  });

  it('paths of the other calls', async () => {
    await client.deleteSchedule('schd_test_1');
    await client.getSchedule('schd_test_1');
    await client.updateCustomer('cust_test_1', { default_card: 'card_test_2' });
    await client.createSchedule({
      every: 30,
      period: 'day',
      start_date: '2026-12-13',
      end_date: '2031-12-13',
      charge: { customer: 'cust_test_1', amount: 19900, currency: 'thb' },
    });
    expect(
      fetchMock.mock.calls.map(
        ([url, init]: [string, RequestInit]) => `${init.method} ${url}`,
      ),
    ).toEqual([
      'DELETE https://api.omise.co/schedules/schd_test_1',
      'GET https://api.omise.co/schedules/schd_test_1',
      'PATCH https://api.omise.co/customers/cust_test_1',
      'POST https://api.omise.co/schedules',
    ]);
  });
});
