import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackService } from './feedback.service';
import { Feedback } from './feedback.entity';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let repo: jest.Mocked<Repository<Feedback>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(Feedback),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(FeedbackService);
    repo = module.get(getRepositoryToken(Feedback));
  });

  describe('create', () => {
    it('stores the userId from the authenticated request, not the client payload', async () => {
      const created = { id: 'f1' } as Feedback;
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.create(
        { message: 'อยากให้เพิ่มโจทย์ฟิสิกส์', age: 16 },
        'user-123',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123', age: 16 }),
      );
      expect(repo.save).toHaveBeenCalledWith(created);
    });

    it('allows anonymous feedback with a null userId', async () => {
      const created = { id: 'f2' } as Feedback;
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.create({ message: 'เยี่ยมมาก' }, null);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          examId: null,
          age: null,
          details: null,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('paginates using the requested page and limit', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll(2, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result).toEqual({ items: [], total: 0, page: 2, limit: 10 });
    });
  });
});
