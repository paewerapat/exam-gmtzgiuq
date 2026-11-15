import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuestionsService } from './questions.service';
import { QuestionsResolver } from './questions.resolver';
import { Question, QuestionStatus } from './question.entity';
import { Exam } from '../exams/exam.entity';
import { UploadService } from '../upload/upload.service';
import { PredictedSet } from '../predicted/predicted-set.entity';

/** Task 22 AC3: questions of Predicted sets stay out of the public lists. */

describe('QuestionsService — Predicted sets (task 22)', () => {
  let service: QuestionsService;
  let resolver: QuestionsResolver;
  let qb: Record<string, jest.Mock>;
  let predictedExists: jest.Mock;

  beforeEach(async () => {
    qb = {};
    for (const m of [
      'leftJoinAndSelect',
      'leftJoin',
      'innerJoin',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getMany = jest.fn().mockResolvedValue([]);
    predictedExists = jest.fn().mockResolvedValue(true);

    const module = await Test.createTestingModule({
      providers: [
        QuestionsService,
        QuestionsResolver,
        {
          provide: getRepositoryToken(Question),
          useValue: {
            createQueryBuilder: jest.fn(() => qb),
            findOne: jest.fn().mockResolvedValue({
              id: 'q1',
              status: QuestionStatus.PUBLISHED,
              examId: 'exam-p',
              isChallenge: false,
            }),
          },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({
              id: 'exam-p',
              isMock: false,
              accessType: 'free',
              bankOnly: false,
            }),
          },
        },
        { provide: UploadService, useValue: {} },
        {
          provide: getRepositoryToken(PredictedSet),
          useValue: { exists: predictedExists },
        },
      ],
    }).compile();
    service = module.get(QuestionsService);
    resolver = module.get(QuestionsResolver);
  });

  it('GET /questions and GraphQL questions: no question of a Predicted set', async () => {
    await service.findPublished(1, 10);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = question.examId)',
    );
    qb.andWhere.mockClear();
    await resolver.questions(1, 10);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = question.examId)',
    );
  });

  it('admin list keeps them', async () => {
    await service.findAll(1, 10);
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('predicted_sets'),
    );
  });

  it('topic / subject practice: no question of a Predicted set', async () => {
    await service.findByTopic('t1');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = exam.id)',
    );
    qb.andWhere.mockClear();
    await service.findBySubject('s1');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = exam.id)',
    );
  });

  it('single question (REST / GraphQL) of a Predicted set → 404', async () => {
    await expect(service.findPublishedOne('q1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(resolver.question('q1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(predictedExists).toHaveBeenCalledWith({
      where: { examId: 'exam-p' },
      loadEagerRelations: false,
    });
    predictedExists.mockResolvedValue(false);
    await expect(service.findPublishedOne('q1')).resolves.toMatchObject({
      id: 'q1',
    });
  });
});
