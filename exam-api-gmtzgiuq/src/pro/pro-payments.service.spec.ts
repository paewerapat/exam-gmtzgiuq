import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { ProCustomer } from './pro-customer.entity';
import { ProException } from './pro-errors';
import { ProPage } from './pro-page.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import {
  CreateChargeParams,
  OmiseCharge,
  OmiseClient,
  OmiseError,
} from './omise.client';
import { ProBillingService } from './pro-billing.service';
import { ProPaymentsService } from './pro-payments.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';

type Row = Record<string, any>;

const NOW = new Date('2026-11-13T05:00:00.400Z');
const DAY = 24 * 60 * 60 * 1000;
const PLAN = 'a17e0001-0000-4000-8000-000000000012';
const PLAN_MAX = 'a17e0001-0000-4000-8000-000000000013';
const PLAN_FREE = 'a17e0001-0000-4000-8000-000000000011';
const SUB = '33333333-3333-4333-8333-333333333333';
const user = { id: 'user-a', email: 'a@example.test' };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator) {
      if (value.type === 'moreThan') {
        return (row[key] as Date).getTime() > (value.value as Date).getTime();
      }
      throw new Error(`operator ${value.type} not mocked`);
    }
    return row[key] === value;
  });
}

function charge(extra: Partial<OmiseCharge> = {}): OmiseCharge {
  return {
    object: 'charge',
    id: 'chrg_test_1',
    status: 'successful',
    amount: 19900,
    currency: 'THB',
    customer: 'cust_test_a',
    schedule: null,
    metadata: {},
    authorize_uri: 'https://api.omise.co/payments/x/authorize',
    failure_code: null,
    failure_message: null,
    expires_at: null,
    paid_at: null,
    ...extra,
  };
}

async function errorOf(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  return {
    status: (err as HttpException).getStatus(),
    body: (err as HttpException).getResponse() as Row,
  };
}

