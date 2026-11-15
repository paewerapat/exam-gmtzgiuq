import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ExamsService,
  PREDICTED_EXAM_NOT_MOCK,
  predictedPreviewTooLarge,
} from './exams.service';
import { UpdateExamInput } from './dto/exam.dto';
import { Exam } from './exam.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { PredictedAccessService } from '../predicted/predicted-access.service';
import { PREDICTED_LOCKED_ERROR_CODE } from '../predicted/predicted-access';

/** Task 22: Predicted sets on GET /exams/:id, exam PUT and the exam lists. */

const NOT_PREDICTED =
  'NOT EXISTS (SELECT 1 FROM predicted_sets pset WHERE pset.examId = exam.id)';

describe('ExamsService — Predicted sets (task 22)', () => {
  let service: ExamsService;
  let examFindOne: jest.Mock;
  let qb: Record<string, jest.Mock>;
  let predicted: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let stored: Exam;

  const question = (id: string, orderIndex: number, passageId?: string) =>
    ({
      id,
      question: `ข้อ ${id}`,
      explanation: `เฉลย ${id}`,
      orderIndex,
      isChallenge: false,
      passageId: passageId ?? null,
    }) as unknown as Question;

  const set = {
    id: 'set-1',
    seriesId: 'series-1',
    examId: 'exam-1',
    setNo: 2,
    access: 'pro',
    previewCount: 2,
    proIndex: 1,
    venueId: 'venue-1',
    venueKey: 'netsat',
    seriesActive: true,
    examPublished: true,
  };

  beforeEach(async () => {
    stored = {
      id: 'exam-1',
      title: 'ชุด',
      status: QuestionStatus.PUBLISHED,
      isMock: false,
      bankOnly: false,
      authorId: 'admin-1',
      questions: [
        question('q1', 0, 'p1'),
        question('q2', 1),
        question('q3', 2, 'p3'),
      ],
    } as unknown as Exam;
    examFindOne = jest.fn((options: { select?: object }) =>
      Promise.resolve(
        options.select
          ? {
              id: 'exam-1',
              passages: [
                { id: 'p1', title: 'บทอ่าน 1', body: 'b1' },
                { id: 'p3', title: 'บทอ่าน 3', body: 'b3' },
              ],
            }
          : { ...stored, questions: [...stored.questions] },
      ),
    );
    qb = {};
    for (const m of [
      'leftJoin',
      'leftJoinAndSelect',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
      'offset',
      'limit',
      'groupBy',
      'setParameters',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getCount = jest.fn().mockResolvedValue(0);
    predicted = {
      resolveExam: jest.fn().mockResolvedValue(null),
      questionIds: jest.fn().mockResolvedValue(['q1', 'q2']),
      isPredictedExam: jest.fn().mockResolvedValue(false),
      findPreviewCount: jest.fn().mockResolvedValue(null),
    };
    transaction = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        ExamsService,
        {
          provide: getRepositoryToken(Exam),
          useValue: { findOne: examFindOne, createQueryBuilder: () => qb },
        },
        { provide: getRepositoryToken(Question), useValue: {} },
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { createQueryBuilder: () => qb },
        },
        {
          provide: DataSource,
          useValue: {
            transaction,
            query: jest.fn().mockResolvedValue([{ refs: 0 }]),
          },
        },
        { provide: UploadService, useValue: { deleteByUrl: jest.fn() } },
        {
          provide: ExamAccessService,
          useValue: {
            assertCanAccess: jest.fn().mockResolvedValue(undefined),
            getAccessMany: jest.fn().mockResolvedValue(new Map()),
          },
        },
        { provide: PredictedAccessService, useValue: predicted },
      ],
    }).compile();
    service = module.get(ExamsService);
  });

  describe('GET /exams/:id (findPublishedOne)', () => {
    it('not a Predicted set: as before, no `predicted` field', async () => {
      const exam = await service.findPublishedOne('exam-1', null);
      expect(exam.questions).toHaveLength(3);
      expect(exam).not.toHaveProperty('predicted');
    });

    it('locked → 403 PREDICTED_LOCKED, no question read for the response', async () => {
      predicted.resolveExam.mockResolvedValue({
        set,
        access: 'locked',
        previewCount: null,
      });
      const err = await service
        .findPublishedOne('exam-1', { id: 'u' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.errorCode).toBe(PREDICTED_LOCKED_ERROR_CODE);
      expect(body.venueKey).toBe('netsat');
      expect(JSON.stringify(body)).not.toMatch(/ข้อ q|เฉลย/);
      // passages are never loaded
      expect(examFindOne).toHaveBeenCalledTimes(1);
    });

    it('preview → only the first previewCount questions (server order) + their passages', async () => {
      predicted.resolveExam.mockResolvedValue({
        set,
        access: 'preview',
        previewCount: 2,
      });
      // returned out of order on purpose: the order of questionIds wins
      predicted.questionIds.mockResolvedValue(['Q2', 'q1']);
      const exam = await service.findPublishedOne('exam-1', null);
      expect(predicted.questionIds).toHaveBeenCalledWith('exam-1', 2);
      expect(exam.questions.map((q) => q.id)).toEqual(['q2', 'q1']);
      expect(JSON.stringify(exam)).not.toContain('เฉลย q3');
      expect(exam.passages?.map((p) => p.id)).toEqual(['p1']);
      expect(exam.predicted).toEqual({
        access: 'preview',
        previewCount: 2,
        totalQuestions: 3,
        seriesId: 'series-1',
        setNo: 2,
        venueKey: 'netsat',
      });
    });

    it('full → every question and passage, predicted.access full', async () => {
      predicted.resolveExam.mockResolvedValue({
        set,
        access: 'full',
        previewCount: 2,
      });
      const exam = await service.findPublishedOne('exam-1', { id: 'u' });
      expect(exam.questions).toHaveLength(3);
      expect(exam.passages).toHaveLength(2);
      expect(exam.predicted).toMatchObject({
        access: 'full',
        totalQuestions: 3,
      });
      expect(predicted.questionIds).not.toHaveBeenCalled();
    });

    it('series off (resolveExam throws 404) → 404', async () => {
      predicted.resolveExam.mockRejectedValue(new NotFoundException());
      await expect(
        service.findPublishedOne('exam-1', null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('exam PUT keeps a Predicted set off Mock / bankOnly', () => {
    it('isMock true on a Predicted set → 400, nothing written', async () => {
      predicted.isPredictedExam.mockResolvedValue(true);
      const err = await service
        .update('exam-1', { isMock: true })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe(PREDICTED_EXAM_NOT_MOCK);
    });

    it('bankOnly true on a Predicted set → 400', async () => {
      predicted.isPredictedExam.mockResolvedValue(true);
      await expect(
        service.update('exam-1', { bankOnly: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('not Mock and not bankOnly: no lookup needed', async () => {
      await service.update('exam-1', { title: 'x' }).catch(() => undefined);
      expect(predicted.isPredictedExam).not.toHaveBeenCalled();
      // Questions not sent: the Preview is not looked up either
      expect(predicted.findPreviewCount).not.toHaveBeenCalled();
    });
  });

  describe('exam PUT keeps more questions than the Preview (B2/Q3)', () => {
    const questions = (n: number) =>
      Array.from({ length: n }, (_v, i) => ({
        question: `ข้อ ${i + 1}`,
        choices: [
          { id: 'a', text: '1', isCorrect: true },
          { id: 'b', text: '2', isCorrect: false },
        ],
      })) as unknown as UpdateExamInput['questions'];

    it('questions ≤ previewCount → 400 in Thai, nothing written', async () => {
      predicted.findPreviewCount.mockResolvedValue(2);
      for (const n of [1, 2]) {
        const err = await service
          .update('exam-1', { questions: questions(n) })
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as Error).message).toBe(predictedPreviewTooLarge(2));
        expect((err as Error).message).toBe(
          'ชุดนี้ตั้ง Preview ไว้ 2 ข้อ ต้องมีข้อมากกว่า 2 ข้อ',
        );
      }
      expect(predicted.findPreviewCount).toHaveBeenCalledWith('exam-1');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('more questions than the Preview, no Preview, or not a Predicted set → saved', async () => {
      for (const [preview, n] of [
        [2, 3],
        [null, 1],
      ] as const) {
        predicted.findPreviewCount.mockResolvedValue(preview);
        transaction.mockClear();
        await service
          .update('exam-1', { questions: questions(n) })
          .catch(() => undefined);
        expect(transaction).toHaveBeenCalled();
      }
    });
  });

  describe('lists leave Predicted sets out', () => {
    it('GET /exams (findPublished) and /exams/topic/:id', async () => {
      await service.findPublished(1, 10);
      expect(qb.andWhere).toHaveBeenCalledWith(NOT_PREDICTED);
      qb.andWhere.mockClear();
      await service.findByTopic('t1');
      expect(qb.andWhere).toHaveBeenCalledWith(NOT_PREDICTED);
    });

    it('admin list keeps them (admins edit those exams)', async () => {
      await service.findAll(1, 10);
      expect(qb.andWhere).not.toHaveBeenCalledWith(NOT_PREDICTED);
    });

    it('GET /exams/mock: no Predicted set and no purchase exam (list and count)', async () => {
      await service.findMockExams(1, 12);
      const purchase = (qb.andWhere.mock.calls as unknown[][]).filter(
        (c) => c[0] === 'exam.accessType <> :purchaseType',
      );
      // once for the list, once for the count
      expect(purchase).toHaveLength(2);
      expect(purchase[0][1]).toEqual({ purchaseType: 'purchase' });
      expect(qb.andWhere).toHaveBeenCalledWith(NOT_PREDICTED);
    });

    it('GET /exams/mock/categories counts no purchase exam', async () => {
      await service.findMockCategories();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'exam.accessType <> :purchaseType',
        { purchaseType: 'purchase' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(NOT_PREDICTED);
    });

    it('GET /exams/mock/:id still opens a purchase exam (detail page)', async () => {
      qb.getRawOne = jest.fn().mockResolvedValue(undefined);
      await service.findMockOne('exam-1').catch(() => undefined);
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'exam.accessType <> :purchaseType',
        expect.anything(),
      );
    });
  });
});
