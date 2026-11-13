import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { User } from '../users/user.entity';
import { ProBillingService } from './pro-billing.service';
import { ProPlan } from './pro-plan.entity';
import { ProVenue } from './pro-venue.entity';
import { ProSubscription } from './pro-subscription.entity';
import {
  AdminSubscriptionView,
  ProSubscriptionsService,
  effectiveStatus,
} from './pro-subscriptions.service';

const NOW = new Date('2026-11-13T05:00:00.400Z');
const NOW_S = new Date('2026-11-13T05:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const admin = { id: 'admin-1', role: 'admin' };

const plans = [
  { id: 'netsat-free', venueId: 'netsat', code: 'free', rank: 0 },
  { id: 'netsat-pro', venueId: 'netsat', code: 'pro', rank: 1 },
  { id: 'netsat-max', venueId: 'netsat', code: 'max', rank: 2 },
  { id: 'tgat-pro', venueId: 'tgat', code: 'pro', rank: 1 },
];
const users = [
  { id: 'user-a', email: 'a@example.com' },
  { id: 'user-b', email: 'b@example.com' },
];

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key];
    if (value instanceof FindOperator) {
      if (value.type === 'in') {
        return (value.value as unknown as unknown[]).includes(actual);
      }
      const t = (actual as Date).getTime();
      const v = (value.value as Date).getTime();
      if (value.type === 'moreThan') return t > v;
      if (value.type === 'lessThanOrEqual') return t <= v;
      throw new Error(`operator ${value.type} not mocked`);
    }
    return actual === value;
  });
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

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

