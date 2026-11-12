import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { AnswerLogsService, clampSeconds } from './answer-logs.service';
import { QuestionAnswer } from './question-answer.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessType } from '../exams/exam-mock';
import { ExamAccess } from '../exam-access/exam-access.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { UserRole } from '../users/user.entity';
import { AnswerLogItemDto } from './dto/answer-log.dto';

type Row = Partial<QuestionAnswer>;

const mc = (
  id: string,
  examId: string | null,
  correct: string[],
  status = QuestionStatus.PUBLISHED,
) =>
  ({
    id,
    examId,
    status,
    type: 'multiple_choice',
    correctAnswer: null,
    choices: ['a', 'b', 'c', 'd'].map((c) => ({
      id: c,
      text: c,
      isCorrect: correct.includes(c),
    })),
  }) as unknown as Question;

const short = (id: string, examId: string, answer: string) =>
  ({
    id,
    examId,
    status: QuestionStatus.PUBLISHED,
    type: 'short_answer',
    correctAnswer: answer,
    choices: [],
  }) as unknown as Question;

describe('AnswerLogsService (task 16)', () => {
  let service: AnswerLogsService;
  let questions: Question[];
  let exams: Partial<Exam>[];
  let grants: Partial<ExamAccess>[];
  // Rows already in question_answers (for isFirstAttempt)
  let stored: Row[];
  let inserted: Row[][];
  let insert: jest.Mock;
  let findQuestions: jest.Mock;
  let transaction: jest.Mock;
  let userLocks: Map<string, Promise<void>>;
  // "<isolation>|<sql>|<userId>" of every user lock taken
  let lockedUsers: string[];
  // innodb_lock_wait_timeout statements and "lock", in order
  let sessionSql: string[];
  // Next N user locks fail with a lock wait timeout (1205)
  let lockWaitTimeouts: number;

  // Lets other pending requests run, like a round trip to MySQL
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

  const values = (op: unknown): string[] =>
    (op as FindOperator<string[]>).value as unknown as string[];

  beforeEach(async () => {
    questions = [
      mc('q1', 'exam-1', ['b']),
      mc('q2', 'exam-1', ['b', 'c']),
      short('q3', 'exam-1', '\\frac{1}{2}'),
      mc('q-other', 'exam-2', ['a']),
      mc('q-locked', 'exam-locked', ['a']),
      mc('q-draft', 'exam-draft', ['a']),
      mc('q-loose', null, ['a']),
      mc('q-loose-draft', null, ['a'], QuestionStatus.DRAFT),
    ];
    exams = [
      { id: 'exam-1', status: QuestionStatus.PUBLISHED, isMock: false },
      { id: 'exam-2', status: QuestionStatus.PUBLISHED, isMock: false },
      {
        id: 'exam-locked',
        status: QuestionStatus.PUBLISHED,
        isMock: true,
        accessType: ExamAccessType.CODE,
      },
      { id: 'exam-draft', status: QuestionStatus.DRAFT, isMock: false },
    ];
    grants = [];
    stored = [];
    inserted = [];

    findQuestions = jest.fn(
      ({ where }: { where: { id: unknown; examId?: string } }) =>
        Promise.resolve(
          questions.filter(
            (q) =>
              (where.id === undefined || values(where.id).includes(q.id)) &&
              (where.examId === undefined || q.examId === where.examId),
          ),
        ),
    );
    insert = jest.fn(async (rows: Row[]) => {
      await tick();
      inserted.push(rows);
      stored.push(...rows);
      return {};
    });

    // MySQL row lock on users.id: SELECT ... FOR UPDATE waits until the
    // transaction holding that user's lock has finished
    userLocks = new Map();
    lockedUsers = [];
    sessionSql = [];
    lockWaitTimeouts = 0;
    transaction = jest.fn(async (...args: [string, unknown] | [unknown]) => {
      // transaction(cb) or transaction(isolationLevel, cb)
      const isolation = args.length > 1 ? String(args[0]) : 'default';
      const cb = args[args.length - 1] as (em: unknown) => Promise<unknown>;
      let release = () => {};
      const em = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.startsWith('SELECT @@SESSION.innodb_lock_wait_timeout')) {
            sessionSql.push(sql);
            return [{ t: 50 }];
          }
          if (sql.startsWith('SET SESSION')) {
            sessionSql.push(`${sql} ${JSON.stringify(params)}`);
            return [];
          }
          const userId = String(params[0]);
          lockedUsers.push(`${isolation}|${sql}|${userId}`);
          sessionSql.push('lock');
          if (lockWaitTimeouts > 0) {
            lockWaitTimeouts--;
            throw Object.assign(new Error('Lock wait timeout exceeded'), {
              code: 'ER_LOCK_WAIT_TIMEOUT',
              errno: 1205,
            });
          }
          const previous = userLocks.get(userId) ?? Promise.resolve();
          const mine = new Promise<void>((resolve) => (release = resolve));
          userLocks.set(
            userId,
            previous.then(() => mine),
          );
          await previous;
          return [];
        }),
        getRepository: () => answersRepo,
      };
      try {
        return await cb(em);
      } finally {
        release();
      }
    });

    // SELECT DISTINCT questionId ... WHERE userId AND questionId IN (...)
    type FakeQueryBuilder = Record<
      'select' | 'where' | 'andWhere' | 'getRawMany',
      jest.Mock
    >;
    const createQueryBuilder = jest.fn(() => {
      const params: Record<string, unknown> = {};
      const qb: FakeQueryBuilder = {
        select: jest.fn(() => qb),
        where: jest.fn((_: string, p: object) => {
          Object.assign(params, p);
          return qb;
        }),
        andWhere: jest.fn((_: string, p: object) => {
          Object.assign(params, p);
          return qb;
        }),
        getRawMany: jest.fn(async () =>
          tick().then(() =>
            [
              ...new Set(
                stored
                  .filter(
                    (r) =>
                      r.userId === params.userId &&
                      (params.questionIds as string[]).includes(r.questionId!),
                  )
                  .map((r) => r.questionId),
              ),
            ].map((questionId) => ({ questionId })),
          ),
        ),
      };
      return qb;
    });
    const answersRepo = {
      insert,
      createQueryBuilder,
      manager: { transaction },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnswerLogsService,
        {
          provide: getRepositoryToken(QuestionAnswer),
          useValue: answersRepo,
        },
        {
          provide: getRepositoryToken(Question),
          useValue: { find: findQuestions },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            find: jest.fn(({ where }: { where: { id: unknown } }) =>
              Promise.resolve(
                exams.filter((e) => values(where.id).includes(e.id!)),
              ),
            ),
          },
        },
        // Real access rules (task 15) on a mocked exam_access table
        ExamAccessService,
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: {
            find: jest.fn(
              ({ where }: { where: { userId: string; examId?: unknown }[] }) =>
                Promise.resolve(
                  grants.filter((g) => g.userId === where[0].userId),
                ),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AnswerLogsService);
  });

  const allRows = () => inserted.flat();

  describe('logAttempt (PATCH /attempts/:id/complete, POST /attempts)', () => {
    const attempt = (extra: Record<string, unknown> = {}) => ({
      attemptId: 'att-1',
      userId: 'user-a',
      examId: 'exam-1',
      mode: 'exam',
      answers: { q1: 'b', q2: 'c,b', q3: ' 0.5 ' },
      timePerQuestion: { q1: 12, q2: 30, q3: 7 },
      ...extra,
    });

    it('AC5 one row per answered question with mode/attempt/exam, graded by the server', async () => {
      await expect(service.logAttempt(attempt())).resolves.toBe(3);

      expect(inserted).toHaveLength(1);
      expect(allRows()).toEqual([
        {
          questionId: 'q1',
          selected: 'b',
          isCorrect: true,
          examId: 'exam-1',
          attemptId: 'att-1',
          mode: 'exam',
          timeSpentSec: 12,
          userId: 'user-a',
          isFirstAttempt: true,
        },
        expect.objectContaining({
          questionId: 'q2',
          selected: 'c,b',
          isCorrect: true,
          timeSpentSec: 30,
        }),
        expect.objectContaining({
          questionId: 'q3',
          selected: ' 0.5 ',
          isCorrect: true,
          timeSpentSec: 7,
        }),
      ]);
    });

    it('grades wrong answers as incorrect', async () => {
      await service.logAttempt(
        attempt({ answers: { q1: 'a', q2: 'b', q3: '1/3' } }),
      );
      expect(allRows().map((r) => r.isCorrect)).toEqual([false, false, false]);
    });

    it('skips unanswered questions ("", spaces, "," and non-strings)', async () => {
      await service.logAttempt(
        attempt({ answers: { q1: '', q2: ',', q3: '   ' } }),
      );
      await service.logAttempt(
        attempt({ answers: { q1: null, q2: 3, q3: ['a'] } }),
      );
      expect(insert).not.toHaveBeenCalled();
    });

    it('skips ids that are not questions of the attempt exam', async () => {
      await service.logAttempt(
        attempt({ answers: { q1: 'b', 'q-other': 'a', missing: 'a' } }),
      );

      // the exam's questions by examId only (no IN list from the client keys)
      expect(findQuestions).toHaveBeenCalledWith(
        expect.objectContaining({ where: { examId: 'exam-1' } }),
      );
      expect(allRows().map((r) => r.questionId)).toEqual(['q1']);
    });

    it('a huge answers object never reaches the query', async () => {
      const answers: Record<string, string> = { q2: 'b,c' };
      for (let i = 0; i < 50000; i++) answers[`junk-${i}`] = 'a';

      await expect(service.logAttempt(attempt({ answers }))).resolves.toBe(1);
      expect(findQuestions).toHaveBeenCalledTimes(1);
      expect(
        (findQuestions.mock.calls[0] as [{ where: object }])[0].where,
      ).toEqual({ examId: 'exam-1' });
    });

    it('ignores inherited keys of the answers object', async () => {
      const answers = Object.create({ q1: 'b' }) as Record<string, string>;
      await expect(service.logAttempt(attempt({ answers }))).resolves.toBe(0);
    });

    it('skips an answer over 500 characters', async () => {
      await service.logAttempt(
        attempt({ answers: { q1: 'b', q3: '1'.repeat(501) } }),
      );
      expect(allRows().map((r) => r.questionId)).toEqual(['q1']);
    });

    it('AC6 mode from the attempt (practice); unknown mode → practice', async () => {
      await service.logAttempt(attempt({ mode: 'practice' }));
      await service.logAttempt(attempt({ attemptId: 'att-2', mode: 'weird' }));
      expect(allRows().map((r) => r.mode)).toEqual([
        'practice',
        'practice',
        'practice',
        'practice',
        'practice',
        'practice',
      ]);
    });

    it('time: missing → 0, clamped to 0–86400, rounded', async () => {
      await service.logAttempt(
        attempt({ timePerQuestion: { q1: 999999, q2: -4 } }),
      );
      await service.logAttempt(
        attempt({ attemptId: 'att-2', timePerQuestion: null }),
      );
      expect(allRows().map((r) => r.timeSpentSec)).toEqual([
        86400, 0, 0, 0, 0, 0,
      ]);
      expect(clampSeconds(12.6)).toBe(13);
      expect(clampSeconds('30')).toBe(30);
      expect(clampSeconds(NaN)).toBe(0);
      expect(clampSeconds(Infinity)).toBe(0);
    });

    it('AC7 the second round of the same questions is not a first attempt', async () => {
      await service.logAttempt(attempt({ answers: { q1: 'b' } }));
      await service.logAttempt(
        attempt({ attemptId: 'att-2', answers: { q1: 'a', q2: 'b' } }),
      );

      expect(inserted[0].map((r) => r.isFirstAttempt)).toEqual([true]);
      expect(inserted[1].map((r) => [r.questionId, r.isFirstAttempt])).toEqual([
        ['q1', false],
        ['q2', true],
      ]);
    });

    it("another user's earlier answers do not count", async () => {
      stored.push({ userId: 'user-b', questionId: 'q1' });
      await service.logAttempt(attempt({ answers: { q1: 'b' } }));
      expect(allRows()[0].isFirstAttempt).toBe(true);
    });

    it('nothing to log without an exam id (exam deleted) or user', async () => {
      await expect(service.logAttempt(attempt({ examId: null }))).resolves.toBe(
        0,
      );
      await expect(service.logAttempt(attempt({ userId: '' }))).resolves.toBe(
        0,
      );
      expect(findQuestions).not.toHaveBeenCalled();
    });

    it.each([
      ['reading the questions', 'find'],
      ['the insert', 'insert'],
    ])(
      'never throws when %s fails (the submit must not fail)',
      async (_, step) => {
        const logError = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        if (step === 'find') {
          findQuestions.mockRejectedValueOnce(new Error('DB down'));
        } else {
          insert.mockRejectedValueOnce(
            new Error("Table 'question_answers' doesn't exist"),
          );
        }

        await expect(service.logAttempt(attempt())).resolves.toBe(0);
        expect(logError).toHaveBeenCalledWith(
          expect.stringContaining('att-1'),
          expect.any(String),
        );
        logError.mockRestore();
      },
    );
  });

  describe('logPractice (POST /answer-logs)', () => {
    const user = { id: 'user-a', role: UserRole.USER };
    const item = (
      questionId: string,
      selected: string,
      timeSpentSec = 5,
    ): AnswerLogItemDto => ({
      questionId,
      selected,
      timeSpentSec,
      mode: 'practice',
    });

    it('AC9 stores practice rows without an attempt; examId and isCorrect from the server', async () => {
      await expect(
        service.logPractice(user, [item('q1', 'b'), item('q-other', 'b', 9)]),
      ).resolves.toEqual({ saved: 2 });

      expect(allRows()).toEqual([
        {
          questionId: 'q1',
          selected: 'b',
          isCorrect: true,
          examId: 'exam-1',
          attemptId: null,
          mode: 'practice',
          timeSpentSec: 5,
          userId: 'user-a',
          isFirstAttempt: true,
        },
        expect.objectContaining({
          questionId: 'q-other',
          examId: 'exam-2',
          isCorrect: false,
          timeSpentSec: 9,
        }),
      ]);
    });

    it('AC10 skips unknown questions and counts only saved rows', async () => {
      await expect(
        service.logPractice(user, [
          item('11111111-1111-4111-8111-111111111111', 'a'),
          item('q1', 'b'),
        ]),
      ).resolves.toEqual({ saved: 1 });
    });

    it('skips questions of a draft exam and draft questions without an exam', async () => {
      await expect(
        service.logPractice(user, [
          item('q-draft', 'a'),
          item('q-loose-draft', 'a'),
          item('q-loose', 'a'),
        ]),
      ).resolves.toEqual({ saved: 1 });
      expect(allRows()).toEqual([
        expect.objectContaining({ questionId: 'q-loose', examId: null }),
      ]);
    });

    it('AC10 skips a question of a locked Mock Exam the user cannot take', async () => {
      await expect(
        service.logPractice(user, [item('q-locked', 'a')]),
      ).resolves.toEqual({ saved: 0 });
      expect(insert).not.toHaveBeenCalled();
    });

    it('logs it when the user has access, or is an admin', async () => {
      await expect(
        service.logPractice({ id: 'admin-1', role: UserRole.ADMIN }, [
          item('q-locked', 'a'),
        ]),
      ).resolves.toEqual({ saved: 1 });

      grants.push({
        userId: 'user-a',
        examId: 'exam-locked',
        allMock: false,
        expiresAt: null,
      });
      await expect(
        service.logPractice(user, [item('q-locked', 'a')]),
      ).resolves.toEqual({ saved: 1 });
    });

    it('skips it when the access has expired', async () => {
      grants.push({
        userId: 'user-a',
        examId: 'exam-locked',
        allMock: false,
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      });
      await expect(
        service.logPractice(user, [item('q-locked', 'a')]),
      ).resolves.toEqual({ saved: 0 });
    });

    it('a question sent twice is a first attempt once', async () => {
      await service.logPractice(user, [item('q1', 'a'), item('q1', 'b')]);
      expect(allRows().map((r) => [r.isCorrect, r.isFirstAttempt])).toEqual([
        [false, true],
        [true, false],
      ]);
    });

    it('skips "," / blank answers and clamps the time', async () => {
      await expect(
        service.logPractice(user, [
          item('q1', ','),
          item('q2', '  '),
          item('q3', '0.5', 100000),
        ]),
      ).resolves.toEqual({ saved: 1 });
      expect(allRows()[0]).toMatchObject({
        questionId: 'q3',
        isCorrect: true,
        timeSpentSec: 86400,
      });
    });

    it('nothing allowed → no insert', async () => {
      await expect(
        service.logPractice(user, [item('missing', 'a')]),
      ).resolves.toEqual({ saved: 0 });
      expect(insert).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('isFirstAttempt under concurrency (round 2)', () => {
    const user = { id: 'user-a', role: UserRole.USER };
    const item = (questionId: string, selected = 'b'): AnswerLogItemDto => ({
      questionId,
      selected,
      timeSpentSec: 5,
      mode: 'practice',
    });

    it('locks the user row first in a default-isolation transaction (no READ COMMITTED: 1665 with statement binlog)', async () => {
      await service.logPractice(user, [item('q1')]);

      expect(transaction).toHaveBeenCalledTimes(1);
      // transaction(cb): no isolation level argument
      expect((transaction.mock.calls[0] as unknown[]).length).toBe(1);
      expect(lockedUsers).toEqual([
        'default|SELECT id FROM users WHERE id = ? FOR UPDATE|user-a',
      ]);
    });

    it('bounds the lock wait to 5 s and restores the previous value after the insert', async () => {
      await service.logPractice(user, [item('q1')]);

      expect(sessionSql).toEqual([
        'SELECT @@SESSION.innodb_lock_wait_timeout AS t',
        'SET SESSION innodb_lock_wait_timeout = 5 []',
        'lock',
        'SET SESSION innodb_lock_wait_timeout = ? [50]',
      ]);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('a lock wait timeout (1205) on the user still logs (without the lock) and restores the timeout', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      lockWaitTimeouts = 2;

      await expect(
        service.logAttempt({
          attemptId: 'att-1',
          userId: 'user-a',
          examId: 'exam-1',
          mode: 'exam',
          answers: { q1: 'b' },
          timePerQuestion: {},
        }),
      ).resolves.toBe(1);
      await expect(service.logPractice(user, [item('q2')])).resolves.toEqual({
        saved: 1,
      });

      expect(warn).toHaveBeenCalledTimes(2);
      expect(sessionSql.at(-1)).toBe(
        'SET SESSION innodb_lock_wait_timeout = ? [50]',
      );
      warn.mockRestore();
    });

    it('a lock wait timeout on the insert never fails a submit; the timeout is restored', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      insert.mockRejectedValueOnce(
        Object.assign(new Error('Lock wait timeout exceeded'), {
          code: 'ER_LOCK_WAIT_TIMEOUT',
          errno: 1205,
        }),
      );

      await expect(
        service.logAttempt({
          attemptId: 'att-1',
          userId: 'user-a',
          examId: 'exam-1',
          mode: 'exam',
          answers: { q1: 'b' },
          timePerQuestion: {},
        }),
      ).resolves.toBe(0);
      expect(transaction).toHaveBeenCalledTimes(1); // not a deadlock: no retry
      expect(sessionSql.at(-1)).toBe(
        'SET SESSION innodb_lock_wait_timeout = ? [50]',
      );
      logError.mockRestore();
    });

    it('10 parallel requests for the same new question → exactly one first attempt', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          service.logPractice(user, [item('q1')]),
        ),
      );

      expect(results.every((r) => r.saved === 1)).toBe(true);
      expect(allRows().filter((r) => r.isFirstAttempt)).toHaveLength(1);
      expect(allRows()).toHaveLength(10);
    });

    it('a submit and a practice log at the same time → one first attempt per question', async () => {
      await Promise.all([
        service.logAttempt({
          attemptId: 'att-1',
          userId: 'user-a',
          examId: 'exam-1',
          mode: 'exam',
          answers: { q1: 'b', q2: 'b' },
          timePerQuestion: {},
        }),
        service.logPractice(user, [item('q1'), item('q2')]),
        service.logPractice(user, [item('q2'), item('q1')]),
      ]);

      for (const id of ['q1', 'q2']) {
        expect(
          allRows().filter((r) => r.questionId === id && r.isFirstAttempt),
        ).toHaveLength(1);
      }
    });

    it('different users do not wait for each other and each gets a first attempt', async () => {
      await Promise.all([
        service.logPractice(user, [item('q1')]),
        service.logPractice({ id: 'user-b', role: UserRole.USER }, [
          item('q1'),
        ]),
      ]);
      expect(
        allRows()
          .filter((r) => r.isFirstAttempt)
          .map((r) => r.userId)
          .sort(),
      ).toEqual(['user-a', 'user-b']);
    });

    const deadlock = () =>
      Object.assign(new Error('Deadlock found when trying to get lock'), {
        code: 'ER_LOCK_DEADLOCK',
        errno: 1213,
      });

    it('retries a deadlock victim', async () => {
      insert.mockRejectedValueOnce(deadlock());

      await expect(service.logPractice(user, [item('q1')])).resolves.toEqual({
        saved: 1,
      });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(allRows()).toEqual([
        expect.objectContaining({ questionId: 'q1', isFirstAttempt: true }),
      ]);
    });

    it('gives up after 3 deadlocks (practice → error; a submit still never fails)', async () => {
      insert.mockRejectedValue(deadlock());
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(service.logPractice(user, [item('q1')])).rejects.toThrow(
        'Deadlock',
      );
      expect(transaction).toHaveBeenCalledTimes(3);
      await expect(
        service.logAttempt({
          attemptId: 'att-1',
          userId: 'user-a',
          examId: 'exam-1',
          mode: 'exam',
          answers: { q1: 'b' },
          timePerQuestion: {},
        }),
      ).resolves.toBe(0);
      logError.mockRestore();
    });

    it('does not retry other errors', async () => {
      insert.mockRejectedValueOnce(new Error('Data too long'));
      await expect(service.logPractice(user, [item('q1')])).rejects.toThrow(
        'Data too long',
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    });
  });
});
