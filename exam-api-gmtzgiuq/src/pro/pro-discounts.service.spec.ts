import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { ProDiscountCode } from './pro-discount-code.entity';
import { ProDiscountRedemption } from './pro-discount-redemption.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProVenue } from './pro-venue.entity';
import { ProDiscountsService } from './pro-discounts.service';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
} from './dto/pro-discounts.dto';

type Row = Record<string, any>;

const NOW = new Date('2026-11-15T05:00:00.000Z');
const PRO = 'a17e0001-0000-4000-8000-000000000012';
const ALEVEL_PRO = 'a17e0001-0000-4000-8000-000000000022';
const FREE = 'a17e0001-0000-4000-8000-000000000011';
const NETSAT = 'a17e0000-0000-4000-8000-000000000001';
const ALEVEL = 'a17e0000-0000-4000-8000-000000000002';

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

describe('ProDiscountsService admin (task 19)', () => {
  let service: ProDiscountsService;
  let db: Record<string, Row[]>;
  let locks: string[];

  const tableOf = (entity: unknown) =>
    new Map<unknown, string>([
      [ProDiscountCode, 'codes'],
      [ProDiscountRedemption, 'redemptions'],
      [ProPayment, 'payments'],
      [ProPlan, 'plans'],
      [ProVenue, 'venues'],
    ]).get(entity) as string;

  const ops = {
    findOne: (
      entity: unknown,
      { where, lock }: { where: Row; lock?: { mode: string } },
    ) => {
      if (lock) locks.push(`${tableOf(entity)}:${lock.mode}`);
      const row = db[tableOf(entity)].find((r) => matches(r, where));
      return Promise.resolve(row ? { ...row } : null);
    },
    find: (entity: unknown, { where }: { where: Row }) =>
      Promise.resolve(
        db[tableOf(entity)]
          .filter((r) => matches(r, where))
          .map((r) => ({
            ...r,
          })),
      ),
    count: (entity: unknown, { where }: { where: Row }) =>
      Promise.resolve(
        db[tableOf(entity)].filter((r) => matches(r, where)).length,
      ),
    update: (entity: unknown, where: Row, changes: Row) => {
      const table = tableOf(entity);
      if (
        table === 'codes' &&
        changes.code &&
        db.codes.some((c) => c.code === changes.code && c.id !== where.id)
      ) {
        return Promise.reject(
          Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
        );
      }
      for (const row of db[table]) {
        if (matches(row, where)) Object.assign(row, changes);
      }
      return Promise.resolve({ affected: 1 });
    },
    insert: (entity: unknown, row: Row) => {
      const table = tableOf(entity);
      if (table === 'codes' && db.codes.some((c) => c.code === row.code)) {
        return Promise.reject(
          Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
        );
      }
      db[table].push({ createdAt: NOW, updatedAt: NOW, ...row });
      return Promise.resolve();
    },
  };

  const repo = (entity: unknown) => ({
    findOne: (o: { where: Row }) => ops.findOne(entity, o),
    find: (o: { where: Row }) => ops.find(entity, o),
    insert: (row: Row) => ops.insert(entity, row),
  });

  beforeEach(async () => {
    locks = [];
    db = {
      venues: [
        { id: NETSAT, key: 'netsat', name: 'NETSAT' },
        { id: ALEVEL, key: 'alevel', name: 'A-Level' },
      ],
      plans: [
        { id: PRO, venueId: NETSAT, code: 'pro', name: 'PRO', rank: 1 },
        { id: ALEVEL_PRO, venueId: ALEVEL, code: 'pro', name: 'PRO', rank: 1 },
        { id: FREE, venueId: NETSAT, code: 'free', name: 'Free', rank: 0 },
      ],
      codes: [],
      redemptions: [],
      payments: [],
    };
    const module = await Test.createTestingModule({
      providers: [
        ProDiscountsService,
        ...[ProDiscountCode, ProDiscountRedemption, ProPlan, ProVenue].map(
          (e) => ({ provide: getRepositoryToken(e), useValue: repo(e) }),
        ),
        {
          provide: DataSource,
          useValue: {
            manager: ops,
            transaction: (work: (m: unknown) => Promise<unknown>) => work(ops),
          },
        },
      ],
    }).compile();
    service = module.get(ProDiscountsService);
  });

  const create = (fields: Partial<CreateDiscountCodeDto> = {}) =>
    service.create(
      {
        code: 'newyear20',
        discountType: 'percent',
        discountValue: 20,
        ...fields,
      } as CreateDiscountCodeDto,
      { id: 'admin-1' },
      NOW,
    );

  it('create: stored upper case with defaults; the view has names, counts and status', async () => {
    const view = await create({
      description: '  ปีใหม่  ',
      planId: PRO,
      maxRedemptions: 100,
    });
    expect(db.codes[0]).toMatchObject({
      code: 'NEWYEAR20',
      description: 'ปีใหม่',
      discountType: 'percent',
      discountValue: 20,
      venueId: NETSAT, // from the plan
      planId: PRO,
      perUserLimit: 1,
      isActive: true,
      redeemedCount: 0,
      createdById: 'admin-1',
    });
    expect(view).toMatchObject({
      code: 'NEWYEAR20',
      venue: { id: NETSAT, key: 'netsat', name: 'NETSAT' },
      plan: { id: PRO, code: 'pro', name: 'PRO' },
      redeemedCount: 0,
      reservedCount: 0,
      status: 'active',
    });
  });

  it('create: value range per type, period order, scope, duplicates', async () => {
    const bad: [Partial<CreateDiscountCodeDto>, string, number][] = [
      [{ discountValue: 101 }, 'DISCOUNT_VALUE_INVALID', 400],
      [
        { discountType: 'amount', discountValue: 99 },
        'DISCOUNT_VALUE_INVALID',
        400,
      ],
      [
        {
          startsAt: '2026-12-01T00:00:00+07:00',
          endsAt: '2026-12-01T00:00:00+07:00',
        },
        'DISCOUNT_PERIOD_INVALID',
        400,
      ],
      [{ planId: FREE }, 'DISCOUNT_SCOPE_INVALID', 400],
      [{ venueId: ALEVEL, planId: PRO }, 'DISCOUNT_SCOPE_INVALID', 400],
      [
        { planId: 'a17e0001-0000-4000-8000-0000000000ff' },
        'PLAN_NOT_FOUND',
        404,
      ],
      [
        { venueId: 'a17e0000-0000-4000-8000-0000000000ff' },
        'VENUE_NOT_FOUND',
        404,
      ],
    ];
    for (const [fields, errorCode, status] of bad) {
      expect(await errorOf(create(fields))).toMatchObject({
        status,
        body: { errorCode },
      });
    }
    expect(db.codes).toHaveLength(0);
    await create({ discountType: 'amount', discountValue: 100 });
    expect(await errorOf(create({ code: 'NewYear20' }))).toMatchObject({
      status: 409,
      body: { errorCode: 'DISCOUNT_CODE_TAKEN' },
    });
  });

  it('update: everything while unused; on/off always; code/type/value after a use → 409 under the code lock (AC8)', async () => {
    const { id } = await create();
    const update = (fields: UpdateDiscountCodeDto) =>
      service.update(id, fields, NOW);

    await update({ code: 'NY2027', discountValue: 25, maxRedemptions: 5 });
    expect(db.codes[0]).toMatchObject({
      code: 'NY2027',
      discountValue: 25,
      maxRedemptions: 5,
    });
    expect(locks).toContain('codes:pessimistic_write');

    db.redemptions.push({ id: 'r1', codeId: id, status: 'reserved' });
    for (const fields of [
      { code: 'OTHER' },
      { discountValue: 30 },
      { discountType: 'amount' as const, discountValue: 1000 },
    ]) {
      expect(await errorOf(update(fields))).toMatchObject({
        status: 409,
        body: { errorCode: 'DISCOUNT_IN_USE' },
      });
    }
    // same values sent again, other fields, on/off: fine
    await update({ code: 'ny2027', discountValue: 25, isActive: false });
    await update({ description: 'x', perUserLimit: 3, endsAt: null });
    expect(db.codes[0]).toMatchObject({
      code: 'NY2027',
      isActive: false,
      perUserLimit: 3,
      description: 'x',
    });
    // a released use does not lock the value; a successful one does
    db.redemptions[0].status = 'released';
    await update({ discountValue: 30 });
    db.codes[0].redeemedCount = 1;
    expect((await errorOf(update({ discountValue: 40 }))).status).toBe(409);
  });

  it('update: plan alone moves the venue with it; a venue that does not fit the plan → 400; unknown id → 404', async () => {
    const { id } = await create({ planId: PRO });
    await service.update(id, { planId: ALEVEL_PRO }, NOW);
    expect(db.codes[0]).toMatchObject({ venueId: ALEVEL, planId: ALEVEL_PRO });
    expect(
      (await errorOf(service.update(id, { venueId: NETSAT }, NOW))).body
        .errorCode,
    ).toBe('DISCOUNT_SCOPE_INVALID');
    await service.update(id, { venueId: NETSAT, planId: null }, NOW);
    expect(db.codes[0]).toMatchObject({ venueId: NETSAT, planId: null });
    await service.update(id, { venueId: null }, NOW);
    expect(db.codes[0]).toMatchObject({ venueId: null, planId: null });
    expect(
      (await errorOf(service.update('nope', { isActive: true }, NOW))).status,
    ).toBe(404);
    expect(
      (await errorOf(service.getForAdmin('nope', NOW))).body.errorCode,
    ).toBe('DISCOUNT_CODE_NOT_FOUND');
    expect(
      (await errorOf(service.listRedemptions('nope'))).body.errorCode,
    ).toBe('DISCOUNT_CODE_NOT_FOUND');
  });

  it('status of the view: inactive / scheduled / expired / used_up (used + live reserved)', async () => {
    const { id } = await create({ maxRedemptions: 2 });
    const status = async () => (await service.getForAdmin(id, NOW)).status;
    expect(await status()).toBe('active');
    db.codes[0].redeemedCount = 1;
    db.payments.push({
      id: 'p1',
      status: 'pending',
      expiresAt: null,
      createdAt: NOW,
    });
    db.redemptions.push({
      id: 'r1',
      codeId: id,
      paymentId: 'p1',
      status: 'reserved',
    });
    await expect(service.getForAdmin(id, NOW)).resolves.toMatchObject({
      redeemedCount: 1,
      reservedCount: 1,
      status: 'used_up',
    });
    db.payments[0].status = 'failed';
    expect(await status()).toBe('active');
    db.codes[0].endsAt = new Date(NOW.getTime() - 1);
    expect(await status()).toBe('expired');
    db.codes[0].endsAt = null;
    db.codes[0].startsAt = new Date(NOW.getTime() + 1);
    expect(await status()).toBe('scheduled');
    db.codes[0].isActive = 0;
    expect(await status()).toBe('inactive');
  });

  it('list: isActive filter must be true/false', async () => {
    expect(
      (await errorOf(service.listForAdmin({ isActive: 'yes' }, NOW))).body
        .errorCode,
    ).toBe('INVALID_DISCOUNT_FILTER');
  });
});
