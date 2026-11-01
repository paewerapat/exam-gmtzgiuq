import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { QuestionsService } from './questions.service';
import { Question } from './question.entity';
import { UploadService } from '../upload/upload.service';
import { CreateQuestionInput, UpdateQuestionInput } from './dto/question.dto';
import { User } from '../users/user.entity';

const LOCAL = 'http://localhost:3001/uploads';
// Upload filenames in the format POST /upload generates
const url = (n: number) => `${LOCAL}/170000000000${n}-000000000000000${n}.png`;

describe('QuestionsService — images (task 07)', () => {
  let service: QuestionsService;
  let repo: jest.Mocked<Repository<Question>>;
  let deleteByUrl: jest.SpyInstance;
  let create: jest.Mock;
  let find: jest.Mock;

  beforeEach(async () => {
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
          },
        },
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
});
