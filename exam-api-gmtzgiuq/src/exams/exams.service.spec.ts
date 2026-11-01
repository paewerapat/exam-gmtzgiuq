import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ExamsService } from './exams.service';
import { Exam } from './exam.entity';
import { Question, QuestionStatus } from '../questions/question.entity';
import { UploadService } from '../upload/upload.service';
import { CreateExamQuestionInput, UpdateExamInput } from './dto/exam.dto';

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
          useValue: { findOne: jest.fn() },
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
});
