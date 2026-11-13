import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccessType } from '../exams/exam-mock';
import { QuestionStatus } from '../questions/question.entity';
import {
  ExamAccess,
  ExamAccessSource,
} from '../exam-access/exam-access.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ProAccessService } from '../pro/pro-access.service';
import { ProException } from '../pro/pro-errors';
import { ProPlan } from '../pro/pro-plan.entity';
import { ProSubscriptionsService } from '../pro/pro-subscriptions.service';
import { RedeemThrottleService } from './redeem-throttle.service';
import { UnlockCodeBatch } from './unlock-code-batch.entity';
import { UnlockCodeBatchExam } from './unlock-code-batch-exam.entity';
import { UnlockCode } from './unlock-code.entity';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import {
  REDEEM_FAILURE_WINDOW_MS,
  UnlockCodesService,
} from './unlock-codes.service';
import * as format from './unlock-code-format';
import { RedeemException } from './unlock-code-format';
import { CreateUnlockBatchDto } from './dto/unlock-code.dto';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T05:00:00.000Z');

type Row = Record<string, unknown>;

/** Yield to the event loop so concurrent requests interleave. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** `where` of find*() incl. In / MoreThan / LessThan, on one row. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond instanceof FindOperator) {
      const op = cond.type;
      const arg = cond.value as unknown;
      if (op === 'in') return (arg as unknown[]).includes(value);
      if (op === 'moreThan') return (value as Date) > (arg as Date);
      if (op === 'lessThan') return (value as Date) < (arg as Date);
      throw new Error(`operator ${op} not faked`);
    }
    return value === cond;
  });
}

const duplicateKey = () =>
  Object.assign(
    new Error("Duplicate entry for key 'UQ_unlock_codes_batch_user'"),
    {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    },
  );

/** Chainable query builder that records calls; rows come from `resolve`. */
function fakeQb(
  resolve: (calls: [string, unknown[]][]) => Row[],
  initial: [string, unknown[]][] = [],
) {
  const calls: [string, unknown[]][] = [...initial];
  const qb: Record<string, unknown> = {};
  for (const m of [
    'leftJoin',
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'skip',
    'take',
    'offset',
    'limit',
  ]) {
    qb[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return qb;
    };
  }
  qb.calls = calls;
  qb.clone = () => fakeQb(resolve, calls);
  qb.getRawMany = () => Promise.resolve(resolve(calls));
  qb.getRawOne = () => Promise.resolve(resolve(calls)[0]);
  qb.getCount = () => Promise.resolve(resolve(calls).length);
  qb.getManyAndCount = () => {
    const rows = resolve(calls);
    return Promise.resolve([rows, rows.length]);
  };
  return qb;
}

/** In-memory tables + the repositories/transaction the service uses. */
class FakeDb {
  batches: Row[] = [];
  batchExams: Row[] = [];
  codes: Row[] = [];
  failures: Row[] = [];
  access: Row[] = [];
  users: Row[] = [];
  exams: Row[] = [];
  plans: Row[] = [];
  queries: string[] = [];
  insertChunks: number[] = [];
  /** Run inside the next transaction before the callback (race tests). */
  beforeTransaction: (() => void) | null = null;
  /** Updates of attempt rows fail (DB hiccup after the attempt was saved). */
  failFailureUpdate = false;
  /** The next N conditional UPDATEs fail with InnoDB deadlock 1213. */
  deadlocks = 0;

  private table(entity: unknown): Row[] {
    if (entity === UnlockCodeBatch) return this.batches;
    if (entity === UnlockCodeBatchExam) return this.batchExams;
    if (entity === UnlockCode) return this.codes;
    if (entity === ExamAccess) return this.access;
    throw new Error('table not faked');
  }

  /** unique (code) and (batchId, usedByUserId) of unlock_codes */
  private checkCodeUnique(candidate: Row) {
    for (const other of this.codes) {
      if (other === candidate || other.id === candidate.id) continue;
      if (other.code === candidate.code) throw duplicateKey();
      if (
        candidate.usedByUserId &&
        other.batchId === candidate.batchId &&
        other.usedByUserId === candidate.usedByUserId
      ) {
        throw duplicateKey();
      }
    }
  }

  insertRows(entity: unknown, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    const table = this.table(entity);
    for (const row of list) {
      const copy = { createdAt: new Date(NOW), ...row };
      if (entity === UnlockCode) this.checkCodeUnique(copy);
      table.push(copy);
    }
  }

