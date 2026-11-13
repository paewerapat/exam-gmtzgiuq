import { HttpException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { ProCustomer } from './pro-customer.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import {
  CreateScheduleParams,
  OmiseCharge,
  OmiseClient,
  OmiseError,
} from './omise.client';
import { ProBillingService } from './pro-billing.service';
import { ProDiscountCode } from './pro-discount-code.entity';
import { ProDiscountRedemption } from './pro-discount-redemption.entity';

type Row = Record<string, any>;

/** The fields of a subscription row the tests read. */
interface SubRow {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

const NOW = new Date('2026-11-13T05:00:00.400Z');
const NOW_S = new Date('2026-11-13T05:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const USER = 'user-a';
const PAY1 = '11111111-1111-4111-8111-111111111111';
const PAY2 = '22222222-2222-4222-8222-222222222222';
const SUB_OLD = '33333333-3333-4333-8333-333333333333';

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator) {
      if (value.type === 'in') {
        return (value.value as unknown as unknown[]).includes(row[key]);
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
    metadata: { paymentId: PAY1 },
    authorize_uri: null,
    failure_code: null,
    failure_message: null,
    expires_at: null,
    paid_at: '2026-11-13T04:59:58Z',
    ...extra,
  };
}

describe('ProBillingService (task 18)', () => {
  let service: ProBillingService;
  let db: Record<string, Row[]>;
  let omise: Record<string, jest.Mock>;
  let lockedUsers: string[];
  let lockOrder: string[];
  let locks: Map<string, Promise<void>>;
  let error: jest.SpyInstance;
  // the save of a new schedule on the subscription throws (DB down)
  let failScheduleSave: boolean;

  const tableOf = (entity: unknown) =>
    entity === ProPayment
      ? 'payments'
      : entity === ProSubscription
        ? 'subs'
        : entity === ProCustomer
          ? 'customers'
          : entity === ProPlan
            ? 'plans'
            : entity === ProVenue
              ? 'venues'
              : entity === ProDiscountCode
                ? 'codes'
                : entity === ProDiscountRedemption
                  ? 'redemptions'
                  : (() => {
                      throw new Error('entity not mocked');
                    })();

  const ops = {
    findOne: jest.fn(
      (entity: unknown, options: { where: Row; lock?: { mode: string } }) => {
        const table = tableOf(entity);
        if (options.lock) lockOrder.push(`${table}:${options.lock.mode}`);
        const row = db[table].find((r) => matches(r, options.where));
        return Promise.resolve(row ? { ...row } : null);
      },
    ),
    find: jest.fn((entity: unknown, options: { where: Row }) =>
      Promise.resolve(
        db[tableOf(entity)]
          .filter((r) => matches(r, options.where))
          .map((r) => ({ ...r })),
      ),
    ),
    update: jest.fn((entity: unknown, where: Row, changes: Row) => {
      if (
        failScheduleSave &&
        entity === ProSubscription &&
        typeof changes.omiseScheduleId === 'string'
      ) {
        return Promise.reject(new Error('db down'));
      }
      let affected = 0;
      for (const row of db[tableOf(entity)]) {
        if (matches(row, where)) {
          Object.assign(row, changes);
          affected++;
        }
      }
      return Promise.resolve({ affected });
    }),
    insert: jest.fn((entity: unknown, row: Row) => {
      const table = tableOf(entity);
      if (
        table === 'payments' &&
        row.omiseChargeId &&
        db.payments.some((p) => p.omiseChargeId === row.omiseChargeId)
      ) {
        return Promise.reject(
          Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
        );
      }
      db[table].push({ createdAt: NOW, ...row });
      return Promise.resolve();
    }),
  };

  beforeEach(async () => {
    lockedUsers = [];
    lockOrder = [];
    failScheduleSave = false;
    locks = new Map();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    db = {
      venues: [{ id: 'netsat', name: 'NETSAT', isActive: true }],
      plans: [
        {
          id: 'netsat-pro',
          venueId: 'netsat',
          name: 'PRO',
          rank: 1,
          periodDays: 30,
        },
        {
          id: 'netsat-max',
          venueId: 'netsat',
          name: 'MAX',
          rank: 2,
          periodDays: 30,
        },
      ],
      customers: [
        {
          userId: USER,
          omiseCustomerId: 'cust_test_a',
          cardBrand: 'Visa',
          cardLastDigits: '4242',
        },
      ],
      subs: [],
      codes: [],
      redemptions: [],
      payments: [
        {
          id: PAY1,
          userId: USER,
          venueId: 'netsat',
          planId: 'netsat-pro',
          subscriptionId: null,
          method: 'card',
          status: 'pending',
          isRenewal: false,
          subtotalSatang: 18598,
          vatSatang: 1302,
          discountSatang: 0,
          totalSatang: 19900,
          currency: 'THB',
          omiseChargeId: null,
          omiseScheduleId: null,
          failureCode: null,
          failureMessage: null,
          qrImageUrl: null,
          expiresAt: null,
          paidAt: null,
          createdAt: NOW,
        },
      ],
    };
    omise = {
      getCharge: jest.fn(() => Promise.resolve(charge())),
      createSchedule: jest.fn(() =>
        Promise.resolve({
          object: 'schedule',
          id: 'schd_test_new',
          status: 'running',
        }),
      ),
      deleteSchedule: jest.fn(() =>
        Promise.resolve({ object: 'schedule', id: 'x', status: 'deleted' }),
      ),
      createCustomer: jest.fn(),
      updateCustomer: jest.fn(),
    };

    const transaction = jest.fn(
      async (work: (m: unknown) => Promise<unknown>) => {
        let release = () => {};
        const manager = {
          ...ops,
          query: jest.fn(async (sql: string, params?: unknown[]) => {
            if (sql.startsWith('SELECT @@SESSION')) return [{ t: 50 }];
            if (sql.startsWith('SET SESSION')) return undefined;
            if (sql.includes('FOR UPDATE')) {
              const id = params?.[0] as string;
              while (locks.has(id)) await locks.get(id);
              let done = () => {};
              locks.set(id, new Promise<void>((r) => (done = r)));
              release = () => {
                locks.delete(id);
                done();
              };
              lockedUsers.push(id);
              lockOrder.push('users:FOR UPDATE');
              return [{ id }];
            }
            throw new Error(`unexpected query ${sql}`);
          }),
        };
        try {
          return await work(manager);
        } finally {
          release();
        }
      },
    );

    const repo = (entity: unknown) => ({
      findOne: (options: { where: Row }) => ops.findOne(entity, options),
      find: (options: { where: Row }) => ops.find(entity, options),
      update: (where: Row, changes: Row) => ops.update(entity, where, changes),
    });
    const module = await Test.createTestingModule({
      providers: [
        ProBillingService,
        { provide: getRepositoryToken(ProPayment), useValue: repo(ProPayment) },
        {
          provide: getRepositoryToken(ProSubscription),
          useValue: repo(ProSubscription),
        },
        {
          provide: getRepositoryToken(ProCustomer),
          useValue: repo(ProCustomer),
        },
        { provide: getRepositoryToken(ProPlan), useValue: repo(ProPlan) },
        { provide: getRepositoryToken(ProVenue), useValue: repo(ProVenue) },
        { provide: DataSource, useValue: { transaction } },
        { provide: OmiseClient, useValue: omise },
      ],
    }).compile();
    service = module.get(ProBillingService);
  });

  afterEach(() => jest.restoreAllMocks());

  const pay1 = () => db.payments.find((p) => p.id === PAY1)!;
  const active = () => db.subs.filter((s) => s.status === 'active') as SubRow[];

  describe('syncCharge: first card payment (AC3)', () => {
    it('reads the charge from Opn, opens 30 days from now, then makes the schedule', async () => {
      const outcome = await service.syncCharge('chrg_test_1', PAY1);

      expect(omise.getCharge).toHaveBeenCalledWith('chrg_test_1');
      expect(outcome).toEqual({
        handled: true,
        paymentId: PAY1,
        status: 'successful',
      });
      expect(active()).toHaveLength(1);
      const sub = active()[0];
      expect(sub).toMatchObject({
        userId: USER,
        venueId: 'netsat',
        planId: 'netsat-pro',
        source: 'card',
        lastPaymentId: PAY1,
        omiseScheduleId: 'schd_test_new',
        autoRenew: true,
        canceledAt: null,
      });
      expect(
        sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime(),
      ).toBe(30 * DAY);
      expect(pay1()).toMatchObject({
        status: 'successful',
        omiseChargeId: 'chrg_test_1',
        subscriptionId: sub.id,
        omiseScheduleId: 'schd_test_new',
        paidAt: new Date('2026-11-13T04:59:58Z'),
      });
      expect(omise.createSchedule).toHaveBeenCalledTimes(1);
      const params = (
        omise.createSchedule.mock.calls[0] as [CreateScheduleParams]
      )[0];
      expect(params).toMatchObject({
        every: 30,
        period: 'day',
        start_date: new Date(sub.currentPeriodEnd.getTime() + 7 * 3600e3)
          .toISOString()
          .slice(0, 10),
        charge: {
          customer: 'cust_test_a',
          amount: 19900,
          currency: 'thb',
          metadata: {
            subscriptionId: sub.id,
            planId: 'netsat-pro',
            userId: USER,
          },
        },
      });
      expect(params.end_date.slice(0, 4)).toBe(
        String(Number(params.start_date.slice(0, 4)) + 5),
      );
    });

    it('lock order: users → venue S → plan S', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      expect(lockOrder.slice(0, 3)).toEqual([
        'users:FOR UPDATE',
        'venues:pessimistic_read',
        'plans:pessimistic_read',
      ]);
      expect(lockedUsers[0]).toBe(USER);
    });

    it('the same charge again (webhook replay / poll) changes nothing (AC7)', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      const end = active()[0].currentPeriodEnd;
      await service.syncCharge('chrg_test_1', PAY1);
      await service.syncCharge('chrg_test_1');
      await Promise.all([
        service.syncCharge('chrg_test_1'),
        service.syncCharge('chrg_test_1'),
      ]);
      expect(db.subs).toHaveLength(1);
      expect(active()[0].currentPeriodEnd).toEqual(end);
      expect(omise.createSchedule).toHaveBeenCalledTimes(1);
    });

    it('Opn says pending → nothing opened, charge linked (AC7 forged body)', async () => {
      omise.getCharge.mockResolvedValue(
        charge({ status: 'pending', authorize_uri: 'https://x' }),
      );
      await expect(
        service.syncCharge('chrg_test_1', PAY1),
      ).resolves.toMatchObject({
        status: 'pending',
      });
      expect(db.subs).toHaveLength(0);
      expect(pay1()).toMatchObject({
        status: 'pending',
        omiseChargeId: 'chrg_test_1',
      });
    });

    it('declined → failed with a Thai message, no rights (AC5)', async () => {
      omise.getCharge.mockResolvedValue(
        charge({
          status: 'failed',
          failure_code: 'insufficient_fund',
          failure_message: 'insufficient funds',
        }),
      );
      await service.syncCharge('chrg_test_1', PAY1);
      expect(pay1()).toMatchObject({
        status: 'failed',
        failureCode: 'insufficient_fund',
        failureMessage: 'ยอดเงินหรือวงเงินในบัตรไม่พอ กรุณาใช้บัตรอื่น',
      });
      expect(db.subs).toHaveLength(0);
      // a later "successful" read of another charge for it cannot reopen
      omise.getCharge.mockResolvedValue(charge({ id: 'chrg_test_other' }));
      await service.syncCharge('chrg_test_other', PAY1);
      expect(pay1().status).toBe('failed');
      expect(db.subs).toHaveLength(0);
    });

    it('PromptPay expired → expired; QR + expiry kept', async () => {
      pay1().method = 'promptpay';
      omise.getCharge.mockResolvedValue(
        charge({
          status: 'expired',
          expires_at: '2026-11-14T05:00:00Z',
          source: {
            type: 'promptpay',
            scannable_code: {
              image: { download_uri: 'https://api.omise.co/qr.png' },
            },
          },
        }),
      );
      await service.syncCharge('chrg_test_1', PAY1);
      expect(pay1()).toMatchObject({
        status: 'expired',
        qrImageUrl: 'https://api.omise.co/qr.png',
        expiresAt: new Date('2026-11-14T05:00:00Z'),
      });
      expect(pay1().failureMessage).toMatch(/[฀-๿]/);
    });

    it('a charge that does not match the payment (amount / currency / other charge / other payment) is ignored', async () => {
      omise.getCharge.mockResolvedValueOnce(charge({ amount: 100 }));
      expect((await service.syncCharge('chrg_test_1')).handled).toBe(false);
      omise.getCharge.mockResolvedValueOnce(charge({ currency: 'USD' }));
      expect((await service.syncCharge('chrg_test_1')).handled).toBe(false);
      omise.getCharge.mockResolvedValueOnce(
        charge({ metadata: { paymentId: PAY2 } }),
      );
      expect(await service.syncCharge('chrg_test_1', PAY1)).toMatchObject({
        handled: false,
        reason: 'payment_mismatch',
      });
      pay1().omiseChargeId = 'chrg_test_mine';
      omise.getCharge.mockResolvedValueOnce(charge({ id: 'chrg_test_1' }));
      expect((await service.syncCharge('chrg_test_1')).handled).toBe(false);
      omise.getCharge.mockResolvedValueOnce(charge({ metadata: {} }));
      expect(await service.syncCharge('chrg_test_1')).toMatchObject({
        reason: 'not_ours',
      });
      expect(db.subs).toHaveLength(0);
      expect(pay1().status).toBe('pending');
    });

    it('a payment that failed before it got a charge (Opn down at checkout) still opens when its charge succeeds', async () => {
      Object.assign(pay1(), {
        status: 'failed',
        failureCode: 'omise_unavailable',
      });
      await service.syncCharge('chrg_test_1');
      expect(pay1()).toMatchObject({ status: 'successful', failureCode: null });
      expect(active()).toHaveLength(1);
    });

    it('Opn cannot be asked → OmiseError, nothing written', async () => {
      omise.getCharge.mockRejectedValue(new OmiseError(true, 503, 'timeout'));
      await expect(
        service.syncCharge('chrg_test_1', PAY1),
      ).rejects.toBeInstanceOf(OmiseError);
      expect(pay1().status).toBe('pending');
    });

    it('schedule creation fails → rights kept, auto renewal off (logged)', async () => {
      omise.createSchedule.mockRejectedValue(
        new OmiseError(true, 503, 'network'),
      );
      await service.syncCharge('chrg_test_1', PAY1);
      expect(active()[0]).toMatchObject({
        autoRenew: false,
        omiseScheduleId: null,
      });
      expect(pay1().status).toBe('successful');
    });
  });

