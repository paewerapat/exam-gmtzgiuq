import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Question } from '../questions/question.entity';
import { ProAccessService } from '../pro/pro-access.service';
import { NO_ENTITLEMENTS } from '../pro/pro-entitlements';
import { PredictedSet } from './predicted-set.entity';
import {
  GUEST_RIGHTS,
  PREDICTED_LOCKED_ERROR_CODE,
  PredictedSetRule,
  PredictedViewerAccess,
  PredictedViewerRights,
  computePredictedAccess,
  effectivePreviewCount,
  normalizePreviewCount,
  notPredictedExamSql,
  playableCountSql,
  proIndexSql,
} from './predicted-access';
import {
  PredictedAccessService,
  pickAllowedKeys,
} from './predicted-access.service';

/** Task 22 AC2: the access table of a Predicted set. */

const VENUE = 'venue-1';

// Viewers of the table (rights as PredictedAccessService.getRights gives)
const VIEWERS: Record<string, PredictedViewerRights> = {
  guest: GUEST_RIGHTS,
  // Logged in, the venue has no free plan → NO_ENTITLEMENTS (predictedSets 0)
  noPlan: { loggedIn: true, admin: false, paid: false, predictedSets: 0 },
  // Logged in, no subscription → the free plan (rank 0), predictedSets 0
  freePlan0: { loggedIn: true, admin: false, paid: false, predictedSets: 0 },
  pro2: { loggedIn: true, admin: false, paid: true, predictedSets: 2 },
  maxAll: { loggedIn: true, admin: false, paid: true, predictedSets: null },
  admin: { loggedIn: true, admin: true, paid: true, predictedSets: null },
};

// Sets of the table: access / previewCount / proIndex
const SETS: Record<string, PredictedSetRule> = {
  freeNoPreview: { access: 'free', previewCount: null, proIndex: null },
  freePreview: { access: 'free', previewCount: 3, proIndex: null },
  proPreview1: { access: 'pro', previewCount: 3, proIndex: 1 },
  proPreview2: { access: 'pro', previewCount: 3, proIndex: 2 },
  proPreview3: { access: 'pro', previewCount: 3, proIndex: 3 },
  proNoPreview1: { access: 'pro', previewCount: null, proIndex: 1 },
  proNoPreview2: { access: 'pro', previewCount: 0, proIndex: 2 },
  proNoPreview3: { access: 'pro', previewCount: null, proIndex: 3 },
};

const F: PredictedViewerAccess = 'full';
const P: PredictedViewerAccess = 'preview';
const L: PredictedViewerAccess = 'locked';

// Rows = viewers, columns = SETS in the order above
const TABLE: Record<string, PredictedViewerAccess[]> = {
  //          freeNo freeP  pP1 pP2 pP3 pN1 pN2 pN3
  guest: [F, P, P, P, P, L, L, L],
  noPlan: [F, P, P, P, P, L, L, L],
  freePlan0: [F, P, P, P, P, L, L, L],
  pro2: [F, F, F, F, P, F, F, L],
  maxAll: [F, F, F, F, F, F, F, F],
  admin: [F, F, F, F, F, F, F, F],
};

