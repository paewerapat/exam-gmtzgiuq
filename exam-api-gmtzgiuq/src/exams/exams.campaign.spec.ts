import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamsService, LATER_ATTEMPT_MISSING } from './exams.service';
import { Exam } from './exam.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { ExamAccessType } from './exam-mock';
import { CreateExamInput, UpdateExamInput } from './dto/exam.dto';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import {
  ExamAccess,
  ExamAccessSource,
} from '../exam-access/exam-access.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ProAccessService } from '../pro/pro-access.service';
import { User } from '../users/user.entity';

/** An instant given in Thai time (UTC+7). */
const th = (local: string) => new Date(`${local}+07:00`);
const NOW = th('2026-11-14T12:00:00');

type Qb = Record<string, jest.Mock>;

/** Chainable query builder mock whose reads return `rows`. */
function makeQb(rows: () => unknown[]): Qb {
  const qb: Qb = {};
  for (const m of [
    'leftJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'addGroupBy',
    'offset',
    'limit',
    'setParameters',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(() => Promise.resolve(rows()));
  qb.getRawOne = jest.fn(() => Promise.resolve(rows()[0]));
  qb.getCount = jest.fn(() => Promise.resolve(rows().length));
  return qb;
}

const card = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'Mock 1',
  category: 'tgat',
  categoryName: 'TGAT',
  subjectId: null,
  subjectName: null,
  bannerImage: null,
  questionCount: 20,
  durationMinutes: 60,
  level: null,
  accessType: ExamAccessType.FREE,
  price: null,
  releaseDate: new Date('2026-11-01T00:00:00.000Z'),
  venueKey: 'tgat',
  campaignStartsAt: null,
  campaignEndsAt: null,
  ...extra,
});

