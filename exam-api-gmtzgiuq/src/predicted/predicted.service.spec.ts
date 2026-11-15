import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { Subject } from '../curriculum/subject.entity';
import { ProVenue } from '../pro/pro-venue.entity';
import { PredictedSeries } from './predicted-series.entity';
import { PredictedSet } from './predicted-set.entity';
import { PredictedAccessService } from './predicted-access.service';
import { GUEST_RIGHTS } from './predicted-access';
import { PredictedService } from './predicted.service';

const VENUE = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const EXAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Chainable query builder whose reads resolve to `result`. */
function chain(result: { many?: unknown[]; one?: unknown } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'select',
    'addSelect',
    'leftJoin',
    'innerJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'limit',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getRawOne = jest.fn().mockResolvedValue(result.one);
  return qb;
}

describe('PredictedService (task 22)', () => {
  let service: PredictedService;
  let seriesQbs: Record<string, jest.Mock>[];
  let setQbs: Record<string, jest.Mock>[];
  let attemptQb: Record<string, jest.Mock>;
  let examQb: Record<string, jest.Mock>;
  let venuesFind: jest.Mock;
  let venueExists: jest.Mock;
  let subjectExists: jest.Mock;
  let examsFind: jest.Mock;
  let seriesFindOne: jest.Mock;
  let manager: Record<string, jest.Mock>;
  let getRights: jest.Mock;

  beforeEach(async () => {
    seriesQbs = [];
    setQbs = [];
    attemptQb = chain();
    examQb = chain();
    venuesFind = jest.fn().mockResolvedValue([
      { id: VENUE, key: 'netsat', name: 'NETSAT' },
      { id: 'v2', key: 'tgat', name: 'TGAT' },
    ]);
    venueExists = jest.fn().mockResolvedValue(true);
    subjectExists = jest.fn().mockResolvedValue(true);
    examsFind = jest.fn().mockResolvedValue([]);
    seriesFindOne = jest.fn().mockResolvedValue({ id: 'series-1' });
    manager = {
      create: jest.fn((_e: unknown, data: object) => ({ ...data })),
      save: jest.fn((data: unknown) =>
        Promise.resolve(Array.isArray(data) ? data : { id: 'series-new' }),
      ),
      findOne: jest.fn().mockResolvedValue({ id: 'series-1' }),
      find: jest.fn().mockResolvedValue([{ id: 's1', examId: EXAM_A }]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      // assertSets reads inside the write's transaction (N8)
      getRepository: jest.fn((entity: unknown) =>
        entity === Exam
          ? { find: examsFind }
          : { createQueryBuilder: () => setQbs.shift() ?? chain() },
      ),
    };
    // As PredictedAccessService.getRights: guests and admins without a query
    getRights = jest.fn((viewer: { id?: string; role?: string } | null) =>
      Promise.resolve(
        viewer?.role === 'admin'
          ? { loggedIn: true, admin: true, paid: true, predictedSets: null }
          : viewer?.id
            ? { loggedIn: true, admin: false, paid: false, predictedSets: 0 }
            : GUEST_RIGHTS,
      ),
    );

    const module = await Test.createTestingModule({
      providers: [
        PredictedService,
        {
          provide: getRepositoryToken(PredictedSeries),
          useValue: {
            createQueryBuilder: jest.fn(() => {
              const qb = seriesQbs.shift() ?? chain();
              return qb;
            }),
            findOne: seriesFindOne,
          },
        },
        {
          provide: getRepositoryToken(PredictedSet),
          useValue: {
            createQueryBuilder: jest.fn(() => setQbs.shift() ?? chain()),
          },
        },
        {
          provide: getRepositoryToken(ProVenue),
          useValue: { find: venuesFind, exists: venueExists },
        },
        {
          provide: getRepositoryToken(Subject),
          useValue: { exists: subjectExists },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: { find: examsFind, createQueryBuilder: () => examQb },
        },
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { createQueryBuilder: () => attemptQb },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
              cb(manager as unknown as EntityManager),
            ),
          },
        },
        { provide: PredictedAccessService, useValue: { getRights } },
      ],
    }).compile();
    service = module.get(PredictedService);
  });

  // ── GET /predicted ────────────────────────────────────────────────────

  describe('findPage', () => {
    const seriesRows = [
      {
        id: 'series-1',
        title: 'MATH JAN',
        description: null,
        color: '#6366f1',
        sortOrder: 1,
        isActive: 1,
        venueId: VENUE,
        subjectId: SUBJECT,
        subjectName: 'คณิต',
        subjectOrder: 1,
      },
      {
        id: 'series-2',
        title: 'EMPTY',
        description: null,
        color: null,
        sortOrder: 2,
        isActive: 1,
        venueId: VENUE,
        subjectId: null,
        subjectName: null,
        subjectOrder: null,
      },
    ];
    const setRows = [
      {
        seriesId: 'series-1',
        examId: EXAM_A,
        setNo: '1',
        access: 'free',
        previewCount: null,
        proIndex: '0',
        playableCount: '5',
        title: 'ชุด A',
        questionCount: '5',
        durationMinutes: null,
        status: 'published',
      },
      {
        seriesId: 'series-1',
        examId: EXAM_B,
        setNo: '2',
        access: 'pro',
        previewCount: 2,
        proIndex: '1',
        playableCount: '5',
        title: 'ชุด B',
        questionCount: '5',
        durationMinutes: '60',
        status: 'published',
      },
    ];

    it('guest: first active venue, viewerAccess per set, no rights / progress query, empty series hidden', async () => {
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(chain({ many: setRows }));
      const page = await service.findPage(null);

      expect(page.venueKey).toBe('netsat');
      expect(page.venues).toEqual([
        { key: 'netsat', name: 'NETSAT' },
        { key: 'tgat', name: 'TGAT' },
      ]);
      expect(page.series).toHaveLength(1);
      expect(page.series[0]).toMatchObject({
        id: 'series-1',
        venueKey: 'netsat',
        subject: { id: SUBJECT, name: 'คณิต' },
      });
      expect(page.series[0].sets).toEqual([
        expect.objectContaining({
          setNo: 1,
          examId: EXAM_A,
          access: 'free',
          previewCount: null,
          viewerAccess: 'full',
          myProgress: null,
          questionCount: 5,
          durationMinutes: null,
        }),
        expect.objectContaining({
          setNo: 2,
          access: 'pro',
          previewCount: 2,
          viewerAccess: 'preview',
          durationMinutes: 60,
        }),
      ]);
      expect(page.subjects).toEqual([{ id: SUBJECT, name: 'คณิต', count: 2 }]);
      expect(page.total).toBe(2);
      expect(page.viewerHasPaidPlan).toBe(false);
      expect(page.series[0].sets.map((s) => s.status)).toEqual([
        'published',
        'published',
      ]);
      expect(getRights).toHaveBeenCalledWith(null, VENUE, expect.any(Date));
      expect(attemptQb.getRawMany).not.toHaveBeenCalled();
      // No question content is selected
      expect(JSON.stringify(page)).not.toMatch(/question"|choices|explanation/);
    });

    it('non-admin: only active series and published exams are read', async () => {
      const sq = chain({ many: seriesRows });
      const st = chain({ many: setRows });
      seriesQbs.push(sq);
      setQbs.push(st);
      await service.findPage({ id: 'u' }, { venue: 'NETSAT' });
      expect(sq.andWhere).toHaveBeenCalledWith('series.isActive = :active', {
        active: true,
      });
      expect(st.andWhere).toHaveBeenCalledWith('exam.status = :published', {
        published: 'published',
      });
    });

    it('logged in: one rights lookup for the venue + one progress query (no N+1)', async () => {
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(chain({ many: setRows }));
      getRights.mockResolvedValue({
        loggedIn: true,
        admin: false,
        paid: true,
        predictedSets: 2,
      });
      attemptQb.getRawMany.mockResolvedValue([
        {
          id: 'att-1',
          examId: EXAM_B,
          status: 'in_progress',
          mode: 'exam',
          answers: '{"q1":"a"}',
          questionIds: '["q1","q2"]',
          totalQuestions: 5,
          score: 0,
        },
      ]);
      const page = await service.findPage({ id: 'u' }, { venue: 'netsat' });
      expect(getRights).toHaveBeenCalledTimes(1);
      expect(getRights).toHaveBeenCalledWith(
        { id: 'u' },
        VENUE,
        expect.any(Date),
      );
      expect(page.viewerHasPaidPlan).toBe(true);
      expect(attemptQb.getRawMany).toHaveBeenCalledTimes(1);
      const b = page.series[0].sets[1];
      expect(b.viewerAccess).toBe('full');
      expect(b.myProgress).toEqual({
        status: 'in_progress',
        mode: 'exam',
        answered: 1,
        total: 5,
        scorePercent: null,
        attemptId: 'att-1',
      });
    });

    it('subject filter keeps the chips and total of the whole venue', async () => {
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(chain({ many: setRows }));
      const page = await service.findPage(null, { subject: 'other' });
      expect(page.series).toEqual([]);
      expect(page.total).toBe(2);
      expect(page.subjects).toHaveLength(1);
    });

    it('unknown venue key → empty page, no series query', async () => {
      const page = await service.findPage(null, { venue: 'nope' });
      expect(page).toMatchObject({
        venueKey: null,
        viewerHasPaidPlan: false,
        series: [],
        total: 0,
      });
      expect(getRights).not.toHaveBeenCalled();
      expect(page.venues).toHaveLength(2);
    });

    it('Preview not below the real questions → locked, not preview (B2/Q3)', async () => {
      const st = chain({
        many: [
          // pro set: Preview 2, only 2 questions left
          { ...setRows[1], playableCount: '2' },
          // free set: Preview 3, only 1 question left
          {
            ...setRows[0],
            examId: EXAM_A,
            setNo: '3',
            previewCount: 3,
            playableCount: '1',
          },
          // pro set: Preview 2 of 3 → still a Preview
          { ...setRows[1], setNo: '4', playableCount: '3' },
        ],
      });
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(st);
      const page = await service.findPage(null);
      expect(page.series[0].sets.map((s) => s.viewerAccess)).toEqual([
        'locked',
        'locked',
        'preview',
      ]);
      // The real questions are counted without Challenge questions
      expect(st.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('isChallenge = 0'),
        'playableCount',
      );
    });

    it('admin: drafts come with status draft (published sets: published)', async () => {
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(
        chain({ many: [setRows[0], { ...setRows[1], status: 'draft' }] }),
      );
      const page = await service.findPage({ id: 'a', role: 'admin' });
      expect(page.series[0].sets.map((s) => [s.setNo, s.status])).toEqual([
        [1, 'published'],
        [2, 'draft'],
      ]);
    });

    it('admin sees series without sets', async () => {
      seriesQbs.push(chain({ many: seriesRows }));
      setQbs.push(chain({ many: setRows }));
      const page = await service.findPage({ id: 'a', role: 'admin' });
      expect(page.series.map((s) => s.id)).toEqual(['series-1', 'series-2']);
      expect(page.series[0].sets.every((s) => s.viewerAccess === 'full')).toBe(
        true,
      );
      expect(page.viewerHasPaidPlan).toBe(true);
    });
  });

  // ── admin validation (AC6) ────────────────────────────────────────────

  describe('admin create / update validation (AC6)', () => {
    const exam = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      title: `ชุด ${id.slice(0, 1)}`,
      isMock: false,
      bankOnly: false,
      questionCount: 5,
      ...over,
    });
    const base = { venueId: VENUE, title: 'ซีรีส์' };

    it('the same exam twice → 409 before any query', async () => {
      await expect(
        service.adminCreate({
          ...base,
          sets: [
            { examId: EXAM_A, setNo: 1, access: 'free' },
            { examId: EXAM_A.toUpperCase(), setNo: 2, access: 'free' },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(examsFind).not.toHaveBeenCalled();
    });

    it('the same setNo twice → 409', async () => {
      await expect(
        service.adminCreate({
          ...base,
          sets: [
            { examId: EXAM_A, setNo: 1, access: 'free' },
            { examId: EXAM_B, setNo: 1, access: 'pro' },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('exam not found → 400', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A)]);
      await expect(
        service.adminCreate({
          ...base,
          sets: [
            { examId: EXAM_A, setNo: 1, access: 'free' },
            { examId: EXAM_B, setNo: 2, access: 'free' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a Mock exam → 400 telling to turn Mock off first (nothing changed)', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A, { isMock: 1 })]);
      const err = await service
        .adminCreate({
          ...base,
          sets: [{ examId: EXAM_A, setNo: 1, access: 'pro' }],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toContain('ให้ปิด Mock Exam');
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('a bankOnly exam → 400', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A, { bankOnly: true })]);
      await expect(
        service.adminCreate({
          ...base,
          sets: [{ examId: EXAM_A, setNo: 1, access: 'pro' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('previewCount ≥ questionCount → 400 "Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด"', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A, { questionCount: 3 })]);
      const err = await service
        .adminCreate({
          ...base,
          sets: [{ examId: EXAM_A, setNo: 1, access: 'pro', previewCount: 3 }],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toContain(
        'Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด',
      );
    });

    it('an exam already in another series → 409 naming the series', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A)]);
      const elsewhere = chain({
        one: { examId: EXAM_A, examTitle: 'ชุด A', seriesTitle: 'MAR' },
      });
      setQbs.push(elsewhere);
      const err = await service
        .adminUpdate('series-1', {
          sets: [{ examId: EXAM_A, setNo: 1, access: 'free' }],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toContain('"MAR"');
      // Its own series does not count
      expect(elsewhere.andWhere).toHaveBeenCalledWith(
        'ps.seriesId <> :seriesId',
        { seriesId: 'series-1' },
      );
    });

    it('unknown venue / subject → 400', async () => {
      venueExists.mockResolvedValue(false);
      await expect(service.adminCreate(base)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      venueExists.mockResolvedValue(true);
      subjectExists.mockResolvedValue(false);
      await expect(
        service.adminCreate({ ...base, subjectId: SUBJECT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update of a missing series → 404', async () => {
      seriesFindOne.mockResolvedValue(null);
      await expect(
        service.adminUpdate('missing', { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('create: series + sets in one transaction (previewCount 0 → null)', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A), exam(EXAM_B)]);
      setQbs.push(chain()); // not in another series
      seriesQbs.push(
        chain({
          one: {
            id: 'series-new',
            venueId: VENUE,
            venueKey: 'netsat',
            venueName: 'NETSAT',
            subjectId: null,
            subjectName: null,
            title: 'ซีรีส์',
            description: null,
            color: null,
            sortOrder: 0,
            isActive: 1,
            setCount: 2,
          },
        }),
      );
      setQbs.push(chain({ many: [] }));
      const result = await service.adminCreate({
        ...base,
        title: '  ซีรีส์  ',
        sets: [
          { examId: EXAM_A, setNo: 1, access: 'free', previewCount: 0 },
          { examId: EXAM_B, setNo: 2, access: 'pro', previewCount: 2 },
        ],
      });
      expect(manager.create).toHaveBeenCalledWith(
        PredictedSeries,
        expect.objectContaining({ title: 'ซีรีส์', isActive: true }),
      );
      expect(manager.create).toHaveBeenCalledWith(PredictedSet, {
        seriesId: 'series-new',
        examId: EXAM_A,
        setNo: 1,
        access: 'free',
        previewCount: null,
      });
      expect(manager.create).toHaveBeenCalledWith(PredictedSet, {
        seriesId: 'series-new',
        examId: EXAM_B,
        setNo: 2,
        access: 'pro',
        previewCount: 2,
      });
      expect(result).toMatchObject({ id: 'series-new', isActive: true });
    });

    it('update with sets: locks the series, deletes then inserts the sets', async () => {
      examsFind.mockResolvedValue([exam(EXAM_B)]);
      setQbs.push(chain());
      seriesQbs.push(chain({ one: { id: 'series-1', venueId: VENUE } }));
      await service.adminUpdate('series-1', {
        isActive: false,
        sets: [{ examId: EXAM_B, setNo: 1, access: 'pro', previewCount: null }],
      });
      expect(manager.findOne).toHaveBeenCalledWith(
        PredictedSeries,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        PredictedSeries,
        { id: 'series-1' },
        { isActive: false },
      );
      expect(manager.delete).toHaveBeenCalledWith(PredictedSet, {
        seriesId: 'series-1',
      });
      expect(manager.save).toHaveBeenCalledWith([
        expect.objectContaining({ examId: EXAM_B, setNo: 1 }),
      ]);
    });

    it('update: the sets are checked inside the transaction, after the series lock (N8)', async () => {
      examsFind.mockResolvedValue([exam(EXAM_B)]);
      setQbs.push(chain());
      seriesQbs.push(chain({ one: { id: 'series-1', venueId: VENUE } }));
      await service.adminUpdate('series-1', {
        sets: [{ examId: EXAM_B, setNo: 1, access: 'pro' }],
      });
      expect(manager.getRepository).toHaveBeenCalledWith(Exam);
      expect(manager.getRepository).toHaveBeenCalledWith(PredictedSet);
      const lockOrder = manager.findOne.mock.invocationCallOrder[0];
      const readOrder = examsFind.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
      expect(readOrder).toBeLessThan(
        manager.delete.mock.invocationCallOrder[0],
      );
    });

    it('update: a check failing after the lock writes nothing', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A, { isMock: true })]);
      await expect(
        service.adminUpdate('series-1', {
          title: 'ใหม่',
          sets: [{ examId: EXAM_A, setNo: 1, access: 'pro' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.findOne).toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('a lost race on UNIQUE(examId) → 409 (Thai)', async () => {
      examsFind.mockResolvedValue([exam(EXAM_A)]);
      setQbs.push(chain());
      manager.save.mockImplementation((data: unknown) =>
        Array.isArray(data)
          ? Promise.reject(Object.assign(new Error('dup'), { errno: 1062 }))
          : Promise.resolve({ id: 'series-new' }),
      );
      await expect(
        service.adminCreate({
          ...base,
          sets: [{ examId: EXAM_A, setNo: 1, access: 'free' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('admin delete / exam options', () => {
    it('delete: sets then series, returns the released exams', async () => {
      await expect(service.adminDelete('series-1')).resolves.toEqual({
        success: true,
        releasedExamIds: [EXAM_A],
      });
      expect(manager.delete).toHaveBeenNthCalledWith(1, PredictedSet, {
        seriesId: 'series-1',
      });
      expect(manager.delete).toHaveBeenNthCalledWith(2, PredictedSeries, {
        id: 'series-1',
      });
    });

    it('delete of a missing series → 404', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.adminDelete('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('exam options: not Mock, not bankOnly, not already a Predicted set; LIKE escaped', async () => {
      examQb.getRawMany.mockResolvedValue([
        {
          id: EXAM_A,
          title: 'ชุด A',
          category: 'c',
          subjectId: null,
          questionCount: '5',
          durationMinutes: null,
          status: 'draft',
        },
      ]);
      await expect(service.adminExamOptions('50%_x')).resolves.toEqual([
        {
          id: EXAM_A,
          title: 'ชุด A',
          category: 'c',
          subjectId: null,
          questionCount: 5,
          durationMinutes: null,
          status: 'draft',
        },
      ]);
      expect(examQb.where).toHaveBeenCalledWith('exam.isMock = :isMock', {
        isMock: false,
      });
      expect(examQb.andWhere).toHaveBeenCalledWith(
        'exam.bankOnly = :bankOnly',
        { bankOnly: false },
      );
      expect(examQb.andWhere).toHaveBeenCalledWith(
        'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = exam.id)',
      );
      expect(examQb.andWhere).toHaveBeenCalledWith('exam.title LIKE :search', {
        search: '%50\\%\\_x%',
      });
    });
  });
});
