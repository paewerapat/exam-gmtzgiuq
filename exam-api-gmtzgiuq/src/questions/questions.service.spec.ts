import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { QuestionsService } from './questions.service';
import { QuestionsResolver } from './questions.resolver';
import { Question, QuestionStatus } from './question.entity';
import { UploadService } from '../upload/upload.service';
import { CreateQuestionInput, UpdateQuestionInput } from './dto/question.dto';
import { User } from '../users/user.entity';
import { Exam } from '../exams/exam.entity';

const LOCAL = 'http://localhost:3001/uploads';
// Upload filenames in the format POST /upload generates
const url = (n: number) => `${LOCAL}/170000000000${n}-000000000000000${n}.png`;

describe('QuestionsService — images (task 07)', () => {
  let service: QuestionsService;
  let repo: jest.Mocked<Repository<Question>>;
  let deleteByUrl: jest.SpyInstance;
  let create: jest.Mock;
  let find: jest.Mock;
  let query: jest.Mock;
  let examFind: jest.Mock;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([{ refs: 0 }]);
    examFind = jest.fn().mockResolvedValue([]);
    // Chainable query builder for the public list endpoints
    qb = {};
    for (const m of [
      'innerJoin',
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
    const uploadService = new UploadService();
    deleteByUrl = jest
      .spyOn(uploadService, 'deleteByUrl')
      .mockReturnValue(true);

    create = jest.fn((data: unknown) => data);
    find = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        {
          provide: getRepositoryToken(Question),
          useValue: {
            create,
            save: jest.fn((data: unknown) => Promise.resolve(data)),
            findOne: jest.fn(),
            find,
            remove: jest.fn().mockResolvedValue(undefined),
            query,
            createQueryBuilder: jest.fn(() => qb),
          },
        },
        { provide: getRepositoryToken(Exam), useValue: { find: examFind } },
        { provide: UploadService, useValue: uploadService },
      ],
    }).compile();

    service = module.get(QuestionsService);
    repo = module.get(getRepositoryToken(Question));
  });

  function givenQuestion(data: Partial<Question>) {
    repo.findOne.mockResolvedValue({
      id: 'q1',
      question: 'ข้อ 1',
      examId: 'exam-1',
      ...data,
    } as Question);
  }

  function givenSiblings(siblings: Partial<Question>[]) {
    find.mockResolvedValue(siblings as Question[]);
  }

  const deletedUrls = () =>
    deleteByUrl.mock.calls.map((call: unknown[]) => call[0] as string);

  it('create stores questionImages, choice images and questionImage = first', async () => {
    await service.create(
      {
        question: 'ข้อ 1',
        category: 'physics',
        questionImages: [url(1), url(2)],
        choices: [{ id: 'a', text: '', isCorrect: true, image: url(3) }],
      } as CreateQuestionInput,
      { id: 'admin-1' } as User,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionImage: url(1),
        questionImages: [url(1), url(2)],
        choices: [{ id: 'a', text: '', isCorrect: true, image: url(3) }],
      }),
    );
  });

  it('update without image fields keeps the images and deletes nothing', async () => {
    givenQuestion({
      questionImage: url(1),
      questionImages: [url(1), url(2)],
    });

    const saved = await service.update('q1', {
      hint: 'ลองวาดวงจร',
    } as UpdateQuestionInput);

    expect(saved.questionImages).toEqual([url(1), url(2)]);
    expect(saved.questionImage).toBe(url(1));
    expect(deleteByUrl).not.toHaveBeenCalled();
  });

  it('update with questionImages deletes only the removed image after saving', async () => {
    givenQuestion({
      questionImage: url(1),
      questionImages: [url(1), url(2), url(3)],
    });
    let saved = false;
    repo.save.mockImplementation((q) => {
      saved = true;
      return Promise.resolve(q as Question);
    });
    deleteByUrl.mockImplementation(() => {
      expect(saved).toBe(true);
      return true;
    });

    const result = await service.update('q1', {
      questionImages: [url(3), url(1)],
    } as UpdateQuestionInput);

    expect(result.questionImage).toBe(url(3));
    expect(deletedUrls()).toEqual([url(2)]);
  });

  it('a legacy questionImage update replaces the list and keeps both fields in sync', async () => {
    givenQuestion({
      questionImage: url(1),
      questionImages: [url(1), url(2)],
    });

    const result = await service.update('q1', {
      questionImage: url(4),
    } as UpdateQuestionInput);

    expect(result.questionImage).toBe(url(4));
    expect(result.questionImages).toEqual([url(4)]);
    expect(deletedUrls().sort()).toEqual([url(1), url(2)].sort());
  });

  it('keeps choice images when choices are updated with them, deletes a dropped one', async () => {
    givenQuestion({
      choices: [
        { id: 'a', text: '', isCorrect: true, image: url(1) },
        { id: 'b', text: '', isCorrect: false, image: url(2) },
      ],
    });

    const result = await service.update('q1', {
      choices: [
        { id: 'a', text: '', isCorrect: true, image: url(1) },
        { id: 'b', text: 'ข้อความแทนรูป', isCorrect: false, image: null },
      ],
    } as UpdateQuestionInput);

    expect(result.choices[0].image).toBe(url(1));
    expect(deletedUrls()).toEqual([url(2)]);
  });

  it('does not delete an image another question of the same exam still uses', async () => {
    givenQuestion({ questionImage: url(1), questionImages: [url(1), url(2)] });
    givenSiblings([
      {
        id: 'q2',
        questionImage: null,
        choices: [{ id: 'a', text: '', isCorrect: true, image: url(2) }],
      },
    ]);

    await service.update('q1', { questionImages: [] } as UpdateQuestionInput);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { examId: 'exam-1', id: Not('q1') },
      }),
    );
    expect(deletedUrls()).toEqual([url(1)]);
  });

  it('deletes nothing when saving fails', async () => {
    givenQuestion({ questionImages: [url(1), url(2)] });
    repo.save.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      service.update('q1', { questionImages: [] } as UpdateQuestionInput),
    ).rejects.toThrow('DB down');
    expect(deleteByUrl).not.toHaveBeenCalled();
  });

  it('remove deletes all its images except ones a sibling uses, after removing', async () => {
    givenQuestion({
      questionImage: url(1),
      questionImages: [url(1), url(2)],
      choices: [{ id: 'a', text: '', isCorrect: true, image: url(3) }],
    });
    givenSiblings([{ id: 'q2', questionImage: url(2) }]);
    let removed = false;
    repo.remove.mockImplementation((q) => {
      removed = true;
      return Promise.resolve(q);
    });
    deleteByUrl.mockImplementation(() => {
      expect(removed).toBe(true);
      return true;
    });

    await expect(service.remove('q1')).resolves.toBe(true);
    expect(deletedUrls()).toEqual([url(1), url(3)]);
  });

  it('a question without an exam does not look up siblings', async () => {
    givenQuestion({
      examId: undefined as unknown as string,
      questionImage: url(1),
    });

    await service.remove('q1');

    expect(find).not.toHaveBeenCalled();
    expect(deletedUrls()).toEqual([url(1)]);
  });

  describe('AC1b files used elsewhere are kept (task 08)', () => {
    function usedElsewhere(...ns: number[]) {
      query.mockImplementation((_sql: string, params: string[]) =>
        Promise.resolve([
          {
            refs: ns.some((n) => params[0].includes(url(n).split('/').pop()!))
              ? 1
              : 0,
          },
        ]),
      );
    }

    it('update keeps an image another exam, passage, banner or blog uses', async () => {
      givenQuestion({ questionImages: [url(1), url(2)] });
      usedElsewhere(1);

      await service.update('q1', { questionImages: [] } as UpdateQuestionInput);

      expect(query).toHaveBeenCalledTimes(2);
      expect(deletedUrls()).toEqual([url(2)]);
    });

    it('remove keeps an image used elsewhere', async () => {
      givenQuestion({
        questionImage: url(1),
        choices: [{ id: 'a', text: '', isCorrect: true, image: url(2) }],
      });
      usedElsewhere(2);

      await service.remove('q1');

      expect(deletedUrls()).toEqual([url(1)]);
    });

    it('deletes nothing when the reference query fails', async () => {
      givenQuestion({ questionImages: [url(1), url(2)] });
      query.mockRejectedValue(new Error('DB down'));
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await service.update('q1', { questionImages: [] } as UpdateQuestionInput);
      await service.remove('q1');

      expect(deleteByUrl).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('AC2 public lists attach passage (task 08)', () => {
    const passage = (id: string) => ({
      id,
      title: `บทอ่าน ${id}`,
      body: 'เนื้อหา',
      images: [],
    });
    // Stored JSON: p1 has line numbers on, p2 is old data without the key
    const stored = (id: string, extra: Record<string, unknown> = {}) => ({
      ...passage(id),
      ...extra,
    });

    const listed = (data: Partial<Question>[]) =>
      data.map((q, i) => ({ id: `q${i}`, question: 'ข้อ', ...q }) as Question);

    const rows = () =>
      listed([
        { examId: 'exam-1', passageId: 'p1' },
        { examId: 'exam-1', passageId: 'p1' },
        { examId: 'exam-1', passageId: null },
        { examId: 'exam-2', passageId: 'p2' },
        { examId: 'exam-2', passageId: 'missing' },
        { examId: 'exam-3', passageId: 'p1' }, // draft exam: not returned
      ]);

    beforeEach(() => {
      examFind.mockResolvedValue([
        {
          id: 'exam-1',
          passages: [stored('p1', { lineNumbers: true }), stored('p9')],
        },
        { id: 'exam-2', passages: [stored('p2', { images: null })] },
      ]);
    });

    function expectAttached(questions: Question[]) {
      expect(questions.map((q) => q.passage)).toEqual([
        { ...passage('p1'), lineNumbers: true },
        { ...passage('p1'), lineNumbers: true },
        null,
        { ...passage('p2'), lineNumbers: false },
        null,
        null,
      ]);
      expect(examFind).toHaveBeenCalledTimes(1);
      expect(examFind).toHaveBeenCalledWith({
        select: { id: true, passages: true },
        where: {
          id: In(['exam-1', 'exam-2', 'exam-3']),
          status: QuestionStatus.PUBLISHED,
        },
        loadEagerRelations: false,
      });
    }

    it('/questions/topic/:topicId', async () => {
      qb.getMany.mockResolvedValue(rows());
      expectAttached(await service.findByTopic('topic-1'));
    });

    it('/questions/subject/:subjectId', async () => {
      qb.getMany.mockResolvedValue(rows());
      expectAttached(await service.findBySubject('subject-1'));
    });

    it('/questions (published list)', async () => {
      qb.getManyAndCount.mockResolvedValue([rows(), 6]);
      const result = await service.findPublished(1, 10);
      expectAttached(result.items);
      expect(result.total).toBe(6);
    });

    it('does not query exams when no question uses a passage', async () => {
      qb.getMany.mockResolvedValue(
        listed([{ examId: 'exam-1', passageId: null }, { examId: 'exam-1' }]),
      );

      const questions = await service.findByTopic('topic-1');

      expect(examFind).not.toHaveBeenCalled();
      expect(questions.map((q) => q.passage)).toEqual([null, null]);
    });
  });

  describe('exam order of /questions/topic and /questions/subject (task 10)', () => {
    it.each([
      ['topic', (svc: QuestionsService) => svc.findByTopic('topic-1')],
      ['subject', (svc: QuestionsService) => svc.findBySubject('subject-1')],
    ])(
      '%s: exam releaseDate ASC, createdAt ASC, then orderIndex',
      async (_label, run) => {
        await run(service);

        expect(qb.orderBy.mock.calls).toEqual([['exam.releaseDate', 'ASC']]);
        expect(qb.addOrderBy.mock.calls).toEqual([
          ['exam.createdAt', 'ASC'],
          ['q.orderIndex', 'ASC'],
        ]);
      },
    );
  });

  describe('mock exams are left out of topic/subject practice (task 11)', () => {
    it.each([
      ['topic', (svc: QuestionsService) => svc.findByTopic('topic-1')],
      ['subject', (svc: QuestionsService) => svc.findBySubject('subject-1')],
    ])('%s: only questions of non-mock published exams', async (_l, run) => {
      await run(service);

      expect(qb.where).toHaveBeenCalledWith('exam.status = :status', {
        status: QuestionStatus.PUBLISHED,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('exam.isMock = :isMock', {
        isMock: false,
      });
    });
  });
});

describe('Public single question — GraphQL question(id) (SEC-9)', () => {
  let service: QuestionsService;
  let resolver: QuestionsResolver;
  let findOne: jest.Mock;

  // Mimics the DB: findOne matches every key in `where`.
  const rows = [
    { id: 'q-pub', status: QuestionStatus.PUBLISHED },
    { id: 'q-draft', status: QuestionStatus.DRAFT },
  ] as Question[];

  beforeEach(async () => {
    findOne = jest.fn(({ where }: { where: Partial<Question> }) =>
      Promise.resolve(
        rows.find((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof Question] === v),
        ) ?? null,
      ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        QuestionsResolver,
        { provide: getRepositoryToken(Question), useValue: { findOne } },
        { provide: getRepositoryToken(Exam), useValue: {} },
        { provide: UploadService, useValue: {} },
      ],
    }).compile();

    service = module.get(QuestionsService);
    resolver = module.get(QuestionsResolver);
  });

  it('findPublishedOne returns a published question', async () => {
    await expect(service.findPublishedOne('q-pub')).resolves.toEqual(rows[0]);
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'q-pub', status: QuestionStatus.PUBLISHED },
      relations: ['author'],
    });
  });

  it('findPublishedOne reports a draft or a missing id as not found', async () => {
    await expect(service.findPublishedOne('q-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findPublishedOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('question(id) is published only; adminQuestion(id) still returns drafts', async () => {
    await expect(resolver.question('q-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(resolver.question('q-pub')).resolves.toEqual(rows[0]);
    await expect(resolver.adminQuestion('q-draft')).resolves.toEqual(rows[1]);
  });
});
