import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { ExamsService } from './exams.service';
import { Exam } from './exam.entity';
import { ExamAccessType } from './exam-mock';
import { CreateExamInput, UpdateExamInput } from './dto/exam.dto';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import { ExamAccess } from '../exam-access/exam-access.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { User } from '../users/user.entity';

const DAY = 24 * 60 * 60 * 1000;

describe('ExamsService — unlock codes (task 15)', () => {
  let service: ExamsService;
  let stored: Partial<Exam>;
  let grants: Partial<ExamAccess>[];
  let qbRows: Record<string, unknown>[];
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const student = { id: 'user-a', role: 'user' };
  const admin = { id: 'admin-1', role: 'admin' };

  beforeEach(async () => {
    grants = [];
    qbRows = [];
    stored = {
      id: 'exam-1',
      title: 'Mock',
      status: QuestionStatus.PUBLISHED,
      isMock: true,
      accessType: ExamAccessType.CODE,
      authorId: 'admin-1',
      questions: [
        {
          id: 'q1',
          question: 'โจทย์',
          choices: [{ id: 'a', text: '1', isCorrect: true }],
          explanation: 'เฉลย',
        } as Question,
      ],
      passages: null,
      detailBlocks: null,
      codeInstructions: null,
    };
    manager = {
      create: jest.fn((_e: unknown, d: unknown) => d),
      save: jest.fn((d: unknown) =>
        Promise.resolve({ ...(d as object), id: 'exam-1' }),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const qb: Record<string, unknown> = {};
    for (const m of [
      'leftJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'offset',
      'limit',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(() => Promise.resolve(qbRows));
    qb.getRawOne = jest.fn(() => Promise.resolve(qbRows[0]));
    qb.getCount = jest.fn(() => Promise.resolve(qbRows.length));

    const module = await Test.createTestingModule({
      providers: [
        ExamsService,
        ExamAccessService,
        {
          provide: getRepositoryToken(Exam),
          useValue: {
            // copies, like rows read from the DB
            findOne: jest.fn(() => Promise.resolve({ ...stored })),
            createQueryBuilder: jest.fn(() => qb),
          },
        },
        { provide: getRepositoryToken(Question), useValue: {} },
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
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
            query: jest.fn().mockResolvedValue([{ refs: 0 }]),
          },
        },
        { provide: UploadService, useValue: new UploadService() },
      ],
    }).compile();

    service = module.get(ExamsService);
  });

  const grant = (data: Partial<ExamAccess>) =>
    grants.push({
      userId: 'user-a',
      examId: 'exam-1',
      allMock: false,
      expiresAt: null,
      ...data,
    });

  describe('GET /exams/:id (findPublishedOne)', () => {
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

    it('locked (code or purchase): guest, no access, expired → 403 EXAM_LOCKED', async () => {
      await expectLocked(service.findPublishedOne('exam-1'));
      await expectLocked(service.findPublishedOne('exam-1', null));
      await expectLocked(service.findPublishedOne('exam-1', student));
      grant({ expiresAt: new Date(Date.now() - DAY) });
      await expectLocked(service.findPublishedOne('exam-1', student));
      stored.accessType = ExamAccessType.PURCHASE;
      await expectLocked(service.findPublishedOne('exam-1', student));
    });

    it('with access that has not expired / admin → the exam with questions and answers', async () => {
      grant({ expiresAt: new Date(Date.now() + DAY) });
      const exam = await service.findPublishedOne('exam-1', student);
      expect(exam.questions[0]).toMatchObject({ explanation: 'เฉลย' });

      grants.length = 0;
      await expect(
        service.findPublishedOne('exam-1', admin),
      ).resolves.toMatchObject({
        id: 'exam-1',
      });
    });

    it('free Mock and normal exams stay public', async () => {
      stored.accessType = ExamAccessType.FREE;
      await expect(service.findPublishedOne('exam-1')).resolves.toMatchObject({
        id: 'exam-1',
      });
      stored.isMock = false;
      stored.accessType = ExamAccessType.CODE;
      await expect(service.findPublishedOne('exam-1')).resolves.toMatchObject({
        id: 'exam-1',
      });
    });
  });

  describe('GET /exams/mock* access', () => {
    const row = (id: string, accessType: string) => ({
      id,
      title: id,
      category: 'tgat',
      categoryName: null,
      subjectId: null,
      subjectName: null,
      bannerImage: null,
      questionCount: 10,
      durationMinutes: 60,
      level: null,
      accessType,
      price: accessType === 'purchase' ? '150.00' : null,
      releaseDate: new Date('2026-11-01T00:00:00Z'),
    });

    it("every card gets the logged-in user's access", async () => {
      const end = new Date(Date.now() + 3 * DAY);
      const past = new Date(Date.now() - DAY);
      qbRows = [
        row('free', 'free'),
        row('locked', 'code'),
        row('mine', 'code'),
        row('old', 'purchase'),
      ];
      grant({ examId: 'mine', expiresAt: end });
      grant({ examId: 'old', expiresAt: past });

      const result = await service.findMockExams(1, 12, undefined, student);
      expect(result.items.map((i) => [i.id, i.access])).toEqual([
        ['free', { status: 'free', expiresAt: null }],
        ['locked', { status: 'locked', expiresAt: null }],
        ['mine', { status: 'unlocked', expiresAt: end.toISOString() }],
        ['old', { status: 'expired', expiresAt: past.toISOString() }],
      ]);
      // never questions
      expect(result.items[0]).not.toHaveProperty('questions');
    });

    it('detail: access + codeInstructions (read tolerantly)', async () => {
      qbRows = [
        {
          ...row('exam-1', 'code'),
          description: null,
          detailBlocks: null,
          codeInstructions: JSON.stringify({
            steps: [
              {
                title: 'ติดตามเพจ',
                linkUrl: 'https://fb.com/lumo',
                linkLabel: 'ไปเพจ',
              },
              { title: 'x', linkUrl: 'javascript:alert(1)' },
            ],
            note: 'หมายเหตุ',
          }),
        },
      ];
      grant({ allMock: true, examId: null, expiresAt: null });

      const detail = await service.findMockOne('exam-1', student);
      expect(detail.access).toEqual({ status: 'unlocked', expiresAt: null });
      expect(detail.codeInstructions).toEqual({
        steps: [
          {
            title: 'ติดตามเพจ',
            linkUrl: 'https://fb.com/lumo',
            linkLabel: 'ไปเพจ',
          },
          { title: 'x' },
        ],
        note: 'หมายเหตุ',
      });
      expect(detail).not.toHaveProperty('questions');

      const guest = await service.findMockOne('exam-1');
      expect(guest.access).toEqual({ status: 'locked', expiresAt: null });
    });
  });

  describe('codeInstructions on admin create / update / findOne', () => {
    const author = { id: 'admin-1' } as User;
    const value = {
      steps: [
        {
          title: ' ขั้น 1 ',
          description: '',
          linkLabel: 'กด',
          linkUrl: 'https://a.co',
        },
      ],
      note: ' จำกัด ',
    };
    const prepared = {
      steps: [{ title: 'ขั้น 1', linkLabel: 'กด', linkUrl: 'https://a.co' }],
      note: 'จำกัด',
    };
    const updated = () =>
      (manager.update.mock.calls[0] as unknown[])[2] as Partial<Exam>;

    it('create stores the cleaned value; not sent → null', async () => {
      await service.create(
        {
          title: 'M',
          category: 'tgat',
          questions: [],
          codeInstructions: value,
        } as CreateExamInput,
        author,
      );
      expect((manager.create.mock.calls[0] as unknown[])[1]).toMatchObject({
        codeInstructions: prepared,
      });

      manager.create.mockClear();
      await service.create(
        { title: 'M', category: 'tgat', questions: [] } as CreateExamInput,
        author,
      );
      expect((manager.create.mock.calls[0] as unknown[])[1]).toMatchObject({
        codeInstructions: null,
      });
    });

    it('update: sent = replaced, null = cleared, not sent = unchanged', async () => {
      await service.update('exam-1', {
        codeInstructions: value,
      } as UpdateExamInput);
      expect(updated().codeInstructions).toEqual(prepared);

      manager.update.mockClear();
      await service.update('exam-1', {
        codeInstructions: null,
      } as UpdateExamInput);
      expect(updated().codeInstructions).toBeNull();

      manager.update.mockClear();
      await service.update('exam-1', { title: 'ใหม่' } as UpdateExamInput);
      expect(updated()).not.toHaveProperty('codeInstructions');
    });

    it('admin findOne returns it', async () => {
      stored.codeInstructions = prepared;
      await expect(service.findOne('exam-1')).resolves.toMatchObject({
        codeInstructions: prepared,
      });
    });
  });
});
