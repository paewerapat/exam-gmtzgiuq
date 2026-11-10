import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  getMetadataArgsStorage,
} from 'typeorm';
import { ExamsService } from './exams.service';
import { Exam } from './exam.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import {
  CreateExamInput,
  CreateExamQuestionInput,
  UpdateExamInput,
} from './dto/exam.dto';
import { User } from '../users/user.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamAccessType, ExamLevel } from './exam-mock';
import { UPLOAD_REFERENCE_SQL } from '../questions/question-images';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ExamAccess } from '../exam-access/exam-access.entity';

const LOCAL = 'http://localhost:3001/uploads';

// Upload filenames in the format POST /upload generates
// (<timestamp>-<16 hex>.<ext>); UploadService.extractFilename ignores others.
const IMG = {
  a: '1700000000001-000000000000000a.png',
  b: '1700000000002-000000000000000b.png',
  c: '1700000000003-000000000000000c.png',
  new: '1700000000004-0000000000000004.png',
  shared: '1700000000005-0000000000000005.png',
  x: '1700000000006-0000000000000006.png',
  y: '1700000000007-0000000000000007.png',
};

function makeExam(images: (string | null)[]): Exam {
  return {
    id: 'exam-1',
    title: 'ชุดที่ 1',
    status: QuestionStatus.DRAFT,
    authorId: 'admin-1',
    questionCount: images.length,
    questions: images.map(
      (img, i) =>
        ({
          id: `q${i}`,
          question: `ข้อ ${i + 1}`,
          questionImage: img,
        }) as Question,
    ),
  } as Exam;
}

function questionsWith(images: (string | null)[]): CreateExamQuestionInput[] {
  return images.map(
    (img, i) =>
      ({
        question: `ข้อ ${i + 1}`,
        correctAnswer: 'a',
        questionImage: img ?? undefined,
      }) as CreateExamQuestionInput,
  );
}