  manager = {
    query: async (sql: string, params: unknown[]) => {
      this.queries.push(sql);
      await tick();
      if (this.deadlocks > 0) {
        this.deadlocks--;
        throw Object.assign(new Error('Deadlock found'), {
          code: 'ER_LOCK_DEADLOCK',
          errno: 1213,
        });
      }
      if (!sql.trim().startsWith('UPDATE unlock_codes')) {
        throw new Error(`query not faked: ${sql}`);
      }
      // The conditional UPDATE of redeem, evaluated atomically
      const [userId, usedAt, codeId, now] = params as [
        string,
        Date,
        string,
        Date,
      ];
      const code = this.codes.find((c) => c.id === codeId);
      const batch = code && this.batches.find((b) => b.id === code.batchId);
      const ok =
        code &&
        batch &&
        code.usedByUserId == null &&
        code.usedAt == null &&
        code.isActive === true &&
        batch.isActive === true &&
        (batch.codeExpiresAt == null || (batch.codeExpiresAt as Date) >= now);
      if (!ok) return { affectedRows: 0 };
      this.checkCodeUnique({ ...code, usedByUserId: userId });
      Object.assign(code, { usedByUserId: userId, usedAt });
      return { affectedRows: 1 };
    },
    findOne: async (entity: unknown, { where }: { where: Row }) => {
      await tick();
      const row = this.table(entity).find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    insert: async (entity: unknown, rows: Row | Row[]) => {
      await tick();
      this.insertRows(entity, rows);
    },
    createQueryBuilder: () => {
      let entity: unknown;
      let values: Row[] = [];
      const qb = {
        insert: () => qb,
        into: (e: unknown) => ((entity = e), qb),
        values: (v: Row[]) => ((values = v), qb),
        updateEntity: () => qb,
        execute: () => {
          this.insertChunks.push(values.length);
          this.insertRows(entity, values);
          return Promise.resolve({});
        },
      };
      return qb;
    },
  };

  dataSource = {
    transaction: async (cb: (m: unknown) => Promise<unknown>) => {
      if (this.beforeTransaction) {
        this.beforeTransaction();
        this.beforeTransaction = null;
      }
      // all-or-nothing like a DB transaction
      const snapshot = {
        batches: this.batches.map((r) => ({ ...r })),
        batchExams: [...this.batchExams],
        codes: this.codes.map((r) => ({ ...r })),
        access: [...this.access],
      };
      try {
        return await cb(this.manager);
      } catch (err) {
        // undo only rows this transaction wrote (others may have committed)
        this.batches = this.batches.filter((r) =>
          snapshot.batches.some((s) => s.id === r.id),
        );
        this.batchExams = this.batchExams.filter((r) =>
          snapshot.batchExams.includes(r),
        );
        this.codes = this.codes.filter((r) =>
          snapshot.codes.some((s) => s.id === r.id),
        );
        throw err;
      }
    },
  };

  find(table: Row[]) {
    return async (opts: { where: Row | Row[] } = { where: {} }) => {
      await tick();
      const where = Array.isArray(opts.where) ? opts.where : [opts.where];
      return table
        .filter((r) => where.some((w) => matches(r, w)))
        .map((r) => ({ ...r }));
    };
  }

  repos() {
    return {
      batches: {
        findOne: async ({ where }: { where: Row }) => {
          await tick();
          const row = this.batches.find((r) => matches(r, where));
          return row ? { ...row } : null;
        },
        update: (id: string, changes: Row) => {
          Object.assign(this.batches.find((b) => b.id === id)!, changes);
          return Promise.resolve({ affected: 1 });
        },
        createQueryBuilder: () =>
          fakeQb(() =>
            [...this.batches].sort(
              (a, b) =>
                (b.createdAt as Date).getTime() -
                (a.createdAt as Date).getTime(),
            ),
          ),
      },
      batchExams: {
        find: (opts: { where: Row }) => this.find(this.batchExams)(opts),
        createQueryBuilder: () =>
          fakeQb((calls) => {
            const ids = (
              calls.find((c) => c[0] === 'where')![1][1] as {
                ids: string[];
              }
            ).ids;
            return this.batchExams
              .filter((l) => ids.includes(l.batchId as string))
              .flatMap((l) => {
                const exam = this.exams.find((e) => e.id === l.examId);
                return exam
                  ? [{ batchId: l.batchId, id: exam.id, title: exam.title }]
                  : [];
              });
          }),
      },
      codes: {
        findOne: async ({ where }: { where: Row }) => {
          await tick();
          const row = this.codes.find((r) => matches(r, where));
          return row ? { ...row } : null;
        },
        exists: async ({ where }: { where: Row }) => {
          await tick();
          return this.codes.some((r) => matches(r, where));
        },
        find: (opts: { where: Row }) => this.find(this.codes)(opts),
        update: (id: string, changes: Row) => {
          const row = this.codes.find((c) => c.id === id);
          if (row) Object.assign(row, changes);
          return Promise.resolve({ affected: row ? 1 : 0 });
        },
        createQueryBuilder: () => fakeQb((calls) => this.codeRows(calls)),
      },
      failures: {
        // async like the DB, so concurrent requests interleave
        count: async ({ where }: { where: Row }) => {
          await tick();
          return this.failures.filter((r) => matches(r, where)).length;
        },
        insert: async (row: Row) => {
          await tick();
          this.failures.push({ ...row });
        },
        update: (id: string, changes: Row) => {
          if (this.failFailureUpdate) {
            return Promise.reject(new Error('db down'));
          }
          const row = this.failures.find((r) => r.id === id);
          if (row) Object.assign(row, changes);
          return Promise.resolve({ affected: row ? 1 : 0 });
        },
        delete: jest.fn((where: Row) => {
          this.failures = this.failures.filter((r) => !matches(r, where));
          return Promise.resolve();
        }),
      },
      exams: {
        findOne: async ({ where }: { where: Row }) => {
          await tick();
          const row = this.exams.find((r) => matches(r, where));
          return row ? { ...row } : null;
        },
        find: (opts: { where: Row }) => this.find(this.exams)(opts),
      },
      access: {
        find: (opts: { where: Row[] }) => this.find(this.access)(opts),
      },
      plans: {
        findOne: async ({ where }: { where: Row }) => {
          await tick();
          const row = this.plans.find((r) => matches(r, where));
          return row ? { ...row } : null;
        },
        find: (opts: { where: Row }) => this.find(this.plans)(opts),
      },
    };
  }

  /** Raw rows of the code queries (select code.batchId → used counts). */
  private codeRows(calls: [string, unknown[]][]): Row[] {
    const first = calls.find((c) => c[0] === 'select')?.[1][0];
    const conds = calls.filter((c) => c[0] === 'where' || c[0] === 'andWhere');
    const sql = conds.map((c) => c[1][0] as string);
    const params = Object.assign(
      {},
      ...conds.map((c) => (c[1][1] as Row) ?? {}),
    ) as Row;

    let rows = this.codes;
    if (params.batchId) rows = rows.filter((c) => c.batchId === params.batchId);
    if (params.id) rows = rows.filter((c) => c.id === params.id);
    if (params.ids) {
      rows = rows.filter((c) =>
        (params.ids as string[]).includes(c.batchId as string),
      );
    }
    if (sql.includes('code.usedAt IS NOT NULL')) {
      rows = rows.filter((c) => c.usedAt != null);
    }
    if (sql.includes('code.usedAt IS NULL')) {
      rows = rows.filter((c) => c.usedAt == null);
    }
    if ('on' in params) rows = rows.filter((c) => c.isActive === true);
    if ('off' in params) rows = rows.filter((c) => c.isActive === false);

    if (first === 'code.batchId') {
      const counts = new Map<string, number>();
      for (const c of rows) {
        counts.set(
          c.batchId as string,
          (counts.get(c.batchId as string) ?? 0) + 1,
        );
      }
      return [...counts].map(([batchId, used]) => ({
        batchId,
        used: String(used),
      }));
    }
    return [...rows]
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((c) => {
        const user = this.users.find((u) => u.id === c.usedByUserId);
        return {
          id: c.id,
          code: c.code,
          isActive: c.isActive ? 1 : 0,
          usedAt: c.usedAt ?? null,
          userId: user?.id ?? null,
          email: user?.email ?? null,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
        };
      });
  }
}

describe('UnlockCodesService (task 15)', () => {
  let db: FakeDb;
  let repos: ReturnType<FakeDb['repos']>;
  let service: UnlockCodesService;

  const studentA = { id: 'user-a', role: 'user' };
  const studentB = { id: 'user-b', role: 'user' };
  const admin = { id: 'admin-1', role: 'admin' };

  // exams: two code mocks, a purchase mock, a free mock, a normal exam
  const E1 = '11111111-1111-4111-8111-111111111111';
  const E2 = '22222222-2222-4222-8222-222222222222';
  const E3 = '33333333-3333-4333-8333-333333333333';
  const FREE = '44444444-4444-4444-8444-444444444444';
  const NORMAL = '55555555-5555-4555-8555-555555555555';

  function addBatch(fields: Row = {}, examIds: string[] = [E1, E2]) {
    const id = `batch-${db.batches.length + 1}`;
    db.batches.push({
      id,
      name: 'แคมเปญ',
      allMock: false,
      accessDays: 30,
      codeExpiresAt: null,
      isActive: true,
      codeCount: 0,
      createdAt: new Date(NOW.getTime() + db.batches.length),
      ...fields,
    });
    for (const examId of examIds) db.batchExams.push({ batchId: id, examId });
    return id;
  }

  function addCode(batchId: string, code: string, fields: Row = {}) {
    const row = {
      id: `code-${code}`,
      batchId,
      code,
      isActive: true,
      usedByUserId: null,
      usedAt: null,
      ...fields,
    };
    db.codes.push(row);
    const batch = db.batches.find((b) => b.id === batchId)!;
    batch.codeCount = (batch.codeCount as number) + 1;
    return row;
  }

  async function redeemError(promise: Promise<unknown>) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RedeemException);
    return err as RedeemException;
  }

