import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { AttemptsService } from './attempts.service';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessType } from '../exams/exam-mock';
import { ExamAccess } from '../exam-access/exam-access.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ProAccessService } from '../pro/pro-access.service';
import { StartAttemptDto, SubmitAttemptInput } from './dto/attempt.dto';
import { User } from '../users/user.entity';
import { AnswerLogsService } from '../answer-logs/answer-logs.service';

/**
 * Task 15: start / progress / complete / legacy submit of a locked Mock
 * Exam (code/purchase) need access that has not expired; with the real
 * ExamAccessService on mocked tables.
 */
describe('AttemptsService — locked Mock Exams (task 15)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const exams: Record<string, Partial<Exam>> = {
    'code-exam': {
      id: 'code-exam',
      isMock: true,
      accessType: ExamAccessType.CODE,
    },
    'buy-exam': {
      id: 'buy-exam',
      isMock: true,
      accessType: ExamAccessType.PURCHASE,
    },
    'free-mock': {
      id: 'free-mock',
      isMock: true,
      accessType: ExamAccessType.FREE,
    },
    normal: { id: 'normal', isMock: false, accessType: ExamAccessType.FREE },
  };

  let service: AttemptsService;
  let grants: Partial<ExamAccess>[];
  let attempt: Partial<ExamAttempt>;
  let writes: jest.Mock;

  const student = { id: 'user-a', role: 'user' } as User;
  const admin = { id: 'user-a', role: 'admin' } as User;

  beforeEach(async () => {
    grants = [];
    attempt = {
      id: 'att-1',
      userId: 'user-a',
      examId: 'code-exam',
      status: 'in_progress',
      answers: {},
      currentIndex: 0,
    };
    writes = jest.fn().mockResolvedValue({ affected: 1 });

    const repo = {
      find: jest.fn().mockResolvedValue([]),
      update: writes,
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: object) => {
        writes(d);
        return Promise.resolve({ ...d, id: 'att-new' });
      }),
    };
    const em = {
      getRepository: () => repo,
      query: jest.fn((sql: string) =>
        Promise.resolve(sql.startsWith('SELECT @@') ? [{ t: 50 }] : []),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttemptsService,
        ExamAccessService,
        // No Pro plans (task 17): purchase exams only by grants here
        {
          provide: ProAccessService,
          useValue: {
            getMockPurchaseAccess: () => Promise.resolve(new Map()),
          },
        },
        // Answer log (task 16) tested in answer-logs
        {
          provide: AnswerLogsService,
          useValue: { logAttempt: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: {
            findOne: jest.fn(() => Promise.resolve({ ...attempt })),
            findOneOrFail: jest.fn(() =>
              Promise.resolve({ ...attempt, id: 'att-new' }),
            ),
            update: writes,
            create: jest.fn((d: unknown) => d),
            save: repo.save,
            manager: {
              transaction: jest.fn((cb: (e: unknown) => unknown) => cb(em)),
            },
          },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            exists: jest.fn(({ where }: { where: { id: string } }) =>
              Promise.resolve(!!exams[where.id]),
            ),
            findOne: jest.fn(({ where }: { where: { id: string } }) =>
              Promise.resolve(exams[where.id] ?? null),
            ),
          },
        },
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: {
            find: jest.fn(({ where }: { where: Record<string, unknown>[] }) =>
              Promise.resolve(
                grants.filter((g) =>
                  where.some(
                    (w) =>
                      g.userId === w.userId &&
                      (w.allMock
                        ? g.allMock
                        : (
                            (w.examId as FindOperator<string[]>)
                              .value as unknown as string[]
                          ).includes(g.examId as string)),
                  ),
                ),
              ),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AttemptsService);
  });

  const startData = (examId: string): StartAttemptDto => ({
    examId,
    examTitle: 'Mock',
    category: 'tgat',
    totalQuestions: 2,
    questionIds: ['q1', 'q2'],
    startedAt: '2026-11-10T05:00:00.000Z',
  });

  const submitData = (examId: string): SubmitAttemptInput => ({
    examId,
    examTitle: 'Mock',
    category: 'tgat',
    totalQuestions: 2,
    correctAnswers: 1,
    incorrectAnswers: 1,
    unanswered: 0,
    score: 50,
    totalTime: 30,
    timePerQuestion: { q1: 15, q2: 15 },
    answers: { q1: 'a', q2: 'b' },
    questionIds: ['q1', 'q2'],
    startedAt: '2026-11-10T05:00:00.000Z',
  });

  const progress = {
    currentIndex: 1,
    answers: { q1: 'a' },
    timePerQuestion: { q1: 5 },
  };

  /** Each endpoint as the given user on the given exam. */
  const calls = {
    start: (user: User, examId: string) =>
      service.startInProgress(user.id, startData(examId), user),
    progress: (user: User, examId: string) => {
      attempt.examId = examId;
      return service.updateProgress('att-1', user.id, progress, user);
    },
    complete: (user: User, examId: string) => {
      attempt.examId = examId;
      return service.completeAttempt(
        'att-1',
        user.id,
        submitData(examId),
        user,
      );
    },
    submit: (user: User, examId: string) =>
      service.submit(submitData(examId), user),
  };

  async function expectLocked(promise: Promise<unknown>) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      message: 'ชุดข้อสอบนี้ต้อง Unlock ก่อน',
      errorCode: 'EXAM_LOCKED',
    });
  }

  describe.each(Object.keys(calls) as (keyof typeof calls)[])('%s', (name) => {
    const run = (user: User, examId: string) => calls[name](user, examId);

    it('locked exam without access → 403 EXAM_LOCKED, nothing written', async () => {
      await expectLocked(run(student, 'code-exam'));
      await expectLocked(run(student, 'buy-exam'));
      expect(writes).not.toHaveBeenCalled();
    });

    it('access that expired → 403 (start/continue/submit blocked)', async () => {
      grants.push({
        userId: 'user-a',
        examId: 'code-exam',
        allMock: false,
        expiresAt: new Date(Date.now() - DAY),
      });
      await expectLocked(run(student, 'code-exam'));
      expect(writes).not.toHaveBeenCalled();
    });

    it('access of another account does not count', async () => {
      grants.push({
        userId: 'user-b',
        examId: 'code-exam',
        allMock: false,
        expiresAt: new Date(Date.now() + DAY),
      });
      await expectLocked(run(student, 'code-exam'));
    });

    it('active access (per exam or all Mock) → allowed', async () => {
      grants.push({
        userId: 'user-a',
        examId: 'code-exam',
        allMock: false,
        expiresAt: new Date(Date.now() + DAY),
      });
      await run(student, 'code-exam');
      grants.length = 0;
      grants.push({
        userId: 'user-a',
        examId: null,
        allMock: true,
        expiresAt: new Date(Date.now() + DAY),
      });
      await run(student, 'buy-exam');
      expect(writes).toHaveBeenCalled();
    });

    it('admin → allowed without access', async () => {
      await run(admin, 'code-exam');
    });

    it('free Mock and normal exams → allowed as before', async () => {
      await run(student, 'free-mock');
      await run(student, 'normal');
    });
  });

  it('progress of an attempt that is no longer in progress is still ignored (no lock check needed)', async () => {
    attempt.status = 'completed';
    await expect(
      service.updateProgress('att-1', 'user-a', progress, student),
    ).resolves.toBeUndefined();
    expect(writes).not.toHaveBeenCalled();
  });
});
