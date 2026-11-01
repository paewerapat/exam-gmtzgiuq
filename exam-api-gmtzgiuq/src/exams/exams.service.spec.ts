import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

  beforeEach(async () => {
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
          },
        },
        { provide: UploadService, useValue: uploadService },
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
});