  async function expectRedeemError(
    promise: Promise<unknown>,
    errorCode: string,
    status: number,
  ) {
    const err = await redeemError(promise);
    expect(err.getStatus()).toBe(status);
    const body = err.getResponse() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
    ]);
    expect(body).toMatchObject({ statusCode: status, errorCode });
    expect(typeof body.message).toBe('string');
  }

  // Pro plans (task 19) given by the mocked ProSubscriptionsService
  const PRO_PLAN = 'a17e0001-0000-4000-8000-000000000012';
  const HIDDEN_PLAN = 'a17e0001-0000-4000-8000-000000000013';
  const CLOSED_VENUE_PLAN = 'a17e0001-0000-4000-8000-000000000032';
  let proSubs: { grantFromCode: jest.Mock };
  let proMockAccess: Map<string, Date | null>;

  beforeEach(async () => {
    db = new FakeDb();
    proMockAccess = new Map();
    // grantFromCode: the code is consumed in the transaction (real
    // conditional UPDATE of the fake DB), then the plan is "given"
    proSubs = {
      grantFromCode: jest.fn(
        async (
          input: { userId: string; planId: string; days: number },
          consume: (m: unknown) => Promise<void>,
          now: Date,
        ) => {
          await db.dataSource.transaction((m) => consume(m));
          return {
            subscriptionId: 'sub-1',
            extended: false,
            autoRenewDatesDiffer: false,
            currentPeriodEnd: new Date(
              Math.floor(now.getTime() / 1000) * 1000 + input.days * DAY,
            ),
            venue: { id: 'netsat', key: 'netsat', name: 'NETSAT' },
            plan: { id: input.planId, code: 'pro', name: 'PRO' },
          };
        },
      ),
    };
    db.plans = [
      {
        id: PRO_PLAN,
        venueId: 'netsat',
        code: 'pro',
        name: 'PRO',
        rank: 1,
        isVisible: 1,
        venue: { id: 'netsat', key: 'netsat', name: 'NETSAT', isActive: 1 },
      },
      {
        id: 'a17e0001-0000-4000-8000-000000000011',
        venueId: 'netsat',
        code: 'free',
        name: 'Free',
        rank: 0,
      },
      {
        id: HIDDEN_PLAN,
        venueId: 'netsat',
        code: 'max',
        name: 'MAX',
        rank: 2,
        isVisible: 0,
        venue: { id: 'netsat', key: 'netsat', name: 'NETSAT', isActive: 1 },
      },
      {
        id: CLOSED_VENUE_PLAN,
        venueId: 'tgat',
        code: 'pro',
        name: 'PRO',
        rank: 1,
        isVisible: true,
        venue: { id: 'tgat', key: 'tgat', name: 'TGAT', isActive: 0 },
      },
    ];
    db.exams = [
      {
        id: E1,
        title: 'ชุด 1',
        isMock: true,
        accessType: ExamAccessType.CODE,
        status: QuestionStatus.PUBLISHED,
      },
      {
        id: E2,
        title: 'ชุด 2',
        isMock: true,
        accessType: ExamAccessType.CODE,
        status: QuestionStatus.PUBLISHED,
      },
      {
        id: E3,
        title: 'ชุดซื้อ',
        isMock: true,
        accessType: ExamAccessType.PURCHASE,
        status: QuestionStatus.PUBLISHED,
      },
      {
        id: FREE,
        title: 'ฟรี',
        isMock: true,
        accessType: ExamAccessType.FREE,
        status: QuestionStatus.PUBLISHED,
      },
      {
        id: NORMAL,
        title: 'ปกติ',
        isMock: false,
        accessType: ExamAccessType.FREE,
        status: QuestionStatus.PUBLISHED,
      },
    ];
    db.users = [
      {
        id: 'user-a',
        email: 'a@lumo.test',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
      },
      { id: 'user-b', email: 'b@lumo.test', firstName: '=cmd', lastName: null },
    ];
    repos = db.repos();

    const module = await Test.createTestingModule({
      providers: [
        UnlockCodesService,
        ExamAccessService,
        // No Pro plans (task 17): purchase exams only by grants here
        {
          provide: ProAccessService,
          useValue: {
            getMockPurchaseAccess: () => Promise.resolve(proMockAccess),
          },
        },
        {
          provide: getRepositoryToken(UnlockCodeBatch),
          useValue: repos.batches,
        },
        {
          provide: getRepositoryToken(UnlockCodeBatchExam),
          useValue: repos.batchExams,
        },
        { provide: getRepositoryToken(UnlockCode), useValue: repos.codes },
        {
          provide: getRepositoryToken(UnlockCodeRedeemFailure),
          useValue: repos.failures,
        },
        { provide: getRepositoryToken(Exam), useValue: repos.exams },
        { provide: getRepositoryToken(ExamAccess), useValue: repos.access },
        { provide: getRepositoryToken(ProPlan), useValue: repos.plans },
        { provide: DataSource, useValue: db.dataSource },
        RedeemThrottleService,
        { provide: ProSubscriptionsService, useValue: proSubs },
      ],
    }).compile();

    service = module.get(UnlockCodesService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ── redeem ──────────────────────────────────────────────────────────

  describe('redeem — success', () => {
    it('lower case / dashes / spaces: marks the code used and unlocks every exam of the campaign', async () => {
      const batch = addBatch({ accessDays: 30 });
      addCode(batch, 'ABCDEFGHJK');

      const result = await service.redeem(
        studentA,
        { code: ' abcde-fghjk ', examId: E1 },
        NOW,
      );

      const expiresAt = new Date(NOW.getTime() + 30 * DAY);
      expect(result).toEqual({
        kind: 'exam',
        unlockedExamIds: [E1, E2],
        expiresAt: expiresAt.toISOString(),
      });
      expect(db.codes[0]).toMatchObject({
        usedByUserId: 'user-a',
        usedAt: NOW,
      });
      expect(db.access).toEqual([
        expect.objectContaining({
          userId: 'user-a',
          examId: E1,
          allMock: false,
          source: ExamAccessSource.CODE,
          sourceId: 'code-ABCDEFGHJK',
          expiresAt,
        }),
        expect.objectContaining({
          userId: 'user-a',
          examId: E2,
          allMock: false,
          expiresAt,
        }),
      ]);
      expect(db.failures).toHaveLength(0);
    });

    it('usedAt / expiresAt in whole seconds (datetime columns have no fraction)', async () => {
      addCode(addBatch({ accessDays: 1 }), 'ABCDEFGHJK');
      const result = await service.redeem(
        studentA,
        { code: 'ABCDEFGHJK', examId: E1 },
        new Date(NOW.getTime() + 999),
      );
      expect(result.expiresAt).toBe(
        new Date(NOW.getTime() + DAY).toISOString(),
      );
      expect(db.codes[0].usedAt).toEqual(NOW);
    });

    it('typed on the second exam of the campaign works the same', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      await expect(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E2 }, NOW),
      ).resolves.toMatchObject({ unlockedExamIds: [E1, E2] });
    });

    it('all-Mock campaign: any locked Mock Exam; one all-Mock grant; returns every locked published mock', async () => {
      addCode(addBatch({ allMock: true }, []), 'ALLMOCK234');

      const result = await service.redeem(
        studentA,
        { code: 'allmock234', examId: E3 },
        NOW,
      );

      expect(result.unlockedExamIds.sort()).toEqual([E1, E2, E3].sort());
      expect(db.access).toEqual([
        expect.objectContaining({
          userId: 'user-a',
          examId: null,
          allMock: true,
        }),
      ]);
    });

    it('unlockedExamIds leaves out a linked exam that was deleted', async () => {
      addCode(addBatch({}, [E1, 'deleted-exam']), 'ABCDEFGHJK');
      await expect(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
      ).resolves.toMatchObject({ unlockedExamIds: [E1] });
    });
  });

  describe('redeem — each error has its own code', () => {
    it('INVALID_FORMAT 400 (nothing looked up)', async () => {
      const findOne = jest.spyOn(repos.codes, 'findOne');
      await expectRedeemError(
        service.redeem(studentA, { code: 'ab#', examId: E1 }, NOW),
        'INVALID_FORMAT',
        400,
      );
      await expectRedeemError(
        service.redeem(studentA, { code: '   ', examId: E1 }, NOW),
        'INVALID_FORMAT',
        400,
      );
      expect(findOne).not.toHaveBeenCalled();
    });

    it('NOT_FOUND 404', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      await expectRedeemError(
        service.redeem(studentA, { code: 'ZZZZZZZZZZ', examId: E1 }, NOW),
        'NOT_FOUND',
        404,
      );
    });

    it('DISABLED 403: the code is off, or its campaign is off', async () => {
      const batch = addBatch();
      addCode(batch, 'CODEOFF234', { isActive: false });
      await expectRedeemError(
        service.redeem(studentA, { code: 'CODEOFF234', examId: E1 }, NOW),
        'DISABLED',
        403,
      );

      addCode(addBatch({ isActive: false }), 'BATCHOFF23');
      await expectRedeemError(
        service.redeem(studentA, { code: 'BATCHOFF23', examId: E1 }, NOW),
        'DISABLED',
        403,
      );
    });

    it('EXPIRED 410 after codeExpiresAt; the last moment still works', async () => {
      addCode(
        addBatch({ codeExpiresAt: new Date(NOW.getTime() - 1) }),
        'EXPIRED234',
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'EXPIRED234', examId: E1 }, NOW),
        'EXPIRED',
        410,
      );

      addCode(addBatch({ codeExpiresAt: new Date(NOW) }), 'LASTMOMENT');
      await expect(
        service.redeem(studentA, { code: 'LASTMOMENT', examId: E1 }, NOW),
      ).resolves.toBeDefined();
    });

    it('USED 409 when another account used it', async () => {
      addCode(addBatch(), 'ABCDEFGHJK', {
        usedByUserId: 'user-b',
        usedAt: new Date(NOW.getTime() - DAY),
      });
      await expectRedeemError(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
        'USED',
        409,
      );
    });

    it('ALREADY_REDEEMED 409 for the same account, also after its access expired (no self-renewal)', async () => {
      const batch = addBatch({ accessDays: 1 });
      addCode(batch, 'ABCDEFGHJK');
      await service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW);

      const later = new Date(NOW.getTime() + 5 * DAY);
      await expectRedeemError(
        service.redeem(studentA, { code: 'abcdefghjk', examId: E1 }, later),
        'ALREADY_REDEEMED',
        409,
      );
      // even with the code turned off since: still "you used it"
      db.codes[0].isActive = false;
      await expectRedeemError(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, later),
        'ALREADY_REDEEMED',
        409,
      );
      expect(db.access).toHaveLength(2);
    });

    it('BATCH_ALREADY_USED 409: a second code of the same campaign', async () => {
      const batch = addBatch();
      addCode(batch, 'FIRSTCODE2');
      addCode(batch, 'SECONDCODE');
      await service.redeem(studentA, { code: 'FIRSTCODE2', examId: E1 }, NOW);

      await expectRedeemError(
        service.redeem(studentA, { code: 'SECONDCODE', examId: E2 }, NOW),
        'BATCH_ALREADY_USED',
        409,
      );
      expect(db.codes[1].usedByUserId).toBeNull();
    });

    it('a code of another campaign still works for the same account', async () => {
      addCode(addBatch(), 'FIRSTCODE2');
      addCode(addBatch(), 'OTHERCAMP2');
      await service.redeem(studentA, { code: 'FIRSTCODE2', examId: E1 }, NOW);
      await expect(
        service.redeem(studentA, { code: 'OTHERCAMP2', examId: E1 }, NOW),
      ).resolves.toBeDefined();
    });

    it('NOT_FOR_THIS_EXAM 422: exam not in the campaign / unknown exam / all-Mock on a free exam', async () => {
      addCode(addBatch({}, [E1]), 'ONLYEXAM12');
      await expectRedeemError(
        service.redeem(studentA, { code: 'ONLYEXAM12', examId: E2 }, NOW),
        'NOT_FOR_THIS_EXAM',
        422,
      );
      await expectRedeemError(
        service.redeem(
          studentA,
          {
            code: 'ONLYEXAM12',
            examId: '99999999-9999-4999-8999-999999999999',
          },
          NOW,
        ),
        'NOT_FOR_THIS_EXAM',
        422,
      );

      addCode(addBatch({ allMock: true }, []), 'ALLMOCK234');
      for (const examId of [FREE, NORMAL]) {
        await expectRedeemError(
          service.redeem(studentA, { code: 'ALLMOCK234', examId }, NOW),
          'NOT_FOR_THIS_EXAM',
          422,
        );
      }
      // nothing was consumed
      expect(db.codes.every((c) => c.usedByUserId === null)).toBe(true);
      expect(db.access).toHaveLength(0);
    });
  });

  describe('redeem — brute-force limit (10 failures / 15 min / account)', () => {
    it('the 11th try after 10 failures → 429 without looking the code up', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      for (let i = 0; i < 10; i++) {
        await expectRedeemError(
          service.redeem(studentA, { code: `WRONG${i}ZZZZ`, examId: E1 }, NOW),
          'NOT_FOUND',
          404,
        );
      }
      expect(db.failures).toHaveLength(10);

      const findOne = jest.spyOn(repos.codes, 'findOne');
      // even the right code is refused now
      await expectRedeemError(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
        'TOO_MANY_ATTEMPTS',
        429,
      );
      expect(findOne).not.toHaveBeenCalled();
      // 429 itself is not counted
      expect(db.failures).toHaveLength(10);

      // another account is not affected
      await expect(
        service.redeem(studentB, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
      ).resolves.toBeDefined();

      // 15 minutes later account A can try again
      const later = new Date(NOW.getTime() + REDEEM_FAILURE_WINDOW_MS + 1);
      await expectRedeemError(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, later),
        'USED',
        409,
      );
    });

    it('every error kind counts; failures are stored with their errorCode', async () => {
      addCode(addBatch({ isActive: false }), 'OFFOFFOFF2');
      await redeemError(
        service.redeem(studentA, { code: 'x', examId: E1 }, NOW),
      );
      await redeemError(
        service.redeem(studentA, { code: 'OFFOFFOFF2', examId: E1 }, NOW),
      );
      expect(db.failures.map((f) => f.errorCode)).toEqual([
        'INVALID_FORMAT',
        'DISABLED',
      ]);
      expect(db.failures[0]).toMatchObject({ userId: 'user-a', failedAt: NOW });
    });

    it('a failure that cannot be written as its errorCode does not hide the redeem error', async () => {
      db.failFailureUpdate = true;
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      await expectRedeemError(
        service.redeem(studentA, { code: 'ZZZZZZZZZZ', examId: E1 }, NOW),
        'NOT_FOUND',
        404,
      );
      expect(logged).toHaveBeenCalled();
    });

    it('a successful redeem leaves no attempt row', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      await service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW);
      expect(db.failures).toHaveLength(0);
    });

    it('concurrent guesses from one account: at most 10 get past the limit (atomic)', async () => {
      // 25 wrong codes at the same time (the old check-then-act let all in)
      const results = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          service.redeem(
            studentA,
            { code: `GUESS${String(i).padStart(2, '0')}ZZZ`, examId: E1 },
            NOW,
          ),
        ),
      );
      const codes = results.map((r) =>
        r.status === 'rejected'
          ? (r.reason as RedeemException).errorCode
          : 'OK',
      );
      const checked = codes.filter((c) => c !== 'TOO_MANY_ATTEMPTS');
      expect(checked.length).toBeLessThanOrEqual(10);
      expect(checked.every((c) => c === 'NOT_FOUND')).toBe(true);
      // only real failures stay; no PENDING row is left behind
      expect(db.failures.length).toBeLessThanOrEqual(10);
      expect(db.failures.every((f) => f.errorCode === 'NOT_FOUND')).toBe(true);

      // and the account stays limited afterwards while it has 10 failures
      for (let i = db.failures.length; i < 10; i++) {
        await redeemError(
          service.redeem(studentA, { code: `MORE${i}ZZZZZ`, examId: E1 }, NOW),
        );
      }
      await expectRedeemError(
        service.redeem(studentA, { code: 'ZZZZZZZZZZ', examId: E1 }, NOW),
        'TOO_MANY_ATTEMPTS',
        429,
      );
    });

    it('rows older than a day are pruned for every account, at most once an hour', async () => {
      const old = (id: string, userId: string, ageMs: number) => ({
        id,
        userId,
        errorCode: 'NOT_FOUND',
        failedAt: new Date(NOW.getTime() - ageMs),
      });
      db.failures.push(
        old('old-a', 'user-a', 2 * DAY),
        old('old-z', 'user-z', 2 * DAY),
        old('recent-z', 'user-z', 60 * 1000),
      );

      await redeemError(
        service.redeem(studentB, { code: 'ZZZZZZZZZZ', examId: E1 }, NOW),
      );
      // B's own failure + the recent row of another account remain
      expect(db.failures).toHaveLength(2);
      expect(db.failures.map((f) => f.id)).toContain('recent-z');
      expect(db.failures.map((f) => f.id)).not.toContain('old-a');
      expect(db.failures.map((f) => f.id)).not.toContain('old-z');

      // not again within the hour
      const prunes = () =>
        (repos.failures.delete.mock.calls as [Row][]).filter(
          ([where]) => !('id' in where),
        ).length;
      expect(prunes()).toBe(1);
      await redeemError(
        service.redeem(
          studentB,
          { code: 'ZZZZZZZZZZ', examId: E1 },
          new Date(NOW.getTime() + 30 * 60 * 1000),
        ),
      );
      expect(prunes()).toBe(1);
      await redeemError(
        service.redeem(
          studentB,
          { code: 'ZZZZZZZZZZ', examId: E1 },
          new Date(NOW.getTime() + 61 * 60 * 1000),
        ),
      );
      expect(prunes()).toBe(2);
    });
  });

  describe('redeem — bad body gets the contract shape (no ValidationPipe array)', () => {
    it.each([
      ['missing code', undefined],
      ['a number', 12345678],
      ['an object', { a: 1 }],
      ['too long', 'A'.repeat(101)],
      ['empty', ''],
    ])('code %s → 400 INVALID_FORMAT (counted)', async (_label, code) => {
      await expectRedeemError(
        service.redeem(studentA, { code, examId: E1 }, NOW),
        'INVALID_FORMAT',
        400,
      );
      expect(db.failures.map((f) => f.errorCode)).toEqual(['INVALID_FORMAT']);
    });

    it.each([
      ['not a uuid', 'exam-1'],
      ['a number', 5],
    ])(
      'examId %s → 400 with a Thai message string, not counted',
      async (_l, examId) => {
        const err = await service
          .redeem(studentA, { code: 'ABCDEFGHJK', examId }, NOW)
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.statusCode).toBe(400);
        expect(typeof body.message).toBe('string');
        expect(body.message).toMatch(/ชุดข้อสอบ/);
        expect(db.failures).toHaveLength(0);
      },
    );
  });

  it('an empty body → INVALID_FORMAT (the code is checked before examId)', async () => {
    await expectRedeemError(
      service.redeem(studentA, {} as never, NOW),
      'INVALID_FORMAT',
      400,
    );
    await expectRedeemError(
      service.redeem(studentA, undefined as never, NOW),
      'INVALID_FORMAT',
      400,
    );
  });

  describe('redeem — deadlock (InnoDB 1213) instead of a duplicate key', () => {
    it('is retried once: success when the retry goes through', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      db.deadlocks = 1;
      await expect(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
      ).resolves.toMatchObject({ unlockedExamIds: [E1, E2] });
      expect(db.queries).toHaveLength(2);
      expect(db.access).toHaveLength(2);
    });

    it('two codes of one campaign: the retry sees the other code used → BATCH_ALREADY_USED, not 500', async () => {
      const batch = addBatch();
      addCode(batch, 'FIRSTCODE2');
      addCode(batch, 'SECONDCODE');
      // the other code wins while this one is the deadlock victim
      db.deadlocks = 1;
      db.beforeTransaction = () => {
        Object.assign(db.codes[0], { usedByUserId: 'user-a', usedAt: NOW });
      };
      await expectRedeemError(
        service.redeem(studentA, { code: 'SECONDCODE', examId: E1 }, NOW),
        'BATCH_ALREADY_USED',
        409,
      );
    });

    it('deadlock twice: BATCH_ALREADY_USED if the account used another code of the campaign', async () => {
      const batch = addBatch();
      addCode(batch, 'FIRSTCODE2', { usedByUserId: 'user-a', usedAt: NOW });
      addCode(batch, 'SECONDCODE');
      // pretend the pre-check missed it (it raced), then 2 deadlocks
      jest
        .spyOn(repos.codes, 'exists')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      db.deadlocks = 2;
      await expectRedeemError(
        service.redeem(studentA, { code: 'SECONDCODE', examId: E1 }, NOW),
        'BATCH_ALREADY_USED',
        409,
      );
    });

    it('deadlock twice for another reason: the error is not hidden (and not counted)', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      db.deadlocks = 2;
      await expect(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
      ).rejects.toMatchObject({ errno: 1213 });
      expect(db.failures).toHaveLength(0);
    });
  });

  describe('redeem — concurrency (atomic)', () => {
    it('two accounts, one code, at the same time → exactly one succeeds, the other gets USED', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');

      const results = await Promise.allSettled([
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
        service.redeem(studentB, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
      ]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0].reason as RedeemException).errorCode).toBe('USED');
      // both passed the "not used yet" read: the conditional UPDATE decided
      expect(db.queries).toHaveLength(2);
      // only the winner has access
      const winner = db.codes[0].usedByUserId;
      expect(new Set(db.access.map((a) => a.userId))).toEqual(
        new Set([winner]),
      );
    });

    it('one account, two codes of the same campaign at the same time → one succeeds, the other BATCH_ALREADY_USED', async () => {
      const batch = addBatch();
      addCode(batch, 'FIRSTCODE2');
      addCode(batch, 'SECONDCODE');

      const results = await Promise.allSettled([
        service.redeem(studentA, { code: 'FIRSTCODE2', examId: E1 }, NOW),
        service.redeem(studentA, { code: 'SECONDCODE', examId: E1 }, NOW),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      )!;
      expect((failed.reason as RedeemException).errorCode).toBe(
        'BATCH_ALREADY_USED',
      );
      // the unique (batchId, usedByUserId) index decided
      expect(db.codes.filter((c) => c.usedByUserId === 'user-a')).toHaveLength(
        1,
      );
      expect(db.access).toHaveLength(2); // E1 + E2 once
    });

    it('campaign turned off between the checks and the update → DISABLED, nothing granted', async () => {
      const batch = addBatch();
      addCode(batch, 'ABCDEFGHJK');
      db.beforeTransaction = () => {
        db.batches.find((b) => b.id === batch)!.isActive = false;
      };
      await expectRedeemError(
        service.redeem(studentA, { code: 'ABCDEFGHJK', examId: E1 }, NOW),
        'DISABLED',
        403,
      );
      expect(db.codes[0].usedByUserId).toBeNull();
      expect(db.access).toHaveLength(0);
    });
  });

  // ── admin: campaigns ────────────────────────────────────────────────

  describe('createBatch', () => {
    const input = (fields: Partial<CreateUnlockBatchDto> = {}) =>
      ({
        name: '  แคมเปญ ม.6  ',
        examIds: [E1, E2],
        allMock: false,
        count: 5,
        accessDays: 30,
        ...fields,
      }) as CreateUnlockBatchDto;

    it('5,000 unique codes in chunks of 1,000, linked to 2 exams, quickly', async () => {
      const started = Date.now();
      const view = await service.createBatch(
        input({ count: 5000, codeExpiresAt: '2026-12-31T23:59:59+07:00' }),
        admin,
        NOW,
      );
      expect(Date.now() - started).toBeLessThan(10_000);

      expect(db.codes).toHaveLength(5000);
      expect(new Set(db.codes.map((c) => c.code)).size).toBe(5000);
      expect(new Set(db.codes.map((c) => c.id)).size).toBe(5000);
      for (const c of db.codes) {
        expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
        expect(c).toMatchObject({
          isActive: true,
          usedByUserId: null,
          usedAt: null,
        });
      }
      expect(db.insertChunks).toEqual([1000, 1000, 1000, 1000, 1000]);

      expect(typeof view.id).toBe('string');
      expect(view.createdAt).toBeInstanceOf(Date);
      expect({ ...view, id: 'x', createdAt: null }).toEqual({
        id: 'x',
        name: 'แคมเปญ ม.6',
        kind: 'exam',
        proPlan: null,
        allMock: false,
        exams: [
          { id: E1, title: 'ชุด 1' },
          { id: E2, title: 'ชุด 2' },
        ],
        codeCount: 5000,
        usedCount: 0,
        accessDays: 30,
        codeExpiresAt: new Date('2026-12-31T16:59:59.000Z'),
        isActive: true,
        createdAt: null,
      });
      expect(db.batches[0]).toMatchObject({ createdById: 'admin-1' });
      // 20 s jest timeout: ~5,000 generated codes are slow under the full
      // parallel run (the test's own timing assertion is unchanged)
    }, 20_000);

    it('all Mock: no exam links needed (examIds ignored)', async () => {
      const view = await service.createBatch(
        input({ allMock: true, examIds: undefined, count: 3 }),
        admin,
        NOW,
      );
      expect(view).toMatchObject({ allMock: true, exams: [], codeCount: 3 });
      expect(db.batchExams).toHaveLength(0);
    });

    it('400 without exams, with a free / normal / unknown exam, or an expiry in the past', async () => {
      const bad: Partial<CreateUnlockBatchDto>[] = [
        { examIds: [] },
        { examIds: undefined },
        { examIds: [E1, FREE] },
        { examIds: [NORMAL] },
        { examIds: [E1, '99999999-9999-4999-8999-999999999999'] },
        { codeExpiresAt: '2026-11-09T00:00:00Z' },
      ];
      for (const fields of bad) {
        await expect(
          service.createBatch(input(fields), admin, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(db.batches).toHaveLength(0);
      expect(db.codes).toHaveLength(0);
    });

    it('a purchase Mock Exam can be unlocked by a code too', async () => {
      await expect(
        service.createBatch(input({ examIds: [E3] }), admin, NOW),
      ).resolves.toMatchObject({ exams: [{ id: E3, title: 'ชุดซื้อ' }] });
    });

    it('never reuses a code that already exists', async () => {
      addCode(addBatch(), 'AAAAAAAAAA');
      jest
        .spyOn(format, 'randomCodes')
        .mockReturnValueOnce(['AAAAAAAAAA', 'BBBBBBBBBB', 'BBBBBBBBBB'])
        .mockReturnValueOnce(['CCCCCCCCCC']);

      await service.createBatch(input({ count: 3 }), admin, NOW);

      const created = db.codes
        .filter((c) => c.batchId !== 'batch-1')
        .map((c) => c.code);
      // A exists already, B was drawn twice: B, C + one more random code
      expect(created).toHaveLength(3);
      expect(new Set(created).size).toBe(3);
      expect(created).toEqual(
        expect.arrayContaining(['BBBBBBBBBB', 'CCCCCCCCCC']),
      );
      expect(created).not.toContain('AAAAAAAAAA');
    });

    it('retries with new codes when one was taken at the same moment (duplicate key)', async () => {
      jest
        .spyOn(format, 'randomCodes')
        .mockReturnValueOnce(['RACECODE22', 'MINE222222'])
        .mockReturnValueOnce(['FRESH22222', 'FRESH33333']);
      // another campaign inserts RACECODE22 right before our transaction
      db.beforeTransaction = () => {
        addCode(addBatch({}, []), 'RACECODE22');
      };

      const view = await service.createBatch(input({ count: 2 }), admin, NOW);

      const mine = db.codes.filter((c) => c.batchId === view.id);
      expect(mine.map((c) => c.code).sort()).toEqual([
        'FRESH22222',
        'FRESH33333',
      ]);
      // the failed attempt left nothing behind
      expect(db.codes.filter((c) => c.code === 'MINE222222')).toHaveLength(0);
      expect(db.batches.filter((b) => b.name === 'แคมเปญ ม.6')).toHaveLength(1);
    });
  });

  describe('campaign views, update', () => {
    it('usedCount counts redeemed codes; list is newest first', async () => {
      const b1 = addBatch({ name: 'เก่า' });
      addCode(b1, 'USEDUSED22', { usedByUserId: 'user-a', usedAt: NOW });
      addCode(b1, 'FREEFREE22');
      addBatch({ name: 'ใหม่' }, [E3]);

      const list = await service.listBatches(1, 20);
      expect(list).toMatchObject({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(list.items.map((b) => [b.name, b.codeCount, b.usedCount])).toEqual(
        [
          ['ใหม่', 0, 0],
          ['เก่า', 2, 1],
        ],
      );
    });

    it('getBatch of an unknown id → 404', async () => {
      await expect(service.getBatch('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updateBatch: name (trimmed), on/off, expiry set and cleared; exams/accessDays untouched', async () => {
      const id = addBatch({ codeExpiresAt: new Date(NOW) });

      await service.updateBatch(id, {
        name: '  ชื่อใหม่ ',
        isActive: false,
        codeExpiresAt: '2027-01-01T00:00:00+07:00',
      });
      expect(db.batches[0]).toMatchObject({
        name: 'ชื่อใหม่',
        isActive: false,
        codeExpiresAt: new Date('2026-12-31T17:00:00.000Z'),
        accessDays: 30,
      });

      const view = await service.updateBatch(id, { codeExpiresAt: null });
      expect(view.codeExpiresAt).toBeNull();
      expect(view.exams).toHaveLength(2);

      await service.updateBatch(id, {});
      expect(db.batches[0].name).toBe('ชื่อใหม่');
    });

    it('turning a campaign off stops new redeems at once; access already granted stays', async () => {
      const id = addBatch();
      addCode(id, 'GRANTED222');
      addCode(id, 'NOTYET2222');
      await service.redeem(studentA, { code: 'GRANTED222', examId: E1 }, NOW);

      await service.updateBatch(id, { isActive: false });

      await expectRedeemError(
        service.redeem(studentB, { code: 'NOTYET2222', examId: E1 }, NOW),
        'DISABLED',
        403,
      );
      expect(db.access.filter((a) => a.userId === 'user-a')).toHaveLength(2);
    });
  });

  // ── admin: codes ────────────────────────────────────────────────────

  describe('codes list, on/off, CSV', () => {
    let batch: string;

    beforeEach(() => {
      batch = addBatch({ name: 'แคมเปญ "ม.6"' });
      addCode(batch, 'BUSEDBYB22', {
        usedByUserId: 'user-b',
        usedAt: new Date('2026-11-10T17:30:05.000Z'),
      });
      addCode(batch, 'AUSEDBYA22', {
        usedByUserId: 'user-a',
        usedAt: new Date('2026-11-09T01:00:00.000Z'),
      });
      addCode(batch, 'COFF222222', { isActive: false });
      addCode(batch, 'DFREE22222');
      addCode(addBatch(), 'OTHERBATCH');
    });

    it('items with the safe user fields only', async () => {
      const result = await service.listCodes(batch, 'all', undefined, 1, 50);
      expect(result.total).toBe(4);
      expect(result.items[0]).toEqual({
        id: 'code-AUSEDBYA22',
        code: 'AUSEDBYA22',
        isActive: true,
        usedAt: new Date('2026-11-09T01:00:00.000Z'),
        usedBy: {
          id: 'user-a',
          email: 'a@lumo.test',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
        },
      });
      expect(result.items[3]).toMatchObject({
        code: 'DFREE22222',
        usedBy: null,
      });
    });

    it.each([
      ['used', ['AUSEDBYA22', 'BUSEDBYB22']],
      ['unused', ['DFREE22222']],
      ['disabled', ['COFF222222']],
      ['all', ['AUSEDBYA22', 'BUSEDBYB22', 'COFF222222', 'DFREE22222']],
    ])('status=%s', async (status, codes) => {
      const result = await service.listCodes(batch, status);
      expect(result.items.map((i) => i.code)).toEqual(codes);
    });

    it('unknown status → 400; unknown campaign → 404', async () => {
      await expect(service.listCodes(batch, 'weird')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.listCodes('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('search matches the code without spaces/dashes/case, or the email (LIKE escaped)', async () => {
      const qbSpy = jest.spyOn(repos.codes, 'createQueryBuilder');
      await service.listCodes(batch, 'all', ' aused-by ');
      await service.listCodes(batch, 'all', '50%_off@x');

      const searchWhere = (i: number) =>
        (
          qbSpy.mock.results[i].value as { calls: [string, unknown[]][] }
        ).calls.find((c) => String(c[1][0]).includes('emailSearch'))![1];
      expect(searchWhere(0)).toEqual([
        '(code.code LIKE :codeSearch OR user.email LIKE :emailSearch)',
        { codeSearch: '%AUSEDBY%', emailSearch: '%aused-by%' },
      ]);
      expect(searchWhere(1)).toEqual([
        '(code.code LIKE :codeSearch OR user.email LIKE :emailSearch)',
        { codeSearch: '%50OFFX%', emailSearch: '%50\\%\\_off@x%' },
      ]);

      await service.listCodes(batch, 'all', '@@');
      expect(searchWhere(2)).toEqual([
        'user.email LIKE :emailSearch',
        expect.objectContaining({ emailSearch: '%@@%' }),
      ]);
    });

    it('updateCode turns one code off/on and returns it; unknown id → 404', async () => {
      await expect(
        service.updateCode('code-DFREE22222', false),
      ).resolves.toMatchObject({
        code: 'DFREE22222',
        isActive: false,
        usedBy: null,
      });
      expect(db.codes.find((c) => c.code === 'DFREE22222')!.isActive).toBe(
        false,
      );
      await expect(service.updateCode('nope', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('CSV: BOM, header, every code of the campaign, Thai time, Thai names, formula-safe', async () => {
      const { name, csv } = await service.exportCsv(batch);
      expect(name).toBe('แคมเปญ "ม.6"');
      expect(csv.startsWith('﻿')).toBe(true);
      const lines = csv.slice(1).split('\r\n');
      expect(lines).toEqual([
        'code,status,used_by_email,used_by_name,used_at',
        'AUSEDBYA22,used,a@lumo.test,สมชาย ใจดี,2026-11-09 08:00:00',
        "BUSEDBYB22,used,b@lumo.test,'=cmd,2026-11-11 00:30:05",
        'COFF222222,disabled,,,',
        'DFREE22222,unused,,,',
        '',
      ]);
    });

    it('CSV of 5,000 codes has 5,000 rows', async () => {
      const view = await service.createBatch(
        {
          name: 'ใหญ่',
          examIds: [E1, E2],
          allMock: false,
          count: 5000,
          accessDays: 7,
        },
        admin,
        NOW,
      );
      const { csv } = await service.exportCsv(view.id);
      const lines = csv.trimEnd().split('\r\n');
      expect(lines).toHaveLength(5001);
      expect(
        lines.slice(1).every((l) => /^[A-HJ-NP-Z2-9]{10},unused,,,$/.test(l)),
      ).toBe(true);
    });
  });

  // ── Pro campaigns (task 19) ─────────────────────────────────────────

  describe('Pro codes (task 19)', () => {
    const proBatch = (fields: Row = {}) =>
      addBatch(
        {
          name: 'PRO NETSAT 7 วัน',
          kind: 'pro',
          proPlanId: PRO_PLAN,
          accessDays: 7,
          ...fields,
        },
        [],
      );

    it('no examId (/upgrade): the plan via grantFromCode (note = campaign), code used, no exam access, not counted', async () => {
      addCode(proBatch(), 'PROCODE222');

      const result = await service.redeem(
        studentA,
        { code: 'procode222' },
        NOW,
      );

      expect(proSubs.grantFromCode).toHaveBeenCalledTimes(1);
      expect((proSubs.grantFromCode.mock.calls[0] as unknown[])[0]).toEqual({
        userId: 'user-a',
        planId: PRO_PLAN,
        days: 7,
        note: 'PRO NETSAT 7 วัน',
      });
      const end = new Date(NOW.getTime() + 7 * DAY).toISOString();
      expect(result).toEqual({
        kind: 'pro',
        venue: { id: 'netsat', key: 'netsat', name: 'NETSAT' },
        plan: { id: PRO_PLAN, code: 'pro', name: 'PRO' },
        currentPeriodEnd: end,
        extended: false,
        autoRenewDatesDiffer: false,
        unlockedExamIds: [],
        expiresAt: end,
      });
      expect(db.codes[0]).toMatchObject({
        usedByUserId: 'user-a',
        usedAt: NOW,
      });
      expect(db.access).toHaveLength(0);
      expect(db.failures).toHaveLength(0);
    });

    it('typed on a purchase Mock page: unlockedExamIds has the exam when the plan now unlocks it', async () => {
      addCode(proBatch(), 'PROCODE222');
      proMockAccess.set(E3, new Date(NOW.getTime() + 7 * DAY));
      await expect(
        service.redeem(studentA, { code: 'PROCODE222', examId: E3 }, NOW),
      ).resolves.toMatchObject({ kind: 'pro', unlockedExamIds: [E3] });

      // a code exam page that the plan does not unlock → []
      addCode(proBatch({ name: 'อีกแคมเปญ' }), 'PROCODE333');
      await expect(
        service.redeem(studentB, { code: 'PROCODE333', examId: E1 }, NOW),
      ).resolves.toMatchObject({ kind: 'pro', unlockedExamIds: [] });
    });

    it('an exam code without examId → 422 NOT_FOR_THIS_EXAM with "กรอกที่หน้าชุดข้อสอบ" (counted)', async () => {
      addCode(addBatch(), 'ABCDEFGHJK');
      for (const examId of [undefined, null, '']) {
        const err = await redeemError(
          service.redeem(studentA, { code: 'ABCDEFGHJK', examId }, NOW),
        );
        expect(err.getStatus()).toBe(422);
        expect(err.getResponse()).toEqual({
          statusCode: 422,
          errorCode: 'NOT_FOR_THIS_EXAM',
          message: 'โค้ดนี้ใช้กับชุดข้อสอบ กรุณากรอกที่หน้าชุดข้อสอบ',
        });
      }
      expect(db.codes[0].usedByUserId).toBeNull();
      expect(db.failures.map((f) => f.errorCode)).toEqual([
        'NOT_FOR_THIS_EXAM',
        'NOT_FOR_THIS_EXAM',
        'NOT_FOR_THIS_EXAM',
      ]);
    });

    it('second code of the same Pro campaign → BATCH_ALREADY_USED; the same code again → ALREADY_REDEEMED', async () => {
      const batch = proBatch();
      addCode(batch, 'FIRSTPRO22');
      addCode(batch, 'SECONDPRO2');
      await service.redeem(studentA, { code: 'FIRSTPRO22' }, NOW);

      await expectRedeemError(
        service.redeem(studentA, { code: 'SECONDPRO2' }, NOW),
        'BATCH_ALREADY_USED',
        409,
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'FIRSTPRO22' }, NOW),
        'ALREADY_REDEEMED',
        409,
      );
      expect(proSubs.grantFromCode).toHaveBeenCalledTimes(1);
      expect(db.codes.find((c) => c.code === 'SECONDPRO2')!.usedAt).toBeNull();
    });

    it('two codes of one Pro campaign at once by one account: the unique index decides (BATCH_ALREADY_USED)', async () => {
      const batch = proBatch();
      addCode(batch, 'FIRSTPRO22');
      addCode(batch, 'SECONDPRO2');
      const results = await Promise.allSettled([
        service.redeem(studentA, { code: 'FIRSTPRO22' }, NOW),
        service.redeem(studentA, { code: 'SECONDPRO2' }, NOW),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      )!;
      expect((failed.reason as RedeemException).errorCode).toBe(
        'BATCH_ALREADY_USED',
      );
      expect(db.codes.filter((c) => c.usedByUserId === 'user-a')).toHaveLength(
        1,
      );
    });

    it('ALREADY_HIGHER_PLAN (409) from the grant: code not used, not counted as a guess (round 2)', async () => {
      addCode(proBatch(), 'PROCODE222');
      proSubs.grantFromCode.mockRejectedValueOnce(
        new ProException('ALREADY_HIGHER_PLAN'),
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'PROCODE222' }, NOW),
        'ALREADY_HIGHER_PLAN',
        409,
      );
      expect(db.codes[0].usedByUserId).toBeNull();
      expect(db.failures).toHaveLength(0);
    });

    it('autoRenewDatesDiffer of the grant is passed on', async () => {
      addCode(proBatch(), 'PROCODE222');
      proSubs.grantFromCode.mockImplementationOnce(
        async (
          input: { planId: string },
          consume: (m: unknown) => Promise<void>,
        ) => {
          await db.dataSource.transaction((m) => consume(m));
          return {
            subscriptionId: 'sub-1',
            extended: true,
            autoRenewDatesDiffer: true,
            currentPeriodEnd: new Date(NOW.getTime() + 7 * DAY),
            venue: { id: 'netsat', key: 'netsat', name: 'NETSAT' },
            plan: { id: input.planId, code: 'pro', name: 'PRO' },
          };
        },
      );
      await expect(
        service.redeem(studentA, { code: 'PROCODE222' }, NOW),
      ).resolves.toMatchObject({ extended: true, autoRenewDatesDiffer: true });
    });

    it('plan deleted / made free / missing on the campaign → 409 PLAN_UNAVAILABLE', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      addCode(proBatch(), 'PROCODE222');
      for (const code of ['PLAN_NOT_FOUND', 'FREE_PLAN_GRANT'] as const) {
        proSubs.grantFromCode.mockRejectedValueOnce(new ProException(code));
        await expectRedeemError(
          service.redeem(studentA, { code: 'PROCODE222' }, NOW),
          'PLAN_UNAVAILABLE',
          409,
        );
      }
      addCode(
        proBatch({ proPlanId: null, name: 'ไม่มีแพ็กเกจ' }),
        'NOPLAN2222',
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'NOPLAN2222' }, NOW),
        'PLAN_UNAVAILABLE',
        409,
      );
      // not a wrong guess (round 2)
      expect(db.failures).toHaveLength(0);
    });

    it('other errors of the grant (USER_BUSY) pass through and are not counted', async () => {
      addCode(proBatch(), 'PROCODE222');
      proSubs.grantFromCode.mockRejectedValueOnce(
        new ProException('USER_BUSY'),
      );
      await expect(
        service.redeem(studentA, { code: 'PROCODE222' }, NOW),
      ).rejects.toMatchObject({ errorCode: 'USER_BUSY' });
      expect(db.failures).toHaveLength(0);
    });

    it('campaign off / expired → DISABLED / EXPIRED before any grant', async () => {
      addCode(proBatch({ isActive: false }), 'OFFPRO2222');
      addCode(
        proBatch({
          name: 'หมด',
          codeExpiresAt: new Date(NOW.getTime() - 1000),
        }),
        'OLDPRO2222',
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'OFFPRO2222' }, NOW),
        'DISABLED',
        403,
      );
      await expectRedeemError(
        service.redeem(studentA, { code: 'OLDPRO2222' }, NOW),
        'EXPIRED',
        410,
      );
      expect(proSubs.grantFromCode).not.toHaveBeenCalled();
    });

    it('disabled between the checks and the grant transaction → DISABLED (the conditional UPDATE decides)', async () => {
      const batch = proBatch();
      addCode(batch, 'PROCODE222');
      db.beforeTransaction = () => {
        db.batches.find((b) => b.id === batch)!.isActive = false;
      };
      await expectRedeemError(
        service.redeem(studentA, { code: 'PROCODE222' }, NOW),
        'DISABLED',
        403,
      );
      expect(db.codes[0].usedByUserId).toBeNull();
    });

    describe('createBatch kind pro', () => {
      const proInput = (fields: Partial<CreateUnlockBatchDto> = {}) =>
        ({
          name: ' PRO NETSAT 7 วัน ',
          kind: 'pro',
          proPlanId: PRO_PLAN,
          count: 5,
          accessDays: 7,
          ...fields,
        }) as CreateUnlockBatchDto;

      it('stores kind + plan, no exams; the view shows the plan and its venue', async () => {
        const view = await service.createBatch(proInput(), admin, NOW);
        expect(view).toMatchObject({
          name: 'PRO NETSAT 7 วัน',
          kind: 'pro',
          proPlan: {
            id: PRO_PLAN,
            code: 'pro',
            name: 'PRO',
            venue: { id: 'netsat', key: 'netsat', name: 'NETSAT' },
          },
          allMock: false,
          exams: [],
          codeCount: 5,
          accessDays: 7,
        });
        expect(db.batches[0]).toMatchObject({
          kind: 'pro',
          proPlanId: PRO_PLAN,
          allMock: false,
        });
        expect(db.batchExams).toHaveLength(0);
        const list = await service.listBatches(1, 20);
        expect(list.items[0]).toMatchObject({
          kind: 'pro',
          proPlan: { id: PRO_PLAN },
        });
      });

      it('exams / allMock with kind pro → 400; plan missing → 404 PLAN_NOT_FOUND; free plan → 400 FREE_PLAN_GRANT', async () => {
        await expect(
          service.createBatch(proInput({ examIds: [E1] }), admin, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          service.createBatch(proInput({ allMock: true }), admin, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          service.createBatch(
            proInput({ proPlanId: '99999999-9999-4999-8999-999999999999' }),
            admin,
            NOW,
          ),
        ).rejects.toMatchObject({ errorCode: 'PLAN_NOT_FOUND' });
        await expect(
          service.createBatch(
            proInput({ proPlanId: 'a17e0001-0000-4000-8000-000000000011' }),
            admin,
            NOW,
          ),
        ).rejects.toMatchObject({ errorCode: 'FREE_PLAN_GRANT' });
        expect(db.batches).toHaveLength(0);
      });

      it('hidden plan / plan of a closed venue → 400 PLAN_NOT_OFFERED (Thai), nothing made (round 2)', async () => {
        for (const proPlanId of [HIDDEN_PLAN, CLOSED_VENUE_PLAN]) {
          const err = await service
            .createBatch(proInput({ proPlanId }), admin, NOW)
            .then(
              () => null,
              (e: unknown) => e,
            );
          expect(err).toBeInstanceOf(ProException);
          expect((err as ProException).getResponse()).toMatchObject({
            statusCode: 400,
            errorCode: 'PLAN_NOT_OFFERED',
            message: expect.stringContaining('ถูกซ่อน') as string,
          });
        }
        expect(db.batches).toHaveLength(0);
      });

      it('kind exam (or none) with a proPlanId → 400; old campaigns without kind show kind exam', async () => {
        await expect(
          service.createBatch(
            {
              name: 'x',
              examIds: [E1],
              count: 1,
              accessDays: 1,
              proPlanId: PRO_PLAN,
            } as CreateUnlockBatchDto,
            admin,
            NOW,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        const id = addBatch();
        await expect(service.getBatch(id)).resolves.toMatchObject({
          kind: 'exam',
          proPlan: null,
        });
      });
    });
  });
});
