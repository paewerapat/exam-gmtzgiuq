import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnswerLogsService } from './answer-logs.service';
import { QuestionAnswer } from './question-answer.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ChallengeAccessService } from '../question-bank/challenge-access.service';
import { PredictedAccessService } from '../predicted/predicted-access.service';

/** Task 22: answer logs of Predicted sets. */

describe('AnswerLogsService — Predicted sets (task 22)', () => {
  let service: AnswerLogsService;
  let insert: jest.Mock;
  let predictedExamIds: jest.Mock;

  const question = (id: string, examId = 'exam-1') => ({
    id,
    examId,
    status: QuestionStatus.PUBLISHED,
    type: 'multiple_choice',
    correctAnswer: null,
    isChallenge: false,
    choices: [
      { id: 'a', text: '1', isCorrect: true },
      { id: 'b', text: '2', isCorrect: false },
    ],
  });

  beforeEach(async () => {
    insert = jest.fn().mockResolvedValue(undefined);
    predictedExamIds = jest.fn().mockResolvedValue(new Set(['exam-p']));
    const answersRepo = {
      insert,
      createQueryBuilder: () => {
        const qb: Record<string, jest.Mock> = {};
        for (const m of ['select', 'where', 'andWhere']) {
          qb[m] = jest.fn(() => qb);
        }
        qb.getRawMany = jest.fn().mockResolvedValue([]);
        return qb;
      },
    };
    const em = {
      query: jest.fn((sql: string) =>
        Promise.resolve(sql.startsWith('SELECT @@') ? [{ t: 50 }] : []),
      ),
      getRepository: () => answersRepo,
    };

    const module = await Test.createTestingModule({
      providers: [
        AnswerLogsService,
        {
          provide: getRepositoryToken(QuestionAnswer),
          useValue: {
            ...answersRepo,
            manager: {
              transaction: jest.fn((cb: (e: unknown) => unknown) => cb(em)),
            },
          },
        },
        {
          provide: getRepositoryToken(Question),
          useValue: {
            find: jest.fn(({ where }: { where: { examId?: string } }) =>
              Promise.resolve(
                where.examId
                  ? ['q1', 'q2', 'q3'].map((id) => question(id))
                  : [question('qp', 'exam-p'), question('qn', 'exam-n')],
              ),
            ),
          },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            find: jest.fn().mockResolvedValue([
              { id: 'exam-p', status: 'published', isMock: false },
              { id: 'exam-n', status: 'published', isMock: false },
            ]),
          },
        },
        {
          provide: ExamAccessService,
          useValue: {
            getAccessMany: jest.fn(
              (_v: unknown, exams: { id: string }[]) =>
                new Map(
                  exams.map((e) => [
                    e.id,
                    { status: 'free', expiresAt: null, via: null },
                  ]),
                ),
            ),
          },
        },
        {
          provide: ChallengeAccessService,
          useValue: { unlockedQuestionIds: jest.fn() },
        },
        { provide: PredictedAccessService, useValue: { predictedExamIds } },
      ],
    }).compile();
    service = module.get(AnswerLogsService);
  });

  const rows = () =>
    (insert.mock.calls as unknown[][]).flatMap(
      (c) => c[0] as { questionId: string; mode: string }[],
    );

  it('logAttempt with questionIds logs only those (Preview), mode preview', async () => {
    await expect(
      service.logAttempt({
        attemptId: 'att-1',
        userId: 'user-1',
        examId: 'exam-1',
        mode: 'preview',
        answers: { q1: 'a', q2: 'b', q3: 'a' },
        timePerQuestion: {},
        questionIds: ['Q1', 'q2'],
      }),
    ).resolves.toBe(2);
    expect(rows().map((r) => [r.questionId, r.mode])).toEqual([
      ['q1', 'preview'],
      ['q2', 'preview'],
    ]);
  });

  it('logAttempt without questionIds: every answered question (as before)', async () => {
    await expect(
      service.logAttempt({
        attemptId: 'att-1',
        userId: 'user-1',
        examId: 'exam-1',
        mode: 'exam',
        answers: { q1: 'a', q2: 'b', q3: 'a' },
        timePerQuestion: {},
      }),
    ).resolves.toBe(3);
  });

  it('POST /answer-logs skips questions of a Predicted set', async () => {
    await expect(
      service.logPractice({ id: 'user-1' }, [
        { questionId: 'qp', selected: 'a', timeSpentSec: 3, mode: 'practice' },
        { questionId: 'qn', selected: 'a', timeSpentSec: 3, mode: 'practice' },
      ]),
    ).resolves.toEqual({ saved: 1 });
    expect(predictedExamIds).toHaveBeenCalledWith(['exam-p', 'exam-n']);
    expect(rows().map((r) => r.questionId)).toEqual(['qn']);
  });
});