describe('ExamsService', () => {
  let service: ExamsService;
  let examsRepo: jest.Mocked<Repository<Exam>>;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let deleteByUrl: jest.SpyInstance;
  // Upload reference query (deleteUnusedImages); default: no other usage
  let query: jest.Mock;
  // exam_access rows of the viewer (task 15); default: none
  let accessFind: jest.Mock;

  beforeEach(async () => {
    accessFind = jest.fn().mockResolvedValue([]);
    query = jest.fn().mockResolvedValue([{ refs: 0 }]);
    manager = {
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    // Real UploadService so filename matching uses extractFilename as-is,
    // but never touch the disk.
    const uploadService = new UploadService();
    deleteByUrl = jest
      .spyOn(uploadService, 'deleteByUrl')
      .mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamsService,
        {
          provide: getRepositoryToken(Exam),
          useValue: { findOne: jest.fn(), remove: jest.fn() },
        },
        { provide: getRepositoryToken(Question), useValue: {} },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
              cb(manager as unknown as EntityManager),
            ),
            query,
          },
        },
        { provide: UploadService, useValue: uploadService },
        // Real access rules on a mocked exam_access table (task 15)
        ExamAccessService,
        {
          provide: getRepositoryToken(ExamAccess),
          useValue: { find: accessFind },
        },
      ],
    }).compile();

    service = module.get(ExamsService);
    examsRepo = module.get(getRepositoryToken(Exam));
  });

  function givenExam(images: (string | null)[]) {
    examsRepo.findOne.mockResolvedValue(makeExam(images));
  }

  function deletedUrls(): string[] {
    return deleteByUrl.mock.calls.map((call: unknown[]) => call[0] as string);
  }

  describe('update — question images (BUG-2)', () => {
    it('AC1 keeps files that the new questions still use', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`, null]);

      await service.update('exam-1', {
        questions: questionsWith([
          `${LOCAL}/${IMG.a}`,
          `${LOCAL}/${IMG.b}`,
          null,
        ]),
      } as UpdateExamInput);

      expect(manager.delete).toHaveBeenCalledWith(Question, {
        examId: 'exam-1',
      });
      expect(manager.save).toHaveBeenCalled();
      expect(deleteByUrl).not.toHaveBeenCalled();
    });

    it('AC2 deletes only the image replaced with a new one', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);

      await service.update('exam-1', {
        questions: questionsWith([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.new}`]),
      } as UpdateExamInput);

      expect(deletedUrls()).toEqual([`${LOCAL}/${IMG.b}`]);
    });

    it('AC2 deletes the image removed from a question', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);

      await service.update('exam-1', {
        questions: questionsWith([null, `${LOCAL}/${IMG.b}`]),
      } as UpdateExamInput);

      expect(deletedUrls()).toEqual([`${LOCAL}/${IMG.a}`]);
    });

    it('AC2 deletes the image of a deleted question only', async () => {
      givenExam([
        `${LOCAL}/${IMG.a}`,
        `${LOCAL}/${IMG.b}`,
        `${LOCAL}/${IMG.c}`,
      ]);

      await service.update('exam-1', {
        questions: questionsWith([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.c}`]),
      } as UpdateExamInput);

      expect(deletedUrls()).toEqual([`${LOCAL}/${IMG.b}`]);
    });

    it('AC3 keeps a shared image when only one question drops it', async () => {
      givenExam([`${LOCAL}/${IMG.shared}`, `${LOCAL}/${IMG.shared}`]);

      await service.update('exam-1', {
        questions: questionsWith([`${LOCAL}/${IMG.shared}`, null]),
      } as UpdateExamInput);

      expect(deleteByUrl).not.toHaveBeenCalled();
    });

    it('AC3 deletes a shared image once when no question uses it anymore', async () => {
      givenExam([`${LOCAL}/${IMG.shared}`, `${LOCAL}/${IMG.shared}`]);

      await service.update('exam-1', {
        questions: questionsWith([null, null]),
      } as UpdateExamInput);

      expect(deletedUrls()).toEqual([`${LOCAL}/${IMG.shared}`]);
    });

    it('AC4 deletes nothing when the transaction fails', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);
      manager.save.mockRejectedValueOnce(new Error('Data too long for hint'));

      await expect(
        service.update('exam-1', {
          questions: questionsWith([null, null]),
        } as UpdateExamInput),
      ).rejects.toThrow('Data too long for hint');

      expect(deleteByUrl).not.toHaveBeenCalled();
    });

    it('AC4 deletes files only after the transaction has committed', async () => {
      givenExam([`${LOCAL}/${IMG.a}`]);
      let committed = false;
      manager.update.mockImplementation(() => {
        committed = true;
        return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
      });
      deleteByUrl.mockImplementation(() => {
        expect(committed).toBe(true);
        return true;
      });

      await service.update('exam-1', {
        questions: questionsWith([null]),
      } as UpdateExamInput);

      expect(deleteByUrl).toHaveBeenCalledTimes(1);
    });

    it('AC5 treats the same file on a different host as the same image', async () => {
      givenExam([
        `http://localhost:3001/uploads/${IMG.x}`,
        `http://localhost:3001/uploads/${IMG.y}`,
      ]);

      await service.update('exam-1', {
        questions: questionsWith([
          `https://api.example/uploads/${IMG.x}`,
          `/uploads/${IMG.y}`,
        ]),
      } as UpdateExamInput);

      expect(deleteByUrl).not.toHaveBeenCalled();
    });

    it('AC6 does not delete images when questions are not sent', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);

      await service.update('exam-1', {
        status: QuestionStatus.PUBLISHED,
      } as UpdateExamInput);

      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(
        Exam,
        'exam-1',
        expect.objectContaining({ status: QuestionStatus.PUBLISHED }),
      );
      expect(deleteByUrl).not.toHaveBeenCalled();
    });

    it('does not fail the request when deleting a file throws', async () => {
      givenExam([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      deleteByUrl.mockImplementationOnce(() => {
        throw new Error('EACCES');
      });

      await expect(
        service.update('exam-1', {
          questions: questionsWith([null, null]),
        } as UpdateExamInput),
      ).resolves.toBeDefined();

      expect(deletedUrls()).toEqual([`${LOCAL}/${IMG.a}`, `${LOCAL}/${IMG.b}`]);
      consoleError.mockRestore();
    });
  });

  describe('multiple question images + choice images (task 07)', () => {
    const url = (name: keyof typeof IMG) => `${LOCAL}/${IMG[name]}`;
    const author = { id: 'admin-1' } as User;

    function storedQuestion(data: Partial<Question>): Question {
      return { id: 'q', question: 'ข้อ', ...data } as Question;
    }

    function givenStored(questions: Partial<Question>[]) {
      examsRepo.findOne.mockResolvedValue({
        ...makeExam([]),
        questionCount: questions.length,
        questions: questions.map((q, i) =>
          storedQuestion({ id: `q${i}`, ...q }),
        ),
      } as Exam);
    }

    function savedQuestions(): Question[] {
      const calls = manager.save.mock.calls as unknown[][];
      const call = calls.find((args) => Array.isArray(args[0]));
      return call![0] as Question[];
    }

    const choices = (images: (string | null)[]) =>
      images.map((image, i) => ({
        id: String.fromCharCode(97 + i),
        text: '',
        isCorrect: i === 0,
        image,
      }));

    describe('AC1 create/update store the images', () => {
      it('create stores questionImages and choice images, questionImage = first image', async () => {
        examsRepo.findOne.mockResolvedValue(makeExam([]));

        await service.create(
          {
            title: 'ฟิสิกส์',
            category: 'physics',
            questions: [
              {
                question: 'วงจร',
                questionImages: [url('a'), url('b'), url('c')],
                choices: choices([url('x'), url('y'), null]),
              },
            ],
          } as CreateExamInput,
          author,
        );

        const [q] = savedQuestions();
        expect(q.questionImages).toEqual([url('a'), url('b'), url('c')]);
        expect(q.questionImage).toBe(url('a'));
        expect(q.choices).toEqual([
          { id: 'a', text: '', isCorrect: true, image: url('x') },
          { id: 'b', text: '', isCorrect: false, image: url('y') },
          { id: 'c', text: '', isCorrect: false },
        ]);
      });

      it('create with only the legacy questionImage behaves as before', async () => {
        examsRepo.findOne.mockResolvedValue(makeExam([]));

        await service.create(
          {
            title: 'ชุดเก่า',
            category: 'physics',
            questions: [
              { question: 'ข้อ 1', questionImage: url('a') },
              { question: 'ข้อ 2' },
            ],
          } as CreateExamInput,
          author,
        );

        const [q1, q2] = savedQuestions();
        expect(q1.questionImage).toBe(url('a'));
        expect(q1.questionImages).toEqual([url('a')]);
        expect(q2.questionImage).toBeNull();
        expect(q2.questionImages).toBeNull();
        expect(q2.choices).toEqual([]);
      });

      it('update stores questionImages and choice images, questionImage = first image', async () => {
        givenStored([{ questionImage: url('a') }]);

        await service.update('exam-1', {
          questions: [
            {
              question: 'ข้อ 1',
              questionImage: url('a'),
              questionImages: [url('b'), url('a')],
              choices: choices([url('x')]),
            },
          ],
        } as UpdateExamInput);

        const [q] = savedQuestions();
        expect(q.questionImages).toEqual([url('b'), url('a')]);
        expect(q.questionImage).toBe(url('b'));
        expect(q.choices[0].image).toBe(url('x'));
        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('update with only the legacy questionImage behaves as before', async () => {
        givenStored([{ questionImage: url('a') }]);

        await service.update('exam-1', {
          questions: questionsWith([url('new')]),
        } as UpdateExamInput);

        const [q] = savedQuestions();
        expect(q.questionImage).toBe(url('new'));
        expect(q.questionImages).toEqual([url('new')]);
        expect(deletedUrls()).toEqual([url('a')]);
      });
    });

    describe('AC2 file deletion', () => {
      it('deletes only the second question image when it is removed', async () => {
        givenStored([
          {
            questionImage: url('a'),
            questionImages: [url('a'), url('b'), url('c')],
          },
        ]);

        await service.update('exam-1', {
          questions: [
            { question: 'ข้อ 1', questionImages: [url('c'), url('a')] },
          ],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('b')]);
      });

      it('deletes only the choice image that was removed', async () => {
        givenStored([{ choices: choices([url('x'), url('y')]) }]);

        await service.update('exam-1', {
          questions: [
            { question: 'ข้อ 1', choices: choices([url('x'), null]) },
          ],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('y')]);
      });

      it('keeps an image still used by another question or another choice', async () => {
        givenStored([
          {
            questionImage: url('a'),
            questionImages: [url('a'), url('shared')],
            choices: choices([url('x')]),
          },
          { choices: choices([url('y')]) },
        ]);

        await service.update('exam-1', {
          questions: [
            // question 1 drops 'shared' and its choice image 'x'
            { question: 'ข้อ 1', questionImages: [url('a')] },
            // question 2 now uses 'shared' (as a choice) and 'x' (as an image)
            {
              question: 'ข้อ 2',
              questionImages: [url('x')],
              choices: choices([url('y'), url('shared')]),
            },
          ],
        } as UpdateExamInput);

        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('an old single-image question still deletes the replaced image', async () => {
        givenStored([{ questionImage: url('a'), questionImages: null }]);

        await service.update('exam-1', {
          questions: [{ question: 'ข้อ 1', questionImages: [url('b')] }],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('a')]);
      });

      it('deletes nothing when the transaction fails', async () => {
        givenStored([
          {
            questionImage: url('a'),
            questionImages: [url('a'), url('b')],
            choices: choices([url('x')]),
          },
        ]);
        manager.save.mockRejectedValueOnce(new Error('Data too long'));

        await expect(
          service.update('exam-1', {
            questions: [{ question: 'ข้อ 1', questionImages: [] }],
          } as UpdateExamInput),
        ).rejects.toThrow('Data too long');

        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('remove deletes every image the exam refers to, once each, after the delete', async () => {
        givenStored([
          {
            questionImage: url('a'),
            questionImages: [url('a'), url('b')],
            choices: choices([url('x'), url('shared')]),
          },
          { questionImage: url('c'), questionImages: null },
          { choices: choices([url('shared'), url('y')]) },
        ]);
        let removed = false;
        examsRepo.remove.mockImplementation((exam) => {
          removed = true;
          return Promise.resolve(exam);
        });
        deleteByUrl.mockImplementation(() => {
          expect(removed).toBe(true);
          return true;
        });

        await expect(service.remove('exam-1')).resolves.toBe(true);

        expect(deletedUrls().sort()).toEqual(
          [
            url('a'),
            url('b'),
            url('x'),
            url('shared'),
            url('c'),
            url('y'),
          ].sort(),
        );
      });

      it('remove deletes nothing when deleting the exam fails', async () => {
        givenStored([{ questionImages: [url('a'), url('b')] }]);
        examsRepo.remove.mockRejectedValueOnce(new Error('FK'));

        await expect(service.remove('exam-1')).rejects.toThrow('FK');
        expect(deleteByUrl).not.toHaveBeenCalled();
      });
    });
  });

  describe('shared passages (task 08)', () => {
    const url = (name: keyof typeof IMG) => `${LOCAL}/${IMG[name]}`;
    const author = { id: 'admin-1' } as User;

    function givenExamWith(
      passages: unknown,
      questions: Partial<Question>[] = [],
    ) {
      examsRepo.findOne.mockResolvedValue({
        ...makeExam([]),
        questionCount: questions.length,
        passages,
        questions: questions.map(
          (q, i) =>
            ({ id: `q${i}`, question: `ข้อ ${i + 1}`, ...q }) as Question,
        ),
      } as Exam);
    }

    function createdExam(): Partial<Exam> {
      const calls = manager.create.mock.calls as unknown[][];
      return calls.find((args) => args[0] === Exam)![1] as Partial<Exam>;
    }

    function savedQuestions(): Question[] {
      const calls = manager.save.mock.calls as unknown[][];
      return calls.find((args) => Array.isArray(args[0]))![0] as Question[];
    }

    function examUpdate(): Partial<Exam> {
      return (manager.update.mock.calls[0] as unknown[])[2] as Partial<Exam>;
    }

    const reading = {
      id: 'reading-1',
      title: 'บทอ่านที่ 1',
      body: 'ย่อหน้าแรก\n\nย่อหน้าที่สอง\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    };

    describe('AC1 create/update store passages + passageId', () => {
      it('create stores normalized passages and each question passageId', async () => {
        examsRepo.findOne.mockResolvedValue(makeExam([]));

        await service.create(
          {
            title: 'TGAT1',
            category: 'english',
            passages: [
              reading,
              { id: 'p-2', title: '', body: null, images: [url('a')] },
            ],
            questions: [
              { question: 'ข้อ 1' },
              { question: 'ข้อ 2', passageId: 'reading-1' },
              { question: 'ข้อ 3', passageId: 'p-2' },
              { question: 'ข้อ 4', passageId: null },
            ],
          } as CreateExamInput,
          author,
        );

        expect(createdExam().passages).toEqual([
          { ...reading, images: [], lineNumbers: false },
          {
            id: 'p-2',
            title: null,
            body: null,
            images: [url('a')],
            lineNumbers: false,
          },
        ]);
        expect(savedQuestions().map((q) => q.passageId)).toEqual([
          null,
          'reading-1',
          'p-2',
          null,
        ]);
      });

      it('create without passages stores []', async () => {
        examsRepo.findOne.mockResolvedValue(makeExam([]));

        await service.create(
          {
            title: 'ชุดเก่า',
            category: 'physics',
            questions: [{ question: 'ข้อ 1' }],
          } as CreateExamInput,
          author,
        );

        expect(createdExam().passages).toEqual([]);
        expect(savedQuestions()[0].passageId).toBeNull();
      });

      it.each([
        [
          'a passageId that is not in passages',
          {
            passages: [reading],
            questions: [
              { question: 'ข้อ 1' },
              { question: 'ข้อ 2', passageId: 'reading-2' },
            ],
          },
          'ข้อ 2: ไม่พบบทอ่าน "reading-2"',
        ],
        [
          'a passageId when no passages are sent',
          { questions: [{ question: 'ข้อ 1', passageId: 'reading-1' }] },
          'ข้อ 1: ไม่พบบทอ่าน "reading-1"',
        ],
        [
          'two passages with the same id',
          {
            passages: [reading, { ...reading, title: 'ซ้ำ' }],
            questions: [{ question: 'ข้อ 1' }],
          },
          'บทอ่านที่ 2: id "reading-1" ซ้ำ',
        ],
        [
          'a passage without body or images',
          {
            passages: [
              { id: 'empty', title: 'ว่าง', body: '  \n', images: [] },
            ],
            questions: [{ question: 'ข้อ 1' }],
          },
          'บทอ่านที่ 1: ต้องมีเนื้อหาหรือรูป',
        ],
      ])(
        'create rejects %s with 400 and saves nothing',
        async (_l, body, msg) => {
          const error = await service
            .create(
              { title: 'ชุด', category: 'english', ...body } as CreateExamInput,
              author,
            )
            .catch((err: unknown) => err);

          expect(error).toBeInstanceOf(BadRequestException);
          expect((error as BadRequestException).message).toContain(msg);
          expect(manager.save).not.toHaveBeenCalled();
        },
      );

      it('update with questions + passages replaces both', async () => {
        givenExamWith(
          [{ id: 'old', title: null, body: 'เดิม', images: [] }],
          [{ passageId: 'old' }],
        );

        await service.update('exam-1', {
          passages: [reading],
          questions: [
            { question: 'ข้อ 1', passageId: 'reading-1' },
            { question: 'ข้อ 2' },
          ],
        } as UpdateExamInput);

        expect(examUpdate().passages).toEqual([
          { ...reading, images: [], lineNumbers: false },
        ]);
        expect(savedQuestions().map((q) => q.passageId)).toEqual([
          'reading-1',
          null,
        ]);
      });

      it('update with questions but without passages sets passages to []', async () => {
        givenExamWith([reading], [{ passageId: 'reading-1' }]);

        await service.update('exam-1', {
          questions: [{ question: 'ข้อ 1' }],
        } as UpdateExamInput);

        expect(examUpdate().passages).toEqual([]);
      });

      it('update with questions referring to an old passage not resent → 400', async () => {
        givenExamWith([reading], [{ passageId: 'reading-1' }]);

        await expect(
          service.update('exam-1', {
            questions: [{ question: 'ข้อ 1', passageId: 'reading-1' }],
          } as UpdateExamInput),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(manager.update).not.toHaveBeenCalled();
      });

      it('update without questions and passages keeps passages untouched', async () => {
        givenExamWith([reading], [{ passageId: 'reading-1' }]);

        await service.update('exam-1', {
          status: QuestionStatus.PUBLISHED,
        } as UpdateExamInput);

        expect(examUpdate()).not.toHaveProperty('passages');
        expect(manager.delete).not.toHaveBeenCalled();
      });

      it('update with passages only checks the existing questions', async () => {
        givenExamWith([reading], [{ passageId: 'reading-1' }, {}]);

        await expect(
          service.update('exam-1', {
            passages: [{ id: 'other', body: 'อื่น' }],
          } as UpdateExamInput),
        ).rejects.toThrow('ข้อ 1: ไม่พบบทอ่าน "reading-1"');

        await service.update('exam-1', {
          passages: [{ ...reading, title: 'แก้ชื่อ' }],
        } as UpdateExamInput);
        expect(examUpdate().passages).toEqual([
          { ...reading, title: 'แก้ชื่อ', images: [], lineNumbers: false },
        ]);
        expect(manager.delete).not.toHaveBeenCalled();
      });

      it('findOne returns passages as an array (null → [])', async () => {
        givenExamWith(null, [{ passageId: null }]);
        await expect(service.findOne('exam-1')).resolves.toMatchObject({
          passages: [],
        });

        givenExamWith([{ id: 'p', body: 'x' }, { title: 'no id' }, 'junk']);
        const exam = await service.findOne('exam-1');
        expect(exam.passages).toEqual([
          { id: 'p', title: null, body: 'x', images: [], lineNumbers: false },
        ]);
        // passages is select: false, so it is loaded explicitly
        expect(examsRepo.findOne.mock.calls).toContainEqual([
          expect.objectContaining({
            select: {
              id: true,
              passages: true,
              detailBlocks: true,
              codeInstructions: true,
            },
            where: { id: 'exam-1' },
          }),
        ]);
      });

      it('findPublishedOne returns passages as well', async () => {
        givenExamWith([reading]);
        const exam = await service.findPublishedOne('exam-1');
        expect(exam.passages).toEqual([
          { ...reading, images: [], lineNumbers: false },
        ]);
      });
    });

    describe('task 09 passage lineNumbers', () => {
      it('create stores lineNumbers: true and not sent → false', async () => {
        examsRepo.findOne.mockResolvedValue(makeExam([]));

        await service.create(
          {
            title: 'TGAT1',
            category: 'thai',
            passages: [
              { ...reading, lineNumbers: true },
              { id: 'p-2', body: 'บทที่สอง' },
            ],
            questions: [{ question: 'ข้อ 1', passageId: 'reading-1' }],
          } as CreateExamInput,
          author,
        );

        expect(
          createdExam().passages?.map((p) => [p.id, p.lineNumbers]),
        ).toEqual([
          ['reading-1', true],
          ['p-2', false],
        ]);
      });

      it('update stores lineNumbers: true / false as sent', async () => {
        givenExamWith([reading], [{ passageId: 'reading-1' }]);

        await service.update('exam-1', {
          passages: [
            { ...reading, lineNumbers: true },
            { id: 'p-2', body: 'บทที่สอง', lineNumbers: false },
          ],
        } as UpdateExamInput);

        expect(examUpdate().passages?.map((p) => p.lineNumbers)).toEqual([
          true,
          false,
        ]);
      });

      it('findOne returns lineNumbers: true when stored, false for old data or non-true values', async () => {
        givenExamWith([
          { ...reading, lineNumbers: true },
          { id: 'old', body: 'ข้อมูลเก่าไม่มี key' },
          { id: 'str', body: 'x', lineNumbers: 'true' },
          { id: 'num', body: 'x', lineNumbers: 1 },
          { id: 'nil', body: 'x', lineNumbers: null },
        ]);

        const exam = await service.findOne('exam-1');

        expect(exam.passages).toEqual([
          { ...reading, images: [], lineNumbers: true },
          {
            id: 'old',
            title: null,
            body: 'ข้อมูลเก่าไม่มี key',
            images: [],
            lineNumbers: false,
          },
          { id: 'str', title: null, body: 'x', images: [], lineNumbers: false },
          { id: 'num', title: null, body: 'x', images: [], lineNumbers: false },
          { id: 'nil', title: null, body: 'x', images: [], lineNumbers: false },
        ]);
      });

      it('findPublishedOne returns lineNumbers as well', async () => {
        givenExamWith([{ ...reading, lineNumbers: true }]);
        const exam = await service.findPublishedOne('exam-1');
        expect(exam.passages?.[0].lineNumbers).toBe(true);
      });
    });

    describe('AC1 passage image files', () => {
      it('deletes a passage image removed from the passages after saving', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a'), url('b')] }],
          [{ passageId: 'reading-1' }],
        );
        let committed = false;
        manager.update.mockImplementation(() => {
          committed = true;
          return Promise.resolve({ affected: 1 });
        });
        deleteByUrl.mockImplementation(() => {
          expect(committed).toBe(true);
          return true;
        });

        await service.update('exam-1', {
          passages: [{ ...reading, images: [url('b')] }],
          questions: [{ question: 'ข้อ 1', passageId: 'reading-1' }],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('a')]);
      });

      it('keeps a passage image still used by another passage or a question', async () => {
        givenExamWith(
          [
            { id: 'p1', body: 'x', images: [url('a'), url('b')] },
            { id: 'p2', body: 'y', images: [url('c')] },
          ],
          [{ passageId: 'p1' }, { passageId: 'p2' }],
        );

        await service.update('exam-1', {
          passages: [{ id: 'p2', body: 'y', images: [url('c'), url('a')] }],
          questions: [
            { question: 'ข้อ 1', questionImages: [url('b')] },
            { question: 'ข้อ 2', passageId: 'p2' },
          ],
        } as UpdateExamInput);

        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('passages only: keeps images the unchanged questions use', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a'), url('b')] }],
          [{ passageId: 'reading-1', questionImage: url('a') }],
        );

        await service.update('exam-1', {
          passages: [{ ...reading, images: [] }],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('b')]);
      });

      it('questions sent without passages deletes the old passage images', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a')] }],
          [{ passageId: 'reading-1' }],
        );

        await service.update('exam-1', {
          questions: [{ question: 'ข้อ 1' }],
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('a')]);
      });

      it('deletes nothing when the transaction fails', async () => {
        givenExamWith([{ ...reading, images: [url('a')] }]);
        manager.update.mockRejectedValueOnce(new Error('DB down'));

        await expect(
          service.update('exam-1', { passages: [] } as UpdateExamInput),
        ).rejects.toThrow('DB down');
        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('remove deletes the passage images too', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a'), url('shared')] }],
          [{ questionImage: url('shared'), passageId: 'reading-1' }],
        );

        await service.remove('exam-1');

        expect(deletedUrls().sort()).toEqual([url('a'), url('shared')].sort());
      });
    });

    describe('AC1b files used by another exam / blog are kept', () => {
      // The reference query reports these files as still used elsewhere
      function usedElsewhere(...names: (keyof typeof IMG)[]) {
        query.mockImplementation((_sql: string, params: string[]) =>
          Promise.resolve([
            { refs: names.some((n) => params[0].includes(IMG[n])) ? 1 : 0 },
          ]),
        );
      }

      it('update keeps a question image another exam still uses', async () => {
        givenExam([url('a'), url('b')]);
        usedElsewhere('a');

        await service.update('exam-1', {
          questions: questionsWith([null, null]),
        } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('b')]);
      });

      it('update keeps a passage image used by a passage/banner/blog elsewhere', async () => {
        givenExamWith([{ ...reading, images: [url('a'), url('b'), url('c')] }]);
        usedElsewhere('a', 'c');

        await service.update('exam-1', { passages: [] } as UpdateExamInput);

        expect(deletedUrls()).toEqual([url('b')]);
      });

      it('remove keeps files other exams, banners or blogs still use', async () => {
        givenExamWith(
          [{ ...reading, images: [url('x')] }],
          [
            { questionImage: url('a'), choices: [] },
            {
              choices: [
                { id: 'a', text: '', isCorrect: true, image: url('y') },
              ],
            },
          ],
        );
        usedElsewhere('x', 'y');

        await service.remove('exam-1');

        expect(deletedUrls()).toEqual([url('a')]);
      });

      it('checks each file with the bound, escaped filename pattern', async () => {
        givenExam([url('a'), url('a')]);

        await service.update('exam-1', {
          questions: questionsWith([null]),
        } as UpdateExamInput);

        expect(query).toHaveBeenCalledTimes(1);
        const [sql, params] = query.mock.calls[0] as [string, string[]];
        expect(sql).toBe(UPLOAD_REFERENCE_SQL);
        expect(params).toHaveLength(9);
        expect(new Set(params)).toEqual(new Set([`%${IMG.a}%`]));
      });

      it('does not query for files the exam itself still uses', async () => {
        givenExam([url('a')]);

        await service.update('exam-1', {
          questions: questionsWith([url('a')]),
        } as UpdateExamInput);

        expect(query).not.toHaveBeenCalled();
      });

      it('update deletes nothing when the reference query fails', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a')] }],
          [{ questionImage: url('b'), passageId: 'reading-1' }],
        );
        query.mockRejectedValue(new Error('ER_BAD_FIELD_ERROR'));
        const consoleError = jest
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);

        await expect(
          service.update('exam-1', {
            questions: [{ question: 'ข้อ 1' }],
          } as UpdateExamInput),
        ).resolves.toBeDefined();

        expect(query).toHaveBeenCalledTimes(2);
        expect(deleteByUrl).not.toHaveBeenCalled();
        consoleError.mockRestore();
      });

      it('remove deletes nothing when the reference query fails or returns nothing', async () => {
        givenExamWith(
          [{ ...reading, images: [url('a')] }],
          [{ questionImage: url('b') }],
        );
        query
          .mockRejectedValueOnce(new Error('connection lost'))
          .mockResolvedValueOnce([]);
        const consoleError = jest
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);

        await expect(service.remove('exam-1')).resolves.toBe(true);

        expect(query).toHaveBeenCalledTimes(2);
        expect(deleteByUrl).not.toHaveBeenCalled();
        consoleError.mockRestore();
      });
    });
  });

  describe('release date (task 10)', () => {
    const author = { id: 'admin-1' } as User;
    const input = {
      title: 'ชุดที่ 2',
      category: 'physics',
      questions: [{ question: 'ข้อ 1' }],
    } as CreateExamInput;

    function createdExam(): Partial<Exam> {
      const calls = manager.create.mock.calls as unknown[][];
      return calls.find((args) => args[0] === Exam)![1] as Partial<Exam>;
    }

    function examUpdate(): Partial<Exam> {
      return (manager.update.mock.calls[0] as unknown[])[2] as Partial<Exam>;
    }

    beforeEach(() => {
      examsRepo.findOne.mockResolvedValue(makeExam([]));
    });

    describe('create', () => {
      it('not sent → left to the DB default CURRENT_TIMESTAMP (now)', async () => {
        await service.create(input, author);

        expect(createdExam()).not.toHaveProperty('releaseDate');
        const column = getMetadataArgsStorage().columns.find(
          (c) => c.target === Exam && c.propertyName === 'releaseDate',
        )!;
        expect(column.options.type).toBe('datetime');
        expect(column.options.nullable).toBeFalsy();
        expect((column.options.default as () => string)()).toBe(
          'CURRENT_TIMESTAMP',
        );
      });

      it('null → same as not sent', async () => {
        await service.create({ ...input, releaseDate: null }, author);

        expect(createdExam()).not.toHaveProperty('releaseDate');
      });

      it.each([
        ['2026-11-05T03:00:00.000Z', '2026-11-05T03:00:00.000Z'],
        ['2026-11-05T10:00:00+07:00', '2026-11-05T03:00:00.000Z'],
        ['2020-01-31T17:30:00Z', '2020-01-31T17:30:00.000Z'],
      ])('sent %s → stores that instant', async (sent, iso) => {
        await service.create({ ...input, releaseDate: sent }, author);

        const releaseDate = createdExam().releaseDate;
        expect(releaseDate).toBeInstanceOf(Date);
        expect(releaseDate!.toISOString()).toBe(iso);
      });

      it.each(['0999-06-01T00:00:00Z', 'not a date'])(
        'rejects %s with 400 before saving',
        async (sent) => {
          await expect(
            service.create({ ...input, releaseDate: sent }, author),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(manager.save).not.toHaveBeenCalled();
        },
      );
    });

    describe('update', () => {
      it('not sent → keeps the current release date', async () => {
        await service.update('exam-1', { title: 'ชื่อใหม่' });

        expect(examUpdate()).not.toHaveProperty('releaseDate');
        expect(examUpdate().title).toBe('ชื่อใหม่');
      });

      it('null → keeps the current release date', async () => {
        await service.update('exam-1', { releaseDate: null });

        expect(examUpdate()).not.toHaveProperty('releaseDate');
      });

      it('sent → stores that instant', async () => {
        await service.update('exam-1', {
          releaseDate: '2027-01-01T08:15:00+07:00',
        });

        expect(examUpdate().releaseDate).toEqual(
          new Date('2027-01-01T01:15:00.000Z'),
        );
      });

      it('rejects a year MySQL datetime cannot store with 400', async () => {
        await expect(
          service.update('exam-1', { releaseDate: '0500-01-01T00:00:00Z' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(manager.update).not.toHaveBeenCalled();
      });
    });

    describe('lists order by releaseDate DESC, then createdAt DESC', () => {
      let qb: Record<string, jest.Mock>;

      beforeEach(() => {
        qb = {};
        for (const m of [
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
        qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
        (
          examsRepo as unknown as { createQueryBuilder: jest.Mock }
        ).createQueryBuilder = jest.fn(() => qb);
      });

      function expectReleaseOrder() {
        expect(qb.orderBy.mock.calls).toEqual([['exam.releaseDate', 'DESC']]);
        expect(qb.addOrderBy.mock.calls).toEqual([['exam.createdAt', 'DESC']]);
        // releaseDate is the primary sort key, createdAt only breaks ties
        expect(qb.orderBy.mock.invocationCallOrder[0]).toBeLessThan(
          qb.addOrderBy.mock.invocationCallOrder[0],
        );
      }

      it('public list (GET /exams)', async () => {
        await service.findPublished(1, 10);
        expectReleaseOrder();
        expect(qb.andWhere).toHaveBeenCalledWith('exam.status = :status', {
          status: QuestionStatus.PUBLISHED,
        });
      });

      it('admin list (GET /exams/admin/all)', async () => {
        await service.findAll(1, 10);
        expectReleaseOrder();
      });

      it('topic list (GET /exams/topic/:topicId)', async () => {
        await service.findByTopic('topic-1');
        expectReleaseOrder();
      });
    });
  });

  describe('Mock Exam (task 11)', () => {
    const url = (name: keyof typeof IMG) => `${LOCAL}/${IMG[name]}`;
    const author = { id: 'admin-1' } as User;
    const input = {
      title: 'Mock 1',
      category: 'physics',
      questions: [{ question: 'ข้อ 1' }],
    } as CreateExamInput;

    function createdExam(): Partial<Exam> {
      const calls = manager.create.mock.calls as unknown[][];
      return calls.find((args) => args[0] === Exam)![1] as Partial<Exam>;
    }

    function examUpdate(): Partial<Exam> {
      return (manager.update.mock.calls[0] as unknown[])[2] as Partial<Exam>;
    }

    // Stored exam; findOne loads detailBlocks with the second findOne call
    function givenMock(fields: Partial<Exam> = {}, questions: string[] = []) {
      examsRepo.findOne.mockResolvedValue({
        ...makeExam(questions),
        isMock: true,
        accessType: ExamAccessType.FREE,
        price: null,
        accessDays: null,
        level: null,
        passages: null,
        detailBlocks: null,
        ...fields,
      } as Exam);
    }

    const textBlock = (text: string) => ({ type: 'text' as const, text });
    const imageBlock = (u: string) => ({ type: 'image' as const, url: u });

    describe('AC1 create/update/findOne store and return the new fields', () => {
      beforeEach(() => givenMock());

      it('create stores every field, keeping only the field of each block type', async () => {
        await service.create(
          {
            ...input,
            isMock: true,
            accessType: ExamAccessType.PURCHASE,
            price: 150,
            accessDays: 365,
            level: ExamLevel.HARD,
            detailBlocks: [
              { type: 'text', text: 'ก่อนรูป', url: '/uploads/ignored.png' },
              { type: 'image', url: url('a'), text: 'ignored' },
              { type: 'text', text: '   ' },
              { type: 'text', text: 'หลังรูป' },
            ],
          },
          author,
        );

        expect(createdExam()).toMatchObject({
          isMock: true,
          accessType: ExamAccessType.PURCHASE,
          price: 150,
          accessDays: 365,
          level: ExamLevel.HARD,
          detailBlocks: [
            textBlock('ก่อนรูป'),
            imageBlock(url('a')),
            textBlock('หลังรูป'),
          ],
        });
      });

      it('create without the fields = normal exam, free, nulls', async () => {
        await service.create(input, author);

        expect(createdExam()).toMatchObject({
          isMock: false,
          accessType: ExamAccessType.FREE,
          price: null,
          accessDays: null,
          level: null,
          detailBlocks: null,
        });
      });

      it.each([
        ['no price', {}],
        ['price null', { price: null }],
        ['price 0', { price: 0 }],
      ])(
        'create purchase with %s → 400 before saving',
        async (_label, fields) => {
          const error = await service
            .create(
              {
                ...input,
                isMock: true,
                accessType: ExamAccessType.PURCHASE,
                ...fields,
              },
              author,
            )
            .catch((err: unknown) => err);

          expect(error).toBeInstanceOf(BadRequestException);
          expect((error as BadRequestException).message).toBe(
            'ชุดข้อสอบที่ต้องซื้อต้องระบุราคามากกว่า 0 บาท',
          );
          expect(manager.save).not.toHaveBeenCalled();
        },
      );

      it('update stores the fields that were sent', async () => {
        await service.update('exam-1', {
          isMock: true,
          accessType: ExamAccessType.CODE,
          accessDays: 30,
          level: ExamLevel.EASY,
          detailBlocks: [textBlock('x'), imageBlock(url('a'))],
        });

        expect(examUpdate()).toMatchObject({
          isMock: true,
          accessType: ExamAccessType.CODE,
          price: null,
          accessDays: 30,
          level: ExamLevel.EASY,
          detailBlocks: [textBlock('x'), imageBlock(url('a'))],
        });
      });

      it('update without the fields keeps them (detailBlocks not written)', async () => {
        givenMock({
          accessType: ExamAccessType.PURCHASE,
          price: 150,
          accessDays: 90,
          level: ExamLevel.MEDIUM,
          detailBlocks: [textBlock('เดิม')],
        });

        await service.update('exam-1', { title: 'ชื่อใหม่' });

        expect(examUpdate()).toMatchObject({
          title: 'ชื่อใหม่',
          isMock: true,
          accessType: ExamAccessType.PURCHASE,
          price: 150,
          accessDays: 90,
          level: ExamLevel.MEDIUM,
        });
        expect(examUpdate()).not.toHaveProperty('detailBlocks');
      });

      it('update with null clears price/accessDays/level, [] or null clears the blocks', async () => {
        givenMock({ price: 99, accessDays: 9, level: ExamLevel.HARD });

        await service.update('exam-1', {
          price: null,
          accessDays: null,
          level: null,
          detailBlocks: [],
        });

        expect(examUpdate()).toMatchObject({
          price: null,
          accessDays: null,
          level: null,
          detailBlocks: null,
        });
      });

      it('update to purchase checks the price the exam will have', async () => {
        // no price stored, none sent → 400
        await expect(
          service.update('exam-1', { accessType: ExamAccessType.PURCHASE }),
        ).rejects.toBeInstanceOf(BadRequestException);
        // clearing the price of a purchase exam → 400
        givenMock({ accessType: ExamAccessType.PURCHASE, price: 150 });
        await expect(
          service.update('exam-1', { price: null }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(manager.update).not.toHaveBeenCalled();

        // stored price is kept → OK
        await service.update('exam-1', { title: 'x' });
        expect(examUpdate().price).toBe(150);
      });

      it('findOne (GET /exams/admin/:id) returns detailBlocks (null → [], bad blocks skipped)', async () => {
        givenMock({
          detailBlocks: [
            textBlock('a'),
            { type: 'video', url: 'x' },
            imageBlock('javascript:alert(1)'),
            imageBlock(url('a')),
          ] as never,
        });
        const exam = await service.findOne('exam-1');
        expect(exam.detailBlocks).toEqual([
          textBlock('a'),
          imageBlock(url('a')),
        ]);
        expect(exam).toMatchObject({ isMock: true, accessType: 'free' });

        givenMock({ detailBlocks: null });
        await expect(service.findOne('exam-1')).resolves.toMatchObject({
          detailBlocks: [],
        });
      });

      it('price column is DECIMAL(10,2) read as a number', () => {
        const column = getMetadataArgsStorage().columns.find(
          (c) => c.target === Exam && c.propertyName === 'price',
        )!;
        expect(column.options).toMatchObject({
          type: 'decimal',
          precision: 10,
          scale: 2,
          nullable: true,
        });
        const transformer = column.options.transformer as {
          from: (v: unknown) => unknown;
        };
        expect(transformer.from('150.00')).toBe(150);
        expect(transformer.from('99.50')).toBe(99.5);
        expect(transformer.from(null)).toBeNull();

        const blocks = getMetadataArgsStorage().columns.find(
          (c) => c.target === Exam && c.propertyName === 'detailBlocks',
        )!;
        expect(blocks.options).toMatchObject({ type: 'json', select: false });
      });
    });

    describe('AC1 detail block image files', () => {
      it('deletes a block image removed from the description, after saving', async () => {
        givenMock({
          detailBlocks: [imageBlock(url('a')), imageBlock(url('b'))],
        });

        await service.update('exam-1', {
          detailBlocks: [imageBlock(url('b'))],
        });

        expect(deletedUrls()).toEqual([url('a')]);
        expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(
          deleteByUrl.mock.invocationCallOrder[0],
        );
      });

      it('keeps an image still used by another block, a question or a passage of this exam', async () => {
        givenMock(
          {
            detailBlocks: [
              imageBlock(url('a')),
              imageBlock(url('b')),
              imageBlock(url('c')),
            ],
            passages: [{ id: 'p', body: 'x', images: [url('c')] }] as never,
          },
          [url('b')],
        );

        await service.update('exam-1', {
          detailBlocks: [textBlock('x'), imageBlock(url('a'))],
        });

        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('keeps an image another exam/blog still refers to (UPLOAD_REFERENCE_SQL covers detailBlocks)', async () => {
        givenMock({
          detailBlocks: [imageBlock(url('a')), imageBlock(url('b'))],
        });
        query.mockImplementation((_sql: string, params: string[]) =>
          Promise.resolve([{ refs: params[0].includes(IMG.a) ? 1 : 0 }]),
        );

        await service.update('exam-1', { detailBlocks: [] });

        expect(deletedUrls()).toEqual([url('b')]);
        expect(UPLOAD_REFERENCE_SQL).toContain('CAST(detailBlocks AS CHAR)');
      });

      it('detailBlocks not sent → no image is touched', async () => {
        givenMock({ detailBlocks: [imageBlock(url('a'))] });

        await service.update('exam-1', { title: 'x' });

        expect(query).not.toHaveBeenCalled();
        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('deletes nothing when the transaction fails', async () => {
        givenMock({ detailBlocks: [imageBlock(url('a'))] });
        manager.update.mockRejectedValueOnce(new Error('db down'));

        await expect(
          service.update('exam-1', { detailBlocks: [] }),
        ).rejects.toThrow('db down');
        expect(deleteByUrl).not.toHaveBeenCalled();
      });

      it('remove deletes the block images too', async () => {
        givenMock({ detailBlocks: [imageBlock(url('a')), textBlock('x')] }, [
          url('b'),
        ]);

        await service.remove('exam-1');

        expect(deletedUrls().sort()).toEqual([url('a'), url('b')].sort());
      });
    });

    describe('lists', () => {
      let qb: Record<string, jest.Mock>;

      beforeEach(() => {
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
          'groupBy',
          'skip',
          'take',
          'offset',
          'limit',
        ]) {
          qb[m] = jest.fn(() => qb);
        }
        qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
        qb.getRawMany = jest.fn().mockResolvedValue([]);
        qb.getRawOne = jest.fn().mockResolvedValue(undefined);
        qb.getCount = jest.fn().mockResolvedValue(0);
        (
          examsRepo as unknown as { createQueryBuilder: jest.Mock }
        ).createQueryBuilder = jest.fn(() => qb);
      });

      const where = () => [
        ...(qb.where.mock.calls as unknown[][]),
        ...(qb.andWhere.mock.calls as unknown[][]),
      ];
      const selected = () =>
        [
          ...(qb.select.mock.calls as unknown[][]),
          ...(qb.addSelect.mock.calls as unknown[][]),
        ].map((call) => call[0] as string);

      const row = {
        id: 'm1',
        title: 'Mock 1',
        category: 'tgat',
        categoryName: 'TGAT',
        subjectId: 's1',
        subjectName: 'คณิตศาสตร์',
        bannerImage: null,
        questionCount: 40,
        durationMinutes: 90,
        level: 'hard',
        accessType: 'purchase',
        price: '150.00',
        releaseDate: new Date('2026-11-05T03:00:00.000Z'),
      };

      it('GET /exams (old list) hides mock exams', async () => {
        await service.findPublished(1, 10);
        expect(where()).toContainEqual([
          'exam.isMock = :isMock',
          { isMock: false },
        ]);
      });

      it('GET /exams/topic/:topicId hides mock exams', async () => {
        await service.findByTopic('topic-1');
        expect(where()).toContainEqual([
          'exam.isMock = :isMock',
          { isMock: false },
        ]);
      });

      it('admin list (GET /exams/admin/all) still shows mock exams', async () => {
        await service.findAll(1, 10);
        expect(JSON.stringify(where())).not.toContain('isMock');
      });

      it('GET /exams/mock: published mock exams only, newest release first, card fields only', async () => {
        qb.getRawMany.mockResolvedValue([row]);
        qb.getCount.mockResolvedValue(13);

        const result = await service.findMockExams(2, 12);

        expect(where()).toEqual(
          expect.arrayContaining([
            ['exam.isMock = :isMock', { isMock: true }],
            ['exam.status = :status', { status: QuestionStatus.PUBLISHED }],
          ]),
        );
        expect(qb.orderBy.mock.calls).toEqual([['exam.releaseDate', 'DESC']]);
        expect(qb.addOrderBy.mock.calls).toEqual([['exam.createdAt', 'DESC']]);
        expect(qb.offset).toHaveBeenCalledWith(12);
        expect(qb.limit).toHaveBeenCalledWith(12);
        // never questions, answers, author or the description
        expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
        for (const column of selected()) {
          expect(column).not.toMatch(/question\.|questions|author|choices/);
        }
        expect(selected()).not.toContain('exam.detailBlocks');

        expect(result).toEqual({
          items: [
            {
              ...row,
              price: 150,
              level: 'hard',
              accessType: 'purchase',
              // guest (task 15)
              access: { status: 'locked', expiresAt: null },
            },
          ],
          total: 13,
          page: 2,
          limit: 12,
          totalPages: 2,
        });
        expect(result.items[0]).not.toHaveProperty('questions');
      });

      it('GET /exams/mock?category= filters by slug or name; bad page/limit are clamped', async () => {
        const result = await service.findMockExams(NaN, 1000, 'tgat');

        expect(qb.andWhere).toHaveBeenCalledWith(
          '(exam.category = :category OR cat.name = :category)',
          { category: 'tgat' },
        );
        expect(result).toMatchObject({ page: 1, limit: 100 });
      });

      it('GET /exams/mock/:id returns the card fields + description + blocks, no questions', async () => {
        qb.getRawOne.mockResolvedValue({
          ...row,
          price: '99.50',
          description: 'คำอธิบาย',
          detailBlocks: JSON.stringify([
            textBlock('a'),
            imageBlock('/uploads/x.png'),
          ]),
        });

        const exam = await service.findMockOne('m1');

        expect(qb.andWhere).toHaveBeenCalledWith('exam.id = :id', {
          id: 'm1',
        });
        expect(exam).toEqual({
          ...row,
          price: 99.5,
          description: 'คำอธิบาย',
          detailBlocks: [textBlock('a'), imageBlock('/uploads/x.png')],
          access: { status: 'locked', expiresAt: null },
          codeInstructions: null,
        });
        expect(exam).not.toHaveProperty('questions');
        expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
      });

      it('GET /exams/mock/:id of a non-mock, draft or missing exam → 404', async () => {
        qb.getRawOne.mockResolvedValue(undefined);

        await expect(service.findMockOne('normal-exam')).rejects.toBeInstanceOf(
          NotFoundException,
        );
        // the query only matches published mock exams
        expect(where()).toEqual(
          expect.arrayContaining([
            ['exam.isMock = :isMock', { isMock: true }],
            ['exam.status = :status', { status: QuestionStatus.PUBLISHED }],
          ]),
        );
      });

      it('GET /exams/mock/categories: published mock categories in admin order, name falls back to slug', async () => {
        qb.getRawMany.mockResolvedValue([
          { slug: 'old-cat', name: null, orderIndex: null, count: '1' },
          { slug: 'tgat', name: 'TGAT', orderIndex: 2, count: '3' },
          { slug: 'a-level', name: 'A-Level', orderIndex: '1', count: 2 },
        ]);

        await expect(service.findMockCategories()).resolves.toEqual([
          { name: 'A-Level', slug: 'a-level', count: 2 },
          { name: 'TGAT', slug: 'tgat', count: 3 },
          { name: 'old-cat', slug: 'old-cat', count: 1 },
        ]);
        expect(where()).toEqual(
          expect.arrayContaining([
            ['exam.isMock = :isMock', { isMock: true }],
            ['exam.status = :status', { status: QuestionStatus.PUBLISHED }],
          ]),
        );
      });
    });
  });
});