describe('computePredictedAccess (task 22 AC2)', () => {
  const setNames = Object.keys(SETS);
  for (const [viewer, row] of Object.entries(TABLE)) {
    it(`${viewer}: ${row.join(' ')}`, () => {
      const got = setNames.map((name) =>
        computePredictedAccess(SETS[name], VIEWERS[viewer]),
      );
      expect(got).toEqual(row);
    });
  }

  it('a free plan with predictedSets 1 opens pro set 1 only (no paid plan)', () => {
    const rights = {
      loggedIn: true,
      admin: false,
      paid: false,
      predictedSets: 1,
    };
    expect(computePredictedAccess(SETS.proNoPreview1, rights)).toBe('full');
    expect(computePredictedAccess(SETS.proNoPreview2, rights)).toBe('locked');
    // free + Preview still needs a paid plan
    expect(computePredictedAccess(SETS.freePreview, rights)).toBe('preview');
  });

  it('guests never get full on a pro set, even if the free plan would', () => {
    expect(
      computePredictedAccess(SETS.proNoPreview1, {
        ...GUEST_RIGHTS,
        predictedSets: null,
      }),
    ).toBe('locked');
  });

  it('a pro set without a usable proIndex (e.g. unpublished) is not counted', () => {
    expect(
      computePredictedAccess(
        { access: 'pro', previewCount: null, proIndex: 0 },
        VIEWERS.pro2,
      ),
    ).toBe('locked');
  });

  it('a Preview not below the real questions is locked, not preview (B2/Q3)', () => {
    const pro = { access: 'pro', previewCount: 3, proIndex: 3 };
    const free = { access: 'free', previewCount: 3, proIndex: null };
    for (const viewer of [VIEWERS.guest, VIEWERS.noPlan, VIEWERS.pro2]) {
      expect(computePredictedAccess({ ...pro, playableCount: 3 }, viewer)).toBe(
        'locked',
      );
      expect(computePredictedAccess({ ...pro, playableCount: 1 }, viewer)).toBe(
        'locked',
      );
      expect(computePredictedAccess({ ...pro, playableCount: 4 }, viewer)).toBe(
        'preview',
      );
      // free set: a paid plan opens it whole, others had only the Preview
      expect(
        computePredictedAccess({ ...free, playableCount: 0 }, viewer),
      ).toBe(viewer.paid ? 'full' : 'locked');
    }
    // Not sent = not checked (as before)
    expect(computePredictedAccess(pro, VIEWERS.guest)).toBe('preview');
    // Full access is not affected
    expect(
      computePredictedAccess({ ...pro, playableCount: 1 }, VIEWERS.maxAll),
    ).toBe('full');
    expect(
      computePredictedAccess({ ...pro, playableCount: 1 }, VIEWERS.admin),
    ).toBe('full');
    expect(
      computePredictedAccess(
        {
          access: 'free',
          previewCount: null,
          proIndex: null,
          playableCount: 0,
        },
        VIEWERS.guest,
      ),
    ).toBe('full');
    expect(effectivePreviewCount({ ...pro, playableCount: 4 })).toBe(3);
    expect(effectivePreviewCount({ ...pro, playableCount: 3 })).toBeNull();
  });

  it('normalizePreviewCount: > 0 whole numbers only', () => {
    expect(normalizePreviewCount(3)).toBe(3);
    expect(normalizePreviewCount('2')).toBe(2);
    expect(normalizePreviewCount(0)).toBeNull();
    expect(normalizePreviewCount(null)).toBeNull();
    expect(normalizePreviewCount(-1)).toBeNull();
    expect(normalizePreviewCount(1.5)).toBeNull();
  });

  it('SQL helpers', () => {
    expect(notPredictedExamSql('exam.id')).toBe(
      'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = exam.id)',
    );
    // published pro sets of the same series up to this setNo
    expect(proIndexSql('ps')).toContain("pro_set.access = 'pro'");
    expect(proIndexSql('ps')).toContain("pro_exam.status = 'published'");
    expect(proIndexSql('ps')).toContain('pro_set.setNo <= ps.setNo');
    // the same rows as questionIds(): this exam, no Challenge question
    expect(playableCountSql('ps.examId')).toBe(
      '(SELECT COUNT(*) FROM questions playable_q WHERE playable_q.examId = ps.examId AND playable_q.isChallenge = 0)',
    );
  });

  it('pickAllowedKeys keeps allowed ids only (case-insensitive)', () => {
    expect(
      pickAllowedKeys({ Q1: 'a', q2: 'b', q3: 'c' }, ['q1', 'Q2']),
    ).toEqual({ Q1: 'a', q2: 'b' });
    expect(pickAllowedKeys(null, ['q1'])).toEqual({});
  });
});

