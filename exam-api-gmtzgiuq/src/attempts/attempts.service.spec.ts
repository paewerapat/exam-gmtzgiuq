import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { AttemptsService } from './attempts.service';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { StartAttemptDto, SubmitAttemptInput } from './dto/attempt.dto';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { AnswerLogsService } from '../answer-logs/answer-logs.service';

/** Access check that lets everything through (lock tests: end of file). */
const openAccess = () => ({
  provide: ExamAccessService,
  useValue: { assertCanAccessExamId: jest.fn().mockResolvedValue(undefined) },
});

/** Answer log that writes nothing (task 16; its own tests: answer-logs). */
const answerLogs = () => ({
  provide: AnswerLogsService,
  useValue: { logAttempt: jest.fn().mockResolvedValue(0) },
});

describe('AttemptsService', () => {
  let service: AttemptsService;
  let findOne: jest.Mock;

  // Mimics the DB: findOne matches every key in `where`.
  const rows = [
    { id: 'att-a', userId: 'user-a', examTitle: 'ของ A' },
    { id: 'att-b', userId: 'user-b', examTitle: 'ของ B' },
  ] as ExamAttempt[];

  beforeEach(async () => {
    findOne = jest.fn(({ where }: { where: Partial<ExamAttempt> }) =>
      Promise.resolve(
        rows.find((r) =>
          Object.entries(where).every(
            ([k, v]) => r[k as keyof ExamAttempt] === v,
          ),
        ) ?? null,
      ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { findOne },
        },
        { provide: getRepositoryToken(Exam), useValue: {} },
        openAccess(),
        answerLogs(),
      ],
    }).compile();

    service = module.get(AttemptsService);
  });

  describe('findOneForUser (SEC-6)', () => {
    it('returns the attempt to its owner', async () => {
      await expect(service.findOneForUser('att-a', 'user-a')).resolves.toEqual(
        rows[0],
      );
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'att-a', userId: 'user-a' },
        relations: ['user', 'exam'],
      });
    });

    it("404 when user B asks for user A's attempt", async () => {
      await expect(
        service.findOneForUser('att-a', 'user-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 when the attempt does not exist', async () => {
      await expect(
        service.findOneForUser('missing', 'user-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 without querying when there is no user id', async () => {
      await expect(
        service.findOneForUser('att-a', undefined as unknown as string),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });
  });
});

// In-memory exam_attempts table for startInProgress. Mimics TypeORM/MySQL on
// the parts the service uses, including dropping `undefined` keys from
// `where` (the root of the "start without examId" bug).
class FakeAttemptTable {
  rows: ExamAttempt[] = [];
  private seq = 0;
  private clock = Date.parse('2026-11-07T00:00:00.000Z');

  private matches(row: ExamAttempt, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true; // TypeORM drops undefined keys
      const value = row[key as keyof ExamAttempt];
      if (cond instanceof FindOperator) {
        return (cond.value as unknown[]).includes(value);
      }
      return value === cond;
    });
  }

  private nextCreatedAt() {
    this.clock += 1000;
    return new Date(this.clock);
  }

  insert(extra: Partial<ExamAttempt>): ExamAttempt {
    const row = {
      id: `att-${++this.seq}`,
      userId: 'user-a',
      examId: 'exam-1',
      examTitle: 'ชุดเก่า',
      category: 'physics',
      totalQuestions: 2,
      questionIds: ['q1', 'q2'],
      answers: {},
      timePerQuestion: { q1: 12 },
      currentIndex: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      unanswered: 2,
      score: 0,
      totalTime: 12,
      status: 'in_progress',
      mode: 'practice',
      startedAt: new Date('2026-11-06T00:00:00.000Z'),
      createdAt: this.nextCreatedAt(),
      ...extra,
    } as ExamAttempt;
    this.rows.push(row);
    return row;
  }

  repo = {
    findOne: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const row = this.rows.find((r) => this.matches(r, where));
      return Promise.resolve(row ? { ...row } : null);
    }),
    find: jest.fn(
      ({
        where,
        order,
      }: {
        where: Record<string, unknown>;
        order?: Record<string, string>;
      }) => {
        const found = this.rows
          .filter((r) => this.matches(r, where))
          .map((r) => ({ ...r }));
        if (order?.createdAt === 'ASC') {
          found.sort(
            (a, b) =>
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id),
          );
        }
        return Promise.resolve(found);
      },
    ),
    findOneOrFail: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const row = this.rows.find((r) => this.matches(r, where));
      return row
        ? Promise.resolve({ ...row })
        : Promise.reject(new Error('EntityNotFound'));
    }),
    update: jest.fn(
      (
        criteria: string | Record<string, unknown>,
        partial: Record<string, unknown>,
      ) => {
        const where =
          typeof criteria === 'string' ? { id: criteria } : criteria;
        const hit = this.rows.filter((r) => this.matches(r, where));
        for (const row of hit) {
          for (const [key, value] of Object.entries(partial)) {
            (row as unknown as Record<string, unknown>)[key] =
              typeof value === 'function' ? this.nextCreatedAt() : value;
          }
        }
        return Promise.resolve({ affected: hit.length });
      },
    ),
    delete: jest.fn((where: Record<string, unknown>) => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => !this.matches(r, where));
      return Promise.resolve({ affected: before - this.rows.length });
    }),
    create: jest.fn((data: Partial<ExamAttempt>) => ({ ...data })),
    save: jest.fn((entity: Partial<ExamAttempt>) =>
      Promise.resolve({ ...this.insert(entity) }),
    ),
  };

  em = {
    getRepository: jest.fn(() => this.repo),
    query: jest.fn<Promise<unknown>, [string, unknown[]?]>((sql) =>
      Promise.resolve(sql.startsWith('SELECT @@') ? [{ t: 50 }] : []),
    ),
  };
}

