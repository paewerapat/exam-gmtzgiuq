import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Opn Payments (Omise) REST API, called with the secret key. */
export const OMISE_API_URL = 'https://api.omise.co';
/** API version of the account, pinned so a dashboard change cannot alter shapes. */
export const OMISE_API_VERSION = '2019-05-29';
export const OMISE_TIMEOUT_MS = 15_000;
/** Customer create/update run while checkout holds the user lock: shorter. */
export const OMISE_CUSTOMER_TIMEOUT_MS = 8_000;

// ── the parts of Opn objects this app reads ─────────────────────────────

export interface OmiseCard {
  object: 'card';
  id: string;
  brand: string | null;
  last_digits: string | null;
  created_at?: string | null;
}

export interface OmiseCustomer {
  object: 'customer';
  id: string;
  default_card: string | null;
  cards?: { data?: OmiseCard[] };
}

export interface OmiseCharge {
  object: 'charge';
  id: string;
  status: string; // pending / successful / failed / expired / reversed
  amount: number;
  currency: string; // 'THB'
  customer: string | null;
  schedule: string | null;
  metadata: Record<string, unknown> | null;
  authorize_uri: string | null;
  failure_code: string | null;
  failure_message: string | null;
  expires_at: string | null;
  paid_at: string | null;
  card?: {
    id?: string;
    brand?: string | null;
    last_digits?: string | null;
  } | null;
  source?: {
    type?: string;
    scannable_code?: { image?: { download_uri?: string | null } } | null;
  } | null;
}

export interface OmiseSchedule {
  object: 'schedule';
  id: string;
  status: string; // running / expiring / expired / deleted / suspended ...
  deleted?: boolean;
  // the card the schedule charges (Opn fixes it when the schedule is made)
  charge?: { card?: string | null } | null;
}

export interface OmiseEvent {
  object: 'event';
  id: string;
  key: string; // e.g. charge.create / charge.complete
  data?: { object?: string; id?: string } | null;
}

export interface CreateChargeParams {
  amount: number;
  currency: 'thb';
  description?: string;
  customer?: string;
  card?: string;
  source?: { type: 'promptpay' };
  return_uri?: string;
  metadata?: Record<string, string>;
}

export interface CreateScheduleParams {
  every: number;
  period: 'day';
  start_date: string; // YYYY-MM-DD
  end_date: string;
  charge: {
    customer: string;
    // a card of the customer (default card when left out)
    card?: string;
    amount: number;
    currency: 'thb';
    description?: string;
    metadata?: Record<string, string>;
  };
}

/**
 * An error of a call to Opn. `unavailable` = Opn could not be reached, timed
 * out, or answered 5xx/429 (try again later); otherwise Opn refused the
 * request (4xx, `code` = Opn's error code, e.g. not_found, used_token).
 * The message never carries the key, tokens or card data.
 */
export class OmiseError extends Error {
  constructor(
    readonly unavailable: boolean,
    readonly status: number,
    readonly code: string,
    // Opn's own message, only to tell apart what was not found; it may name
    // a token id, so it is never logged or returned
    readonly detail: string = '',
  ) {
    super(`Opn ${unavailable ? 'unavailable' : 'error'} ${status} ${code}`);
    this.name = 'OmiseError';
  }

  get notFound(): boolean {
    return this.status === 404 || this.code === 'not_found';
  }

  /** 404 about the customer itself (not about the card token sent). */
  get customerNotFound(): boolean {
    return this.notFound && /^customer\b/i.test(this.detail);
  }
}

/** Ids of Opn objects as they appear in a URL path (nothing else allowed). */
const ID_PATTERNS = {
  charge: /^chrg_(test_)?[0-9a-z]+$/,
  customer: /^cust_(test_)?[0-9a-z]+$/,
  schedule: /^schd_(test_)?[0-9a-z]+$/,
  event: /^evnt_(test_)?[0-9a-z]+$/,
} as const;

export function isOmiseId(
  kind: keyof typeof ID_PATTERNS,
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    ID_PATTERNS[kind].test(value)
  );
}

