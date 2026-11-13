import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, FindOperator, In } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccessType } from '../exams/exam-mock';
import { ExamAccess, ExamAccessSource } from './exam-access.entity';
import { ExamAccessService } from './exam-access.service';
import { isLockedExam } from './exam-access';
import { ProAccessService } from '../pro/pro-access.service';

const NOW = new Date('2026-11-10T05:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const exam = (
  id: string,
  accessType: ExamAccessType,
  isMock: boolean | number | string = true,
) => ({ id, isMock, accessType });

const codeExam = exam('code-1', ExamAccessType.CODE);
const purchaseExam = exam('buy-1', ExamAccessType.PURCHASE);
const freeMock = exam('free-1', ExamAccessType.FREE);
const normalExam = exam('normal-1', ExamAccessType.CODE, false);

const student = { id: 'user-a', role: 'user' };
const admin = { id: 'admin-1', role: 'admin' };

describe('isLockedExam (task 15)', () => {
  it('locks only Mock Exams with accessType code or purchase', () => {
    expect(isLockedExam(codeExam)).toBe(true);
    expect(isLockedExam(purchaseExam)).toBe(true);
    expect(isLockedExam(freeMock)).toBe(false);
    // accessType only applies to mock exams
    expect(isLockedExam(normalExam)).toBe(false);
  });

  it('reads isMock from raw rows (0/1, "0"/"1")', () => {
    expect(isLockedExam({ isMock: 1, accessType: 'code' })).toBe(true);
    expect(isLockedExam({ isMock: '1', accessType: 'purchase' })).toBe(true);
    expect(isLockedExam({ isMock: 0, accessType: 'code' })).toBe(false);
    expect(isLockedExam({ isMock: '0', accessType: 'code' })).toBe(false);
    expect(isLockedExam({ isMock: null, accessType: 'code' })).toBe(false);
  });
});

