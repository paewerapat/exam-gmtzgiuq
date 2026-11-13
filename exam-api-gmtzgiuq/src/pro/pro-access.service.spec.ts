import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { Category } from '../categories/category.entity';
import { Exam } from '../exams/exam.entity';
import { ProAccessService } from './pro-access.service';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { NO_ENTITLEMENTS } from './pro-entitlements';

const NOW = new Date('2026-11-13T05:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const NETSAT = 'venue-netsat';
const TGAT = 'venue-tgat';

const ent = (over: Record<string, unknown> = {}) => ({
  challenge: false,
  beyond: false,
  predictedSets: 0,
  solutions: false,
  analytics: false,
  mockPurchase: false,
  ...over,
});

const plan = (
  id: string,
  venueId: string,
  code: string,
  rank: number,
  entitlements: unknown,
  sortOrder = rank,
) =>
  ({
    id,
    venueId,
    code,
    rank,
    entitlements,
    sortOrder,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
  }) as unknown as ProPlan;

const plans = [
  plan('netsat-free', NETSAT, 'free', 0, ent({ predictedSets: 1 })),
  plan(
    'netsat-pro',
    NETSAT,
    'pro',
    1,
    ent({ challenge: true, predictedSets: 2, mockPurchase: true }),
  ),
  // MariaDB raw/text JSON
  plan(
    'netsat-max',
    NETSAT,
    'max',
    2,
    JSON.stringify(
      ent({
        challenge: true,
        beyond: true,
        predictedSets: null,
        mockPurchase: true,
      }),
    ),
  ),
  plan('tgat-free', TGAT, 'free', 0, ent()),
  plan('tgat-pro', TGAT, 'pro', 1, ent({ mockPurchase: true })),
];

/** Mimics find({ where }) with In / MoreThan on plain objects. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key];
    if (value instanceof FindOperator) {
      if (value.type === 'in') {
        return (value.value as unknown as unknown[]).includes(actual);
      }
      if (value.type === 'moreThan') {
        return (actual as Date).getTime() > (value.value as Date).getTime();
      }
      throw new Error(`operator ${value.type} not mocked`);
    }
    return actual === value;
  });
}

describe('ProAccessService (task 17)', () => {
  let service: ProAccessService;
  let subscriptions: Partial<ProSubscription>[];
  let categories: { slug: string; venueId: string | null }[];
  let exams: { id: string; category: string }[];
  let subsFind: jest.Mock;
  let plansFind: jest.Mock;
  let examsFind: jest.Mock;

  beforeEach(async () => {
    subscriptions = [];
    categories = [
      { slug: 'netsat-math', venueId: NETSAT },
      { slug: 'tgat-eng', venueId: TGAT },
      { slug: 'no-venue', venueId: null },
    ];
    exams = [{ id: 'exam-loaded-later', category: 'netsat-math' }];

    subsFind = jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        subscriptions
          .filter((s) => matches(s as Record<string, unknown>, where))
          .map((s) => ({ ...s, plan: plans.find((p) => p.id === s.planId) })),
      ),
    );
    plansFind = jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        plans.filter((p) =>
          matches(p as unknown as Record<string, unknown>, where),
        ),
      ),
    );
    examsFind = jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(exams.filter((e) => matches(e, where))),
    );

    const module = await Test.createTestingModule({
      providers: [
        ProAccessService,
        {
          provide: getRepositoryToken(ProSubscription),
          useValue: { find: subsFind },
        },
        { provide: getRepositoryToken(ProPlan), useValue: { find: plansFind } },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            find: jest.fn(({ where }: { where: Record<string, unknown> }) =>
              Promise.resolve(categories.filter((c) => matches(c, where))),
            ),
          },
        },
        { provide: getRepositoryToken(Exam), useValue: { find: examsFind } },
      ],
    }).compile();

    service = module.get(ProAccessService);
  });

  const subscribe = (data: Partial<ProSubscription>) =>
    subscriptions.push({
      id: `sub-${subscriptions.length + 1}`,
      userId: 'user-a',
      venueId: NETSAT,
      planId: 'netsat-pro',
      status: 'active',
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
      ...data,
    });

  describe('getEntitlements (AC8)', () => {
    it('no subscription → the venue free plan', async () => {
      await expect(
        service.getEntitlements('user-a', NETSAT, NOW),
      ).resolves.toEqual(ent({ predictedSets: 1 }));
      // a guest too
      await expect(service.getEntitlements(null, NETSAT, NOW)).resolves.toEqual(
        ent({ predictedSets: 1 }),
      );
      // no query for a guest's subscriptions
      expect(subsFind).toHaveBeenCalledTimes(1);
    });

    it('active PRO → the PRO entitlements', async () => {
      subscribe({ planId: 'netsat-pro' });
      await expect(
        service.getEntitlements('user-a', NETSAT, NOW),
      ).resolves.toEqual(
        ent({ challenge: true, predictedSets: 2, mockPurchase: true }),
      );
      // only active rows that end after now are asked for
      const where = (
        subsFind.mock.calls[0] as [{ where: Record<string, unknown> }]
      )[0].where;
      expect(where).toMatchObject({ userId: 'user-a', status: 'active' });
      expect((where.currentPeriodEnd as FindOperator<Date>).type).toBe(
        'moreThan',
      );
    });

    it('expired (end passed, status still active), revoked or other user → free', async () => {
      subscribe({ currentPeriodEnd: new Date(NOW.getTime() - 1000) });
      subscribe({ currentPeriodEnd: NOW });
      subscribe({ status: 'revoked' });
      subscribe({ userId: 'user-b' });
      await expect(
        service.getEntitlements('user-a', NETSAT, NOW),
      ).resolves.toEqual(ent({ predictedSets: 1 }));
    });

    it('several active plans → the highest rank (JSON text is parsed)', async () => {
      subscribe({ planId: 'netsat-pro' });
      subscribe({ planId: 'netsat-max' });
      const result = await service.getEntitlementsMany('user-a', [NETSAT], NOW);
      expect(result.get(NETSAT)).toMatchObject({
        planCode: 'max',
        rank: 2,
        entitlements: ent({
          challenge: true,
          beyond: true,
          predictedSets: null,
          mockPurchase: true,
        }),
      });
    });

    it('a plan of another venue does not count', async () => {
      subscribe({ venueId: TGAT, planId: 'tgat-pro' });
      await expect(
        service.getEntitlements('user-a', NETSAT, NOW),
      ).resolves.toEqual(ent({ predictedSets: 1 }));
    });

    it('venue without any plan → all off', async () => {
      await expect(
        service.getEntitlements('user-a', 'venue-empty', NOW),
      ).resolves.toEqual(NO_ENTITLEMENTS);
    });
  });

  it('hasPaidPlan: only an active plan with rank > 0', async () => {
    await expect(service.hasPaidPlan('user-a', NETSAT, NOW)).resolves.toBe(
      false,
    );
    subscribe({ planId: 'netsat-free' });
    await expect(service.hasPaidPlan('user-a', NETSAT, NOW)).resolves.toBe(
      false,
    );
    subscribe({ planId: 'netsat-pro' });
    await expect(service.hasPaidPlan('user-a', NETSAT, NOW)).resolves.toBe(
      true,
    );
    await expect(service.hasPaidPlan(null, NETSAT, NOW)).resolves.toBe(false);
  });

  it('getVenueIdForCategory: venueId of the slug (case-insensitive), else null', async () => {
    await expect(service.getVenueIdForCategory('netsat-math')).resolves.toBe(
      NETSAT,
    );
    await expect(service.getVenueIdForCategory('no-venue')).resolves.toBeNull();
    await expect(service.getVenueIdForCategory('missing')).resolves.toBeNull();
    await expect(service.getVenueIdForCategory(null)).resolves.toBeNull();
  });

  describe('getMockPurchaseAccess (AC7)', () => {
    const buy = (id: string, category?: string | null) => ({ id, category });

    it('no plan → nothing; PRO NETSAT → NETSAT exams until the plan end', async () => {
      const list = [buy('n1', 'netsat-math'), buy('t1', 'tgat-eng')];
      await expect(
        service.getMockPurchaseAccess('user-a', list, NOW),
      ).resolves.toEqual(new Map());

      const end = new Date(NOW.getTime() + 30 * DAY);
      subscribe({ planId: 'netsat-pro', currentPeriodEnd: end });
      const result = await service.getMockPurchaseAccess('user-a', list, NOW);
      // TGAT exam is not helped by a NETSAT plan
      expect([...result.entries()]).toEqual([['n1', end]]);
    });

    it('TGAT plan does not unlock NETSAT; category without venue stays out', async () => {
      subscribe({ venueId: TGAT, planId: 'tgat-pro' });
      const result = await service.getMockPurchaseAccess(
        'user-a',
        [
          buy('n1', 'netsat-math'),
          buy('t1', 'tgat-eng'),
          buy('x', 'no-venue'),
          buy('y', null),
        ],
        NOW,
      );
      expect([...result.keys()]).toEqual(['t1']);
    });

    it('a free plan with mockPurchase off (seed) never unlocks', async () => {
      subscribe({ planId: 'netsat-free' });
      const result = await service.getMockPurchaseAccess(
        'user-a',
        [buy('n1', 'netsat-math')],
        NOW,
      );
      expect(result.size).toBe(0);
    });

    it('expired plan → nothing; guest → nothing without queries', async () => {
      subscribe({ currentPeriodEnd: new Date(NOW.getTime() - DAY) });
      await expect(
        service.getMockPurchaseAccess(
          'user-a',
          [buy('n1', 'netsat-math')],
          NOW,
        ),
      ).resolves.toEqual(new Map());

      subsFind.mockClear();
      await expect(
        service.getMockPurchaseAccess(null, [buy('n1', 'netsat-math')], NOW),
      ).resolves.toEqual(new Map());
      expect(subsFind).not.toHaveBeenCalled();
    });

    it('reads the category of exams loaded without it', async () => {
      subscribe({ planId: 'netsat-pro' });
      const result = await service.getMockPurchaseAccess(
        'user-a',
        [{ id: 'exam-loaded-later' }],
        NOW,
      );
      expect(examsFind).toHaveBeenCalledTimes(1);
      expect(result.has('exam-loaded-later')).toBe(true);
    });
  });
});