/**
 * The only place that talks to Opn (task 18): plain `fetch` with Basic auth
 * (secret key from OMISE_SECRET_KEY, never logged or returned), JSON bodies,
 * a 15 s timeout, and errors turned into OmiseError. No SDK dependency.
 */
@Injectable()
export class OmiseClient {
  private readonly logger = new Logger(OmiseClient.name);

  constructor(private configService: ConfigService) {}

  /** False when OMISE_SECRET_KEY is not set (payments are off). */
  isConfigured(): boolean {
    return this.secretKey() !== '';
  }

  getCharge(id: string): Promise<OmiseCharge> {
    return this.request('GET', '/charges/', undefined, ['charge', id]);
  }

  createCharge(params: CreateChargeParams): Promise<OmiseCharge> {
    return this.request('POST', '/charges', params);
  }

  createCustomer(params: {
    email?: string;
    description?: string;
    card: string;
    metadata?: Record<string, string>;
  }): Promise<OmiseCustomer> {
    return this.request(
      'POST',
      '/customers',
      params,
      undefined,
      OMISE_CUSTOMER_TIMEOUT_MS,
    );
  }

  /**
   * `card`: attach a new card (token) — Opn does NOT make it the default;
   * `default_card`: choose the default card (charged by new schedules).
   */
  updateCustomer(
    id: string,
    params: { card: string } | { default_card: string },
  ): Promise<OmiseCustomer> {
    return this.request(
      'PATCH',
      '/customers/',
      params,
      ['customer', id],
      OMISE_CUSTOMER_TIMEOUT_MS,
    );
  }

  createSchedule(params: CreateScheduleParams): Promise<OmiseSchedule> {
    return this.request('POST', '/schedules', params);
  }

  getSchedule(id: string): Promise<OmiseSchedule> {
    return this.request('GET', '/schedules/', undefined, ['schedule', id]);
  }

  deleteSchedule(id: string): Promise<OmiseSchedule> {
    return this.request('DELETE', '/schedules/', undefined, ['schedule', id]);
  }

  getEvent(id: string): Promise<OmiseEvent> {
    return this.request('GET', '/events/', undefined, ['event', id]);
  }

  private secretKey(): string {
    const key: unknown = this.configService.get('OMISE_SECRET_KEY');
    return typeof key === 'string' ? key.trim() : '';
  }

  /**
   * `id`: an Opn id appended to `path` after checking its form (an id
   * that came from a request body can never change the path).
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    basePath: string,
    body?: object,
    id?: [keyof typeof ID_PATTERNS, string],
    timeoutMs: number = OMISE_TIMEOUT_MS,
  ): Promise<T> {
    if (id && !isOmiseId(id[0], id[1])) {
      throw new OmiseError(false, 404, 'not_found');
    }
    const path = id ? `${basePath}${id[1]}` : basePath;
    const key = this.secretKey();
    if (!key) throw new OmiseError(true, 503, 'not_configured');

    let response: Response;
    try {
      response = await fetch(`${OMISE_API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Omise-Version': OMISE_API_VERSION,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      // Path only (ids, no token/key), never the body
      this.logger.warn(
        `${method} ${pathForLog(path)} failed: ${timeout ? 'timeout' : 'network'}`,
      );
      throw new OmiseError(true, 503, timeout ? 'timeout' : 'network');
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      const err = json as { code?: unknown; message?: unknown } | null;
      const code = typeof err?.code === 'string' ? err.code : 'unknown';
      const detail = typeof err?.message === 'string' ? err.message : '';
      const unavailable = response.status >= 500 || response.status === 429;
      if (unavailable || response.status === 401) {
        this.logger.warn(
          `${method} ${pathForLog(path)} -> ${response.status} ${code}`,
        );
      }
      throw new OmiseError(unavailable, response.status, code, detail);
    }
    if (!json || typeof json !== 'object') {
      throw new OmiseError(true, 502, 'bad_response');
    }
    return json as T;
  }
}

function pathForLog(path: string): string {
  return path.split('?')[0];
}
