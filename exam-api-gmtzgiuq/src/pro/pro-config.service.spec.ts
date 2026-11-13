import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import {
  ProConfigService,
  assertPlanPricing,
  assertPlanRules,
} from './pro-config.service';
import { ProPage } from './pro-page.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProVenue } from './pro-venue.entity';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import type { CreateProPlanDto } from './dto/pro.dto';
import { ProDiscountCode } from './pro-discount-code.entity';
import { UnlockCodeBatch } from '../unlock-codes/unlock-code-batch.entity';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator) {
      if (value.type === 'not') return row[key] !== value.value;
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

const cmp = {
  groups: [
    {
      title: 'PREDICTED EXAM',
      rows: [
        {
          label: '<script>alert(1)</script>',
          cells: {
            free: { type: 'cross' },
            pro: { type: 'check' },
            max: { type: 'text', text: '6 ชุด' },
            old: { type: 'check' },
          },
        },
      ],
    },
  ],
};

describe('ProConfigService (task 17)', () => {
  let service: ProConfigService;
  let venues: Row[];
  let plans: Row[];
  let payments: Row[];
  let subscriptions: Row[];
  let batches: Row[];
  let discountCodes: Row[];
  let categories: Row[];
  let page: Row | null;
  let findMySummaries: jest.Mock;

  const repo = (rows: () => Row[]) => ({
    find: jest.fn(({ where }: { where?: Row } = {}) =>
      Promise.resolve(rows().filter((r) => !where || matches(r, where))),
    ),
    findOne: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows().find((r) => matches(r, where)) ?? null),
    ),
    exists: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows().some((r) => matches(r, where))),
    ),
    create: jest.fn((data: Row) => ({ ...data })),
    save: jest.fn((data: Row) => {
      const list = rows();
      const existing = list.find((r) => r.id === data.id);
      if (existing) {
        Object.assign(existing, data);
        return Promise.resolve(existing);
      }
      const row = { id: `new-${list.length + 1}`, ...data };
      list.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((id: string, changes: Row) => {
      Object.assign(rows().find((r) => r.id === id) ?? {}, changes);
      return Promise.resolve({ affected: 1 });
    }),
  });

  beforeEach(async () => {
    venues = [
      {
        id: 'v-netsat',
        key: 'netsat',
        name: 'NETSAT',
        isActive: true,
        sortOrder: 1,
        comparison: cmp,
      },
      {
        id: 'v-old',
        key: 'old',
        name: 'เก่า',
        isActive: false,
        sortOrder: 2,
        comparison: null,
      },
    ];
    plans = [
      {
        id: 'p-free',
        venueId: 'v-netsat',
        code: 'free',
        rank: 0,
        priceSatang: 0,
        isVisible: true,
        isPurchasable: 0,
        highlight: 0,
        entitlements: { mockPurchase: false },
      },
      {
        id: 'p-pro',
        venueId: 'v-netsat',
        code: 'pro',
        rank: 1,
        priceSatang: 19900,
        isVisible: true,
        isPurchasable: 1,
        highlight: 0,
        entitlements: { mockPurchase: true },
      },
      {
        id: 'p-max',
        venueId: 'v-netsat',
        code: 'max',
        rank: 2,
        priceSatang: 29900,
        isVisible: false,
        isPurchasable: 1,
        highlight: 1,
        entitlements: '{"mockPurchase":true}',
      },
      {
        id: 'p-oldfree',
        venueId: 'v-old',
        code: 'free',
        rank: 0,
        priceSatang: 0,
        isVisible: true,
        isPurchasable: 0,
        highlight: 0,
        entitlements: {},
      },
    ];
    subscriptions = [{ id: 's1', venueId: 'v-netsat', planId: 'p-pro' }];
    payments = [];
    batches = [];
    discountCodes = [];
    categories = [{ id: 'c1', slug: 'netsat-math', venueId: 'v-netsat' }];
    page = {
      id: 1,
      title: 'แพ็กเกจ LUMO',
      subtitle: 'เลือกแพ็กเกจ',
      venuePickerTitle: 'เลือกสนาม',
      footerNote: null,
    };
    findMySummaries = jest.fn().mockResolvedValue([{ venueId: 'v-netsat' }]);

    // Transaction manager on the same arrays
    const manager = {
      findOne: jest.fn((entity: unknown, { where }: { where: Row }) =>
        Promise.resolve(
          (entity === ProVenue ? venues : plans).find((r) =>
            matches(r, where),
          ) ?? null,
        ),
      ),
      find: jest.fn((entity: unknown, { where }: { where: Row }) =>
        Promise.resolve(
          entity === ProPlan ? plans.filter((r) => matches(r, where)) : [],
        ),
      ),
      count: jest.fn((entity: unknown, { where }: { where: Row | Row[] }) => {
        const rows =
          entity === ProPlan
            ? plans
            : entity === ProPayment
              ? payments
              : entity === UnlockCodeBatch
                ? batches
                : entity === ProDiscountCode
                  ? discountCodes
                  : subscriptions;
        const any = Array.isArray(where) ? where : [where];
        return Promise.resolve(
          rows.filter((r) => any.some((w) => matches(r, w))).length,
        );
      }),
      save: jest.fn((_entity: unknown, data: Row) => {
        const existing = plans.find((r) => r.id === data.id);
        if (existing) {
          Object.assign(existing, data);
          return Promise.resolve(existing);
        }
        const row = { id: `new-${plans.length + 1}`, ...data };
        plans.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn((_entity: unknown, where: Row, changes: Row) => {
        for (const row of categories) {
          if (matches(row, where)) Object.assign(row, changes);
        }
        return Promise.resolve();
      }),
      delete: jest.fn((entity: unknown, { id }: { id: string }) => {
        if (entity === ProVenue) {
          venues = venues.filter((v) => v.id !== id);
          plans = plans.filter((p) => p.venueId !== id);
        } else {
          plans = plans.filter((p) => p.id !== id);
        }
        return Promise.resolve();
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProConfigService,
        {
          provide: getRepositoryToken(ProPage),
          useValue: {
            findOne: jest.fn(() => Promise.resolve(page)),
            upsert: jest.fn((data: Row) => {
              page = { ...(page ?? { title: '' }), ...data };
              return Promise.resolve();
            }),
          },
        },
        { provide: getRepositoryToken(ProVenue), useValue: repo(() => venues) },
        { provide: getRepositoryToken(ProPlan), useValue: repo(() => plans) },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
              work(manager),
            ),
          },
        },
        { provide: ProSubscriptionsService, useValue: { findMySummaries } },
      ],
    }).compile();

    service = module.get(ProConfigService);
  });

  describe('GET /pro/upgrade (AC2)', () => {
    it('active venues, visible plans, no entitlements; my = [] for a guest', async () => {
      const result = await service.getUpgrade(null);

      expect(result.page).toEqual({
        title: 'แพ็กเกจ LUMO',
        subtitle: 'เลือกแพ็กเกจ',
        venuePickerTitle: 'เลือกสนาม',
        footerNote: null,
        vatEnabled: false,
      });
      expect(result.venues.map((v) => v.key)).toEqual(['netsat']);
      const netsat = result.venues[0];
      expect(netsat.plans.map((p) => p.code)).toEqual(['free', 'pro']);
      expect(netsat.plans[1]).toEqual({
        id: 'p-pro',
        code: 'pro',
        rank: 1,
        name: undefined,
        tagline: null,
        priceSatang: 19900,
        priceUnit: null,
        priceNote: null,
        buttonText: undefined,
        badge: null,
        highlight: false,
        isPurchasable: true,
      });
      expect(JSON.stringify(result)).not.toContain('entitlements');
      expect(JSON.stringify(result)).not.toContain('mockPurchase');
      expect(result.my).toEqual([]);
      expect(findMySummaries).not.toHaveBeenCalled();
    });

    it('comparison: only cells of visible plans; text kept as typed (plain text)', async () => {
      const { venues: list } = await service.getUpgrade(null);
      const row = list[0].comparison!.groups[0].rows[0];
      expect(row.label).toBe('<script>alert(1)</script>');
      expect(Object.keys(row.cells)).toEqual(['free', 'pro']);
    });

    it('logged in → my = the user subscriptions that give rights', async () => {
      const result = await service.getUpgrade({ id: 'user-a' });
      expect(findMySummaries).toHaveBeenCalledWith('user-a', expect.any(Date));
      expect(result.my).toEqual([{ venueId: 'v-netsat' }]);
    });

    it('no page row yet → empty texts', async () => {
      page = null;
      await expect(service.getPage()).resolves.toEqual({
        title: '',
        subtitle: null,
        venuePickerTitle: null,
        footerNote: null,
        vatEnabled: false,
      });
    });
  });

  it('admin config: every venue and plan with entitlements (parsed)', async () => {
    const config = await service.getAdminConfig();
    expect(config.venues.map((v) => v.key)).toEqual(['netsat', 'old']);
    expect(config.plans).toHaveLength(4);
    expect(config.venues[0].plans.map((p) => p.code)).toEqual([
      'free',
      'pro',
      'max',
    ]);
    expect(config.plans.find((p) => p.id === 'p-max')?.entitlements).toEqual(
      expect.objectContaining({ mockPurchase: true, challenge: false }),
    );
  });

  it('PUT page: trims, blank → null, only sent fields change', async () => {
    const result = await service.updatePage({
      title: '  แพ็กเกจใหม่ ',
      footerNote: '   ',
    });
    expect(result).toEqual({
      title: 'แพ็กเกจใหม่',
      subtitle: 'เลือกแพ็กเกจ',
      venuePickerTitle: 'เลือกสนาม',
      footerNote: null,
      vatEnabled: false,
    });
  });

  it('PUT page: vatEnabled on/off (task 18 AC12), shown on the public page', async () => {
    await expect(service.updatePage({ vatEnabled: true })).resolves.toEqual(
      expect.objectContaining({ vatEnabled: true, title: 'แพ็กเกจ LUMO' }),
    );
    expect((await service.getUpgrade(null)).page.vatEnabled).toBe(true);
    // tinyint from MySQL
    page = { ...page, vatEnabled: 0 };
    expect((await service.getPage()).vatEnabled).toBe(false);
  });

  describe('plans: price rules (AC4)', () => {
    it('rank 0 must cost 0 and not be purchasable; purchasable needs a price', () => {
      expect(() => assertPlanPricing(0, 0, false)).not.toThrow();
      expect(() => assertPlanPricing(1, 19900, true)).not.toThrow();
      expect(() => assertPlanPricing(1, 0, false)).not.toThrow();
      for (const [rank, price, purchasable] of [
        [0, 100, false],
        [0, 0, true],
      ] as const) {
        try {
          assertPlanPricing(rank, price, purchasable);
          throw new Error('no error');
        } catch (err) {
          expect((err as HttpException).getResponse()).toEqual({
            statusCode: 400,
            message: 'แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0 และเปิดให้ซื้อไม่ได้',
            errorCode: 'FREE_PLAN_PRICE',
          });
        }
      }
      expect(() => assertPlanPricing(2, 0, true)).toThrow(HttpException);
    });

    const newPlan = (over: Partial<CreateProPlanDto> = {}) =>
      ({
        venueId: 'v-netsat',
        code: 'ultra',
        rank: 3,
        name: ' ULTRA ',
        buttonText: 'สมัคร',
        priceSatang: 39900,
        entitlements: { mockPurchase: true, extraKey: 'x' },
        ...over,
      }) as CreateProPlanDto;

    it('create: stores trimmed text, known entitlements typed, purchasable by default when paid', async () => {
      const plan = await service.createPlan(newPlan());
      expect(plan).toMatchObject({
        code: 'ultra',
        name: 'ULTRA',
        isPurchasable: true,
        isVisible: true,
        periodDays: 30,
        entitlements: {
          challenge: false,
          predictedSets: 0,
          mockPurchase: true,
          extraKey: 'x',
        },
      });
    });

    it('create: rank 0 with a price → 400; code taken in the venue → 409; venue missing → 404', async () => {
      expect(
        (await errorOf(service.createPlan(newPlan({ rank: 0 })))).body
          .errorCode,
      ).toBe('FREE_PLAN_PRICE');
      expect(
        await errorOf(service.createPlan(newPlan({ code: 'pro' }))),
      ).toMatchObject({ status: 409, body: { errorCode: 'PLAN_CODE_TAKEN' } });
      expect(
        await errorOf(service.createPlan(newPlan({ venueId: 'nope' }))),
      ).toMatchObject({ status: 404, body: { errorCode: 'VENUE_NOT_FOUND' } });
    });

    it('update: the rule applies to the values after saving', async () => {
      // the free plan cannot get a price
      expect(
        (await errorOf(service.updatePlan('p-free', { priceSatang: 100 }))).body
          .errorCode,
      ).toBe('FREE_PLAN_PRICE');
      // moving PRO to rank 0 while it still costs 199 → 400
      expect(
        (await errorOf(service.updatePlan('p-pro', { rank: 0 }))).body
          .errorCode,
      ).toBe('FREE_PLAN_PRICE');
      // price, badge and button of PRO change
      const updated = await service.updatePlan('p-pro', {
        priceSatang: 24900,
        badge: ' เร็วๆ นี้ ',
        isPurchasable: false,
      });
      expect(updated).toMatchObject({
        priceSatang: 24900,
        badge: 'เร็วๆ นี้',
        isPurchasable: false,
      });
    });
  });

  describe('free plan rules (round 2)', () => {
    const newPlan = (over: Partial<CreateProPlanDto> = {}) =>
      ({
        venueId: 'v-netsat',
        code: 'free2',
        rank: 0,
        name: 'ฟรี 2',
        buttonText: 'เริ่ม',
        entitlements: { mockPurchase: false },
        ...over,
      }) as CreateProPlanDto;

    it('assertPlanRules: rank 0 with mockPurchase → 400 FREE_PLAN_MOCK_PURCHASE', () => {
      expect(() =>
        assertPlanRules(0, 0, false, { mockPurchase: false }),
      ).not.toThrow();
      expect(() =>
        assertPlanRules(1, 100, true, { mockPurchase: true }),
      ).not.toThrow();
      try {
        assertPlanRules(0, 0, false, { mockPurchase: true });
        throw new Error('no error');
      } catch (err) {
        expect((err as HttpException).getResponse()).toEqual({
          statusCode: 400,
          message:
            'แพ็กเกจฟรี (ระดับ 0) เปิดสิทธิ์ชุด Mock ที่ต้องซื้อ (mockPurchase) ไม่ได้',
          errorCode: 'FREE_PLAN_MOCK_PURCHASE',
        });
      }
    });

    it('create: rank 0 + mockPurchase → 400; a second rank-0 plan → 409 FREE_PLAN_EXISTS', async () => {
      expect(
        await errorOf(
          service.createPlan(newPlan({ entitlements: { mockPurchase: true } })),
        ),
      ).toMatchObject({
        status: 400,
        body: { errorCode: 'FREE_PLAN_MOCK_PURCHASE' },
      });
      expect(await errorOf(service.createPlan(newPlan()))).toMatchObject({
        status: 409,
        body: { errorCode: 'FREE_PLAN_EXISTS' },
      });
      expect(plans).toHaveLength(4);
      // the old venue has its own free plan; a venue without one may add it
      plans = plans.filter((p) => p.id !== 'p-oldfree');
      await expect(
        service.createPlan(newPlan({ venueId: 'v-old' })),
      ).resolves.toMatchObject({ rank: 0, code: 'free2' });
    });

    it('update: mockPurchase on the free plan → 400 (also via merged values)', async () => {
      expect(
        (
          await errorOf(
            service.updatePlan('p-free', {
              entitlements: { mockPurchase: true },
            }),
          )
        ).body.errorCode,
      ).toBe('FREE_PLAN_MOCK_PURCHASE');
      // MAX (stored mockPurchase true) moved to rank 0 without new rights
      plans = plans.filter((p) => p.id !== 'p-free');
      expect(
        (
          await errorOf(
            service.updatePlan('p-max', {
              rank: 0,
              priceSatang: 0,
              isPurchasable: false,
            }),
          )
        ).body.errorCode,
      ).toBe('FREE_PLAN_MOCK_PURCHASE');
    });

    it('update to rank 0: another free plan → 409 FREE_PLAN_EXISTS; subscribers → 409 PLAN_RANK_IN_USE', async () => {
      const toFree = {
        rank: 0,
        priceSatang: 0,
        isPurchasable: false,
        entitlements: { mockPurchase: false },
      };
      expect(
        (await errorOf(service.updatePlan('p-max', toFree))).body.errorCode,
      ).toBe('FREE_PLAN_EXISTS');

      plans = plans.filter((p) => p.id !== 'p-free');
      expect(await errorOf(service.updatePlan('p-pro', toFree))).toMatchObject({
        status: 409,
        body: {
          errorCode: 'PLAN_RANK_IN_USE',
          message:
            'เปลี่ยนแพ็กเกจนี้เป็นระดับ 0 (ฟรี) ไม่ได้ เพราะมีสมาชิกอ้างอิงแพ็กเกจนี้อยู่',
        },
      });
      expect(plans.find((p) => p.id === 'p-pro')?.rank).toBe(1);

      // no subscriber and no other free plan → allowed
      await expect(service.updatePlan('p-max', toFree)).resolves.toMatchObject({
        rank: 0,
        isPurchasable: false,
      });
      // editing the (only) free plan again does not hit FREE_PLAN_EXISTS
      await expect(
        service.updatePlan('p-max', { name: 'Free' }),
      ).resolves.toMatchObject({ name: 'Free' });
    });
  });

  describe('deadlock backstop (round 3)', () => {
    const deadlock = () =>
      Object.assign(new Error('Deadlock found'), {
        code: 'ER_LOCK_DEADLOCK',
        errno: 1213,
      });
    const ds = () =>
      (service as unknown as { dataSource: { transaction: jest.Mock } })
        .dataSource.transaction;

    it('a deadlock victim is run again (plan edit, plan/venue delete, plan create)', async () => {
      ds().mockRejectedValueOnce(deadlock());
      await expect(
        service.updatePlan('p-pro', { sortOrder: 5 }),
      ).resolves.toMatchObject({ sortOrder: 5 });

      ds().mockRejectedValueOnce(deadlock());
      await expect(service.deletePlan('p-max')).resolves.toEqual({
        success: true,
      });

      subscriptions = [];
      ds().mockRejectedValueOnce(deadlock());
      await expect(service.deleteVenue('v-old')).resolves.toEqual({
        success: true,
      });

      ds().mockRejectedValueOnce(deadlock());
      await expect(
        service.createPlan({
          venueId: 'v-netsat',
          code: 'ultra',
          rank: 3,
          name: 'ULTRA',
          buttonText: 'สมัคร',
          priceSatang: 39900,
          entitlements: {},
        } as CreateProPlanDto),
      ).resolves.toMatchObject({ code: 'ultra' });
    });

    it('still a victim after 3 tries, or a lock wait that ran out → 409 CONCURRENT_UPDATE (Thai)', async () => {
      ds()
        .mockRejectedValueOnce(deadlock())
        .mockRejectedValueOnce(deadlock())
        .mockRejectedValueOnce(deadlock());
      expect(
        await errorOf(service.updatePlan('p-pro', { sortOrder: 5 })),
      ).toEqual({
        status: 409,
        body: {
          statusCode: 409,
          message: 'มีการแก้ไขข้อมูลนี้พร้อมกันอยู่ กรุณาลองใหม่อีกครั้ง',
          errorCode: 'CONCURRENT_UPDATE',
        },
      });

      ds().mockRejectedValueOnce(
        Object.assign(new Error('Lock wait timeout'), { errno: 1205 }),
      );
      expect(
        (await errorOf(service.deleteVenue('v-netsat'))).body.errorCode,
      ).toBe('CONCURRENT_UPDATE');
      // other errors are not turned into 409
      ds().mockRejectedValueOnce(new Error('boom'));
      await expect(service.deletePlan('p-max')).rejects.toThrow('boom');
    });

    it('deletePlan locks the venue before the plan (round 3)', async () => {
      const manager = { calls: [] as string[] };
      ds().mockImplementationOnce((work: (m: unknown) => Promise<unknown>) =>
        work({
          findOne: (entity: unknown, options: { lock?: { mode: string } }) => {
            manager.calls.push(
              `${entity === ProVenue ? 'venue' : 'plan'}:${options.lock?.mode}`,
            );
            return Promise.resolve({ id: 'x', venueId: 'v-netsat' });
          },
          count: () => Promise.resolve(0),
          delete: () => Promise.resolve(),
        }),
      );
      await service.deletePlan('p-max');
      expect(manager.calls).toEqual([
        'venue:pessimistic_write',
        'plan:pessimistic_write',
      ]);
    });
  });

  describe('delete (AC10)', () => {
    it('plan with a subscription → 409 PLAN_IN_USE; without → deleted', async () => {
      expect(await errorOf(service.deletePlan('p-pro'))).toEqual({
        status: 409,
        body: {
          statusCode: 409,
          message: 'แพ็กเกจนี้มีสมาชิกอ้างอิงอยู่ ลบไม่ได้ ให้ซ่อนแพ็กเกจแทน',
          errorCode: 'PLAN_IN_USE',
        },
      });
      expect(plans.some((p) => p.id === 'p-pro')).toBe(true);

      await expect(service.deletePlan('p-max')).resolves.toEqual({
        success: true,
      });
      expect(plans.some((p) => p.id === 'p-max')).toBe(false);
      expect((await errorOf(service.deletePlan('p-max'))).body.errorCode).toBe(
        'PLAN_NOT_FOUND',
      );

      // the comparison cell of "max" stays but is not shown any more
      const { venues: list } = await service.getUpgrade(null);
      expect(Object.keys(list[0].comparison!.groups[0].rows[0].cells)).toEqual([
        'free',
        'pro',
      ]);
    });

    it('venue with a subscription → 409 VENUE_IN_USE; without → deleted with its plans, categories unlinked', async () => {
      expect(
        (await errorOf(service.deleteVenue('v-netsat'))).body.errorCode,
      ).toBe('VENUE_IN_USE');
      expect(venues).toHaveLength(2);

      subscriptions = [];
      await expect(service.deleteVenue('v-netsat')).resolves.toEqual({
        success: true,
      });
      expect(venues.map((v) => v.id)).toEqual(['v-old']);
      expect(plans.every((p) => p.venueId !== 'v-netsat')).toBe(true);
      expect(categories[0].venueId).toBeNull();
    });

    it('plan / venue with payments but no subscription → 409 (task 18)', async () => {
      subscriptions = [];
      payments = [{ id: 'pay-1', venueId: 'v-netsat', planId: 'p-max' }];
      expect((await errorOf(service.deletePlan('p-max'))).body.errorCode).toBe(
        'PLAN_IN_USE',
      );
      expect(
        (await errorOf(service.deleteVenue('v-netsat'))).body.errorCode,
      ).toBe('VENUE_IN_USE');
      expect(plans.some((p) => p.id === 'p-max')).toBe(true);
    });

    it('FK error (row referenced) → 409 instead of 500', async () => {
      subscriptions = [];
      const ds = (
        service as unknown as { dataSource: { transaction: jest.Mock } }
      ).dataSource;
      ds.transaction.mockRejectedValueOnce(
        Object.assign(new Error('fk'), { errno: 1451 }),
      );
      expect((await errorOf(service.deletePlan('p-free'))).body.errorCode).toBe(
        'PLAN_IN_USE',
      );
    });

    it('plan / venue used by a Pro unlock campaign or a discount code → 409 naming it (task 19 round 2)', async () => {
      subscriptions = [];
      batches = [{ id: 'b1', proPlanId: 'p-max' }];
      expect(await errorOf(service.deletePlan('p-max'))).toEqual({
        status: 409,
        body: {
          statusCode: 409,
          errorCode: 'PLAN_IN_USE',
          message:
            'แพ็กเกจนี้ถูกใช้อยู่ในแคมเปญโค้ด Unlock แบบให้แพ็กเกจ Pro ลบไม่ได้ ให้ซ่อนแพ็กเกจแทน',
        },
      });
      discountCodes = [{ id: 'd1', planId: 'p-max', venueId: 'v-netsat' }];
      expect((await errorOf(service.deletePlan('p-max'))).body.message).toBe(
        'แพ็กเกจนี้ถูกใช้อยู่ในแคมเปญโค้ด Unlock แบบให้แพ็กเกจ Pro และโค้ดส่วนลด ลบไม่ได้ ให้ซ่อนแพ็กเกจแทน',
      );
      // the venue: through its plans, or a code of the venue itself
      expect(await errorOf(service.deleteVenue('v-netsat'))).toMatchObject({
        status: 409,
        body: { errorCode: 'VENUE_IN_USE' },
      });
      batches = [];
      discountCodes = [{ id: 'd2', planId: null, venueId: 'v-netsat' }];
      expect(
        (await errorOf(service.deleteVenue('v-netsat'))).body.message,
      ).toBe(
        'สนามนี้หรือแพ็กเกจของสนามถูกใช้อยู่ในโค้ดส่วนลด ลบไม่ได้ ให้ปิดการใช้งานสนามแทน',
      );
      // a code of another venue / plan does not block
      await expect(service.deletePlan('p-max')).resolves.toEqual({
        success: true,
      });
      expect(venues).toHaveLength(2);
    });
  });

  it('venue key taken → 409 VENUE_KEY_TAKEN', async () => {
    expect(
      await errorOf(service.createVenue({ key: 'netsat', name: 'ซ้ำ' })),
    ).toMatchObject({ status: 409, body: { errorCode: 'VENUE_KEY_TAKEN' } });
    expect(
      (await errorOf(service.updateVenue('v-old', { key: 'netsat' }))).body
        .errorCode,
    ).toBe('VENUE_KEY_TAKEN');
  });

  it('PUT venue comparison: stored cleaned (unknown keys dropped, trimmed)', async () => {
    const view = await service.updateVenue('v-old', {
      comparison: {
        groups: [
          {
            title: ' กลุ่ม ',
            rows: [
              {
                label: ' แถว ',
                sublabel: '',
                cells: { pro: { type: 'text', text: ' 2 ชุด ', junk: 1 } },
                junk: true,
              },
            ],
          },
        ],
      } as never,
    });
    expect(view.comparison).toEqual({
      groups: [
        {
          title: 'กลุ่ม',
          rows: [
            { label: 'แถว', cells: { pro: { type: 'text', text: '2 ชุด' } } },
          ],
        },
      ],
    });
  });
});
