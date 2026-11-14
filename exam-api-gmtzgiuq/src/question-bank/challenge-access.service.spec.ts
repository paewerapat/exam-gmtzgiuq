import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChallengeAccessService } from './challenge-access.service';
import { Question } from '../questions/question.entity';
import { ProAccessService } from '../pro/pro-access.service';
import { NO_ENTITLEMENTS } from '../pro/pro-entitlements';

describe('ChallengeAccessService (task 20)', () => {
  let service: ChallengeAccessService;
  let getEntitlements: jest.Mock;
  let getEntitlementsMany: jest.Mock;
  let rawRows: { id: string; venueId: string | null }[];
  let qb: Record<string, jest.Mock>;

  const user = { id: 'u1', role: 'user' };
  const admin = { id: 'a1', role: 'admin' };
  // u1 has challenge in NETSAT only
  const rights: Record<string, boolean> = { netsat: true, tgat: false };

  beforeEach(async () => {
    getEntitlements = jest.fn((_userId: string, venueId: string) =>
      Promise.resolve({ ...NO_ENTITLEMENTS, challenge: !!rights[venueId] }),
    );
    getEntitlementsMany = jest.fn((_userId: string, venueIds: string[]) =>
      Promise.resolve(
        new Map(
          venueIds.map((v) => [
            v,
            { entitlements: { ...NO_ENTITLEMENTS, challenge: !!rights[v] } },
          ]),
        ),
      ),
    );
    rawRows = [];
    qb = {};
    for (const m of ['innerJoin', 'select', 'addSelect', 'where']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(() => Promise.resolve(rawRows));

    const module = await Test.createTestingModule({
      providers: [
        ChallengeAccessService,
        {
          provide: getRepositoryToken(Question),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
        {
          provide: ProAccessService,
          useValue: { getEntitlements, getEntitlementsMany },
        },
      ],
    }).compile();
    service = module.get(ChallengeAccessService);
  });

  describe('isUnlocked', () => {
    it('AC7 user with PRO NETSAT: NETSAT unlocked, TGAT still locked', async () => {
      await expect(service.isUnlocked(user, 'netsat')).resolves.toBe(true);
      await expect(service.isUnlocked(user, 'tgat')).resolves.toBe(false);
      expect(getEntitlements).toHaveBeenCalledWith('u1', 'netsat');
    });

    it('admin always; guest never (no lookup); no venue → locked', async () => {
      await expect(service.isUnlocked(admin, 'tgat')).resolves.toBe(true);
      await expect(service.isUnlocked(null, 'netsat')).resolves.toBe(false);
      await expect(service.isUnlocked(user, null)).resolves.toBe(false);
      expect(getEntitlements).not.toHaveBeenCalled();
    });
  });

  describe('unlockedQuestionIds (POST /answer-logs)', () => {
    it('by the venue of each question subject; no venue = locked', async () => {
      rawRows = [
        { id: 'Q-NET', venueId: 'netsat' },
        { id: 'q-tgat', venueId: 'tgat' },
        { id: 'q-none', venueId: null },
      ];
      const unlocked = await service.unlockedQuestionIds(user, [
        'Q-NET',
        'q-tgat',
        'q-none',
      ]);
      expect([...unlocked]).toEqual(['q-net']);
      expect(getEntitlementsMany).toHaveBeenCalledWith('u1', [
        'netsat',
        'tgat',
      ]);
      expect(qb.where).toHaveBeenCalledWith('q.id IN (:...ids)', {
        ids: ['Q-NET', 'q-tgat', 'q-none'],
      });
    });

    it('admin: all without a query; guest / nothing: none', async () => {
      await expect(
        service.unlockedQuestionIds(admin, ['A', 'b']),
      ).resolves.toEqual(new Set(['a', 'b']));
      await expect(service.unlockedQuestionIds(null, ['a'])).resolves.toEqual(
        new Set(),
      );
      await expect(service.unlockedQuestionIds(user, [])).resolves.toEqual(
        new Set(),
      );
      expect(qb.getRawMany).not.toHaveBeenCalled();
    });
  });
});