describe('ProSubscriptionsService (task 17)', () => {
  let service: ProSubscriptionsService;
  let store: Row[];
  let queries: { sql: string; params?: unknown[] }[];
  let transactions: jest.Mock;
  // Fake InnoDB row locks of users: a FOR UPDATE waits for the holder
  let locks: Map<string, Promise<void>>;
  let lockTimeoutFor: string | null;
  let deadlocksLeft: number;
  let subsUpdate: jest.Mock;
  let insertError: Error | null;
  let updateCriteria: Row[];
  // [table, lock] of every findOne in the grant transaction
  let reads: [string, unknown][];
  let venues: string[];
  let billing: {
    cancelScheduleQuietly: jest.Mock;
    moveRenewalSchedule: jest.Mock;
  };

  beforeEach(async () => {
    billing = {
      cancelScheduleQuietly: jest.fn().mockResolvedValue(true),
      moveRenewalSchedule: jest.fn().mockResolvedValue(true),
    };
    store = [];
    queries = [];
    locks = new Map();
    lockTimeoutFor = null;
    deadlocksLeft = 0;
    insertError = null;
    updateCriteria = [];
    reads = [];
    venues = ['netsat', 'tgat'];

    transactions = jest.fn(async (work: (m: unknown) => Promise<unknown>) => {
      if (deadlocksLeft > 0) {
        deadlocksLeft--;
        throw Object.assign(new Error('Deadlock found'), {
          code: 'ER_LOCK_DEADLOCK',
          errno: 1213,
        });
      }
      let release = () => {};
      const pending: Row[] = [];
      const manager = {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
          queries.push({ sql, params });
          if (sql.startsWith('SELECT @@SESSION')) return [{ t: 50 }];
          if (sql.startsWith('SET SESSION')) return undefined;
          if (sql.includes('FOR UPDATE')) {
            const userId = params?.[0] as string;
            if (lockTimeoutFor === userId) {
              throw Object.assign(new Error('Lock wait timeout'), {
                code: 'ER_LOCK_WAIT_TIMEOUT',
                errno: 1205,
              });
            }
            while (locks.has(userId)) await locks.get(userId);
            let done = () => {};
            locks.set(userId, new Promise<void>((resolve) => (done = resolve)));
            release = () => {
              locks.delete(userId);
              done();
            };
            return users.some((u) => u.id === userId) ? [{ id: userId }] : [];
          }
          throw new Error(`unexpected query ${sql}`);
        }),
        findOne: jest.fn(
          (entity: unknown, options: { where: Row; lock?: unknown }) => {
            const isVenue = entity === ProVenue;
            reads.push([isVenue ? 'venue' : 'plan', options.lock]);
            if (isVenue) {
              const id = options.where.id as string;
              return Promise.resolve(
                venues.includes(id)
                  ? { id, key: id, name: id.toUpperCase() }
                  : null,
              );
            }
            return Promise.resolve(
              plans.find((p) => p.id === options.where.id) ?? null,
            );
          },
        ),
        find: jest.fn(async (entity: unknown, { where }: { where: Row }) => {
          await tick();
          const rows: Row[] = entity === ProPlan ? plans : store;
          return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
        }),
        update: jest.fn(
          async (_entity: unknown, criteria: Row, changes: Row) => {
            updateCriteria.push(criteria);
            await tick();
            for (const row of store) {
              if (matches(row, criteria)) Object.assign(row, changes);
            }
          },
        ),
        insert: jest.fn(async (_entity: unknown, row: Row) => {
          await tick();
          if (insertError) throw insertError;
          pending.push({ ...row });
        }),
      };
      try {
        const result = await work(manager);
        store.push(...pending); // commit
        return result;
      } finally {
        release();
      }
    });

    subsUpdate = jest.fn((criteria: Row, changes: Row) => {
      const rows = store.filter((r) => matches(r, criteria));
      for (const row of rows) Object.assign(row, changes);
      return Promise.resolve({ affected: rows.length });
    });

    const module = await Test.createTestingModule({
      providers: [
        ProSubscriptionsService,
        {
          provide: getRepositoryToken(ProSubscription),
          useValue: {
            findOne: jest.fn(({ where }: { where: Row }) =>
              Promise.resolve(store.find((r) => r.id === where.id) ?? null),
            ),
            update: subsUpdate,
            find: jest.fn(({ where }: { where: Row }) =>
              Promise.resolve(store.filter((r) => matches(r, where))),
            ),
          },
        },
        {
          provide: getRepositoryToken(ProPlan),
          useValue: {
            findOne: jest.fn(({ where }: { where: Row }) =>
              Promise.resolve(plans.find((p) => p.id === where.id) ?? null),
            ),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(({ where }: { where: Row }) =>
              Promise.resolve(
                users.find((u) => u.email === where.email) ?? null,
              ),
            ),
          },
        },
        { provide: DataSource, useValue: { transaction: transactions } },
        { provide: ProBillingService, useValue: billing },
      ],
    }).compile();

    service = module.get(ProSubscriptionsService);
    // The view is a joined query (checked against the dev DB); here the row
    jest
      .spyOn(service, 'findAdminView')
      .mockImplementation((id: string) =>
        Promise.resolve(
          store.find((r) => r.id === id) as unknown as AdminSubscriptionView,
        ),
      );
  });

  const activeOf = (userId: string, venueId: string) =>
    store.filter(
      (r) =>
        r.userId === userId && r.venueId === venueId && r.status === 'active',
    );

  const grant = (planId: string, email = 'a@example.com', days = 30) =>
    service.grant({ email, planId, days, note: ' ให้ทดลอง ' }, admin, NOW);

  describe('grant (AC5)', () => {
    it('adds an active row from now (whole seconds) for `days` days under the user lock', async () => {
      const view = await grant('netsat-pro');

      expect(store).toHaveLength(1);
      expect(store[0]).toMatchObject({
        id: view.id,
        userId: 'user-a',
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        source: 'admin',
        currentPeriodStart: NOW_S,
        currentPeriodEnd: new Date(NOW_S.getTime() + 30 * DAY),
        autoRenew: false,
        note: 'ให้ทดลอง',
        grantedById: 'admin-1',
      });
      // lock the user row first, with a short lock wait, restored after
      const sqls = queries.map((q) => q.sql);
      expect(sqls[1]).toBe('SET SESSION innodb_lock_wait_timeout = 5');
      expect(queries[2]).toEqual({
        sql: 'SELECT id FROM users WHERE id = ? FOR UPDATE',
        params: ['user-a'],
      });
      expect(queries[queries.length - 1]).toEqual({
        sql: 'SET SESSION innodb_lock_wait_timeout = ?',
        params: [50],
      });
    });

    it('a second plan of the same venue replaces the first (revoked); another venue is separate', async () => {
      const first = await grant('netsat-pro');
      const second = await grant('netsat-max');

      expect(activeOf('user-a', 'netsat').map((r) => r.id)).toEqual([
        second.id,
      ]);
      expect(store.find((r) => r.id === first.id)).toMatchObject({
        status: 'revoked',
        revokedAt: NOW_S,
        revokedById: 'admin-1',
      });

      await grant('tgat-pro');
      expect(activeOf('user-a', 'netsat')).toHaveLength(1);
      expect(activeOf('user-a', 'tgat')).toHaveLength(1);
    });

    it('ends the old rows by primary key only (no range locks, round 3)', async () => {
      const first = await grant('netsat-pro');
      await grant('netsat-max');
      // the first grant had nothing to end; the second ends one row by id
      expect(updateCriteria).toHaveLength(1);
      expect(Object.keys(updateCriteria[0])).toEqual(['id']);
      expect((updateCriteria[0].id as FindOperator<string[]>).value).toEqual([
        first.id,
      ]);
    });

    it('an old active row already past its end becomes expired, not revoked', async () => {
      store.push({
        id: 'old',
        userId: 'user-a',
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        currentPeriodEnd: new Date(NOW.getTime() - DAY),
      });
      await grant('netsat-max');
      expect(store.find((r) => r.id === 'old')).toMatchObject({
        status: 'expired',
      });
      expect(store.find((r) => r.id === 'old')?.revokedAt).toBeUndefined();
    });

    it('other users are not touched', async () => {
      await grant('netsat-pro', 'b@example.com');
      await grant('netsat-max', 'a@example.com');
      expect(activeOf('user-b', 'netsat')).toHaveLength(1);
      expect(activeOf('user-a', 'netsat')).toHaveLength(1);
    });

    it('unknown email → 404 USER_NOT_FOUND; unknown plan → 404; free plan → 400; nothing written', async () => {
      expect(await errorOf(grant('netsat-pro', 'nobody@example.com'))).toEqual({
        status: 404,
        body: {
          statusCode: 404,
          message: 'ไม่พบผู้ใช้ที่มีอีเมลนี้',
          errorCode: 'USER_NOT_FOUND',
        },
      });
      expect((await errorOf(grant('missing'))).body.errorCode).toBe(
        'PLAN_NOT_FOUND',
      );
      expect(await errorOf(grant('netsat-free'))).toMatchObject({
        status: 400,
        body: { errorCode: 'FREE_PLAN_GRANT' },
      });
      expect(store).toHaveLength(0);
      expect(transactions).not.toHaveBeenCalled();
    });

    it('lock still held after the wait → 409 USER_BUSY, nothing written', async () => {
      lockTimeoutFor = 'user-a';
      expect(await errorOf(grant('netsat-pro'))).toMatchObject({
        status: 409,
        body: { errorCode: 'USER_BUSY' },
      });
      expect(store).toHaveLength(0);
    });

    it('lock order users → venue → plan, like the admin edits (round 3)', async () => {
      await grant('netsat-pro');
      expect(queries[2].sql).toBe(
        'SELECT id FROM users WHERE id = ? FOR UPDATE',
      );
      expect(reads).toEqual([
        // venueId only (it never changes), no lock
        ['plan', undefined],
        ['venue', { mode: 'pessimistic_read' }],
        ['plan', { mode: 'pessimistic_read' }],
      ]);
    });

    it('venue deleted meanwhile → 404 PLAN_NOT_FOUND, nothing written (round 3)', async () => {
      venues = ['tgat'];
      expect(await errorOf(grant('netsat-pro'))).toMatchObject({
        status: 404,
        body: { errorCode: 'PLAN_NOT_FOUND' },
      });
      expect(store).toHaveLength(0);
    });

    it('venue/plan deleted before the insert (FK 1452) → 404 PLAN_NOT_FOUND, not 500 (round 2)', async () => {
      insertError = Object.assign(
        new Error('Cannot add or update a child row'),
        {
          code: 'ER_NO_REFERENCED_ROW_2',
          errno: 1452,
        },
      );
      expect(await errorOf(grant('netsat-pro'))).toEqual({
        status: 404,
        body: {
          statusCode: 404,
          message: 'ไม่พบแพ็กเกจนี้',
          errorCode: 'PLAN_NOT_FOUND',
        },
      });
      expect(store).toHaveLength(0);
      // other DB errors are not hidden
      insertError = new Error('boom');
      await expect(grant('netsat-pro')).rejects.toThrow('boom');
    });

    it('a deadlock victim is retried', async () => {
      deadlocksLeft = 1;
      await grant('netsat-pro');
      expect(transactions).toHaveBeenCalledTimes(2);
      expect(activeOf('user-a', 'netsat')).toHaveLength(1);
    });

    it('still a deadlock victim after 3 tries → 409 USER_BUSY, not 500 (round 3)', async () => {
      deadlocksLeft = 3;
      expect(await errorOf(grant('netsat-pro'))).toMatchObject({
        status: 409,
        body: { errorCode: 'USER_BUSY' },
      });
      expect(transactions).toHaveBeenCalledTimes(3);
      expect(store).toHaveLength(0);
    });
  });

  it('two grants at once for the same user and venue → one active row (AC9)', async () => {
    const results = await Promise.all([
      grant('netsat-pro'),
      grant('netsat-max'),
      grant('netsat-pro'),
    ]);
    expect(results).toHaveLength(3);
    expect(activeOf('user-a', 'netsat')).toHaveLength(1);
    expect(store.filter((r) => r.status === 'revoked')).toHaveLength(2);
  });

  describe('revoke (AC6)', () => {
    beforeEach(() => {
      store.push(
        {
          id: 'sub-1',
          userId: 'user-a',
          venueId: 'netsat',
          status: 'active',
          note: 'เดิม',
          currentPeriodEnd: new Date(NOW.getTime() + DAY),
        },
        { id: 'sub-old', userId: 'user-a', status: 'expired' },
      );
    });

    it('active → revoked now by the admin, note replaced when sent', async () => {
      await service.revoke('sub-1', { note: 'ขอคืนเงิน' }, admin, NOW);
      expect(store[0]).toMatchObject({
        status: 'revoked',
        revokedAt: NOW_S,
        revokedById: 'admin-1',
        note: 'ขอคืนเงิน',
      });
      // conditional: only while still active
      expect(subsUpdate).toHaveBeenCalledWith(
        { id: 'sub-1', status: 'active' },
        expect.objectContaining({ status: 'revoked' }),
      );
    });

    it('no note → keeps the note', async () => {
      await service.revoke('sub-1', {}, admin, NOW);
      expect(store[0]).toMatchObject({ status: 'revoked', note: 'เดิม' });
    });

    it('already revoked → 409 ALREADY_REVOKED; expired → 409 NOT_ACTIVE; missing → 404', async () => {
      await service.revoke('sub-1', {}, admin, NOW);
      expect(
        (await errorOf(service.revoke('sub-1', {}, admin, NOW))).body,
      ).toMatchObject({ errorCode: 'ALREADY_REVOKED' });
      expect(
        (await errorOf(service.revoke('sub-old', {}, admin, NOW))).body,
      ).toMatchObject({ errorCode: 'NOT_ACTIVE' });
      expect(
        await errorOf(service.revoke('nope', {}, admin, NOW)),
      ).toMatchObject({
        status: 404,
        body: { errorCode: 'SUBSCRIPTION_NOT_FOUND' },
      });
    });

    it('revoked meanwhile (conditional update matches nothing) → 409', async () => {
      subsUpdate.mockImplementationOnce(() => {
        store[0].status = 'revoked';
        return Promise.resolve({ affected: 0 });
      });
      expect(
        (await errorOf(service.revoke('sub-1', {}, admin, NOW))).body,
      ).toMatchObject({ errorCode: 'ALREADY_REVOKED' });
    });
  });

  it('effectiveStatus: active past its end → expired (AC6)', () => {
    const later = new Date(NOW.getTime() + 1000);
    expect(effectiveStatus('active', later, NOW)).toBe('active');
    expect(effectiveStatus('active', NOW, NOW)).toBe('expired');
    expect(effectiveStatus('active', new Date(0), NOW)).toBe('expired');
    expect(effectiveStatus('revoked', later, NOW)).toBe('revoked');
    expect(effectiveStatus('expired', later, NOW)).toBe('expired');
  });

  it('GET /pro/me: only rows that give rights now, no user fields', async () => {
    store.push(
      {
        id: 's1',
        userId: 'user-a',
        venueId: 'netsat',
        planId: 'netsat-pro',
        status: 'active',
        source: 'admin',
        autoRenew: 0,
        currentPeriodStart: NOW_S,
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
        venue: { key: 'netsat', name: 'NETSAT' },
        plan: { code: 'pro', name: 'PRO' },
      },
      {
        id: 's2',
        userId: 'user-a',
        venueId: 'tgat',
        status: 'active',
        currentPeriodEnd: new Date(NOW.getTime() - DAY),
      },
      {
        id: 's3',
        userId: 'user-a',
        venueId: 'alevel',
        status: 'revoked',
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
      },
    );
    await expect(service.findMine('user-a', NOW)).resolves.toEqual([
      {
        id: 's1',
        cardBrand: null,
        cardLastDigits: null,
        canceledAt: null,
        renewalFailedAt: null,
        venueId: 'netsat',
        venueKey: 'netsat',
        venueName: 'NETSAT',
        planId: 'netsat-pro',
        planCode: 'pro',
        planName: 'PRO',
        status: 'active',
        currentPeriodStart: NOW_S,
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
        autoRenew: false,
        source: 'admin',
      },
    ]);
  });

  describe('task 18: card subscriptions', () => {
    const cardRow = (extra: Row = {}) => ({
      id: 'card-1',
      userId: 'user-a',
      venueId: 'netsat',
      planId: 'netsat-pro',
      status: 'active',
      source: 'card',
      autoRenew: 1,
      omiseScheduleId: 'schd_test_1',
      canceledAt: null,
      currentPeriodStart: NOW_S,
      currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
      venue: { key: 'netsat', name: 'NETSAT' },
      plan: { code: 'pro', name: 'PRO' },
      ...extra,
    });

    it('GET /pro/me: card rows show their own card (brand / last 4), canceledAt and renewalFailedAt; others no card', async () => {
      store.push(
        cardRow({
          canceledAt: NOW_S,
          renewalFailedAt: NOW_S,
          autoRenew: 0,
          cardBrand: 'Visa',
          cardLastDigits: '4242',
          omiseCardId: 'card_test_1',
        }),
        cardRow({
          id: 'pp-1',
          venueId: 'tgat',
          source: 'promptpay',
          cardBrand: 'MasterCard',
          cardLastDigits: '4444',
        }),
      );
      const mine = await service.findMine('user-a', NOW);
      expect(mine.find((m) => m.id === 'card-1')).toMatchObject({
        source: 'card',
        cardBrand: 'Visa',
        cardLastDigits: '4242',
        canceledAt: NOW_S,
        renewalFailedAt: NOW_S,
        autoRenew: false,
      });
      expect(mine.find((m) => m.id === 'pp-1')).toMatchObject({
        source: 'promptpay',
        cardBrand: null,
        cardLastDigits: null,
      });
      expect(JSON.stringify(mine)).not.toContain('card_test_1');
      expect(JSON.stringify(mine)).not.toContain('schd_test_1');
      const summaries = await service.findMySummaries('user-a', NOW);
      expect(summaries.map((m) => m.source).sort()).toEqual([
        'card',
        'promptpay',
      ]);
    });

    it('admin revoke of a card row: auto renewal off and its Opn schedule deleted', async () => {
      store.push(cardRow());
      await service.revoke('card-1', {}, admin, NOW);
      expect(store[0]).toMatchObject({ status: 'revoked', autoRenew: false });
      expect(billing.cancelScheduleQuietly).toHaveBeenCalledWith('schd_test_1');
    });

    it('admin grant replacing a card row: the old schedule is deleted after the commit', async () => {
      store.push(cardRow());
      billing.cancelScheduleQuietly.mockImplementation(() => {
        // runs after the commit: the new row is already stored
        expect(activeOf('user-a', 'netsat').map((r) => r.planId)).toEqual([
          'netsat-max',
        ]);
        return Promise.resolve(true);
      });
      await grant('netsat-max');
      expect(store.find((r) => r.id === 'card-1')).toMatchObject({
        status: 'revoked',
        autoRenew: false,
      });
      expect(billing.cancelScheduleQuietly).toHaveBeenCalledTimes(1);
      expect(billing.cancelScheduleQuietly).toHaveBeenCalledWith('schd_test_1');
    });

    it('grant / revoke of rows without a schedule do not call Opn', async () => {
      const view = await grant('netsat-pro');
      await service.revoke(view.id, {}, admin, NOW);
      expect(billing.cancelScheduleQuietly).not.toHaveBeenCalled();
    });
  });

  it('admin list: unknown status filter → 400 INVALID_STATUS_FILTER', async () => {
    expect(
      await errorOf(service.listForAdmin({ status: 'pending' }, NOW)),
    ).toMatchObject({
      status: 400,
      body: { errorCode: 'INVALID_STATUS_FILTER' },
    });
  });

  // ── Pro unlock codes (task 19) ──────────────────────────────────────

  describe('grantFromCode (task 19)', () => {
    let consume: jest.Mock;
    const fromCode = (planId: string, days = 7, userId = 'user-a') =>
      service.grantFromCode(
        { userId, planId, days, note: 'PRO NETSAT 7 วัน' },
        consume,
        NOW,
      );
    const row = (planId: string, extra: Row = {}) => {
      const r = {
        id: `sub-${store.length + 1}`,
        userId: 'user-a',
        venueId: 'netsat',
        planId,
        status: 'active',
        source: 'admin',
        currentPeriodStart: new Date(NOW_S.getTime() - 10 * DAY),
        currentPeriodEnd: new Date(NOW_S.getTime() + 20 * DAY),
        autoRenew: false,
        omiseScheduleId: null,
        note: null,
        ...extra,
      };
      store.push(r);
      return r;
    };

    beforeEach(() => {
      consume = jest.fn().mockResolvedValue(undefined);
    });

    it('no plan of the venue → new row from now for the days, source code, note = campaign, code consumed in the same lock', async () => {
      const result = await fromCode('netsat-pro');
      expect(consume).toHaveBeenCalledTimes(1);
      expect(store).toHaveLength(1);
      expect(store[0]).toMatchObject({
        id: result.subscriptionId,
        userId: 'user-a',
        planId: 'netsat-pro',
        status: 'active',
        source: 'code',
        note: 'PRO NETSAT 7 วัน',
        grantedById: null,
        currentPeriodStart: NOW_S,
        currentPeriodEnd: new Date(NOW_S.getTime() + 7 * DAY),
        autoRenew: false,
      });
      expect(result).toMatchObject({
        extended: false,
        currentPeriodEnd: new Date(NOW_S.getTime() + 7 * DAY),
        venue: { id: 'netsat', key: 'netsat' },
        plan: { id: 'netsat-pro', code: 'pro' },
      });
      // consume ran inside the transaction, after the user lock
      expect(transactions).toHaveBeenCalledTimes(1);
      expect(reads.map((r) => r[0])).toEqual(['plan', 'venue', 'plan']);
    });

    it('same plan running (a card row with autoRenew) → +days from its end, source kept, its schedule moved to the new end after the commit (AC2, round 2)', async () => {
      const card = row('netsat-pro', {
        source: 'card',
        autoRenew: true,
        omiseScheduleId: 'schd_test_1',
      });
      billing.moveRenewalSchedule.mockImplementationOnce(() => {
        // runs after the commit: the row already has the new end
        expect(store[0].currentPeriodEnd).toEqual(
          new Date(NOW_S.getTime() + 27 * DAY),
        );
        return Promise.resolve(true);
      });
      const result = await fromCode('netsat-pro');
      expect(result).toMatchObject({
        subscriptionId: card.id,
        extended: true,
        currentPeriodEnd: new Date(NOW_S.getTime() + 27 * DAY),
        autoRenewDatesDiffer: false,
      });
      expect(store).toHaveLength(1);
      expect(store[0]).toMatchObject({
        status: 'active',
        source: 'card',
        autoRenew: true,
        currentPeriodEnd: new Date(NOW_S.getTime() + 27 * DAY),
      });
      expect(billing.moveRenewalSchedule).toHaveBeenCalledWith(
        card.id,
        'schd_test_1',
      );
      expect(billing.cancelScheduleQuietly).not.toHaveBeenCalled();
      expect(consume).toHaveBeenCalledTimes(1);
    });

    it('schedule could not be moved → still extended (code used), autoRenewDatesDiffer true', async () => {
      row('netsat-pro', {
        source: 'card',
        autoRenew: true,
        omiseScheduleId: 'schd_test_1',
      });
      billing.moveRenewalSchedule.mockResolvedValueOnce(false);
      await expect(fromCode('netsat-pro')).resolves.toMatchObject({
        extended: true,
        autoRenewDatesDiffer: true,
      });
      expect(consume).toHaveBeenCalledTimes(1);
      expect(store[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 27 * DAY),
      );
    });

    it('no schedule / auto renewal off → nothing to move', async () => {
      row('netsat-pro', { omiseScheduleId: 'schd_test_off', autoRenew: false });
      await fromCode('netsat-pro');
      expect(billing.moveRenewalSchedule).not.toHaveBeenCalled();
    });

    it('a lower plan running → replaced (revoked, its schedule deleted after the commit), new row from now', async () => {
      // pretend PRO is "lower": a code for MAX over a running PRO card row
      const old = row('netsat-pro', {
        source: 'card',
        autoRenew: true,
        omiseScheduleId: 'schd_test_old',
      });
      const result = await fromCode('netsat-max', 7);
      expect(result.extended).toBe(false);
      expect(store.find((r) => r.id === old.id)).toMatchObject({
        status: 'revoked',
        revokedAt: NOW_S,
        revokedById: null,
        autoRenew: false,
      });
      expect(activeOf('user-a', 'netsat')).toEqual([
        expect.objectContaining({ planId: 'netsat-max', source: 'code' }),
      ]);
      expect(billing.cancelScheduleQuietly).toHaveBeenCalledWith(
        'schd_test_old',
      );
    });

    it('same or higher rank of another plan running → 409 ALREADY_HIGHER_PLAN, code not consumed, nothing written (AC2)', async () => {
      row('netsat-max');
      expect(await errorOf(fromCode('netsat-pro'))).toMatchObject({
        status: 409,
        body: { errorCode: 'ALREADY_HIGHER_PLAN' },
      });
      expect(consume).not.toHaveBeenCalled();
      expect(store).toHaveLength(1);
      expect(store[0].status).toBe('active');

      // equal rank, other plan: tgat has its own rows; add an equal-rank plan
      plans.push({
        id: 'netsat-pro2',
        venueId: 'netsat',
        code: 'pro2',
        rank: 2,
      });
      try {
        expect((await errorOf(fromCode('netsat-pro2'))).body.errorCode).toBe(
          'ALREADY_HIGHER_PLAN',
        );
      } finally {
        plans.pop();
      }
    });

    it('a row of the venue already past its end does not block: it is expired, a new row starts', async () => {
      const past = row('netsat-max', {
        currentPeriodEnd: new Date(NOW_S.getTime() - DAY),
      });
      await fromCode('netsat-pro');
      expect(store.find((r) => r.id === past.id)!.status).toBe('expired');
      expect(activeOf('user-a', 'netsat')).toHaveLength(1);
    });

    it('another venue is separate', async () => {
      row('netsat-max');
      await expect(fromCode('tgat-pro')).resolves.toMatchObject({
        extended: false,
      });
      expect(activeOf('user-a', 'tgat')).toHaveLength(1);
    });

    it('consume fails (code used meanwhile) → the error passes, nothing written', async () => {
      row('netsat-pro');
      consume.mockRejectedValueOnce(new Error('USED'));
      await expect(fromCode('netsat-pro')).rejects.toThrow('USED');
      expect(store).toHaveLength(1);
      expect(store[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 20 * DAY),
      );
    });

    it('plan missing → 404 PLAN_NOT_FOUND; free plan → 400 FREE_PLAN_GRANT; nothing consumed', async () => {
      expect((await errorOf(fromCode('nope'))).body.errorCode).toBe(
        'PLAN_NOT_FOUND',
      );
      expect((await errorOf(fromCode('netsat-free'))).body.errorCode).toBe(
        'FREE_PLAN_GRANT',
      );
      expect(consume).not.toHaveBeenCalled();
    });

    it('two codes at once for one user → run one after the other under the user lock', async () => {
      await Promise.all([fromCode('netsat-pro'), fromCode('netsat-pro')]);
      expect(activeOf('user-a', 'netsat')).toHaveLength(1);
      expect(activeOf('user-a', 'netsat')[0].currentPeriodEnd).toEqual(
        new Date(NOW_S.getTime() + 14 * DAY),
      );
    });
  });
});
