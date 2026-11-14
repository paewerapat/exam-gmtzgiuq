import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuestionsService } from './questions.service';
import { QuestionsResolver } from './questions.resolver';
import { Question, QuestionStatus } from './question.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessType } from '../exams/exam-mock';
import { UploadService } from '../upload/upload.service';

/**
 * Task 15: public question lists never include questions of a locked Mock
 * Exam (code/purchase), whoever asks; admin lists still do.
 */
describe('QuestionsService — locked Mock Exams (task 15)', () => {
  let service: QuestionsService;
  let resolver: QuestionsResolver;
  let qb: Record<string, jest.Mock>;
  let question: Partial<Question> | null;
  let exam: Partial<Exam> | null;
  let examFindOne: jest.Mock;

  beforeEach(async () => {
    qb = {};
    for (const m of [
      'innerJoin',
      'leftJoin',
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getMany = jest.fn().mockResolvedValue([]);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    question = { id: 'q1', status: QuestionStatus.PUBLISHED, examId: 'exam-1' };
    exam = { id: 'exam-1', isMock: true, accessType: ExamAccessType.CODE };
    examFindOne = jest.fn(() => Promise.resolve(exam));

    const module = await Test.createTestingModule({
      providers: [
        QuestionsService,
        QuestionsResolver,
        {
          provide: getRepositoryToken(Question),
          useValue: {
            createQueryBuilder: jest.fn(() => qb),
            findOne: jest.fn(() => Promise.resolve(question)),
          },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: examFindOne,
          },
        },
        { provide: UploadService, useValue: {} },
      ],
    }).compile();

    service = module.get(QuestionsService);
    resolver = module.get(QuestionsResolver);
  });

  const lockCondition = [
    '(lockExam.id IS NULL OR lockExam.isMock = :lockIsMock OR lockExam.accessType NOT IN (:...lockedTypes))',
    { lockIsMock: false, lockedTypes: ['code', 'purchase'] },
  ];

  it('GET /questions and GraphQL questions leave out questions of locked exams', async () => {
    await service.findPublished(1, 10);
    expect(qb.leftJoin).toHaveBeenCalledWith('question.exam', 'lockExam');
    expect(qb.andWhere).toHaveBeenCalledWith(...lockCondition);

    qb.andWhere.mockClear();
    await resolver.questions(1, 10);
    expect(qb.andWhere).toHaveBeenCalledWith(...lockCondition);
  });

  it('admin lists (REST admin/all, GraphQL adminQuestions) are unchanged', async () => {
    await service.findAll(1, 10);
    await resolver.adminQuestions(1, 10);
    expect(qb.leftJoin).not.toHaveBeenCalled();
    expect(JSON.stringify(qb.andWhere.mock.calls)).not.toContain('lockExam');
  });

  it('topic/subject practice: no Mock Exam questions at all (task 11 rule covers locked ones)', async () => {
    await service.findByTopic('t1');
    await service.findBySubject('s1');
    expect(qb.andWhere).toHaveBeenCalledWith('exam.isMock = :isMock', {
      isMock: false,
    });
    expect(
      (qb.andWhere.mock.calls as unknown[][]).filter(
        (c) => c[0] === 'exam.isMock = :isMock',
      ),
    ).toHaveLength(2);
  });

  it('task 20: GET /questions / GraphQL questions leave out bankOnly exams and Challenge questions', async () => {
    await service.findPublished(1, 10);
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(lockExam.id IS NULL OR lockExam.bankOnly = :lockBankOnly)',
      { lockBankOnly: false },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'question.isChallenge = :lockIsChallenge',
      { lockIsChallenge: false },
    );
  });

  it('task 20 AC6: topic/subject practice never serves Challenge questions', async () => {
    await service.findByTopic('t1');
    await service.findBySubject('s1');
    expect(
      (qb.andWhere.mock.calls as unknown[][]).filter(
        (c) =>
          c[0] === 'q.isChallenge = :isChallenge' &&
          (c[1] as { isChallenge: boolean }).isChallenge === false,
      ),
    ).toHaveLength(2);
  });

  describe('page/limit are clamped (used to be a 500)', () => {
    it.each([
      ['0 / 0', 0, 0, 0, 10, 1],
      ['negative', -3, -5, 0, 10, 1],
      ['NaN (REST "abc")', NaN, NaN, 0, 10, 1],
      ['fractions', 2.7, 5.9, 5, 5, 2],
      ['over the max', 3, 1000, 200, 100, 3],
    ])(
      'GET /questions %s → skip %#',
      async (_label, page, limit, skip, take, outPage) => {
        const result = await service.findPublished(page, limit);
        expect(qb.skip).toHaveBeenCalledWith(skip);
        expect(qb.take).toHaveBeenCalledWith(take);
        expect(result).toMatchObject({ page: outPage, limit: take });
      },
    );

    it('GraphQL questions with negative args is clamped the same way', async () => {
      await resolver.questions(-1, -10);
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('admin lists keep large limits (no max) but never go below 1', async () => {
      await service.findAll(1, 1000);
      expect(qb.take).toHaveBeenLastCalledWith(1000);
      await resolver.adminQuestions(0, -1);
      expect(qb.skip).toHaveBeenLastCalledWith(0);
      expect(qb.take).toHaveBeenLastCalledWith(10);
    });
  });

  describe('GraphQL question(id)', () => {
    it('a question of a locked exam (code or purchase) is not found', async () => {
      await expect(resolver.question('q1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      exam = {
        id: 'exam-1',
        isMock: true,
        accessType: ExamAccessType.PURCHASE,
      };
      await expect(service.findPublishedOne('q1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(examFindOne).toHaveBeenCalledWith({
        select: { id: true, isMock: true, accessType: true, bankOnly: true },
        where: { id: 'exam-1' },
        loadEagerRelations: false,
      });
    });

    it('task 20: a Challenge question or a question of a bankOnly exam is not found', async () => {
      exam = { id: 'exam-1', isMock: false, bankOnly: true };
      await expect(resolver.question('q1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      exam = { id: 'exam-1', isMock: false, bankOnly: false };
      question = { ...question, isChallenge: true };
      await expect(resolver.question('q1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('questions of free Mock / normal exams, or without an exam, are returned', async () => {
      exam = { id: 'exam-1', isMock: true, accessType: ExamAccessType.FREE };
      await expect(resolver.question('q1')).resolves.toBe(question);
      exam = { id: 'exam-1', isMock: false, accessType: ExamAccessType.CODE };
      await expect(resolver.question('q1')).resolves.toBe(question);
      question = {
        id: 'q2',
        status: QuestionStatus.PUBLISHED,
        examId: null as unknown as string,
      };
      examFindOne.mockClear();
      await expect(resolver.question('q2')).resolves.toBe(question);
      expect(examFindOne).not.toHaveBeenCalled();
    });

    it('adminQuestion(id) still returns it', async () => {
      await expect(resolver.adminQuestion('q1')).resolves.toBe(question);
    });
  });
});