describe('PredictedAccessService (task 22)', () => {
  let service: PredictedAccessService;
  let setRow: Record<string, unknown> | undefined;
  let qb: Record<string, jest.Mock>;
  let questionQb: Record<string, jest.Mock>;
  let getEntitlementsMany: jest.Mock;
  let exists: jest.Mock;
  let find: jest.Mock;
  let findOne: jest.Mock;

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'set-1',
    seriesId: 'series-1',
    examId: 'exam-1',
    setNo: '3',
    access: 'pro',
    previewCount: 2,
    proIndex: '1',
    playableCount: '5',
    venueId: VENUE,
    venueKey: 'netsat',
    seriesActive: 1,
    examStatus: 'published',
    ...over,
  });

  const venueRights = (
    entitlements: Record<string, unknown>,
    rank: number | null,
    subscriptionId: string | null,
  ) =>
    new Map([
      [
        VENUE,
        {
          venueId: VENUE,
          entitlements: { ...NO_ENTITLEMENTS, ...entitlements },
          subscriptionId,
          planId: 'plan',
          planCode: 'x',
          rank,
          expiresAt: null,
        },
      ],
    ]);

  beforeEach(async () => {
    setRow = row();
    qb = {};
    for (const m of [
      'innerJoin',
      'leftJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawOne = jest.fn(() => Promise.resolve(setRow));
    questionQb = {};
    for (const m of [
      'select',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'limit',
    ]) {
      questionQb[m] = jest.fn(() => questionQb);
    }
    questionQb.getRawMany = jest
      .fn()
      .mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    getEntitlementsMany = jest
      .fn()
      .mockResolvedValue(venueRights({ predictedSets: 2 }, 1, 'sub-1'));
    exists = jest.fn().mockResolvedValue(true);
    find = jest.fn().mockResolvedValue([{ id: 's', examId: 'EXAM-1' }]);
    findOne = jest.fn().mockResolvedValue({ id: 's', previewCount: 3 });

    const module = await Test.createTestingModule({
      providers: [
        PredictedAccessService,
        {
          provide: getRepositoryToken(PredictedSet),
          useValue: { createQueryBuilder: () => qb, exists, find, findOne },
        },
        {
          provide: getRepositoryToken(Question),
          useValue: { createQueryBuilder: () => questionQb },
        },
        { provide: ProAccessService, useValue: { getEntitlementsMany } },
      ],
    }).compile();
    service = module.get(PredictedAccessService);
  });

  describe('getRights', () => {
    it('guest: no query, guest rights', async () => {
      await expect(service.getRights(null, VENUE)).resolves.toEqual(
        GUEST_RIGHTS,
      );
      expect(getEntitlementsMany).not.toHaveBeenCalled();
    });

    it('admin: no query, every set', async () => {
      await expect(
        service.getRights({ id: 'a', role: 'admin' }, VENUE),
      ).resolves.toMatchObject({ admin: true, predictedSets: null });
      expect(getEntitlementsMany).not.toHaveBeenCalled();
    });

    it('paid = the highest active plan has rank > 0 (one ProAccessService call)', async () => {
      await expect(service.getRights({ id: 'u' }, VENUE)).resolves.toEqual({
        loggedIn: true,
        admin: false,
        paid: true,
        predictedSets: 2,
      });
      expect(getEntitlementsMany).toHaveBeenCalledTimes(1);
      expect(getEntitlementsMany).toHaveBeenCalledWith(
        'u',
        [VENUE],
        expect.any(Date),
      );
    });

    it('free plan (no subscription, rank 0): not paid, its predictedSets', async () => {
      getEntitlementsMany.mockResolvedValue(
        venueRights({ predictedSets: 0 }, 0, null),
      );
      await expect(
        service.getRights({ id: 'u' }, VENUE),
      ).resolves.toMatchObject({ paid: false, predictedSets: 0 });
    });

    it('MAX (predictedSets null) → every set', async () => {
      getEntitlementsMany.mockResolvedValue(
        venueRights({ predictedSets: null }, 2, 'sub-2'),
      );
      await expect(
        service.getRights({ id: 'u' }, VENUE),
      ).resolves.toMatchObject({ paid: true, predictedSets: null });
    });
  });

  describe('resolveExam', () => {
    it('not a Predicted set → null', async () => {
      setRow = undefined;
      await expect(service.resolveExam(null, 'exam-x')).resolves.toBeNull();
    });

    it('series off or exam not published → 404 (non-admin), admin still full', async () => {
      setRow = row({ seriesActive: 0 });
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      setRow = row({ examStatus: 'draft' });
      await expect(service.resolveExam(null, 'exam-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.resolveExam({ id: 'a', role: 'admin' }, 'exam-1'),
      ).resolves.toMatchObject({ access: 'full' });
    });

    it('PRO (predictedSets 2) on pro set proIndex 1 → full', async () => {
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).resolves.toMatchObject({
        access: 'full',
        previewCount: 2,
        set: { setNo: 3, seriesId: 'series-1', proIndex: 1 },
      });
      // venueKey only from an active venue (/upgrade lists active ones)
      expect(qb.leftJoin).toHaveBeenCalledWith(
        'pro_venues',
        'venue',
        'venue.id = series.venueId AND venue.isActive = :venueActive',
        { venueActive: true },
      );
    });

    it('PRO on pro set proIndex 3 → preview', async () => {
      setRow = row({ proIndex: 3 });
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).resolves.toMatchObject({ access: 'preview', previewCount: 2 });
    });

    it('free set without Preview: full, no rights query', async () => {
      setRow = row({ access: 'free', previewCount: null });
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).resolves.toMatchObject({ access: 'full', previewCount: null });
      expect(getEntitlementsMany).not.toHaveBeenCalled();
    });

    it('guest: no rights query; pro with Preview → preview, without → locked', async () => {
      await expect(service.resolveExam(null, 'exam-1')).resolves.toMatchObject({
        access: 'preview',
      });
      setRow = row({ previewCount: null });
      await expect(service.resolveExam(null, 'exam-1')).resolves.toMatchObject({
        access: 'locked',
      });
      expect(getEntitlementsMany).not.toHaveBeenCalled();
    });
  });

  describe('Preview checked on every read (B2/Q3)', () => {
    it('findSetForExam counts the real questions in the same query', async () => {
      await service.findSetForExam('exam-1');
      expect(qb.addSelect).toHaveBeenCalledWith(
        playableCountSql('ps.examId'),
        'playableCount',
      );
    });

    it('questions dropped to previewCount → locked for GET /exams/:id', async () => {
      setRow = row({ proIndex: 3, playableCount: '2' });
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).resolves.toMatchObject({ access: 'locked' });
      await expect(
        service.assertExam({ id: 'u' }, 'exam-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('start / legacy submit → 403, no question id read', async () => {
      setRow = row({ proIndex: 3, playableCount: '1' });
      await expect(
        service.attemptStartScope(null, 'exam-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(questionQb.getRawMany).not.toHaveBeenCalled();
    });

    it('progress / complete of a Preview attempt → 403 once the set is locked', async () => {
      setRow = row({ proIndex: 3, playableCount: '2' });
      await expect(
        service.attemptScope(
          { id: 'u' },
          { examId: 'exam-1', mode: 'preview', questionIds: ['q1', 'q2'] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('findPreviewCount (exam PUT): previewCount of the set, else null', async () => {
      await expect(service.findPreviewCount('exam-1')).resolves.toBe(3);
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { examId: 'exam-1' } }),
      );
      findOne.mockResolvedValue({ id: 's', previewCount: 0 });
      await expect(service.findPreviewCount('exam-1')).resolves.toBeNull();
      findOne.mockResolvedValue(null);
      await expect(service.findPreviewCount('exam-1')).resolves.toBeNull();
    });

    it('viewers with full access are not affected', async () => {
      setRow = row({ proIndex: 1, playableCount: '2' });
      await expect(
        service.resolveExam({ id: 'u' }, 'exam-1'),
      ).resolves.toMatchObject({ access: 'full' });
    });
  });

  describe('attempt scopes', () => {
    it('locked → 403 PREDICTED_LOCKED', async () => {
      setRow = row({ previewCount: null, proIndex: 3 });
      const err = await service
        .attemptStartScope({ id: 'u' }, 'exam-1')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        errorCode: PREDICTED_LOCKED_ERROR_CODE,
        venueKey: 'netsat',
      });
    });

    it('preview start → mode preview with the first previewCount ids in order', async () => {
      setRow = row({ proIndex: 3 });
      await expect(
        service.attemptStartScope({ id: 'u' }, 'exam-1'),
      ).resolves.toEqual({ mode: 'preview', questionIds: ['q1', 'q2'] });
      expect(questionQb.limit).toHaveBeenCalledWith(2);
      expect(questionQb.orderBy).toHaveBeenCalledWith('q.orderIndex', 'ASC');
      expect(questionQb.addOrderBy).toHaveBeenCalledWith('q.createdAt', 'ASC');
      expect(questionQb.addOrderBy).toHaveBeenCalledWith('q.id', 'ASC');
      expect(questionQb.andWhere).toHaveBeenCalledWith(
        'q.isChallenge = :isChallenge',
        { isChallenge: false },
      );
    });

    it('full start → mode null, every question (no limit)', async () => {
      await expect(
        service.attemptStartScope({ id: 'u' }, 'exam-1'),
      ).resolves.toEqual({ mode: null, questionIds: ['q1', 'q2'] });
      expect(questionQb.limit).not.toHaveBeenCalled();
    });

    it('not a Predicted set → null', async () => {
      setRow = undefined;
      await expect(
        service.attemptStartScope({ id: 'u' }, 'exam-1'),
      ).resolves.toBeNull();
      await expect(
        service.attemptScope(
          { id: 'u' },
          {
            examId: 'exam-1',
            mode: 'exam',
            questionIds: [],
          },
        ),
      ).resolves.toBeNull();
    });

    it('preview attempt keeps its stored questions (even after an upgrade)', async () => {
      await expect(
        service.attemptScope(
          { id: 'u' },
          {
            examId: 'exam-1',
            mode: 'preview',
            questionIds: ['q1', 5, 'q2'],
          },
        ),
      ).resolves.toEqual({ mode: 'preview', questionIds: ['q1', 'q2'] });
    });

    it('full attempt when access is now only preview → 403 PREDICTED_LOCKED', async () => {
      setRow = row({ proIndex: 3 });
      await expect(
        service.attemptScope(
          { id: 'u' },
          {
            examId: 'exam-1',
            mode: 'exam',
            questionIds: ['q1'],
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('predictedExamIds / isPredictedExam', async () => {
    await expect(
      service.predictedExamIds(['exam-1', 'exam-2']),
    ).resolves.toEqual(new Set(['exam-1']));
    await expect(service.predictedExamIds([])).resolves.toEqual(new Set());
    await expect(service.isPredictedExam('exam-1')).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith({
      where: { examId: 'exam-1' },
      loadEagerRelations: false,
    });
  });
});