describe('ProPaymentsService (task 18)', () => {
  let service: ProPaymentsService;
  let db: Record<string, Row[]>;
  let omise: Record<string, jest.Mock>;
  let billing: Record<string, jest.Mock>;
  let findMineOne: jest.Mock;
  let configured: boolean;
  let env: Record<string, string | undefined>;

  const tableOf = (entity: unknown) =>
    new Map<unknown, string>([
      [ProPayment, 'payments'],
      [ProSubscription, 'subs'],
      [ProCustomer, 'customers'],
      [ProPlan, 'plans'],
      [ProVenue, 'venues'],
      [ProPage, 'page'],
    ]).get(entity) as string;

  const withVenue = (row: Row | undefined) =>
    row && row.venueId
      ? { ...row, venue: db.venues.find((v) => v.id === row.venueId) }
      : row;

  const ops = {
    findOne: jest.fn(
      (entity: unknown, { where }: { where: Row; relations?: unknown }) => {
        const row = db[tableOf(entity)].find((r) => matches(r, where));
        return Promise.resolve(
          row
            ? entity === ProPlan
              ? withVenue({ ...row })
              : { ...row }
            : null,
        );
      },
    ),
    find: jest.fn((entity: unknown, { where }: { where: Row }) =>
      Promise.resolve(
        db[tableOf(entity)]
          .filter((r) => matches(r, where))
          .map((r) => ({ ...r })),
      ),
    ),
    update: jest.fn((entity: unknown, where: Row, changes: Row) => {
      for (const row of db[tableOf(entity)]) {
        if (matches(row, where)) Object.assign(row, changes);
      }
      return Promise.resolve({ affected: 1 });
    }),
    insert: jest.fn((entity: unknown, row: Row) => {
      db[tableOf(entity)].push({ createdAt: NOW, ...row });
      return Promise.resolve();
    }),
  };

  /** The two conditional UPDATEs made with the query builder. */
  const queryBuilder = () => {
    let changes: Row = {};
    let sql = '';
    let params: Row = {};
    const qb = {
      update: () => qb,
      set: (c: Row) => {
        changes = c;
        return qb;
      },
      where: (s: string, p: Row) => {
        sql = s;
        params = p;
        return qb;
      },
      execute: () => {
        const row = db.payments.find((p) => p.id === params.id);
        let ok = !!row;
        if (row && sql.includes('omiseChargeId IS NULL')) {
          ok = !row.omiseChargeId;
        }
        if (row && sql.includes('lastCheckedAt')) {
          ok =
            !row.lastCheckedAt ||
            (row.lastCheckedAt as Date).getTime() <=
              (params.cutoff as Date).getTime();
        }
        if (row && ok) Object.assign(row, changes);
        return Promise.resolve({ affected: ok ? 1 : 0 });
      },
    };
    return qb;
  };

  beforeEach(async () => {
    configured = true;
    env = { FRONTEND_URL: 'https://web.example/', NODE_ENV: 'development' };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    db = {
      venues: [{ id: 'netsat', key: 'netsat', name: 'NETSAT', isActive: true }],
      plans: [
        {
          id: PLAN,
          venueId: 'netsat',
          code: 'pro',
          name: 'PRO',
          rank: 1,
          priceSatang: 19900,
          periodDays: 30,
          isVisible: true,
          isPurchasable: true,
        },
        {
          id: PLAN_MAX,
          venueId: 'netsat',
          code: 'max',
          name: 'MAX',
          rank: 2,
          priceSatang: 29900,
          periodDays: 30,
          isVisible: 1,
          isPurchasable: 1,
        },
        {
          id: PLAN_FREE,
          venueId: 'netsat',
          code: 'free',
          name: 'Free',
          rank: 0,
          priceSatang: 0,
          periodDays: 30,
          isVisible: true,
          isPurchasable: false,
        },
      ],
      page: [{ id: 1, vatEnabled: 0 }],
      subs: [],
      payments: [],
      customers: [],
    };
    omise = {
      isConfigured: jest.fn(() => configured),
      createCharge: jest.fn(() => Promise.resolve(charge())),
      getEvent: jest.fn(),
    };
    billing = {
      ensureCustomerLocked: jest.fn(() =>
        Promise.resolve({
          customerId: 'cust_test_a',
          cardId: 'card_test_1',
          cardBrand: 'Visa',
          cardLastDigits: '4242',
        }),
      ),
      // the real one reads the charge from Opn; here: mark successful
      syncCharge: jest.fn((chargeId: string) => {
        const p = db.payments.find((x) => x.omiseChargeId === chargeId);
        if (p) p.status = 'successful';
        return Promise.resolve({ handled: true, status: 'successful' });
      }),
      applyCharge: jest.fn(() => Promise.resolve({ handled: true })),
      deleteSchedule: jest.fn(() => Promise.resolve()),
      attachCard: jest.fn(() =>
        Promise.resolve({
          object: 'customer',
          id: 'cust_test_a',
          default_card: 'card_new',
          cards: {
            data: [
              { id: 'card_new', brand: 'MasterCard', last_digits: '4444' },
            ],
          },
        }),
      ),
      remakeSchedulesForUser: jest.fn(() => Promise.resolve([])),
    };
    findMineOne = jest.fn((_u: string, id: string) => Promise.resolve({ id }));

    const repo = (entity: unknown) => ({
      findOne: (o: { where: Row }) => ops.findOne(entity, o),
      find: (o: { where: Row }) => ops.find(entity, o),
      update: (w: Row, c: Row) => ops.update(entity, w, c),
      createQueryBuilder: queryBuilder,
    });
    const transaction = jest.fn((work: (m: unknown) => Promise<unknown>) =>
      work({
        ...ops,
        query: jest.fn((sql: string, params?: unknown[]) => {
          if (sql.startsWith('SELECT @@SESSION'))
            return Promise.resolve([{ t: 50 }]);
          if (sql.startsWith('SET SESSION')) return Promise.resolve();
          return Promise.resolve([{ id: params?.[0] }]);
        }),
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        ProPaymentsService,
        ...[ProPayment, ProPlan, ProPage, ProSubscription, ProCustomer].map(
          (e) => ({
            provide: getRepositoryToken(e),
            useValue: repo(e),
          }),
        ),
        { provide: DataSource, useValue: { transaction } },
        { provide: OmiseClient, useValue: omise },
        { provide: ProBillingService, useValue: billing },
        { provide: ProSubscriptionsService, useValue: { findMineOne } },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => env[k],
          },
        },
      ],
    }).compile();
    service = module.get(ProPaymentsService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('quote (AC2)', () => {
    it('VAT off → price; VAT on → price + 7% rounded; current plan + changesPlan', async () => {
      await expect(service.quote('user-a', PLAN, NOW)).resolves.toMatchObject({
        subtotalSatang: 19900,
        vatSatang: 0,
        totalSatang: 19900,
        vatEnabled: false,
        current: null,
        changesPlan: false,
        plan: {
          id: PLAN,
          code: 'pro',
          venue: { key: 'netsat', name: 'NETSAT' },
        },
      });
      db.page[0].vatEnabled = 1;
      db.subs.push({
        userId: 'user-a',
        venueId: 'netsat',
        planId: PLAN,
        status: 'active',
        source: 'card',
        autoRenew: 1,
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
      });
      await expect(
        service.quote('user-a', PLAN_MAX, NOW),
      ).resolves.toMatchObject({
        subtotalSatang: 29900,
        vatSatang: 2093,
        totalSatang: 31993,
        vatEnabled: true,
        current: { planId: PLAN, autoRenew: true, source: 'card' },
        changesPlan: true,
      });
    });

    it('free / hidden / not for sale / venue off → 400 PLAN_NOT_PURCHASABLE; missing → 404; < 20 baht → 400', async () => {
      expect(
        (await errorOf(service.quote('user-a', PLAN_FREE))).body,
      ).toMatchObject({
        statusCode: 400,
        errorCode: 'PLAN_NOT_PURCHASABLE',
      });
      db.plans[0].isVisible = 0;
      expect((await errorOf(service.quote('user-a', PLAN))).status).toBe(400);
      db.plans[0].isVisible = 1;
      db.plans[0].isPurchasable = false;
      expect((await errorOf(service.quote('user-a', PLAN))).status).toBe(400);
      db.plans[0].isPurchasable = true;
      db.venues[0].isActive = 0;
      expect((await errorOf(service.quote('user-a', PLAN))).status).toBe(400);
      db.venues[0].isActive = 1;
      expect(
        (
          await errorOf(
            service.quote('user-a', 'a17e0001-0000-4000-8000-0000000000ff'),
          )
        ).body.errorCode,
      ).toBe('PLAN_NOT_FOUND');
      db.plans[0].priceSatang = 1500;
      expect(
        (await errorOf(service.quote('user-a', PLAN))).body.errorCode,
      ).toBe('AMOUNT_TOO_LOW');
    });
  });

  describe('checkout', () => {
    it('card: amount from the server (VAT on), customer card, charge with metadata + return_uri, applied via syncCharge (AC3, AC13)', async () => {
      db.page[0].vatEnabled = true;
      const result = await service.checkout(
        user,
        { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
        NOW,
      );
      expect(Object.keys(result).sort()).toEqual(['paymentId', 'status']);
      expect(typeof result.paymentId).toBe('string');
      expect(result.status).toBe('successful');
      const params = (
        omise.createCharge.mock.calls[0] as [CreateChargeParams]
      )[0];
      expect(params).toMatchObject({
        amount: 21293,
        currency: 'thb',
        customer: 'cust_test_a',
        card: 'card_test_1',
        metadata: {
          paymentId: result.paymentId,
          userId: 'user-a',
          planId: PLAN,
        },
        return_uri: `https://web.example/upgrade/result?payment=${result.paymentId}`,
      });
      expect(params.source).toBeUndefined();
      expect(db.payments[0]).toMatchObject({
        id: result.paymentId,
        subtotalSatang: 19900,
        vatSatang: 1393,
        totalSatang: 21293,
        omiseChargeId: 'chrg_test_1',
        method: 'card',
      });
      expect(billing.syncCharge).toHaveBeenCalledWith(
        'chrg_test_1',
        result.paymentId,
      );
      expect((billing.ensureCustomerLocked.mock.calls[0] as unknown[])[2]).toBe(
        'tokn_test_1',
      );
    });

    it('card needing 3-D Secure → pending + authorizeUri (AC4)', async () => {
      omise.createCharge.mockResolvedValue(
        charge({ status: 'pending', authorize_uri: 'https://pay.example/3ds' }),
      );
      const result = await service.checkout(
        user,
        { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
        NOW,
      );
      expect(result).toMatchObject({
        status: 'pending',
        authorizeUri: 'https://pay.example/3ds',
      });
      expect(billing.syncCharge).not.toHaveBeenCalled();
    });

    it('declined card (charge failed) → failed + Thai message from the payment (AC5)', async () => {
      omise.createCharge.mockResolvedValue(
        charge({ status: 'failed', failure_code: 'insufficient_fund' }),
      );
      billing.syncCharge.mockImplementation((id: string) => {
        Object.assign(db.payments.find((p) => p.omiseChargeId === id)!, {
          status: 'failed',
          failureMessage: 'ยอดเงินหรือวงเงินในบัตรไม่พอ กรุณาใช้บัตรอื่น',
        });
        return Promise.resolve({ handled: true });
      });
      await expect(
        service.checkout(
          user,
          { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
          NOW,
        ),
      ).resolves.toMatchObject({
        status: 'failed',
        failureMessage: 'ยอดเงินหรือวงเงินในบัตรไม่พอ กรุณาใช้บัตรอื่น',
      });
    });

    it('PromptPay → pending + QR + expiresAt; again while valid → the same payment (AC6)', async () => {
      omise.createCharge.mockResolvedValue(
        charge({
          status: 'pending',
          expires_at: '2026-11-14T05:00:00Z',
          source: {
            type: 'promptpay',
            scannable_code: {
              image: { download_uri: 'https://api.omise.co/qr' },
            },
          },
        }),
      );
      const first = await service.checkout(
        user,
        { planId: PLAN, method: 'promptpay' },
        NOW,
      );
      expect(first).toMatchObject({
        status: 'pending',
        qrImageUrl: 'https://api.omise.co/qr',
        expiresAt: new Date('2026-11-14T05:00:00Z'),
      });
      expect(first.authorizeUri).toBeUndefined();
      expect((omise.createCharge.mock.calls[0] as unknown[])[0]).toMatchObject({
        source: { type: 'promptpay' },
      });
      const later = new Date(NOW.getTime() + 60_000);
      const again = await service.checkout(
        user,
        { planId: PLAN, method: 'promptpay' },
        later,
      );
      expect(again).toEqual({
        paymentId: first.paymentId,
        status: 'pending',
        qrImageUrl: 'https://api.omise.co/qr',
        expiresAt: new Date('2026-11-14T05:00:00Z'),
      });
      expect(omise.createCharge).toHaveBeenCalledTimes(1);
      // nearly expired → a new QR
      const late = new Date(
        new Date('2026-11-14T05:00:00Z').getTime() - 30_000,
      );
      const fresh = await service.checkout(
        user,
        { planId: PLAN, method: 'promptpay' },
        late,
      );
      expect(fresh.paymentId).not.toBe(first.paymentId);
    });

    it('same plan already renewing by card → 409 ALREADY_AUTO_RENEW, nothing charged', async () => {
      db.subs.push({
        userId: 'user-a',
        venueId: 'netsat',
        planId: PLAN,
        status: 'active',
        autoRenew: 1,
        omiseScheduleId: 'schd_test_1',
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
      });
      expect(
        (
          await errorOf(
            service.checkout(user, { planId: PLAN, method: 'promptpay' }, NOW),
          )
        ).body.errorCode,
      ).toBe('ALREADY_AUTO_RENEW');
      expect(omise.createCharge).not.toHaveBeenCalled();
      expect(db.payments).toHaveLength(0);
    });

    it('another card checkout of the plan in flight → 409 PAYMENT_IN_PROGRESS, token not used (AC13)', async () => {
      db.payments.push({
        id: 'p0',
        userId: 'user-a',
        planId: PLAN,
        method: 'card',
        status: 'pending',
        isRenewal: false,
        omiseChargeId: null,
        failureCode: null,
        createdAt: new Date(NOW.getTime() - 2000),
      });
      expect(
        (
          await errorOf(
            service.checkout(
              user,
              { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
              NOW,
            ),
          )
        ).body,
      ).toMatchObject({ statusCode: 409, errorCode: 'PAYMENT_IN_PROGRESS' });
      expect(billing.ensureCustomerLocked).not.toHaveBeenCalled();
    });

    it('Opn refuses the charge (4xx) → payment failed, Thai message', async () => {
      omise.createCharge.mockRejectedValue(
        new OmiseError(false, 400, 'invalid_charge'),
      );
      const result = await service.checkout(
        user,
        { planId: PLAN, method: 'promptpay' },
        NOW,
      );
      expect(result).toMatchObject({ status: 'failed' });
      expect(result.failureMessage).toMatch(/[฀-๿]/);
      expect(db.payments[0]).toMatchObject({
        status: 'failed',
        failureCode: 'invalid_charge',
      });
    });

    it('Opn down → 503 OMISE_UNAVAILABLE (Thai); payment failed at once; a card retry within 30 s → 409, later allowed (round 2)', async () => {
      omise.createCharge.mockRejectedValue(
        new OmiseError(true, 503, 'timeout'),
      );
      const err = await errorOf(
        service.checkout(
          user,
          { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
          NOW,
        ),
      );
      expect(err).toMatchObject({
        status: 503,
        body: { errorCode: 'OMISE_UNAVAILABLE' },
      });
      expect(err.body.message).toMatch(/[฀-๿]/);
      expect(db.payments[0]).toMatchObject({
        status: 'failed',
        failureCode: 'omise_unavailable',
        omiseChargeId: null,
      });
      expect(db.payments[0].failureMessage).toMatch(/[\u0E00-\u0E7F]/);
      omise.createCharge.mockResolvedValue(charge());
      // Opn may have charged the card after all: no second charge yet
      expect(
        (
          await errorOf(
            service.checkout(
              user,
              { planId: PLAN, method: 'card', cardToken: 'tokn_test_2' },
              new Date(NOW.getTime() + 5000),
            ),
          )
        ).body.errorCode,
      ).toBe('PAYMENT_IN_PROGRESS');
      expect(billing.ensureCustomerLocked).toHaveBeenCalledTimes(1);
      await expect(
        service.checkout(
          user,
          { planId: PLAN, method: 'card', cardToken: 'tokn_test_2' },
          new Date(NOW.getTime() + 31_000),
        ),
      ).resolves.toMatchObject({ status: 'successful' });
    });

    it('Opn down for PromptPay → failed; a retry may make a QR right away', async () => {
      omise.createCharge.mockRejectedValueOnce(
        new OmiseError(true, 503, 'timeout'),
      );
      expect(
        (
          await errorOf(
            service.checkout(user, { planId: PLAN, method: 'promptpay' }, NOW),
          )
        ).status,
      ).toBe(503);
      omise.createCharge.mockResolvedValue(
        charge({ status: 'pending', expires_at: '2026-11-14T05:00:00Z' }),
      );
      await expect(
        service.checkout(user, { planId: PLAN, method: 'promptpay' }, NOW),
      ).resolves.toMatchObject({ status: 'pending' });
    });

    it('FRONTEND_URL missing in production → card refused 503 (no localhost return_uri), PromptPay without return_uri', async () => {
      env = { NODE_ENV: 'production' };
      expect(
        (
          await errorOf(
            service.checkout(
              user,
              { planId: PLAN, method: 'card', cardToken: 'tokn_test_1' },
              NOW,
            ),
          )
        ).body.errorCode,
      ).toBe('OMISE_UNAVAILABLE');
      expect(billing.ensureCustomerLocked).not.toHaveBeenCalled();
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      service.onModuleInit();
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain(
        'FRONTEND_URL',
      );
      omise.createCharge.mockResolvedValue(charge({ status: 'pending' }));
      await service.checkout(user, { planId: PLAN, method: 'promptpay' }, NOW);
      const params = (
        omise.createCharge.mock.calls[0] as [CreateChargeParams]
      )[0];
      expect(params.return_uri).toBeUndefined();
      // development without FRONTEND_URL → localhost
      env = { NODE_ENV: 'development' };
      await service.checkout(
        user,
        { planId: PLAN_MAX, method: 'card', cardToken: 'tokn_test_1' },
        NOW,
      );
      expect(
        (omise.createCharge.mock.calls[1] as [CreateChargeParams])[0]
          .return_uri,
      ).toMatch(/^http:\/\/localhost:3000\/upgrade\/result\?payment=/);
    });

    it('payments not configured → 503 before anything', async () => {
      configured = false;
      expect(
        (
          await errorOf(
            service.checkout(user, { planId: PLAN, method: 'promptpay' }, NOW),
          )
        ).status,
      ).toBe(503);
      expect(db.payments).toHaveLength(0);
    });

    it('plan not for sale → 400 before the lock', async () => {
      expect(
        (
          await errorOf(
            service.checkout(
              user,
              { planId: PLAN_FREE, method: 'promptpay' },
              NOW,
            ),
          )
        ).body.errorCode,
      ).toBe('PLAN_NOT_PURCHASABLE');
    });
  });

  describe('GET /pro/payments/:id', () => {
    beforeEach(() => {
      db.payments.push({
        id: '11111111-1111-4111-8111-111111111111',
        userId: 'user-a',
        planId: PLAN,
        venueId: 'netsat',
        method: 'promptpay',
        status: 'pending',
        isRenewal: 0,
        totalSatang: 19900,
        subtotalSatang: 19900,
        vatSatang: 0,
        discountSatang: 0,
        currency: 'THB',
        omiseChargeId: 'chrg_test_1',
        qrImageUrl: 'https://api.omise.co/qr',
        expiresAt: new Date(NOW.getTime() + DAY),
        subscriptionId: null,
        lastCheckedAt: null,
        createdAt: NOW,
      });
    });
    const ID = '11111111-1111-4111-8111-111111111111';

    it("someone else's / bad id → 404 PAYMENT_NOT_FOUND (AC13)", async () => {
      expect(
        (await errorOf(service.getMine('user-b', ID, NOW))).body,
      ).toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_NOT_FOUND' });
      expect(
        (await errorOf(service.getMine('user-a', 'nope', NOW))).status,
      ).toBe(404);
      expect(billing.syncCharge).not.toHaveBeenCalled();
    });

    it('pending → asks Opn at most once per 5 s (AC6)', async () => {
      billing.syncCharge.mockResolvedValue({
        handled: true,
        status: 'pending',
      });
      const view = await service.getMine('user-a', ID, NOW);
      expect(view).toMatchObject({
        status: 'pending',
        qrImageUrl: 'https://api.omise.co/qr',
        plan: { name: 'PRO' },
        venue: { name: 'NETSAT' },
        subscription: null,
      });
      await service.getMine('user-a', ID, new Date(NOW.getTime() + 3000));
      expect(billing.syncCharge).toHaveBeenCalledTimes(1);
      expect(billing.syncCharge).toHaveBeenCalledWith('chrg_test_1', ID);
      await service.getMine('user-a', ID, new Date(NOW.getTime() + 6000));
      expect(billing.syncCharge).toHaveBeenCalledTimes(2);
    });

    it('paid meanwhile → successful with the subscription, no QR', async () => {
      db.subs.push({
        id: SUB,
        currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
        autoRenew: 0,
      });
      billing.syncCharge.mockImplementation(() => {
        Object.assign(db.payments[0], {
          status: 'successful',
          subscriptionId: SUB,
        });
        return Promise.resolve({ handled: true });
      });
      await expect(service.getMine('user-a', ID, NOW)).resolves.toMatchObject({
        status: 'successful',
        qrImageUrl: null,
        subscription: { id: SUB, autoRenew: false },
      });
    });

    it('refundRequired is shown (money taken without rights)', async () => {
      Object.assign(db.payments[0], {
        status: 'successful',
        isRenewal: 1,
        refundRequired: 1,
        failureMessage: 'คืนเงิน',
      });
      await expect(service.getMine('user-a', ID, NOW)).resolves.toMatchObject({
        status: 'successful',
        refundRequired: true,
      });
    });

    it('Opn down while polling → stored state, no error', async () => {
      billing.syncCharge.mockRejectedValue(
        new OmiseError(true, 503, 'network'),
      );
      await expect(service.getMine('user-a', ID, NOW)).resolves.toMatchObject({
        status: 'pending',
      });
    });

    it('a renewal payment is synced without a paymentId (metadata has none)', async () => {
      Object.assign(db.payments[0], { isRenewal: 1, method: 'card' });
      await service.getMine('user-a', ID, NOW);
      expect(billing.syncCharge).toHaveBeenCalledWith('chrg_test_1', undefined);
    });
  });

  describe('webhook abuse (round 3)', () => {
    const realEvent = (id: string) => ({
      object: 'event',
      id,
      key: 'charge.create',
      data: { object: 'charge', id: 'chrg_test_1' },
    });
    let error: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
      omise.getEvent.mockImplementation((id: string) =>
        id.startsWith('evnt_test_real')
          ? Promise.resolve(realEvent(id))
          : Promise.reject(new OmiseError(false, 404, 'not_found')),
      );
      error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });

    it('an event id handled in the last 10 min is not asked from Opn again', async () => {
      const t = Date.now();
      await service.handleWebhook('evnt_test_real1', '1.1.1.1', t);
      await service.handleWebhook('evnt_test_real1', '1.1.1.1', t + 60_000);
      expect(omise.getEvent).toHaveBeenCalledTimes(1);
      expect(billing.syncCharge).toHaveBeenCalledTimes(1);
      await service.handleWebhook(
        'evnt_test_real1',
        '1.1.1.1',
        t + 11 * 60_000,
      );
      expect(omise.getEvent).toHaveBeenCalledTimes(2);
    });

    it('a failed try (503) is not remembered: the resend from Opn is processed', async () => {
      const t = Date.now();
      omise.getEvent.mockRejectedValueOnce(new OmiseError(true, 503, 'x'));
      expect(
        (await errorOf(service.handleWebhook('evnt_test_real1', '1.1.1.1', t)))
          .status,
      ).toBe(503);
      await service.handleWebhook('evnt_test_real1', '1.1.1.1', t + 1000);
      expect(billing.syncCharge).toHaveBeenCalledTimes(1);
    });

    it('real events are never limited: 60 found events from one IP in a minute are all processed', async () => {
      const t = Date.now();
      for (let i = 0; i < 60; i++) {
        await expect(
          service.handleWebhook(`evnt_test_real${i}`, '203.0.113.5', t + i),
        ).resolves.toEqual({ ok: true });
      }
      expect(billing.syncCharge).toHaveBeenCalledTimes(60);
      expect(error).not.toHaveBeenCalled();
    });

    it('junk from one IP (unknown or malformed ids): 30 a minute, then 503 + ERROR log, without asking Opn', async () => {
      const t = Date.now();
      for (let i = 0; i < 20; i++) {
        await service.handleWebhook(`evnt_test_fake${i}`, '198.51.100.9', t);
      }
      for (let i = 0; i < 10; i++) {
        await service.handleWebhook('../x', '198.51.100.9', t);
      }
      expect(omise.getEvent).toHaveBeenCalledTimes(20);
      const err = await errorOf(
        service.handleWebhook('evnt_test_fake99', '198.51.100.9', t + 10),
      );
      expect(err).toMatchObject({
        status: 503,
        body: { errorCode: 'WEBHOOK_RATE_LIMITED' },
      });
      expect(omise.getEvent).toHaveBeenCalledTimes(20);
      const logged = String((error.mock.calls[0] as unknown[])[0]);
      expect(logged).toContain('198.51.100.9');
      expect(logged).toContain('30');
      // an event handled before is still answered from memory
      await service.handleWebhook('evnt_test_real7', '203.0.113.5', t);
      await expect(
        service.handleWebhook('evnt_test_real7', '198.51.100.9', t + 20),
      ).resolves.toEqual({ ok: true });
      // other IPs and the next minute are fine
      await expect(
        service.handleWebhook('evnt_test_real8', '203.0.113.6', t + 20),
      ).resolves.toEqual({ ok: true });
      await expect(
        service.handleWebhook('evnt_test_real9', '198.51.100.9', t + 61_000),
      ).resolves.toEqual({ ok: true });
    });

    it('client IP unknown / loopback → never limited (fail open), warned once', async () => {
      const t = Date.now();
      for (const ip of [undefined, '127.0.0.1', '::ffff:127.0.0.1', '::1']) {
        for (let i = 0; i < 35; i++) {
          await expect(
            service.handleWebhook(`junk-${i}`, ip, t),
          ).resolves.toEqual({ ok: true });
        }
      }
      const warned = warn.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('not limited'),
      );
      expect(warned).toHaveLength(1);
    });
  });

  describe('webhook (AC7)', () => {
    it('only the event id is used; the charge is read again from Opn', async () => {
      omise.getEvent.mockResolvedValue({
        object: 'event',
        id: 'evnt_test_1',
        key: 'charge.complete',
        data: { object: 'charge', id: 'chrg_test_9', status: 'pending' },
      });
      await expect(service.handleWebhook('evnt_test_1')).resolves.toEqual({
        ok: true,
      });
      expect(omise.getEvent).toHaveBeenCalledWith('evnt_test_1');
      expect(billing.syncCharge).toHaveBeenCalledWith('chrg_test_9');
    });

    it('fake / malformed ids and non-charge events → 200 without changes', async () => {
      await expect(service.handleWebhook(undefined)).resolves.toEqual({
        ok: true,
      });
      await expect(service.handleWebhook('../charges/x')).resolves.toEqual({
        ok: true,
      });
      expect(omise.getEvent).not.toHaveBeenCalled();
      omise.getEvent.mockRejectedValueOnce(
        new OmiseError(false, 404, 'not_found'),
      );
      await expect(service.handleWebhook('evnt_test_fake')).resolves.toEqual({
        ok: true,
      });
      omise.getEvent.mockResolvedValueOnce({
        object: 'event',
        id: 'evnt_test_2',
        key: 'customer.create',
        data: { object: 'customer', id: 'cust_test_1' },
      });
      await expect(service.handleWebhook('evnt_test_2')).resolves.toEqual({
        ok: true,
      });
      expect(billing.syncCharge).not.toHaveBeenCalled();
    });

    it('Opn unreachable / user busy → 503 so Opn sends it again', async () => {
      omise.getEvent.mockRejectedValueOnce(
        new OmiseError(true, 503, 'timeout'),
      );
      expect((await errorOf(service.handleWebhook('evnt_test_1'))).status).toBe(
        503,
      );
      omise.getEvent.mockResolvedValue({
        object: 'event',
        id: 'evnt_test_1',
        key: 'charge.create',
        data: { object: 'charge', id: 'chrg_test_1' },
      });
      billing.syncCharge.mockRejectedValueOnce(
        new OmiseError(true, 502, 'bad_response'),
      );
      expect((await errorOf(service.handleWebhook('evnt_test_1'))).status).toBe(
        503,
      );
      billing.syncCharge.mockRejectedValueOnce(new ProException('USER_BUSY'));
      expect((await errorOf(service.handleWebhook('evnt_test_1'))).status).toBe(
        503,
      );
    });
  });

  describe('cancel renewal (AC9) / change card (AC11)', () => {
    const cardSub = (extra: Row = {}) => ({
      id: SUB,
      userId: 'user-a',
      status: 'active',
      source: 'card',
      autoRenew: 1,
      omiseScheduleId: 'schd_test_1',
      canceledAt: null,
      currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
      ...extra,
    });

    it('owner: schedule deleted at Opn first, then autoRenew off + canceledAt; rights kept', async () => {
      db.subs.push(cardSub());
      await expect(service.cancelRenewal('user-a', SUB, NOW)).resolves.toEqual({
        id: SUB,
      });
      expect(billing.deleteSchedule).toHaveBeenCalledWith('schd_test_1');
      expect(db.subs[0]).toMatchObject({
        status: 'active',
        autoRenew: false,
        omiseScheduleId: null,
        canceledAt: new Date('2026-11-13T05:00:00.000Z'),
      });
    });

    it("someone else's → 404; not renewing → 409 NOT_RENEWABLE; Opn down → 503 and nothing changes", async () => {
      db.subs.push(cardSub());
      expect(
        (await errorOf(service.cancelRenewal('user-b', SUB, NOW))).body
          .errorCode,
      ).toBe('SUBSCRIPTION_NOT_FOUND');
      expect(
        (await errorOf(service.cancelRenewal('user-a', 'bad-id', NOW))).status,
      ).toBe(404);
      billing.deleteSchedule.mockRejectedValueOnce(
        new OmiseError(true, 503, 'network'),
      );
      expect(
        (await errorOf(service.cancelRenewal('user-a', SUB, NOW))).status,
      ).toBe(503);
      expect(db.subs[0]).toMatchObject({
        autoRenew: 1,
        omiseScheduleId: 'schd_test_1',
      });
      db.subs[0].omiseScheduleId = null;
      expect(
        (await errorOf(service.cancelRenewal('user-a', SUB, NOW))).body
          .errorCode,
      ).toBe('NOT_RENEWABLE');
    });

    it('change card: new default card stored (brand + last 4 only), schedules made again', async () => {
      db.subs.push(cardSub());
      db.customers.push({
        userId: 'user-a',
        omiseCustomerId: 'cust_test_a',
        cardBrand: 'Visa',
        cardLastDigits: '4242',
      });
      await expect(
        service.changeCard(user, SUB, 'tokn_test_2', NOW),
      ).resolves.toEqual({
        cardBrand: 'MasterCard',
        cardLastDigits: '4444',
        autoRenewFailed: [],
      });
      expect(billing.attachCard).toHaveBeenCalledWith(
        expect.objectContaining({ omiseCustomerId: 'cust_test_a' }),
        user,
        'tokn_test_2',
      );
      expect(db.customers[0]).toEqual({
        userId: 'user-a',
        omiseCustomerId: 'cust_test_a',
        cardBrand: 'MasterCard',
        cardLastDigits: '4444',
      });
      expect(billing.remakeSchedulesForUser).toHaveBeenCalledWith('user-a');
    });

    it('change card: not a card subscription / someone else → 409 / 404', async () => {
      db.subs.push(cardSub({ source: 'promptpay' }));
      db.customers.push({ userId: 'user-a', omiseCustomerId: 'cust_test_a' });
      expect(
        (await errorOf(service.changeCard(user, SUB, 'tokn_test_2', NOW))).body
          .errorCode,
      ).toBe('NOT_CARD_SUBSCRIPTION');
      expect(
        (
          await errorOf(
            service.changeCard(
              { id: 'user-b', email: 'b@x' },
              SUB,
              'tokn_test_2',
              NOW,
            ),
          )
        ).status,
      ).toBe(404);
      expect(billing.attachCard).not.toHaveBeenCalled();
    });
  });

  it('admin list: bad filters → 400 INVALID_PAYMENT_FILTER', async () => {
    expect(
      (await errorOf(service.listForAdmin({ status: 'paid' }))).body.errorCode,
    ).toBe('INVALID_PAYMENT_FILTER');
    expect(
      (await errorOf(service.listForAdmin({ method: 'cash' }))).status,
    ).toBe(400);
  });
});