describe('ExamAccessService (task 15)', () => {
  let service: ExamAccessService;
  let grants: Partial<ExamAccess>[];
  let accessFind: jest.Mock;
  let examFindOne: jest.Mock;
  // Pro rights by exam id → end (task 17); empty = no Pro plan
  let proAccess: Map<string, Date | null>;
  let getMockPurchaseAccess: jest.Mock;

  beforeEach(async () => {
    grants = [];
    proAccess = new Map();
    getMockPurchaseAccess = jest.fn(
      (_userId: string, exams: { id: string }[]) =>
        Promise.resolve(
          new Map(
            exams
              .filter((e) => proAccess.has(e.id))
              .map((e) => [e.id, proAccess.get(e.id) ?? null]),
          ),
        ),
    );
    // Mimics find({ where: [..] }) on exam_access: OR of the conditions
    accessFind = jest.fn(({ where }: { where: Record<string, unknown>[] }) =>
      Promise.resolve(
        grants.filter((g) =>
          where.some((cond) =>
            Object.entries(cond).every(([key, value]) => {
              const actual = g[key as keyof ExamAccess];
              if (value instanceof FindOperator) {
                return (value.value as unknown[]).includes(actual);
              }
              return actual === value;
            }),
          ),
        ),
      ),
    );
    examFindOne = jest.fn().mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        ExamAccessService,
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: { find: accessFind },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: { findOne: examFindOne },
        },
        {
          provide: ProAccessService,
          useValue: { getMockPurchaseAccess },
        },
      ],
    }).compile();

    service = module.get(ExamAccessService);
  });

  const grant = (data: Partial<ExamAccess>) =>
    grants.push({
      userId: 'user-a',
      examId: null,
      allMock: false,
      source: ExamAccessSource.CODE,
      expiresAt: null,
      ...data,
    });

  describe('getAccessMany / getAccess', () => {
    it('free exams are free for everyone, without a query', async () => {
      const map = await service.getAccessMany(
        null,
        [freeMock, normalExam],
        NOW,
      );
      expect(map.get('free-1')).toEqual({
        status: 'free',
        expiresAt: null,
        via: null,
      });
      expect(map.get('normal-1')).toEqual({
        status: 'free',
        expiresAt: null,
        via: null,
      });
      expect(accessFind).not.toHaveBeenCalled();
    });

    it('guest → locked (no query)', async () => {
      const map = await service.getAccessMany(
        null,
        [codeExam, purchaseExam],
        NOW,
      );
      expect(map.get('code-1')).toEqual({
        status: 'locked',
        expiresAt: null,
        via: null,
      });
      expect(map.get('buy-1')).toEqual({
        status: 'locked',
        expiresAt: null,
        via: null,
      });
      expect(accessFind).not.toHaveBeenCalled();
    });

    it('admin → unlocked without an end (no query)', async () => {
      await expect(service.getAccess(admin, codeExam, NOW)).resolves.toEqual({
        status: 'unlocked',
        expiresAt: null,
        via: 'admin',
      });
      expect(accessFind).not.toHaveBeenCalled();
    });

    it('student without a grant → locked', async () => {
      grant({ userId: 'user-b', examId: 'code-1', expiresAt: null });
      await expect(service.getAccess(student, codeExam, NOW)).resolves.toEqual({
        status: 'locked',
        expiresAt: null,
        via: null,
      });
    });

    it('active grant → unlocked with its end; past grant → expired with its end', async () => {
      const end = new Date(NOW.getTime() + 30 * DAY);
      const past = new Date(NOW.getTime() - DAY);
      grant({ examId: 'code-1', expiresAt: end });
      grant({ examId: 'buy-1', expiresAt: past });

      const map = await service.getAccessMany(
        student,
        [codeExam, purchaseExam, freeMock],
        NOW,
      );

      expect(map.get('code-1')).toEqual({
        status: 'unlocked',
        expiresAt: end.toISOString(),
        via: 'code',
      });
      expect(map.get('buy-1')).toEqual({
        status: 'expired',
        expiresAt: past.toISOString(),
        via: 'code',
      });
      expect(map.get('free-1')?.status).toBe('free');
      // one query for the whole list: this user's grants of the locked
      // exams + all-Mock grants
      expect(accessFind).toHaveBeenCalledTimes(1);
      expect(
        (accessFind.mock.calls[0] as [{ where: unknown }])[0].where,
      ).toEqual([
        { userId: 'user-a', examId: In(['code-1', 'buy-1']) },
        { userId: 'user-a', allMock: true },
      ]);
    });

    it('expires exactly at expiresAt', async () => {
      grant({ examId: 'code-1', expiresAt: NOW });
      await expect(
        service.getAccess(student, codeExam, NOW),
      ).resolves.toMatchObject({ status: 'expired' });
    });

    it('an all-Mock grant covers every locked exam, also ones not named', async () => {
      const end = new Date(NOW.getTime() + DAY);
      grant({ allMock: true, examId: null, expiresAt: end });

      const map = await service.getAccessMany(
        student,
        [codeExam, purchaseExam, exam('new-mock', ExamAccessType.CODE)],
        NOW,
      );
      for (const id of ['code-1', 'buy-1', 'new-mock']) {
        expect(map.get(id)).toEqual({
          status: 'unlocked',
          expiresAt: end.toISOString(),
          via: 'code',
        });
      }
    });

    it('several grants: unlocked uses the latest end; one without an end wins', async () => {
      const soon = new Date(NOW.getTime() + DAY);
      const later = new Date(NOW.getTime() + 10 * DAY);
      grant({ examId: 'code-1', expiresAt: soon });
      grant({ allMock: true, expiresAt: later });
      grant({ examId: 'code-1', expiresAt: new Date(NOW.getTime() - DAY) });

      await expect(service.getAccess(student, codeExam, NOW)).resolves.toEqual({
        status: 'unlocked',
        expiresAt: later.toISOString(),
        via: 'code',
      });

      grant({
        examId: 'code-1',
        expiresAt: null,
        source: ExamAccessSource.ADMIN,
      });
      await expect(service.getAccess(student, codeExam, NOW)).resolves.toEqual({
        status: 'unlocked',
        expiresAt: null,
        via: 'admin',
      });
    });

    it('expired: expiresAt is the latest past end', async () => {
      const a = new Date(NOW.getTime() - 5 * DAY);
      const b = new Date(NOW.getTime() - 2 * DAY);
      grant({ examId: 'code-1', expiresAt: a });
      grant({ allMock: true, expiresAt: b });
      await expect(service.getAccess(student, codeExam, NOW)).resolves.toEqual({
        status: 'expired',
        expiresAt: b.toISOString(),
        via: 'code',
      });
    });
  });

  describe('assertCanAccess', () => {
    const lockedBody = {
      statusCode: 403,
      message: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน',
      errorCode: 'EXAM_LOCKED',
    };

    async function expectLocked(promise: Promise<unknown>) {
      const err = await promise.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toEqual(lockedBody);
    }

    it('free / normal exams pass for guests', async () => {
      await expect(service.assertCanAccess(null, freeMock)).resolves.toBe(
        undefined,
      );
      await expect(service.assertCanAccess(null, normalExam)).resolves.toBe(
        undefined,
      );
    });

    it('locked: guest, no grant and expired grant → 403 EXAM_LOCKED', async () => {
      await expectLocked(service.assertCanAccess(null, codeExam));
      await expectLocked(service.assertCanAccess(student, purchaseExam));
      grant({ examId: 'code-1', expiresAt: new Date(Date.now() - 1000) });
      await expectLocked(service.assertCanAccess(student, codeExam));
    });

    it('locked: active grant and admin pass', async () => {
      grant({ examId: 'code-1', expiresAt: new Date(Date.now() + DAY) });
      await expect(service.assertCanAccess(student, codeExam)).resolves.toBe(
        undefined,
      );
      await expect(service.assertCanAccess(admin, purchaseExam)).resolves.toBe(
        undefined,
      );
    });

    it('by exam id: loads only the lock fields; unknown exam or no id passes', async () => {
      examFindOne.mockResolvedValue(codeExam);
      await expectLocked(service.assertCanAccessExamId(student, 'code-1'));
      expect(examFindOne).toHaveBeenCalledWith({
        select: { id: true, isMock: true, accessType: true, category: true },
        where: { id: 'code-1' },
        loadEagerRelations: false,
      });

      examFindOne.mockResolvedValue(null);
      await expect(
        service.assertCanAccessExamId(student, 'missing'),
      ).resolves.toBe(undefined);
      await expect(service.assertCanAccessExamId(student, null)).resolves.toBe(
        undefined,
      );
    });
  });

  describe('purchase exams and Pro plans (task 17)', () => {
    const netsatBuy = {
      ...exam('buy-netsat', ExamAccessType.PURCHASE),
      category: 'netsat-math',
    };

    it('only purchase exams of a logged-in non-admin are asked about Pro', async () => {
      await service.getAccessMany(null, [netsatBuy], NOW);
      await service.getAccessMany(admin, [netsatBuy], NOW);
      await service.getAccessMany(student, [codeExam, freeMock], NOW);
      expect(getMockPurchaseAccess).not.toHaveBeenCalled();

      await service.getAccessMany(student, [codeExam, netsatBuy], NOW);
      expect(getMockPurchaseAccess).toHaveBeenCalledTimes(1);
      expect(getMockPurchaseAccess).toHaveBeenCalledWith(
        'user-a',
        [netsatBuy],
        NOW,
      );
    });

    it('no Pro right (no plan, other venue, category without venue) → locked', async () => {
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'locked', expiresAt: null, via: null },
      );
    });

    it('Pro right with mockPurchase → unlocked until the end of the plan', async () => {
      const end = new Date(NOW.getTime() + 30 * DAY);
      proAccess.set('buy-netsat', end);
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'unlocked', expiresAt: end.toISOString(), via: 'pro' },
      );
      // a code exam is never unlocked by Pro
      proAccess.set('code-1', end);
      await expect(service.getAccess(student, codeExam, NOW)).resolves.toEqual({
        status: 'locked',
        expiresAt: null,
        via: null,
      });
    });

    it('Pro without an end (free plan allows it) → unlocked, no end', async () => {
      proAccess.set('buy-netsat', null);
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'unlocked', expiresAt: null, via: 'pro' },
      );
    });

    it('a grant and a Pro right: the later end wins; an expired grant does not matter', async () => {
      const planEnd = new Date(NOW.getTime() + 10 * DAY);
      proAccess.set('buy-netsat', planEnd);

      grant({ examId: 'buy-netsat', expiresAt: new Date(NOW.getTime() - DAY) });
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'unlocked', expiresAt: planEnd.toISOString(), via: 'pro' },
      );

      const grantEnd = new Date(NOW.getTime() + 20 * DAY);
      grant({ examId: 'buy-netsat', expiresAt: grantEnd });
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'unlocked', expiresAt: grantEnd.toISOString(), via: 'code' },
      );

      grant({
        examId: 'buy-netsat',
        expiresAt: null,
        source: ExamAccessSource.ADMIN,
      });
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        { status: 'unlocked', expiresAt: null, via: 'admin' },
      );
    });

    it('via (round 2): the source whose end won; ties → the grant, then admin > purchase > code', async () => {
      const end = new Date(NOW.getTime() + 10 * DAY);
      const via = async () =>
        (await service.getAccess(student, netsatBuy, NOW)).via;

      // Pro without an end beats a dated grant
      grant({ examId: 'buy-netsat', expiresAt: end });
      proAccess.set('buy-netsat', null);
      await expect(via()).resolves.toBe('pro');
      // same end → the grant is kept
      proAccess.set('buy-netsat', end);
      await expect(via()).resolves.toBe('code');
      // grants with the same end: purchase before code
      grant({
        examId: 'buy-netsat',
        expiresAt: end,
        source: ExamAccessSource.PURCHASE,
      });
      await expect(via()).resolves.toBe('purchase');
      // a grant without an end beats Pro without an end
      proAccess.set('buy-netsat', null);
      grant({ allMock: true, expiresAt: null });
      await expect(via()).resolves.toBe('code');
    });

    it('via: expired → the grant that ended last; locked / free → null', async () => {
      grant({
        examId: 'buy-netsat',
        expiresAt: new Date(NOW.getTime() - 5 * DAY),
        source: ExamAccessSource.ADMIN,
      });
      grant({
        examId: 'buy-netsat',
        expiresAt: new Date(NOW.getTime() - DAY),
        source: ExamAccessSource.PURCHASE,
      });
      await expect(service.getAccess(student, netsatBuy, NOW)).resolves.toEqual(
        {
          status: 'expired',
          expiresAt: new Date(NOW.getTime() - DAY).toISOString(),
          via: 'purchase',
        },
      );
      await expect(service.getAccess(null, netsatBuy, NOW)).resolves.toEqual({
        status: 'locked',
        expiresAt: null,
        via: null,
      });
      await expect(service.getAccess(student, freeMock, NOW)).resolves.toEqual({
        status: 'free',
        expiresAt: null,
        via: null,
      });
    });

    it('assertCanAccess: 403 without Pro, passes with Pro', async () => {
      await expect(
        service.assertCanAccess(student, netsatBuy),
      ).rejects.toBeInstanceOf(ForbiddenException);
      proAccess.set('buy-netsat', new Date(Date.now() + DAY));
      await expect(service.assertCanAccess(student, netsatBuy)).resolves.toBe(
        undefined,
      );
    });
  });

  describe('grant', () => {
    it('one row per exam (deduped), or one all-Mock row', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);
      const manager = { insert } as unknown as EntityManager;
      const expiresAt = new Date(NOW.getTime() + DAY);

      await service.grant(manager, {
        userId: 'user-a',
        examIds: ['e1', 'e2', 'e1'],
        allMock: false,
        source: ExamAccessSource.CODE,
        sourceId: 'code-id',
        expiresAt,
      });
      expect(insert).toHaveBeenCalledWith(ExamAccess, [
        expect.objectContaining({ examId: 'e1', allMock: false, expiresAt }),
        expect.objectContaining({ examId: 'e2', allMock: false, expiresAt }),
      ]);
      expect(
        (insert.mock.calls[0] as [unknown, unknown[]])[1][0],
      ).toMatchObject({
        userId: 'user-a',
        source: 'code',
        sourceId: 'code-id',
      });

      insert.mockClear();
      await service.grant(manager, {
        userId: 'user-a',
        examIds: ['ignored'],
        allMock: true,
        source: ExamAccessSource.PURCHASE,
        sourceId: null,
        expiresAt: null,
      });
      expect(insert).toHaveBeenCalledWith(ExamAccess, [
        expect.objectContaining({
          examId: null,
          allMock: true,
          source: 'purchase',
        }),
      ]);
    });
  });
});