describe('AttemptsService.startInProgress (task 13)', () => {
  let service: AttemptsService;
  let table: FakeAttemptTable;
  let transaction: jest.Mock;
  let examExists: jest.Mock;

  const startData: StartAttemptDto = {
    examId: 'exam-1',
    examTitle: 'ชุดใหม่',
    category: 'physics',
    totalQuestions: 3,
    questionIds: ['q1', 'q2', 'q3'],
    startedAt: '2026-11-07T10:00:00.000Z',
  };

  const inProgressRows = () =>
    table.rows.filter(
      (r) =>
        r.userId === 'user-a' &&
        r.examId === 'exam-1' &&
        r.status === 'in_progress',
    );

  beforeEach(async () => {
    table = new FakeAttemptTable();
    transaction = jest.fn((cb: (em: unknown) => Promise<unknown>) =>
      cb(table.em),
    );
    examExists = jest.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { ...table.repo, manager: { transaction } },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: { exists: examExists },
        },
        openAccess(),
        answerLogs(),
      ],
    }).compile();

    service = module.get(AttemptsService);
  });

  // task 14 B2: the foreign key used to turn this into a 500
  it('404 for an exam that does not exist, before starting the transaction', async () => {
    examExists.mockResolvedValue(false);

    await expect(
      service.startInProgress('user-a', startData),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(examExists).toHaveBeenCalledWith({
      where: { id: 'exam-1' },
      loadEagerRelations: false,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(table.repo.save).not.toHaveBeenCalled();
    expect(table.rows).toHaveLength(0);
  });

  it('creates a new attempt when there is no in-progress one', async () => {
    const result = await service.startInProgress('user-a', startData);

    expect(table.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        examId: 'exam-1',
        status: 'in_progress',
        currentIndex: 0,
        answers: {},
        mode: 'practice',
      }),
    );
    expect(result).toMatchObject({ id: 'att-1', examTitle: 'ชุดใหม่' });
    expect(inProgressRows()).toHaveLength(1);
  });

  it('runs inside a transaction that locks the user row first', async () => {
    await service.startInProgress('user-a', startData);

    expect(transaction).toHaveBeenCalledTimes(1);
    const lock = table.em.query.mock.calls.findIndex(([sql]) =>
      /FROM users WHERE id = \? FOR UPDATE/.test(sql),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(table.em.query.mock.calls[lock][1]).toEqual(['user-a']);
    // the lock is taken before reading the in-progress rows
    expect(table.em.query.mock.invocationCallOrder[lock]).toBeLessThan(
      table.repo.find.mock.invocationCallOrder[0],
    );
    // the short lock timeout is put back on the connection
    expect(table.em.query).toHaveBeenLastCalledWith(
      'SET SESSION innodb_lock_wait_timeout = ?',
      [50],
    );
  });

  it('reuses an untouched in-progress attempt: same id, fields reset, createdAt set to now', async () => {
    const old = table.insert({});
    const oldCreatedAt = old.createdAt;

    const result = await service.startInProgress('user-a', {
      ...startData,
      mode: 'exam',
    });

    expect(table.repo.create).not.toHaveBeenCalled();
    expect(table.repo.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: old.id,
      status: 'in_progress',
      examTitle: 'ชุดใหม่',
      totalQuestions: 3,
      questionIds: ['q1', 'q2', 'q3'],
      answers: {},
      timePerQuestion: {},
      currentIndex: 0,
      unanswered: 3,
      totalTime: 0,
      score: 0,
      mode: 'exam',
      startedAt: new Date('2026-11-07T10:00:00.000Z'),
    });
    // createdAt is written with the DB clock through update(), not save()
    expect(table.repo.update).toHaveBeenCalledWith(
      old.id,
      expect.objectContaining({
        createdAt: expect.any(Function) as unknown,
      }),
    );
    const [, partial] = table.repo.update.mock.calls.find(
      ([criteria]) => criteria === old.id,
    ) as [string, { createdAt: () => string }];
    expect(partial.createdAt()).toBe('CURRENT_TIMESTAMP(6)');
    expect(result.createdAt.getTime()).toBeGreaterThan(oldCreatedAt.getTime());
    expect(inProgressRows()).toHaveLength(1);
    expect(table.rows.filter((r) => r.status === 'abandoned')).toHaveLength(0);
  });

  it('returns the attempt without eager relations, for a new and a reused row', async () => {
    await service.startInProgress('user-a', startData);
    await service.startInProgress('user-a', startData);

    expect(table.repo.findOneOrFail).toHaveBeenCalledTimes(2);
    for (const [options] of table.repo.findOneOrFail.mock.calls) {
      expect(options).toEqual({
        where: { id: 'att-1' },
        loadEagerRelations: false,
      });
    }
    expect(table.repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ loadEagerRelations: false }),
    );
  });

  it('three starts in a row without answering leave one in-progress row and no abandoned rows', async () => {
    const ids = [
      (await service.startInProgress('user-a', startData)).id,
      (await service.startInProgress('user-a', startData)).id,
      (await service.startInProgress('user-a', startData)).id,
    ];

    expect(new Set(ids).size).toBe(1);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].status).toBe('in_progress');
    expect(table.repo.delete).not.toHaveBeenCalled();
  });

  it('treats empty-string answers as not answered', async () => {
    const old = table.insert({ answers: { q1: '' } });

    const result = await service.startInProgress('user-a', startData);

    expect(table.repo.save).not.toHaveBeenCalled();
    expect(result.id).toBe(old.id);
  });

  it.each<[string, Partial<ExamAttempt>]>([
    ['has an answer', { answers: { q1: 'a' } }],
    ['moved past the first question even with no answers', { currentIndex: 1 }],
  ])(
    'keeps the old behaviour when the in-progress attempt %s: abandon it and create a new one',
    async (_label, extra) => {
      const old = table.insert(extra);

      const result = await service.startInProgress('user-a', startData);

      expect(table.rows.find((r) => r.id === old.id)?.status).toBe('abandoned');
      expect(table.repo.save).toHaveBeenCalledTimes(1);
      expect(result.id).not.toBe(old.id);
      expect(inProgressRows()).toHaveLength(1);
    },
  );

  // task 14 B1: extra untouched rows are abandoned, no longer deleted, so a
  // tab that still holds one can submit it instead of getting 404.
  it('two untouched rows: keeps the oldest (createdAt now) and abandons the other without deleting it', async () => {
    const keep = table.insert({});
    const extra = table.insert({});
    const keepCreatedAt = keep.createdAt;

    const result = await service.startInProgress('user-a', startData);

    expect(result.id).toBe(keep.id);
    expect(result.createdAt.getTime()).toBeGreaterThan(keepCreatedAt.getTime());
    expect(table.rows).toHaveLength(2);
    expect(table.rows.find((r) => r.id === extra.id)?.status).toBe('abandoned');
    expect(inProgressRows().map((r) => r.id)).toEqual([keep.id]);
    expect(table.repo.delete).not.toHaveBeenCalled();
    expect(table.repo.save).not.toHaveBeenCalled();
  });

  it('keeps the oldest untouched row and abandons extra untouched and started ones', async () => {
    const started = table.insert({ answers: { q1: 'b' } });
    const keep = table.insert({});
    const extra = table.insert({});

    const result = await service.startInProgress('user-a', startData);

    expect(result.id).toBe(keep.id);
    expect(table.rows).toHaveLength(3);
    expect(table.rows.find((r) => r.id === extra.id)?.status).toBe('abandoned');
    expect(table.rows.find((r) => r.id === started.id)?.status).toBe(
      'abandoned',
    );
    expect(inProgressRows().map((r) => r.id)).toEqual([keep.id]);
    expect(table.repo.delete).not.toHaveBeenCalled();
    // abandoning only ever touches rows that are still in progress
    expect(table.repo.update).toHaveBeenCalledWith(
      { id: expect.any(FindOperator) as unknown, status: 'in_progress' },
      { status: 'abandoned' },
    );
  });

  it('one untouched row: reused, no abandoned row added', async () => {
    table.insert({});

    await service.startInProgress('user-a', startData);

    expect(table.rows).toHaveLength(1);
    expect(table.rows.filter((r) => r.status === 'abandoned')).toHaveLength(0);
  });

  it('still starts when abandoning fails (lock timeout)', async () => {
    table.insert({ answers: { q1: 'a' } });
    table.repo.update.mockRejectedValueOnce(new Error('Lock wait timeout'));

    await expect(
      service.startInProgress('user-a', startData),
    ).resolves.toMatchObject({ examTitle: 'ชุดใหม่' });
  });

  it('never touches attempts of other exams or other users', async () => {
    const otherExam = { ...table.insert({ examId: 'exam-2' }) };
    const otherUser = { ...table.insert({ userId: 'user-b' }) };

    await service.startInProgress('user-a', startData);

    expect(table.rows.find((r) => r.id === otherExam.id)).toEqual(otherExam);
    expect(table.rows.find((r) => r.id === otherUser.id)).toEqual(otherUser);
  });

  // QA task 13: without examId TypeORM dropped the key from `where`, so an
  // untouched attempt of another exam was overwritten.
  it('never reuses an in-progress attempt that belongs to another exam', async () => {
    const otherExam = { ...table.insert({ examId: 'exam-2' }) };

    await expect(
      service.startInProgress('user-a', {
        ...startData,
        examId: undefined as unknown as string,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(table.rows).toEqual([otherExam]);
    expect(table.repo.update).not.toHaveBeenCalled();
    expect(table.repo.save).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['empty examId', { examId: '' }],
    ['missing startedAt', { startedAt: undefined }],
    ['invalid startedAt', { startedAt: 'not-a-date' }],
  ])('rejects %s with 400 before touching the DB', async (_label, extra) => {
    await expect(
      service.startInProgress('user-a', {
        ...startData,
        ...(extra as Partial<StartAttemptDto>),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(examExists).not.toHaveBeenCalled();
  });
});

describe('AttemptsService.completeAttempt (task 14 B3, BUG-21)', () => {
  let service: AttemptsService;
  let table: FakeAttemptTable;

  const submit: SubmitAttemptInput = {
    examId: 'exam-1',
    examTitle: 'ชุดเก่า',
    category: 'physics',
    totalQuestions: 2,
    correctAnswers: 1,
    incorrectAnswers: 1,
    unanswered: 0,
    score: 50,
    totalTime: 40,
    timePerQuestion: { q1: 20, q2: 20 },
    answers: { q1: 'a', q2: 'b' },
    questionIds: ['q1', 'q2'],
    startedAt: '2026-11-07T10:00:00.000Z',
    completedAt: '2026-11-07T10:05:00.000Z',
  };

  let logAttempt: jest.Mock;

  beforeEach(async () => {
    table = new FakeAttemptTable();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: getRepositoryToken(ExamAttempt), useValue: table.repo },
        { provide: getRepositoryToken(Exam), useValue: {} },
        openAccess(),
        answerLogs(),
      ],
    }).compile();

    service = module.get(AttemptsService);
    logAttempt = module.get<{ logAttempt: jest.Mock }>(
      AnswerLogsService,
    ).logAttempt;
  });

  describe('answer log (task 16)', () => {
    it('logs the answers of the request with the attempt mode/exam after completing', async () => {
      const attempt = table.insert({ mode: 'exam' });

      await service.completeAttempt(attempt.id, 'user-a', submit);

      expect(logAttempt).toHaveBeenCalledTimes(1);
      expect(logAttempt).toHaveBeenCalledWith({
        attemptId: attempt.id,
        userId: 'user-a',
        examId: 'exam-1',
        mode: 'exam',
        answers: submit.answers,
        timePerQuestion: submit.timePerQuestion,
      });
      // logged after the attempt row was completed
      expect(table.repo.update.mock.invocationCallOrder[0]).toBeLessThan(
        logAttempt.mock.invocationCallOrder[0],
      );
    });

    it('AC8 a repeated submit (409) logs nothing more', async () => {
      const attempt = table.insert({});

      await service.completeAttempt(attempt.id, 'user-a', submit);
      await expect(
        service.completeAttempt(attempt.id, 'user-a', submit),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(logAttempt).toHaveBeenCalledTimes(1);
    });

    it('logs nothing when the write loses the race (409)', async () => {
      const attempt = table.insert({ status: 'completed' });
      table.repo.findOne.mockResolvedValueOnce({
        ...attempt,
        status: 'in_progress',
      });

      await expect(
        service.completeAttempt(attempt.id, 'user-a', submit),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(logAttempt).not.toHaveBeenCalled();
    });

    it('logs nothing for another user (403)', async () => {
      const attempt = table.insert({});

      await expect(
        service.completeAttempt(attempt.id, 'user-b', submit),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(logAttempt).not.toHaveBeenCalled();
    });

    it('legacy POST /attempts logs the saved attempt as practice', async () => {
      const result = await service.submit(submit, {
        id: 'user-a',
      } as never);

      expect(logAttempt).toHaveBeenCalledWith({
        attemptId: result.id,
        userId: 'user-a',
        examId: 'exam-1',
        mode: 'practice',
        answers: submit.answers,
        timePerQuestion: submit.timePerQuestion,
      });
    });
  });

  it('completes an in-progress attempt with the submitted result', async () => {
    const attempt = table.insert({});

    const result = await service.completeAttempt(attempt.id, 'user-a', submit);

    expect(result).toMatchObject({
      id: attempt.id,
      status: 'completed',
      score: 50,
      correctAnswers: 1,
      currentIndex: 1,
      completedAt: new Date('2026-11-07T10:05:00.000Z'),
    });
  });

  it('still completes an abandoned attempt (an older tab whose attempt a newer start abandoned)', async () => {
    const attempt = table.insert({ status: 'abandoned' });

    const result = await service.completeAttempt(attempt.id, 'user-a', submit);

    expect(result).toMatchObject({ status: 'completed', score: 50 });
  });

  it('409 for an attempt that is already completed, and keeps the first result', async () => {
    const attempt = table.insert({
      status: 'completed',
      score: 80,
      correctAnswers: 2,
    });
    const before = { ...attempt };

    await expect(
      service.completeAttempt(attempt.id, 'user-a', { ...submit, score: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(table.repo.update).not.toHaveBeenCalled();
    expect(table.rows.find((r) => r.id === attempt.id)).toEqual(before);
  });

  it('second submit of the same attempt gets 409 and does not change the score', async () => {
    const attempt = table.insert({});

    await service.completeAttempt(attempt.id, 'user-a', submit);
    await expect(
      service.completeAttempt(attempt.id, 'user-a', { ...submit, score: 100 }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(table.rows.find((r) => r.id === attempt.id)?.score).toBe(50);
  });

  it('409 when another submit completes the attempt between the read and the write', async () => {
    const attempt = table.insert({ status: 'completed', score: 80 });
    // The read still sees the attempt in progress
    table.repo.findOne.mockResolvedValueOnce({
      ...attempt,
      status: 'in_progress',
    });

    await expect(
      service.completeAttempt(attempt.id, 'user-a', submit),
    ).rejects.toBeInstanceOf(ConflictException);

    // the write is conditional on the status, so nothing was overwritten
    expect(table.repo.update).toHaveBeenCalledWith(
      { id: attempt.id, status: expect.any(FindOperator) as unknown },
      expect.objectContaining({ status: 'completed' }),
    );
    expect(table.rows.find((r) => r.id === attempt.id)?.score).toBe(80);
  });

  it("403 for another user's attempt and 404 for a missing one (unchanged)", async () => {
    const attempt = table.insert({});

    await expect(
      service.completeAttempt(attempt.id, 'user-b', submit),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.completeAttempt('missing', 'user-a', submit),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(table.repo.update).not.toHaveBeenCalled();
  });
});

describe('StartAttemptDto validation (POST /attempts/start)', () => {
  // Same options as the global pipe in main.ts
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const validate = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: StartAttemptDto,
    }) as Promise<StartAttemptDto>;

  // Exactly what exam-web-gmtzgiuq/lib/api/attempts.ts startInProgressAttempt sends
  const webBody = {
    examId: 'ab1df77f-3a9b-4424-9736-f0f6f205583a',
    examTitle: 'ฟิสิกส์ ชุดที่ 1',
    category: 'physics',
    totalQuestions: 2,
    questionIds: [
      '0b6d0a3e-6a55-4d4e-9d8f-1c2b3a4d5e6f',
      '1c7e1b4f-7b66-4e5f-8e90-2d3c4b5e6f70',
    ],
    startedAt: '2026-11-07T10:00:00.000Z',
  };

  it('accepts the practice page body (no mode)', async () => {
    await expect(validate(webBody)).resolves.toEqual(webBody);
  });

  it('accepts the exam page body (mode: exam)', async () => {
    await expect(validate({ ...webBody, mode: 'exam' })).resolves.toEqual({
      ...webBody,
      mode: 'exam',
    });
  });

  it('accepts an exam with no questions', async () => {
    await expect(
      validate({ ...webBody, totalQuestions: 0, questionIds: [] }),
    ).resolves.toBeInstanceOf(StartAttemptDto);
  });

  it('strips unknown fields', async () => {
    const result = await validate({ ...webBody, status: 'completed' });
    expect(result).not.toHaveProperty('status');
  });

  it.each([
    ['an empty body', {}],
    ['a missing examId', { examId: undefined }],
    ['a non-uuid examId', { examId: 'exam-1' }],
    ['a missing startedAt', { startedAt: undefined }],
    ['an invalid startedAt', { startedAt: 'yesterday' }],
    ['a missing examTitle', { examTitle: undefined }],
    ['a title over 255 characters', { examTitle: 'ก'.repeat(256) }],
    ['a missing category', { category: undefined }],
    ['a non-integer totalQuestions', { totalQuestions: 1.5 }],
    ['a negative totalQuestions', { totalQuestions: -1 }],
    ['non-string questionIds', { questionIds: [1, 2] }],
    ['an unknown mode', { mode: 'speedrun' }],
  ])('rejects %s with 400', async (_label, extra) => {
    const body =
      Object.keys(extra).length === 0 ? {} : { ...webBody, ...extra };
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AttemptsService stats count only completed attempts (BUG-12)', () => {
  let service: AttemptsService;
  let repo: { count: jest.Mock; createQueryBuilder: jest.Mock };

  // Every query run through createQueryBuilder, with the WHERE conditions
  // and parameters it had when it was executed.
  type RanQuery = { conditions: string[]; params: Record<string, unknown> };
  let ran: RanQuery[];

  type FakeQueryBuilder = Record<string, jest.Mock>;

  function fakeQueryBuilder(
    conditions: string[] = [],
    params: Record<string, unknown> = {},
  ): FakeQueryBuilder {
    const run = (result: unknown) => () => {
      ran.push({ conditions: [...conditions], params: { ...params } });
      return Promise.resolve(result);
    };
    const qb: FakeQueryBuilder = {
      where: jest.fn((cond: string, p: Record<string, unknown> = {}) => {
        conditions.splice(0, conditions.length, cond);
        Object.assign(params, p);
        return qb;
      }),
      andWhere: jest.fn((cond: string, p: Record<string, unknown> = {}) => {
        conditions.push(cond);
        Object.assign(params, p);
        return qb;
      }),
      select: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      groupBy: jest.fn(() => qb),
      clone: jest.fn(() => fakeQueryBuilder([...conditions], { ...params })),
      getCount: jest.fn(run(2)),
      getRawOne: jest.fn(run({ avg: '75', count: '1' })),
      getRawMany: jest.fn(run([])),
    };
    return qb;
  }

  beforeEach(async () => {
    ran = [];
    repo = {
      count: jest.fn().mockResolvedValue(4),
      createQueryBuilder: jest.fn(() => fakeQueryBuilder()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: getRepositoryToken(ExamAttempt), useValue: repo },
        { provide: getRepositoryToken(Exam), useValue: {} },
        openAccess(),
        answerLogs(),
      ],
    }).compile();

    service = module.get(AttemptsService);
  });

  const expectEveryQueryCompletedOnly = () => {
    expect(ran.length).toBeGreaterThan(0);
    for (const q of ran) {
      expect(q.conditions).toContain('attempt.status = :status');
      expect(q.params.status).toBe('completed');
    }
  };

  it('getMyStats filters by user and status completed in every query', async () => {
    const stats = await service.getMyStats('user-a');

    expect(ran).toHaveLength(3);
    expectEveryQueryCompletedOnly();
    for (const q of ran) {
      expect(q.conditions).toContain('attempt.userId = :userId');
      expect(q.params.userId).toBe('user-a');
    }
    expect(stats.totalAttempts).toBe(2);
    expect(stats.averageScore).toBe(75);
  });

  it('getExamAttemptStats filters by exam and status completed in every query', async () => {
    const stats = await service.getExamAttemptStats('exam-1');

    expect(ran).toHaveLength(3);
    expectEveryQueryCompletedOnly();
    for (const q of ran) {
      expect(q.conditions).toContain('attempt.examId = :examId');
      expect(q.params.examId).toBe('exam-1');
    }
    expect(stats.totalAttempts).toBe(2);
    expect(stats.uniqueUsers).toBe(1);
  });

  it('admin getStats counts and averages completed attempts only', async () => {
    const stats = await service.getStats();

    expect(repo.count).toHaveBeenCalledWith({
      where: { status: 'completed' },
    });
    expect(ran).toHaveLength(3);
    expectEveryQueryCompletedOnly();
    expect(stats.totalAttempts).toBe(4);
    expect(stats.averageScore).toBe(75);
  });
});
