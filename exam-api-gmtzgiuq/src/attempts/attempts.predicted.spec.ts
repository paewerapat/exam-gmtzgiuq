import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttemptsService } from './attempts.service';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { AnswerLogsService } from '../answer-logs/answer-logs.service';
import { PredictedAccessService } from '../predicted/predicted-access.service';
import { predictedLockedException } from '../predicted/predicted-access';
import { User } from '../users/user.entity';
import { StartAttemptDto, SubmitAttemptInput } from './dto/attempt.dto';

/** Task 22 AC3/AC5: attempts of a Predicted set (preview / locked / full). */

describe('AttemptsService — Predicted sets (task 22)', () => {
  let service: AttemptsService;
  let predicted: Record<string, jest.Mock>;
  let logAttempt: jest.Mock;
  let update: jest.Mock;
  let save: jest.Mock;
  let saveInTx: jest.Mock;
  let txRepo: {
    find: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let stored: Partial<ExamAttempt>;

  const user = { id: 'user-1', role: 'user' } as User;
  const ALL = ['q1', 'q2', 'q3', 'q4'];
  const answersAll = { q1: 'a', q2: 'b', q3: 'a', q4: 'b', other: 'a' };
  const timesAll = { q1: 10, q2: 20, q3: 30, q4: 40, other: 50 };

  const startData = (): StartAttemptDto => ({
    examId: 'exam-1',
    examTitle: 'Predicted',
    category: 'netsat',
    totalQuestions: 4,
    questionIds: [...ALL, 'other'],
    startedAt: '2026-11-18T05:00:00.000Z',
    mode: 'exam',
  });

  const submitData = (): SubmitAttemptInput => ({
    examId: 'exam-1',
    examTitle: 'Predicted',
    category: 'netsat',
    totalQuestions: 4,
    correctAnswers: 2,
    incorrectAnswers: 2,
    unanswered: 0,
    score: 50,
    totalTime: 150,
    timePerQuestion: { ...timesAll },
    answers: { ...answersAll },
    questionIds: [...ALL, 'other'],
    startedAt: '2026-11-18T05:00:00.000Z',
  });

  beforeEach(async () => {
    stored = {
      id: 'att-1',
      userId: 'user-1',
      examId: 'exam-1',
      status: 'in_progress',
      mode: 'preview',
      questionIds: ['q1', 'q2'],
      answers: {},
      currentIndex: 0,
    };
    predicted = {
      attemptStartScope: jest.fn().mockResolvedValue(null),
      attemptScope: jest.fn().mockResolvedValue(null),
    };
    logAttempt = jest.fn().mockResolvedValue(0);
    update = jest.fn().mockResolvedValue({ affected: 1 });
    save = jest.fn((d: object) => Promise.resolve({ id: 'att-legacy', ...d }));
    saveInTx = jest.fn((d: object) => Promise.resolve({ id: 'att-new', ...d }));

    txRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn((d: object) => d),
      save: saveInTx,
    };
    const em = {
      getRepository: () => txRepo,
      query: jest.fn((sql: string) =>
        Promise.resolve(sql.startsWith('SELECT @@') ? [{ t: 50 }] : []),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttemptsService,
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: {
            findOne: jest.fn(() => Promise.resolve({ ...stored })),
            findOneOrFail: jest.fn(() => Promise.resolve({ id: 'att-new' })),
            update,
            create: jest.fn((d: object) => d),
            save,
            manager: {
              transaction: jest.fn((cb: (e: unknown) => unknown) => cb(em)),
            },
          },
        },
        {
          provide: getRepositoryToken(Exam),
          useValue: { exists: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: ExamAccessService,
          useValue: {
            assertCanStartExamId: jest.fn().mockResolvedValue(undefined),
            assertCanAccessExamId: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: AnswerLogsService, useValue: { logAttempt } },
        { provide: PredictedAccessService, useValue: predicted },
      ],
    }).compile();
    service = module.get(AttemptsService);
  });

  describe('POST /attempts/start', () => {
    it('locked → 403, nothing written', async () => {
      predicted.attemptStartScope.mockRejectedValue(predictedLockedException());
      await expect(
        service.startInProgress('user-1', startData(), user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(saveInTx).not.toHaveBeenCalled();
    });

    it('preview → mode preview, Preview questions only (whatever was sent)', async () => {
      predicted.attemptStartScope.mockResolvedValue({
        mode: 'preview',
        questionIds: ['q1', 'q2'],
      });
      await service.startInProgress('user-1', startData(), user);
      expect(predicted.attemptStartScope).toHaveBeenCalledWith(user, 'exam-1');
      expect(saveInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'preview',
          questionIds: ['q1', 'q2'],
          totalQuestions: 2,
          unanswered: 2,
        }),
      );
    });

    it('full → mode as requested, ids outside the set dropped', async () => {
      predicted.attemptStartScope.mockResolvedValue({
        mode: null,
        questionIds: ALL,
      });
      await service.startInProgress('user-1', startData(), user);
      expect(saveInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'exam',
          questionIds: ALL,
          totalQuestions: 4,
        }),
      );
    });

    it('not a Predicted set → as sent', async () => {
      await service.startInProgress('user-1', startData(), user);
      expect(saveInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'exam',
          questionIds: [...ALL, 'other'],
        }),
      );
    });

    describe('in-progress attempt of the other scope (QA Q2)', () => {
      const inProgress = (fields: Partial<ExamAttempt>) =>
        ({
          id: 'att-old',
          userId: 'user-1',
          examId: 'exam-1',
          status: 'in_progress',
          answers: {},
          currentIndex: 0,
          ...fields,
        }) as ExamAttempt;
      const fullScope = { mode: null, questionIds: ALL };
      const previewScope = { mode: 'preview', questionIds: ['q1', 'q2'] };

      it('untouched Preview attempt, viewer now full → abandoned, new full attempt', async () => {
        txRepo.find.mockResolvedValue([
          inProgress({ mode: 'preview', questionIds: ['q1', 'q2'] }),
        ]);
        predicted.attemptStartScope.mockResolvedValue(fullScope);
        await service.startInProgress('user-1', startData(), user);
        const [where, fields] = (
          txRepo.update.mock.calls as unknown[][]
        )[0] as [{ id: { value: string[] } }, unknown];
        expect(where.id.value).toEqual(['att-old']);
        expect(fields).toEqual({ status: 'abandoned' });
        // Never reused: no update of its fields
        expect(txRepo.update).toHaveBeenCalledTimes(1);
        expect(saveInTx).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'exam',
            questionIds: ALL,
            totalQuestions: 4,
            status: 'in_progress',
          }),
        );
      });

      it('Preview attempt with answers, viewer now full → abandoned, new full attempt', async () => {
        txRepo.find.mockResolvedValue([
          inProgress({
            mode: 'preview',
            questionIds: ['q1', 'q2'],
            answers: { q1: 'a' },
            currentIndex: 1,
          }),
        ]);
        predicted.attemptStartScope.mockResolvedValue(fullScope);
        await service.startInProgress('user-1', startData(), user);
        expect(txRepo.update).toHaveBeenCalledTimes(1);
        expect(saveInTx).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'exam', questionIds: ALL }),
        );
      });

      it('untouched full attempt, viewer now preview → abandoned, new Preview attempt', async () => {
        txRepo.find.mockResolvedValue([
          inProgress({ mode: 'practice', questionIds: ALL }),
        ]);
        predicted.attemptStartScope.mockResolvedValue(previewScope);
        await service.startInProgress('user-1', startData(), user);
        expect(txRepo.update).toHaveBeenCalledTimes(1);
        expect(txRepo.update).toHaveBeenCalledWith(expect.anything(), {
          status: 'abandoned',
        });
        expect(saveInTx).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'preview',
            questionIds: ['q1', 'q2'],
            totalQuestions: 2,
          }),
        );
      });

      it('untouched attempt of the same scope → reused (no new row)', async () => {
        txRepo.find.mockResolvedValue([
          inProgress({ mode: 'preview', questionIds: ['q1', 'q2'] }),
        ]);
        predicted.attemptStartScope.mockResolvedValue(previewScope);
        await service.startInProgress('user-1', startData(), user);
        expect(saveInTx).not.toHaveBeenCalled();
        expect(txRepo.update).toHaveBeenCalledTimes(1);
        expect(txRepo.update).toHaveBeenCalledWith(
          'att-old',
          expect.objectContaining({
            mode: 'preview',
            questionIds: ['q1', 'q2'],
          }),
        );
      });
    });
  });

  describe('PATCH /attempts/:id/progress', () => {
    it('preview attempt: answers/times outside its questions dropped', async () => {
      predicted.attemptScope.mockResolvedValue({
        mode: 'preview',
        questionIds: ['q1', 'q2'],
      });
      await service.updateProgress(
        'att-1',
        'user-1',
        { currentIndex: 1, answers: answersAll, timePerQuestion: timesAll },
        user,
      );
      expect(predicted.attemptScope).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ id: 'att-1', mode: 'preview' }),
      );
      expect(update).toHaveBeenCalledWith('att-1', {
        currentIndex: 1,
        answers: { q1: 'a', q2: 'b' },
        timePerQuestion: { q1: 10, q2: 20 },
        totalTime: 30,
      });
    });

    it('locked now → 403, nothing saved', async () => {
      predicted.attemptScope.mockRejectedValue(predictedLockedException());
      await expect(
        service.updateProgress(
          'att-1',
          'user-1',
          { currentIndex: 0, answers: {}, timePerQuestion: {} },
          user,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /attempts/:id/complete', () => {
    it('preview: stores and logs only the Preview questions (mode preview)', async () => {
      predicted.attemptScope.mockResolvedValue({
        mode: 'preview',
        questionIds: ['q1', 'q2'],
      });
      await service.completeAttempt('att-1', 'user-1', submitData(), user);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'att-1' }),
        expect.objectContaining({
          answers: { q1: 'a', q2: 'b' },
          timePerQuestion: { q1: 10, q2: 20 },
          questionIds: ['q1', 'q2'],
          totalQuestions: 2,
          totalTime: 30,
          currentIndex: 1,
          status: 'completed',
        }),
      );
      expect(logAttempt).toHaveBeenCalledWith({
        attemptId: 'att-1',
        userId: 'user-1',
        examId: 'exam-1',
        mode: 'preview',
        answers: { q1: 'a', q2: 'b' },
        timePerQuestion: { q1: 10, q2: 20 },
        questionIds: ['q1', 'q2'],
      });
    });

    it('full attempt: questions of the set only, mode kept', async () => {
      stored = { ...stored, mode: 'practice', questionIds: ALL };
      predicted.attemptScope.mockResolvedValue({
        mode: null,
        questionIds: ALL,
      });
      await service.completeAttempt('att-1', 'user-1', submitData(), user);
      const fields = (update.mock.calls as unknown[][])[0][1] as Record<
        string,
        unknown
      >;
      expect(fields.questionIds).toEqual(ALL);
      expect(fields).not.toHaveProperty('totalQuestions');
      expect(Object.keys(fields.answers as object)).toEqual(ALL);
      expect(logAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'practice', questionIds: ALL }),
      );
    });

    it('locked now → 403, nothing completed or logged', async () => {
      predicted.attemptScope.mockRejectedValue(predictedLockedException());
      await expect(
        service.completeAttempt('att-1', 'user-1', submitData(), user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
      expect(logAttempt).not.toHaveBeenCalled();
    });

    it('not a Predicted set → stored and logged as sent (no questionIds limit)', async () => {
      stored = { ...stored, mode: 'exam' };
      await service.completeAttempt('att-1', 'user-1', submitData(), user);
      const log = (logAttempt.mock.calls as unknown[][])[0][0] as Record<
        string,
        unknown
      >;
      expect(log).not.toHaveProperty('questionIds');
      expect(log.answers).toEqual(answersAll);
    });
  });

  describe('legacy POST /attempts', () => {
    it('locked → 403, nothing saved', async () => {
      predicted.attemptStartScope.mockRejectedValue(predictedLockedException());
      await expect(service.submit(submitData(), user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('preview → mode preview with the Preview questions only', async () => {
      predicted.attemptStartScope.mockResolvedValue({
        mode: 'preview',
        questionIds: ['q1', 'q2'],
      });
      await service.submit(submitData(), user).catch(() => undefined);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'preview',
          totalQuestions: 2,
          questionIds: ['q1', 'q2'],
          answers: { q1: 'a', q2: 'b' },
          totalTime: 30,
        }),
      );
      expect(logAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'preview',
          questionIds: ['q1', 'q2'],
        }),
      );
    });
  });
});