  describe('existing subscriptions of the venue (AC10)', () => {
    const oldRow = (extra: Row = {}) => ({
      id: SUB_OLD,
      userId: USER,
      venueId: 'netsat',
      planId: 'netsat-max',
      status: 'active',
      source: 'card',
      autoRenew: true,
      omiseScheduleId: 'schd_test_old',
      currentPeriodStart: new Date(NOW_S.getTime() - 10 * DAY),
      currentPeriodEnd: new Date(NOW_S.getTime() + 20 * DAY),
      lastPaymentId: 'old-pay',
      ...extra,
    });

    it('another plan → old row revoked, its schedule deleted after the commit, new row from now', async () => {
      db.subs.push(oldRow());
      omise.deleteSchedule.mockImplementation(() => {
        // after the commit: the new row is there already
        expect(active().map((s) => s.planId)).toEqual(['netsat-pro']);
        return Promise.resolve({ status: 'deleted' });
      });
      await service.applyCharge(charge(), PAY1, NOW);
      expect(db.subs.find((s) => s.id === SUB_OLD)).toMatchObject({
        status: 'revoked',
        autoRenew: false,
        revokedAt: NOW_S,
        omiseScheduleId: null,
      });
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_old');
      const fresh = active()[0];
      expect(fresh.currentPeriodStart).toEqual(NOW_S);
      expect(fresh.currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 30 * DAY),
      );
    });

    it('old schedule cannot be deleted → its id stays on the revoked row (a later charge is still recognised)', async () => {
      db.subs.push(oldRow());
      omise.deleteSchedule.mockRejectedValue(
        new OmiseError(true, 503, 'network'),
      );
      await service.applyCharge(charge(), PAY1, NOW);
      expect(db.subs.find((s) => s.id === SUB_OLD)).toMatchObject({
        status: 'revoked',
        omiseScheduleId: 'schd_test_old',
      });
    });

    it('same plan by PromptPay → +30 days from the old end, source promptpay, no schedule', async () => {
      db.subs.push(
        oldRow({
          planId: 'netsat-pro',
          source: 'promptpay',
          autoRenew: false,
          omiseScheduleId: null,
        }),
      );
      pay1().method = 'promptpay';
      await service.applyCharge(charge(), PAY1, NOW);
      expect(db.subs).toHaveLength(1);
      expect(db.subs[0]).toMatchObject({
        status: 'active',
        source: 'promptpay',
        lastPaymentId: PAY1,
        currentPeriodEnd: new Date(NOW_S.getTime() + 50 * DAY),
      });
      expect(pay1()).toMatchObject({
        periodStart: new Date(NOW_S.getTime() + 20 * DAY),
        periodEnd: new Date(NOW_S.getTime() + 50 * DAY),
      });
      expect(omise.createSchedule).not.toHaveBeenCalled();
    });

    it('same plan by card while its schedule runs → extended, the schedule is kept (no second one)', async () => {
      db.subs.push(oldRow({ planId: 'netsat-pro' }));
      await service.applyCharge(charge(), PAY1, NOW);
      expect(db.subs[0]).toMatchObject({
        omiseScheduleId: 'schd_test_old',
        autoRenew: true,
      });
      expect(omise.createSchedule).not.toHaveBeenCalled();
      expect(omise.deleteSchedule).not.toHaveBeenCalled();
    });

    it('an active row already past its end → expired; new row from now', async () => {
      db.subs.push(
        oldRow({
          planId: 'netsat-pro',
          currentPeriodEnd: new Date(NOW_S.getTime() - DAY),
        }),
      );
      await service.applyCharge(charge(), PAY1, NOW);
      expect(db.subs.find((s) => s.id === SUB_OLD)?.status).toBe('expired');
      expect(active()).toHaveLength(1);
      expect(active()[0].currentPeriodStart).toEqual(NOW_S);
    });
  });

  describe('renewals charged by a schedule (AC8)', () => {
    beforeEach(() => {
      Object.assign(pay1(), {
        status: 'successful',
        omiseChargeId: 'chrg_test_first',
        omiseScheduleId: 'schd_test_run',
      });
      db.subs.push({
        id: SUB_OLD,
        userId: USER,
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        source: 'card',
        autoRenew: true,
        omiseScheduleId: 'schd_test_run',
        currentPeriodStart: new Date(NOW_S.getTime() - 29 * DAY),
        currentPeriodEnd: new Date(NOW_S.getTime() + DAY),
        lastPaymentId: PAY1,
      });
    });
    const renewal = (extra: Partial<OmiseCharge> = {}) =>
      charge({
        id: 'chrg_test_ren',
        schedule: 'schd_test_run',
        metadata: {},
        ...extra,
      });

    it('found by the schedule id: one renewal payment, +30 days from the end, same VAT split', async () => {
      const outcome = await service.applyCharge(renewal(), undefined, NOW);
      expect(outcome).toMatchObject({ handled: true, status: 'successful' });
      const rows = db.payments.filter(
        (p) => p.omiseChargeId === 'chrg_test_ren',
      ) as SubRow[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        isRenewal: true,
        method: 'card',
        status: 'successful',
        subscriptionId: SUB_OLD,
        subtotalSatang: 18598,
        vatSatang: 1302,
        totalSatang: 19900,
        omiseScheduleId: 'schd_test_run',
      });
      expect(db.subs[0]).toMatchObject({
        currentPeriodEnd: new Date(NOW_S.getTime() + 31 * DAY),
        lastPaymentId: rows[0].id,
      });
      expect(omise.createSchedule).not.toHaveBeenCalled();
    });

    it('the same renewal 3 times (and at once) → renewed once (AC7)', async () => {
      await Promise.all([
        service.applyCharge(renewal(), undefined, NOW),
        service.applyCharge(renewal(), undefined, NOW),
      ]);
      await service.applyCharge(renewal(), undefined, NOW);
      expect(
        db.payments.filter((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toHaveLength(1);
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 31 * DAY),
      );
    });

    it('found by metadata.subscriptionId when the charge has no schedule', async () => {
      db.subs[0].omiseScheduleId = null;
      await service.applyCharge(
        renewal({ schedule: null, metadata: { subscriptionId: SUB_OLD } }),
        undefined,
        NOW,
      );
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 31 * DAY),
      );
    });

    it('charge of another customer naming our subscription → ignored', async () => {
      const outcome = await service.applyCharge(
        renewal({
          schedule: null,
          customer: 'cust_test_evil',
          metadata: { subscriptionId: SUB_OLD },
        }),
        undefined,
        NOW,
      );
      expect(outcome).toMatchObject({
        handled: false,
        reason: 'customer_mismatch',
      });
      expect(db.payments).toHaveLength(1);
    });

    it('failed renewal → failed renewal payment (shown as "ตัดบัตรไม่สำเร็จ"), no extension', async () => {
      await service.applyCharge(
        renewal({ status: 'failed', failure_code: 'insufficient_fund' }),
        undefined,
        NOW,
      );
      const row = db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren');
      expect(row).toMatchObject({
        isRenewal: true,
        status: 'failed',
        failureCode: 'insufficient_fund',
        refundRequired: false,
      });
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + DAY),
      );
      // round 2: auto renewal stops, the schedule is deleted at Opn
      expect(db.subs[0]).toMatchObject({
        status: 'active',
        autoRenew: false,
        omiseScheduleId: null,
        canceledAt: NOW_S,
        renewalFailedAt: NOW_S,
      });
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_run');
      // a later charge of that schedule (deleted too late) is not renewed
      await service.applyCharge(
        renewal({ id: 'chrg_test_ren2' }),
        undefined,
        NOW,
      );
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren2'),
      ).toMatchObject({ status: 'successful', refundRequired: true });
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + DAY),
      );
    });

    it('failed renewal: schedule cannot be deleted now → autoRenew still off, id kept for later', async () => {
      omise.deleteSchedule.mockRejectedValue(
        new OmiseError(true, 503, 'network'),
      );
      await service.applyCharge(
        renewal({ status: 'failed', failure_code: 'payment_rejected' }),
        undefined,
        NOW,
      );
      expect(db.subs[0]).toMatchObject({
        autoRenew: false,
        omiseScheduleId: 'schd_test_run',
        renewalFailedAt: NOW_S,
      });
      // round 3: an ERROR naming the schedule so an admin deletes it by hand
      const errors = error.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('schd_test_run');
      expect(errors[0]).toContain('Opn dashboard');
    });

    it("charge from a schedule that is not the subscription's → recorded with refundRequired, not extended, that schedule deleted (round 2)", async () => {
      const outcome = await service.applyCharge(
        renewal({
          schedule: 'schd_test_stray',
          metadata: { subscriptionId: SUB_OLD },
        }),
        undefined,
        NOW,
      );
      expect(outcome).toMatchObject({ handled: true, status: 'successful' });
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({
        status: 'successful',
        refundRequired: true,
        failureMessage: expect.stringContaining('คืนเงิน') as string,
        periodEnd: null,
      });
      expect(db.subs[0]).toMatchObject({
        currentPeriodEnd: new Date(NOW_S.getTime() + DAY),
        omiseScheduleId: 'schd_test_run',
        autoRenew: true,
      });
      expect(omise.deleteSchedule.mock.calls).toEqual([['schd_test_stray']]);
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain('refund');
    });

    it('an orphan schedule kept on a payment → found, not renewed, refundRequired, deleted', async () => {
      db.payments.push({
        id: PAY2,
        userId: USER,
        subscriptionId: SUB_OLD,
        omiseScheduleId: 'schd_test_orphan',
        totalSatang: 19900,
        createdAt: NOW,
      });
      await service.applyCharge(
        renewal({ schedule: 'schd_test_orphan' }),
        undefined,
        NOW,
      );
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({ refundRequired: true, subscriptionId: SUB_OLD });
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + DAY),
      );
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_orphan');
    });

    it('renewal charged after the end + 3 days → not renewed, refundRequired, auto renewal off, schedule deleted', async () => {
      db.subs[0].currentPeriodEnd = new Date(NOW_S.getTime() - 4 * DAY);
      await service.applyCharge(renewal(), undefined, NOW);
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({ status: 'successful', refundRequired: true });
      expect(db.subs[0]).toMatchObject({
        currentPeriodEnd: new Date(NOW_S.getTime() - 4 * DAY),
        autoRenew: false,
        omiseScheduleId: null,
      });
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_run');
    });

    it('auto renewal canceled but a charge came anyway → refundRequired, not extended', async () => {
      db.subs[0].autoRenew = false;
      await service.applyCharge(renewal(), undefined, NOW);
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({ refundRequired: true });
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + DAY),
      );
    });

    it('a retry after the end passed → +30 days from now', async () => {
      db.subs[0].currentPeriodEnd = new Date(NOW_S.getTime() - 2 * DAY);
      await service.applyCharge(renewal(), undefined, NOW);
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 30 * DAY),
      );
    });

    it('subscription no longer active (revoked) → money recorded, not extended, schedule deleted, logged for refund', async () => {
      db.subs[0].status = 'revoked';
      await service.applyCharge(renewal(), undefined, NOW);
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({ status: 'successful', refundRequired: true });
      expect(db.subs[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + DAY),
      );
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_run');
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain('refund');
    });

    it('a schedule nobody knows → ignored', async () => {
      const outcome = await service.applyCharge(
        renewal({ schedule: 'schd_test_unknown' }),
        undefined,
        NOW,
      );
      expect(outcome).toMatchObject({
        handled: false,
        reason: 'subscription_not_found',
      });
    });
  });

  describe('orphan schedules and the card of a subscription (round 2)', () => {
    it('card checkout: the charge card is on the new row, then the schedule card (brand from the customer, id from Opn)', async () => {
      omise.getCharge.mockResolvedValue(
        charge({
          card: {
            id: 'card_test_paid',
            brand: 'MasterCard',
            last_digits: '4444',
          },
        }),
      );
      omise.createSchedule.mockResolvedValue({
        object: 'schedule',
        id: 'schd_test_new',
        status: 'running',
        charge: { card: 'card_test_default' },
      });
      await service.syncCharge('chrg_test_1', PAY1);
      expect(active()[0]).toMatchObject({
        cardBrand: 'Visa',
        cardLastDigits: '4242',
        omiseCardId: 'card_test_default',
        omiseScheduleId: 'schd_test_new',
        renewalFailedAt: null,
      });
    });

    it('card stored from the charge when no schedule could be made', async () => {
      omise.getCharge.mockResolvedValue(
        charge({
          card: {
            id: 'card_test_paid',
            brand: 'MasterCard',
            last_digits: '4444',
          },
        }),
      );
      omise.createSchedule.mockRejectedValue(new OmiseError(true, 503, 'x'));
      await service.syncCharge('chrg_test_1', PAY1);
      expect(active()[0]).toMatchObject({
        cardBrand: 'MasterCard',
        cardLastDigits: '4444',
        omiseCardId: 'card_test_paid',
        autoRenew: false,
      });
    });

    it('schedule made at Opn but saving it fails → deleted at Opn again', async () => {
      failScheduleSave = true;
      await service.syncCharge('chrg_test_1', PAY1);
      expect(omise.createSchedule).toHaveBeenCalledTimes(1);
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_new');
      expect(active()[0]).toMatchObject({
        omiseScheduleId: null,
        autoRenew: false,
      });
      expect(pay1().status).toBe('successful');
    });

    it('…and Opn cannot delete it either → ERROR logged with the id, id kept on the payment', async () => {
      failScheduleSave = true;
      omise.deleteSchedule.mockRejectedValue(new OmiseError(true, 503, 'x'));
      await service.syncCharge('chrg_test_1', PAY1);
      expect(pay1().omiseScheduleId).toBe('schd_test_new');
      expect(
        error.mock.calls.map((c: unknown[]) => String(c[0])).join('\n'),
      ).toContain('schd_test_new');
    });

    it('the row got another schedule meanwhile → the new one is deleted (not saved)', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      const sub = active()[0] as SubRow & Row;
      sub.omiseScheduleId = null;
      omise.createSchedule.mockImplementationOnce(() => {
        sub.omiseScheduleId = 'schd_test_other';
        return Promise.resolve({
          object: 'schedule',
          id: 'schd_test_late',
          status: 'running',
        });
      });
      await expect(
        service.createRenewalSchedule(sub.id, PAY1),
      ).resolves.toBeNull();
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_late');
      expect(sub.omiseScheduleId).toBe('schd_test_other');
    });

    it('cancelScheduleQuietly only clears rows that still point to that schedule', async () => {
      db.subs.push({
        id: 's1',
        omiseScheduleId: 'schd_test_x',
        autoRenew: true,
      });
      omise.deleteSchedule.mockImplementation(() => {
        // another writer gave the row a new schedule meanwhile
        db.subs[0].omiseScheduleId = 'schd_test_y';
        return Promise.resolve({ status: 'deleted' });
      });
      await service.cancelScheduleQuietly('schd_test_x');
      expect(db.subs[0]).toMatchObject({
        omiseScheduleId: 'schd_test_y',
        autoRenew: true,
      });
    });
  });

  describe('schedules and cards', () => {
    it('cancelScheduleQuietly: Opn 404 counts as deleted and clears the rows', async () => {
      db.subs.push({
        id: 's',
        userId: USER,
        omiseScheduleId: 'schd_test_x',
        autoRenew: true,
      });
      omise.deleteSchedule.mockRejectedValue(
        new OmiseError(false, 404, 'not_found'),
      );
      await expect(service.cancelScheduleQuietly('schd_test_x')).resolves.toBe(
        true,
      );
      expect(db.subs[0]).toMatchObject({
        omiseScheduleId: null,
        autoRenew: false,
      });
    });

    it('remakeSchedulesForUser: old schedule deleted, a new one from the same end date', async () => {
      db.subs.push({
        id: SUB_OLD,
        userId: USER,
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        omiseScheduleId: 'schd_test_old',
        autoRenew: true,
        currentPeriodEnd: new Date(Date.now() + 5 * DAY),
        lastPaymentId: PAY1,
      });
      await expect(service.remakeSchedulesForUser(USER)).resolves.toEqual([]);
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_old');
      expect(omise.createSchedule).toHaveBeenCalledTimes(1);
      expect(db.subs[0]).toMatchObject({
        omiseScheduleId: 'schd_test_new',
        autoRenew: true,
      });
    });

    it('ensureCustomerLocked: first card → customer made once even if the transaction is retried', async () => {
      db.customers = [];
      omise.createCustomer.mockResolvedValue({
        object: 'customer',
        id: 'cust_test_new',
        default_card: 'card_test_1',
        cards: {
          data: [
            {
              object: 'card',
              id: 'card_test_1',
              brand: 'Visa',
              last_digits: '4242',
            },
          ],
        },
      });
      const memo = {};
      const manager = ops as never;
      await service.ensureCustomerLocked(
        manager,
        { id: 'user-b', email: 'b@x.test' },
        'tokn_test_1',
        memo,
      );
      db.customers = []; // the first transaction was rolled back
      const card = await service.ensureCustomerLocked(
        manager,
        { id: 'user-b', email: 'b@x.test' },
        'tokn_test_1',
        memo,
      );
      expect(omise.createCustomer).toHaveBeenCalledTimes(1);
      expect(card).toEqual({
        customerId: 'cust_test_new',
        cardId: 'card_test_1',
        cardBrand: 'Visa',
        cardLastDigits: '4242',
      });
      expect(db.customers).toEqual([
        {
          createdAt: NOW,
          userId: 'user-b',
          omiseCustomerId: 'cust_test_new',
          cardBrand: 'Visa',
          cardLastDigits: '4242',
        },
      ]);
    });

    it('attachCard: existing customer → card attached, then made the default card', async () => {
      omise.updateCustomer
        .mockResolvedValueOnce({
          object: 'customer',
          id: 'cust_test_a',
          default_card: 'card_old',
          cards: {
            data: [
              {
                id: 'card_old',
                brand: 'Visa',
                last_digits: '4242',
                created_at: '2026-11-01T00:00:00Z',
              },
              {
                id: 'card_new',
                brand: 'MasterCard',
                last_digits: '4444',
                created_at: '2026-11-13T00:00:00Z',
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          object: 'customer',
          id: 'cust_test_a',
          default_card: 'card_new',
          cards: { data: [] },
        });
      await service.attachCard(
        { omiseCustomerId: 'cust_test_a' },
        { id: USER },
        'tokn_test_2',
      );
      expect(omise.updateCustomer.mock.calls).toEqual([
        ['cust_test_a', { card: 'tokn_test_2' }],
        ['cust_test_a', { default_card: 'card_new' }],
      ]);
    });

    it('attachCard: token refused → 400 CARD_DECLINED; Opn down → 503; customer gone at Opn → new customer', async () => {
      omise.updateCustomer.mockRejectedValueOnce(
        new OmiseError(false, 400, 'used_token'),
      );
      const declined = await service
        .attachCard(
          { omiseCustomerId: 'cust_test_a' },
          { id: USER },
          'tokn_test_x',
        )
        .catch((e: unknown) => e);
      expect(declined).toBeInstanceOf(HttpException);
      expect((declined as HttpException).getResponse()).toMatchObject({
        errorCode: 'CARD_DECLINED',
        statusCode: 400,
      });
      omise.updateCustomer.mockRejectedValueOnce(
        new OmiseError(true, 503, 'timeout'),
      );
      const down = await service
        .attachCard(
          { omiseCustomerId: 'cust_test_a' },
          { id: USER },
          'tokn_test_x',
        )
        .catch((e: unknown) => e);
      expect((down as HttpException).getStatus()).toBe(503);
      omise.updateCustomer.mockRejectedValueOnce(
        new OmiseError(
          false,
          404,
          'not_found',
          'customer cust_test_a was not found',
        ),
      );
      omise.createCustomer.mockResolvedValueOnce({
        object: 'customer',
        id: 'cust_test_b2',
      });
      await expect(
        service.attachCard(
          { omiseCustomerId: 'cust_test_a' },
          { id: USER },
          'tokn_test_x',
        ),
      ).resolves.toMatchObject({ id: 'cust_test_b2' });
    });
  });

  // ── discount codes (task 19) ────────────────────────────────────────

  describe('discount codes (task 19)', () => {
    const CODE = 'dc-1';
    beforeEach(() => {
      // 20% of 199 baht, VAT on the price after it
      Object.assign(pay1(), {
        subtotalSatang: 19900,
        discountSatang: 3980,
        vatSatang: 1114,
        totalSatang: 17034,
        discountCodeId: CODE,
      });
      db.codes.push({ id: CODE, code: 'NEWYEAR20', redeemedCount: 4 });
      db.redemptions.push({
        id: 'r-1',
        codeId: CODE,
        userId: USER,
        paymentId: PAY1,
        amountSatang: 3980,
        status: 'reserved',
      });
      omise.getCharge.mockResolvedValue(charge({ amount: 17034 }));
    });

    it('successful charge → use used + redeemedCount + 1, once; code row locked after venue / plan (AC4)', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      expect(db.redemptions[0].status).toBe('used');
      expect(db.codes[0].redeemedCount).toBe(5);
      // (the next user lock is the one that saves the new schedule)
      expect(lockOrder.slice(0, 4)).toEqual([
        'users:FOR UPDATE',
        'venues:pessimistic_read',
        'plans:pessimistic_read',
        'codes:pessimistic_write',
      ]);
      // replay: nothing more
      await service.syncCharge('chrg_test_1', PAY1);
      expect(db.codes[0].redeemedCount).toBe(5);
    });

    it('the renewal schedule charges the full price + VAT, not the discounted total (AC4)', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      const params = (
        omise.createSchedule.mock.calls[0] as [CreateScheduleParams]
      )[0];
      expect(params.charge.amount).toBe(21293);
      // the payment itself keeps what was charged
      expect(pay1()).toMatchObject({
        status: 'successful',
        totalSatang: 17034,
      });
    });

    it('a renewal of a discounted first payment is recorded with the full split and no discount', async () => {
      await service.syncCharge('chrg_test_1', PAY1);
      const sub = active()[0];
      const outcome = await service.applyCharge(
        charge({
          id: 'chrg_test_ren',
          amount: 21293,
          schedule: 'schd_test_new',
          metadata: {},
        }),
        undefined,
        new Date(sub.currentPeriodEnd.getTime() - 3600e3),
      );
      expect(outcome).toMatchObject({ handled: true, status: 'successful' });
      expect(
        db.payments.find((p) => p.omiseChargeId === 'chrg_test_ren'),
      ).toMatchObject({
        isRenewal: true,
        subtotalSatang: 19900,
        vatSatang: 1393,
        discountSatang: 0,
        totalSatang: 21293,
        discountCodeId: null,
      });
      expect(db.codes[0].redeemedCount).toBe(5);
    });

    it('declined / expired charge → the reservation is released, no count (AC5)', async () => {
      omise.getCharge.mockResolvedValue(
        charge({ amount: 17034, status: 'failed', failure_code: 'x' }),
      );
      await service.syncCharge('chrg_test_1', PAY1);
      expect(pay1().status).toBe('failed');
      expect(db.redemptions[0].status).toBe('released');
      expect(db.codes[0].redeemedCount).toBe(4);
    });

    it('a released use whose payment is paid after all (old QR) → used again', async () => {
      db.redemptions[0].status = 'released';
      await service.syncCharge('chrg_test_1', PAY1);
      expect(db.redemptions[0].status).toBe('used');
      expect(db.codes[0].redeemedCount).toBe(5);
    });

    it('a payment without a discount code never touches the code tables', async () => {
      Object.assign(pay1(), {
        subtotalSatang: 18598,
        discountSatang: 0,
        vatSatang: 1302,
        totalSatang: 19900,
        discountCodeId: null,
      });
      omise.getCharge.mockResolvedValue(charge());
      await service.syncCharge('chrg_test_1', PAY1);
      expect(db.redemptions[0].status).toBe('reserved');
      expect(lockOrder).not.toContain('codes:pessimistic_write');
      const params = (
        omise.createSchedule.mock.calls[0] as [CreateScheduleParams]
      )[0];
      expect(params.charge.amount).toBe(19900);
    });
  });

  // ── round 2 ─────────────────────────────────────────────────────────

  describe('canceled payments (task 19 round 2)', () => {
    beforeEach(() => {
      Object.assign(pay1(), {
        method: 'promptpay',
        status: 'canceled',
        failureCode: 'replaced',
        failureMessage: 'ถูกแทนที่ด้วยรายการชำระใหม่',
        omiseChargeId: 'chrg_test_1',
        discountSatang: 3980,
        subtotalSatang: 19900,
        vatSatang: 1114,
        totalSatang: 17034,
        discountCodeId: 'dc-1',
      });
      db.codes.push({ id: 'dc-1', redeemedCount: 0 });
      db.redemptions.push({
        id: 'r-1',
        codeId: 'dc-1',
        paymentId: PAY1,
        status: 'released',
      });
    });

    it('paid anyway (old QR) → successful + refundRequired; no rights, no schedule, discount not used, ERROR logged', async () => {
      omise.getCharge.mockResolvedValue(charge({ amount: 17034 }));
      const outcome = await service.syncCharge('chrg_test_1', PAY1);
      expect(outcome).toMatchObject({ handled: true, status: 'successful' });
      expect(pay1()).toMatchObject({
        status: 'successful',
        refundRequired: true,
        failureCode: null,
        subscriptionId: null,
        paidAt: new Date('2026-11-13T04:59:58Z'),
      });
      expect(String(pay1().failureMessage)).toContain('คืนเงิน');
      expect(db.subs).toHaveLength(0);
      expect(omise.createSchedule).not.toHaveBeenCalled();
      expect(db.redemptions[0].status).toBe('released');
      expect(db.codes[0].redeemedCount).toBe(0);
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain('refund');
      // again (webhook replay): nothing more
      await service.syncCharge('chrg_test_1', PAY1);
      expect(db.subs).toHaveLength(0);
    });

    it('failed / expired at Opn → stays canceled', async () => {
      for (const status of ['failed', 'expired'] as const) {
        omise.getCharge.mockResolvedValue(charge({ amount: 17034, status }));
        await service.syncCharge('chrg_test_1', PAY1);
        expect(pay1().status).toBe('canceled');
      }
    });
  });

  describe('moveRenewalSchedule (task 19 round 2)', () => {
    const END = new Date('2026-12-20T11:00:00.000Z');
    beforeEach(() => {
      Object.assign(pay1(), {
        status: 'successful',
        omiseChargeId: 'chrg_test_first',
        omiseScheduleId: 'schd_test_old',
        subtotalSatang: 19900,
        discountSatang: 3980,
        vatSatang: 1114,
        totalSatang: 17034,
      });
      db.subs.push({
        id: SUB_OLD,
        userId: USER,
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        source: 'card',
        autoRenew: true,
        omiseScheduleId: 'schd_test_old',
        omiseCardId: 'card_test_a',
        currentPeriodStart: new Date(NOW_S.getTime() - DAY),
        currentPeriodEnd: END,
        lastPaymentId: PAY1,
      });
    });

    it('new schedule from the new end (same amount = full price + VAT, same card) saved, then the old one deleted', async () => {
      await expect(
        service.moveRenewalSchedule(SUB_OLD, 'schd_test_old'),
      ).resolves.toBe(true);
      const params = (
        omise.createSchedule.mock.calls[0] as [CreateScheduleParams]
      )[0];
      expect(params).toMatchObject({
        every: 30,
        start_date: '2026-12-20', // Thai date of the new end
        charge: {
          customer: 'cust_test_a',
          card: 'card_test_a',
          amount: 21293,
          metadata: { subscriptionId: SUB_OLD },
        },
      });
      expect(db.subs[0]).toMatchObject({
        omiseScheduleId: 'schd_test_new',
        autoRenew: true,
      });
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_old');
      expect(omise.createSchedule.mock.invocationCallOrder[0]).toBeLessThan(
        omise.deleteSchedule.mock.invocationCallOrder[0],
      );
    });

    it('Opn cannot make the new one → false, the old schedule kept (not deleted), ERROR logged', async () => {
      omise.createSchedule.mockRejectedValueOnce(
        new OmiseError(true, 503, 'timeout'),
      );
      await expect(
        service.moveRenewalSchedule(SUB_OLD, 'schd_test_old'),
      ).resolves.toBe(false);
      expect(db.subs[0].omiseScheduleId).toBe('schd_test_old');
      expect(omise.deleteSchedule).not.toHaveBeenCalled();
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain(
        'old date',
      );
    });

    it('the row has another schedule already → nothing to move (true)', async () => {
      db.subs[0].omiseScheduleId = 'schd_test_other';
      await expect(
        service.moveRenewalSchedule(SUB_OLD, 'schd_test_old'),
      ).resolves.toBe(true);
      expect(omise.createSchedule).not.toHaveBeenCalled();
    });

    it('the row changed while the new one was made → the new one is deleted again, old kept, false', async () => {
      omise.createSchedule.mockImplementationOnce(() => {
        db.subs[0].omiseScheduleId = 'schd_test_other';
        return Promise.resolve({
          object: 'schedule',
          id: 'schd_test_new',
          status: 'running',
        });
      });
      await expect(
        service.moveRenewalSchedule(SUB_OLD, 'schd_test_old'),
      ).resolves.toBe(false);
      expect(omise.deleteSchedule).toHaveBeenCalledWith('schd_test_new');
      expect(omise.deleteSchedule).not.toHaveBeenCalledWith('schd_test_old');
      expect(db.subs[0].omiseScheduleId).toBe('schd_test_other');
    });

    it('old schedule cannot be deleted → still true (new one saved), ERROR logged', async () => {
      omise.deleteSchedule.mockRejectedValueOnce(
        new OmiseError(true, 503, 'timeout'),
      );
      await expect(
        service.moveRenewalSchedule(SUB_OLD, 'schd_test_old'),
      ).resolves.toBe(true);
      expect(db.subs[0].omiseScheduleId).toBe('schd_test_new');
      expect(String((error.mock.calls[0] as unknown[])[0])).toContain(
        'schd_test_old',
      );
    });
  });
});