describe('ExamsService — Free Mock Exam / campaign window (task 21)', () => {
  let service: ExamsService;
  let examRows: Record<string, unknown>[];
  let topicRows: Record<string, unknown>[];
  let attemptRows: Record<string, unknown>[];
  let examQbs: Qb[];
  let topicQb: Qb;
  let attemptQb: Qb;
  let attemptsCreateQb: jest.Mock;
  let stored: Partial<Exam>;
  let grants: Partial<ExamAccess>[];
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };
  let transaction: jest.Mock;

  beforeEach(async () => {
    examRows = [];
    topicRows = [];
    attemptRows = [];
    examQbs = [];
    grants = [];
    topicQb = makeQb(() => topicRows);
    attemptQb = makeQb(() => attemptRows);
    attemptsCreateQb = jest.fn(() => attemptQb);
    stored = {
      id: 'exam-1',
      title: 'ชุด',
      status: QuestionStatus.PUBLISHED,
      authorId: 'admin-1',
      isMock: true,
      accessType: ExamAccessType.CODE,
      price: null,
      questions: [],
      campaignStartsAt: th('2026-11-20T09:00:00'),
      campaignEndsAt: th('2026-11-30T23:59:00'),
    };
    manager = {
      create: jest.fn((_e: unknown, data: Record<string, unknown>) => ({
        ...data,
      })),
      save: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve(
          Array.isArray(data) ? data : { ...data, id: data.id ?? 'exam-1' },
        ),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({ id: 'exam-1' }),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    transaction = jest.fn((cb: (m: unknown) => unknown) => cb(manager));

    const module = await Test.createTestingModule({
      providers: [
        ExamsService,
        ExamAccessService,
        {
          provide: ProAccessService,
          useValue: { getMockPurchaseAccess: () => Promise.resolve(new Map()) },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            findOne: jest.fn(() => Promise.resolve({ ...stored })),
            createQueryBuilder: jest.fn(() => {
              const qb = makeQb(() => examRows);
              examQbs.push(qb);
              return qb;
            }),
          },
        },
        {
          provide: getRepositoryToken(Question),
          useValue: { createQueryBuilder: jest.fn(() => topicQb) },
        },
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { createQueryBuilder: attemptsCreateQb },
        },
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: { find: jest.fn(() => Promise.resolve(grants)) },
        },
        {
          provide: DataSource,
          useValue: {
            transaction,
            query: jest.fn().mockResolvedValue([{ refs: 0 }]),
          },
        },
        { provide: UploadService, useValue: { deleteByUrl: jest.fn() } },
      ],
    }).compile();

    service = module.get(ExamsService);
  });

  const listQb = () => examQbs[0];
  const viewer = { id: 'user-a', role: 'user' };

  // ── admin create / update (AC9) ─────────────────────────────────────

  describe('admin create / update', () => {
    const admin = { id: 'admin-1' } as User;
    const input = (extra: Partial<CreateExamInput> = {}) =>
      ({
        title: 'แคมเปญ',
        category: 'tgat',
        isMock: true,
        accessType: ExamAccessType.CODE,
        questions: [],
        ...extra,
      }) as CreateExamInput;
    const createdExam = () =>
      (manager.create.mock.calls as unknown[][]).find(
        (call) => call[0] === Exam,
      )?.[1] as Record<string, unknown>;

    it('create stores the window (whole seconds); not sent = null', async () => {
      await service.create(
        input({
          campaignStartsAt: '2026-11-20T09:00:00.500+07:00',
          campaignEndsAt: '2026-11-30T16:59:00.000Z',
        }),
        admin,
      );
      expect(createdExam()).toMatchObject({
        campaignStartsAt: new Date('2026-11-20T02:00:00.000Z'),
        campaignEndsAt: new Date('2026-11-30T16:59:00.000Z'),
      });

      manager.create.mockClear();
      await service.create(input(), admin);
      expect(createdExam()).toMatchObject({
        campaignStartsAt: null,
        campaignEndsAt: null,
      });
    });

    it('create: end not after start → 400 (Thai) before writing anything', async () => {
      await expect(
        service.create(
          input({
            campaignStartsAt: '2026-11-20T09:00:00+07:00',
            campaignEndsAt: '2026-11-20T02:00:00Z',
          }),
          admin,
        ),
      ).rejects.toThrow(
        new BadRequestException('วันปิดแคมเปญต้องอยู่หลังวันเปิดแคมเปญ'),
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    const updated = () =>
      (manager.update.mock.calls as unknown[][])[0][2] as Record<
        string,
        unknown
      >;

    it('update: sent = replaced, null = cleared, not sent = unchanged', async () => {
      await service.update('exam-1', {
        campaignEndsAt: '2026-12-31T23:59:00+07:00',
      } as UpdateExamInput);
      expect(updated()).toMatchObject({
        campaignStartsAt: stored.campaignStartsAt,
        campaignEndsAt: th('2026-12-31T23:59:00'),
      });

      manager.update.mockClear();
      await service.update('exam-1', {
        campaignStartsAt: null,
      } as UpdateExamInput);
      expect(updated()).toMatchObject({
        campaignStartsAt: null,
        campaignEndsAt: stored.campaignEndsAt,
      });
    });

    it('update: checked against the stored value that is kept → 400', async () => {
      // stored start 20 Nov 09:00; new end before it
      await expect(
        service.update('exam-1', {
          campaignEndsAt: '2026-11-19T00:00:00+07:00',
        } as UpdateExamInput),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();

      // clearing the start at the same time is fine
      await expect(
        service.update('exam-1', {
          campaignStartsAt: null,
          campaignEndsAt: '2026-11-19T00:00:00+07:00',
        } as UpdateExamInput),
      ).resolves.toBeDefined();
    });
  });

  // ── GET /exams/mock (AC3, AC4, AC6) ─────────────────────────────────

  describe('GET /exams/mock', () => {
    it('sort=recommended: campaign rank (open/others → upcoming → ended) on the API clock, then newest release', async () => {
      await service.findMockExams(
        1,
        100,
        undefined,
        null,
        {
          sort: 'recommended',
        },
        NOW,
      );

      const qb = listQb();
      const rank = (qb.addSelect.mock.calls as unknown[][]).find(
        (call) => call[1] === 'campaignRank',
      );
      expect(rank).toBeDefined();
      const sql = String(rank?.[0]).replace(/\s+/g, ' ');
      expect(sql).toContain('WHEN exam.accessType <> :campaignType THEN 0');
      expect(sql).toContain(
        'WHEN exam.campaignStartsAt IS NOT NULL AND exam.campaignStartsAt > :now THEN 1',
      );
      expect(sql).toContain(
        'WHEN exam.campaignEndsAt IS NOT NULL AND exam.campaignEndsAt < :now THEN 2',
      );
      expect(qb.setParameters).toHaveBeenCalledWith({
        campaignType: 'code',
        now: NOW,
      });
      expect(qb.orderBy.mock.calls).toEqual([['campaignRank', 'ASC']]);
      expect(qb.addOrderBy.mock.calls).toEqual([
        ['exam.releaseDate', 'DESC'],
        ['exam.createdAt', 'DESC'],
        ['exam.id', 'ASC'],
      ]);
    });

    it('sort=name: title A–Z; newest / unknown: release date', async () => {
      await service.findMockExams(1, 12, undefined, null, { sort: 'name' });
      expect(listQb().orderBy.mock.calls).toEqual([['exam.title', 'ASC']]);
      expect(listQb().addOrderBy.mock.calls).toEqual([
        ['exam.releaseDate', 'DESC'],
        ['exam.id', 'ASC'],
      ]);

      for (const sort of ['newest', 'bogus', undefined]) {
        examQbs = [];
        await service.findMockExams(1, 12, undefined, null, { sort });
        expect(listQb().orderBy.mock.calls).toEqual([
          ['exam.releaseDate', 'DESC'],
        ]);
        expect(listQb().setParameters).not.toHaveBeenCalled();
      }
    });

    it('venue=<key> filters list and count by the venue key; blank = all', async () => {
      await service.findMockExams(1, 12, undefined, null, { venue: ' tgat ' });
      for (const qb of examQbs) {
        expect(qb.andWhere).toHaveBeenCalledWith('venue.key = :venueKey', {
          venueKey: 'tgat',
        });
      }
      expect(examQbs).toHaveLength(2);

      examQbs = [];
      await service.findMockExams(1, 12, undefined, null, { venue: '  ' });
      for (const qb of examQbs) {
        expect(JSON.stringify(qb.andWhere.mock.calls)).not.toContain(
          'venueKey',
        );
      }
    });

    it('selects the campaign window, subject label and colour', async () => {
      await service.findMockExams(1, 12);
      const selected = (listQb().addSelect.mock.calls as unknown[][]).map(
        (c) => c[1],
      );
      expect(selected).toEqual(
        expect.arrayContaining([
          'campaignStartsAt',
          'campaignEndsAt',
          'subjectBankLabel',
          'subjectColor',
        ]),
      );
    });

    it('campaign per card (code only) with Thai-day counts; guest: myProgress null without a query', async () => {
      examRows = [
        card({ id: 'free', accessType: ExamAccessType.FREE }),
        card({
          id: 'open',
          accessType: ExamAccessType.CODE,
          campaignEndsAt: th('2026-11-20T23:59:00'),
        }),
        card({
          id: 'soon',
          accessType: ExamAccessType.CODE,
          campaignStartsAt: th('2026-11-15T00:00:00'),
        }),
        card({
          id: 'done',
          accessType: ExamAccessType.CODE,
          campaignEndsAt: th('2026-11-14T11:59:59'),
        }),
        card({ id: 'always', accessType: ExamAccessType.CODE }),
        card({ id: 'pro', accessType: ExamAccessType.PURCHASE }),
      ];

      const result = await service.findMockExams(
        1,
        12,
        undefined,
        null,
        {},
        NOW,
      );

      const byId = Object.fromEntries(
        result.items.map((item) => [item.id, item]),
      );
      expect(byId.free.campaign).toBeNull();
      expect(byId.pro.campaign).toBeNull();
      expect(byId.open.campaign).toMatchObject({ status: 'open', daysLeft: 6 });
      expect(byId.soon.campaign).toMatchObject({
        status: 'upcoming',
        daysUntilOpen: 1,
      });
      expect(byId.done.campaign).toMatchObject({
        status: 'ended',
        daysLeft: null,
      });
      expect(byId.always.campaign).toMatchObject({
        status: 'open',
        startsAt: null,
        endsAt: null,
        daysLeft: null,
      });
      expect(byId.free.color).toBe('#10b981');
      expect(byId.open.color).toBe('#f59e0b');
      for (const item of result.items) {
        expect(item.myProgress).toBeNull();
        expect(item).not.toHaveProperty('campaignStartsAt');
      }
      expect(attemptsCreateQb).not.toHaveBeenCalled();
    });

    it('myProgress: the latest in_progress/completed attempt of the logged-in user per exam', async () => {
      examRows = [card({ id: 'm1' }), card({ id: 'm2' }), card({ id: 'm3' })];
      // newest first, as ordered by the query
      attemptRows = [
        {
          id: 'att-new',
          examId: 'm1',
          status: 'in_progress',
          mode: 'practice',
          answers: { q1: 'a', q2: 'b', q3: '' },
          questionIds: ['q1', 'q2', 'q3'],
          totalQuestions: 20,
          score: '0.00',
        },
        {
          id: 'att-old',
          examId: 'm1',
          status: 'completed',
          mode: 'practice',
          answers: {},
          questionIds: [],
          totalQuestions: 20,
          score: '90.00',
        },
        {
          id: 'att-m2',
          examId: 'm2',
          status: 'completed',
          mode: 'exam',
          answers: '{"q1":"a"}',
          questionIds: '["q1"]',
          totalQuestions: 20,
          score: '82.00',
        },
      ];

      const result = await service.findMockExams(1, 12, undefined, viewer);

      expect(attemptQb.where).toHaveBeenCalledWith('attempt.userId = :userId', {
        userId: 'user-a',
      });
      expect(attemptQb.andWhere).toHaveBeenCalledWith(
        'attempt.examId IN (:...examIds)',
        { examIds: ['m1', 'm2', 'm3'] },
      );
      expect(attemptQb.andWhere).toHaveBeenCalledWith(
        'attempt.status IN (:...statuses)',
        { statuses: ['in_progress', 'completed'] },
      );
      // R4: only the latest row per exam is read (no older JSON answers)
      expect(attemptQb.andWhere).toHaveBeenCalledWith(LATER_ATTEMPT_MISSING);
      expect(LATER_ATTEMPT_MISSING).toMatch(
        /^NOT EXISTS \(SELECT 1 FROM exam_attempts later WHERE later\.userId = attempt\.userId AND later\.examId = attempt\.examId AND later\.status IN \(:\.\.\.statuses\)/,
      );
      expect(attemptQb.orderBy).toHaveBeenCalledWith(
        'attempt.createdAt',
        'DESC',
      );
      expect(result.items.map((item) => item.myProgress)).toEqual([
        {
          status: 'in_progress',
          mode: 'practice',
          answered: 2,
          total: 20,
          scorePercent: null,
          attemptId: 'att-new',
        },
        {
          status: 'completed',
          mode: 'exam',
          answered: 1,
          total: 20,
          scorePercent: 82,
          attemptId: 'att-m2',
        },
        null,
      ]);
    });

    it('no cards → no attempt query', async () => {
      await service.findMockExams(1, 12, undefined, viewer);
      expect(attemptsCreateQb).not.toHaveBeenCalled();
    });
  });

  // ── GET /exams/mock/:id (AC7) ───────────────────────────────────────

  describe('GET /exams/mock/:id', () => {
    it('campaign + myProgress + topicBreakdown (most first, "อื่น ๆ" last, no question content)', async () => {
      examRows = [
        card({
          id: 'm1',
          accessType: ExamAccessType.CODE,
          campaignStartsAt: th('2026-11-16T09:00:00'),
          description: null,
          detailBlocks: null,
          codeInstructions: null,
        }),
      ];
      topicRows = [
        { topicId: 't-alg', name: 'พีชคณิต', count: '3' },
        { topicId: null, name: null, count: '2' },
        { topicId: 't-geo', name: 'เรขาคณิต', count: 5 },
        // topicId of a deleted topic: joined row has no topic
        { topicId: null, name: null, count: '1' },
        { topicId: 't-cal', name: 'แคลคูลัส', count: '3' },
      ];
      attemptRows = [
        {
          id: 'att-1',
          examId: 'm1',
          status: 'completed',
          mode: 'practice',
          answers: {},
          questionIds: [],
          totalQuestions: 14,
          score: '50.00',
        },
      ];

      const detail = await service.findMockOne('m1', viewer, NOW);

      expect(detail.campaign).toMatchObject({
        status: 'upcoming',
        daysUntilOpen: 2,
      });
      expect(detail.myProgress).toMatchObject({
        status: 'completed',
        scorePercent: 50,
        attemptId: 'att-1',
      });
      expect(detail.topicBreakdown).toEqual([
        { topicId: 't-geo', name: 'เรขาคณิต', count: 5 },
        { topicId: 't-cal', name: 'แคลคูลัส', count: 3 },
        { topicId: 't-alg', name: 'พีชคณิต', count: 3 },
        { topicId: null, name: 'อื่น ๆ', count: 3 },
      ]);
      // counts only, Challenge questions left out, this exam only
      expect(topicQb.where).toHaveBeenCalledWith('q.examId = :examId', {
        examId: 'm1',
      });
      expect(topicQb.andWhere).toHaveBeenCalledWith(
        'q.isChallenge = :isChallenge',
        { isChallenge: false },
      );
      const topicSelects = [
        ...(topicQb.select.mock.calls as unknown[][]),
        ...(topicQb.addSelect.mock.calls as unknown[][]),
      ].map((c) => String(c[0]));
      for (const column of topicSelects) {
        expect(column).not.toMatch(/question|choices|answer|explanation/i);
      }
    });

    it('guest: no myProgress; empty exam → empty topicBreakdown', async () => {
      examRows = [card({ id: 'm1' })];
      const detail = await service.findMockOne('m1', null, NOW);
      expect(detail.myProgress).toBeNull();
      expect(detail.campaign).toBeNull();
      expect(detail.topicBreakdown).toEqual([]);
      expect(attemptsCreateQb).not.toHaveBeenCalled();
    });
  });

  // ── GET /exams/:id of a campaign (Review รอบ 1 R1) ──────────────────

  describe('GET /exams/:id (findPublishedOne) — campaign window', () => {
    const admin = { id: 'admin-1', role: 'admin' };
    // an all-Mock code redeemed earlier: access to every locked Mock Exam
    const allMockGrant = (): Partial<ExamAccess> => ({
      id: 'grant-1',
      examId: null,
      allMock: true,
      expiresAt: null,
      source: ExamAccessSource.CODE,
    });
    const question = {
      id: 'q1',
      question: 'โจทย์',
      choices: [{ id: 'a', text: '1', isCorrect: true }],
      explanation: 'เฉลย',
    } as Question;

    beforeEach(() => {
      stored.questions = [question];
    });

    const closedError = async (promise: Promise<unknown>) => {
      const err = (await promise.then(
        () => {
          throw new Error('expected 403');
        },
        (e: unknown) => e,
      )) as ForbiddenException;
      expect(err).toBeInstanceOf(ForbiddenException);
      return err.getResponse();
    };

    it('upcoming: a non-admin with access, or without (guest / no code) → 403 CAMPAIGN_NOT_OPEN, no questions', async () => {
      // window 20–30 Nov, now 14 Nov
      grants = [allMockGrant()];
      const notOpen = {
        statusCode: 403,
        message: 'แคมเปญนี้ยังไม่เปิด เริ่มทำข้อสอบได้เมื่อถึงวันเปิดแคมเปญ',
        errorCode: 'CAMPAIGN_NOT_OPEN',
      };
      await expect(
        closedError(service.findPublishedOne('exam-1', viewer, NOW)),
      ).resolves.toEqual(notOpen);

      grants = [];
      await expect(
        closedError(service.findPublishedOne('exam-1', viewer, NOW)),
      ).resolves.toEqual(notOpen);
      await expect(
        closedError(service.findPublishedOne('exam-1', null, NOW)),
      ).resolves.toEqual(notOpen);
    });

    it('upcoming: admin → 200 with questions and answers', async () => {
      const exam = await service.findPublishedOne('exam-1', admin, NOW);
      expect(exam.questions).toEqual([question]);
    });

    it('open (inside the window, exactly at the start, no window) → 200 for a user with access', async () => {
      grants = [allMockGrant()];
      for (const now of [
        th('2026-11-25T12:00:00'),
        th('2026-11-20T09:00:00'),
      ]) {
        const exam = await service.findPublishedOne('exam-1', viewer, now);
        expect(exam.questions).toEqual([question]);
      }
      stored.campaignStartsAt = null;
      stored.campaignEndsAt = null;
      await expect(
        service.findPublishedOne('exam-1', viewer, NOW),
      ).resolves.toMatchObject({ id: 'exam-1' });
    });

    it('ended → still 200 (resume an attempt, result and answers)', async () => {
      grants = [allMockGrant()];
      const exam = await service.findPublishedOne(
        'exam-1',
        viewer,
        th('2026-12-01T00:00:00'),
      );
      expect(exam.questions).toEqual([question]);
    });

    it('ended without access → EXAM_LOCKED as before (the window does not unlock)', async () => {
      await expect(
        closedError(
          service.findPublishedOne('exam-1', viewer, th('2026-12-01T00:00:00')),
        ),
      ).resolves.toMatchObject({ errorCode: 'EXAM_LOCKED' });
    });

    it('not a campaign: a window on a free / purchase Mock or a normal exam has no effect', async () => {
      stored.accessType = ExamAccessType.FREE;
      await expect(
        service.findPublishedOne('exam-1', null, NOW),
      ).resolves.toMatchObject({ id: 'exam-1' });

      stored.accessType = ExamAccessType.PURCHASE;
      stored.price = 99;
      grants = [allMockGrant()];
      await expect(
        service.findPublishedOne('exam-1', viewer, NOW),
      ).resolves.toMatchObject({ id: 'exam-1' });

      stored.isMock = false;
      stored.accessType = ExamAccessType.CODE;
      grants = [];
      await expect(
        service.findPublishedOne('exam-1', null, NOW),
      ).resolves.toMatchObject({ id: 'exam-1' });
    });
  });
});
