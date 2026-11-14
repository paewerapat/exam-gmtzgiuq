import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamsService, assertChallengeInBankOnly } from './exams.service';
import { Exam } from './exam.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import { CreateExamInput, UpdateExamInput } from './dto/exam.dto';
import { User } from '../users/user.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ProAccessService } from '../pro/pro-access.service';
import { ExamAccess } from '../exam-access/exam-access.entity';
import { CHALLENGE_NOT_IN_BANK_ONLY } from '../question-bank/question-bank-errors';

/** Task 20: "ใช้เฉพาะ Question Bank" exams and Challenge questions. */
describe('ExamsService — bankOnly / isChallenge (task 20)', () => {
  let service: ExamsService;
  let examFindOne: jest.Mock;
  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let qb: Record<string, jest.Mock>;
  const admin = { id: 'admin-1', role: 'admin' } as User;

  beforeEach(async () => {
    examFindOne = jest.fn();
    manager = {
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((data: { id?: string }) =>
        Promise.resolve({ id: 'exam-new', ...data }),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({ id: 'exam-1' }),
      find: jest.fn().mockResolvedValue([{ id: 'q1' }]),
    };
    transaction = jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
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
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getCount = jest.fn().mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamsService,
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            findOne: examFindOne,
            createQueryBuilder: jest.fn(() => qb),
          },
        },
        { provide: getRepositoryToken(Question), useValue: {} },
        {
          provide: DataSource,
          useValue: {
            transaction,
            query: jest.fn().mockResolvedValue([{ refs: 0 }]),
          },
        },
        { provide: UploadService, useValue: { deleteByUrl: jest.fn() } },
        ExamAccessService,
        {
          provide: ProAccessService,
          useValue: { getMockPurchaseAccess: () => Promise.resolve(new Map()) },
        },
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(ExamsService);
  });

  /** Argument `index` of the first call of a mock. */
  const arg = (mock: jest.Mock, index: number): unknown =>
    (mock.mock.calls as unknown[][])[0][index];

  const stored = (extra: Partial<Exam> = {}, challenge = false) =>
    ({
      id: 'exam-1',
      title: 'ชุด',
      status: QuestionStatus.PUBLISHED,
      authorId: 'admin-1',
      isMock: false,
      bankOnly: false,
      questions: [
        { id: 'q1', question: 'ข้อ 1', isChallenge: challenge } as Question,
      ],
      ...extra,
    }) as Exam;

  const expect400 = async (promise: Promise<unknown>, text: string) => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      message: string;
      errorCode: string;
    };
    expect(body.errorCode).toBe(CHALLENGE_NOT_IN_BANK_ONLY);
    expect(body.message).toContain(text);
  };

  describe('assertChallengeInBankOnly', () => {
    it('bankOnly allows Challenge questions', () => {
      expect(() =>
        assertChallengeInBankOnly(true, [{ isChallenge: true }]),
      ).not.toThrow();
    });

    it('names the first sent Challenge question of a normal exam', () => {
      expect(() =>
        assertChallengeInBankOnly(false, [
          { isChallenge: false },
          {},
          { isChallenge: true },
        ]),
      ).toThrow('ข้อที่ 3');
    });

    it('questions not sent → checks the stored ones (raw 1 too)', () => {
      expect(() =>
        assertChallengeInBankOnly(false, undefined, [
          { isChallenge: 1 as unknown as boolean },
        ]),
      ).toThrow(BadRequestException);
      expect(() =>
        assertChallengeInBankOnly(false, undefined, [{ isChallenge: false }]),
      ).not.toThrow();
      // sent questions replace the stored ones: only they count
      expect(() =>
        assertChallengeInBankOnly(false, [{}], [{ isChallenge: true }]),
      ).not.toThrow();
    });
  });

  describe('create (POST /exams/admin, import)', () => {
    it('AC5 Challenge in a normal exam → 400 before writing anything', async () => {
      await expect400(
        service.create(
          {
            title: 't',
            category: 'c',
            questions: [{ question: 'ข้อ 1', isChallenge: true }],
          } as CreateExamInput,
          admin,
        ),
        'ข้อที่ 1',
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('AC10 bankOnly exam stores bankOnly and isChallenge per question (not sent = false)', async () => {
      examFindOne.mockResolvedValue(stored({ bankOnly: true }));
      await service.create(
        {
          title: 't',
          category: 'c',
          bankOnly: true,
          questions: [
            { question: 'ข้อ 1', isChallenge: true },
            { question: 'ข้อ 2' },
          ],
        } as CreateExamInput,
        admin,
      );
      const created = manager.create.mock.calls.map((c: unknown[]) => c[1]);
      expect(created[0]).toMatchObject({ bankOnly: true });
      expect(created.slice(1)).toEqual([
        expect.objectContaining({ question: 'ข้อ 1', isChallenge: true }),
        expect.objectContaining({ question: 'ข้อ 2', isChallenge: false }),
      ]);
    });

    it('bankOnly not sent = false', async () => {
      examFindOne.mockResolvedValue(stored());
      await service.create(
        {
          title: 't',
          category: 'c',
          questions: [],
        } as unknown as CreateExamInput,
        admin,
      );
      expect(arg(manager.create, 1)).toMatchObject({
        bankOnly: false,
      });
    });
  });

  describe('update (PUT /exams/admin/:id)', () => {
    it('AC5 turning bankOnly off while stored questions are Challenge → 400', async () => {
      examFindOne.mockResolvedValue(stored({ bankOnly: true }, true));
      await expect400(
        service.update('exam-1', { bankOnly: false } as UpdateExamInput),
        'ต้องเปิด',
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('Challenge sent to a normal exam → 400', async () => {
      examFindOne.mockResolvedValue(stored());
      await expect400(
        service.update('exam-1', {
          questions: [{ id: 'q1', question: 'ข้อ 1', isChallenge: true }],
        } as UpdateExamInput),
        'ข้อที่ 1',
      );
    });

    it('bankOnly + Challenge in the same request is saved; not sent keeps bankOnly', async () => {
      examFindOne.mockResolvedValue(stored());
      await service.update('exam-1', {
        bankOnly: true,
        questions: [{ id: 'q1', question: 'ข้อ 1', isChallenge: true }],
      } as UpdateExamInput);
      expect(arg(manager.save, 0)).toEqual([
        expect.objectContaining({ id: 'q1', isChallenge: true }),
      ]);
      expect(arg(manager.update, 2)).toMatchObject({
        bankOnly: true,
      });

      manager.update.mockClear();
      examFindOne.mockResolvedValue(stored({ bankOnly: true }, true));
      await service.update('exam-1', { title: 'ใหม่' } as UpdateExamInput);
      expect(arg(manager.update, 2)).toMatchObject({
        bankOnly: true,
      });
    });

    it('turning bankOnly off and removing the Challenge flags together is allowed', async () => {
      examFindOne.mockResolvedValue(stored({ bankOnly: true }, true));
      await service.update('exam-1', {
        bankOnly: false,
        questions: [{ id: 'q1', question: 'ข้อ 1' }],
      } as UpdateExamInput);
      expect(arg(manager.save, 0)).toEqual([
        expect.objectContaining({ id: 'q1', isChallenge: false }),
      ]);
      expect(arg(manager.update, 2)).toMatchObject({
        bankOnly: false,
      });
    });
  });

  describe('AC5 hidden from exam lists and GET /exams/:id', () => {
    const bankCondition = ['exam.bankOnly = :bankOnly', { bankOnly: false }];

    it('GET /exams, /exams/topic/:id, /exams/mock and its categories leave bankOnly exams out', async () => {
      await service.findPublished(1, 10);
      expect(qb.andWhere).toHaveBeenCalledWith(...bankCondition);

      qb.andWhere.mockClear();
      await service.findByTopic('t1');
      expect(qb.andWhere).toHaveBeenCalledWith(...bankCondition);

      qb.andWhere.mockClear();
      await service.findMockExams(1, 12);
      expect(qb.andWhere).toHaveBeenCalledWith(...bankCondition);

      qb.andWhere.mockClear();
      await service.findMockCategories();
      expect(qb.andWhere).toHaveBeenCalledWith(...bankCondition);
    });

    it('admin list shows everything unless filtered with bankOnly', async () => {
      await service.findAll(1, 10);
      expect(JSON.stringify(qb.andWhere.mock.calls)).not.toContain('bankOnly');

      await service.findAll(1, 10, undefined, undefined, undefined, {
        bankOnly: true,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('exam.bankOnly = :bankOnly', {
        bankOnly: true,
      });
    });

    it('GET /exams/:id of a bankOnly exam: 404 for users and guests, admins get it', async () => {
      examFindOne.mockImplementation(({ select }: { select?: unknown }) =>
        Promise.resolve(
          select
            ? { id: 'exam-1', passages: null }
            : stored({ bankOnly: true }),
        ),
      );
      await expect(
        service.findPublishedOne('exam-1', { id: 'u1', role: 'user' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.findPublishedOne('exam-1', null)).rejects.toThrow(
        'ไม่พบชุดข้อสอบ',
      );
      await expect(
        service.findPublishedOne('exam-1', admin),
      ).resolves.toMatchObject({ id: 'exam-1', bankOnly: true });
    });

    it('second layer: GET /exams/:id never gives Challenge questions to non-admins (even in a normal exam)', async () => {
      const withChallenge = () =>
        stored({
          questions: [
            { id: 'q1', question: 'ข้อ 1', isChallenge: false },
            { id: 'q2', question: 'ข้อลับ', isChallenge: true },
            { id: 'q3', question: 'ข้อลับ raw', isChallenge: 1 },
          ] as unknown as Question[],
        });
      examFindOne.mockImplementation(({ select }: { select?: unknown }) =>
        Promise.resolve(
          select ? { id: 'exam-1', passages: null } : withChallenge(),
        ),
      );
      for (const viewer of [{ id: 'u1', role: 'user' }, null]) {
        const exam = await service.findPublishedOne('exam-1', viewer);
        expect(exam.questions.map((q) => q.id)).toEqual(['q1']);
        expect(JSON.stringify(exam)).not.toContain('ข้อลับ');
      }
      const forAdmin = await service.findPublishedOne('exam-1', admin);
      expect(forAdmin.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    });
  });
});
