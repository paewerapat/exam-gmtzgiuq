import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttemptsService } from './attempts.service';
import { ExamAttempt } from './attempt.entity';

describe('AttemptsService', () => {
  let service: AttemptsService;
  let findOne: jest.Mock;

  // Mimics the DB: findOne matches every key in `where`.
  const rows = [
    { id: 'att-a', userId: 'user-a', examTitle: 'ของ A' },
    { id: 'att-b', userId: 'user-b', examTitle: 'ของ B' },
  ] as ExamAttempt[];

  beforeEach(async () => {
    findOne = jest.fn(({ where }: { where: Partial<ExamAttempt> }) =>
      Promise.resolve(
        rows.find((r) =>
          Object.entries(where).every(
            ([k, v]) => r[k as keyof ExamAttempt] === v,
          ),
        ) ?? null,
      ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        {
          provide: getRepositoryToken(ExamAttempt),
          useValue: { findOne },
        },
      ],
    }).compile();

    service = module.get(AttemptsService);
  });

  describe('findOneForUser (SEC-6)', () => {
    it('returns the attempt to its owner', async () => {
      await expect(service.findOneForUser('att-a', 'user-a')).resolves.toEqual(
        rows[0],
      );
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'att-a', userId: 'user-a' },
        relations: ['user', 'exam'],
      });
    });

    it("404 when user B asks for user A's attempt", async () => {
      await expect(
        service.findOneForUser('att-a', 'user-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 when the attempt does not exist', async () => {
      await expect(
        service.findOneForUser('missing', 'user-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 without querying when there is no user id', async () => {
      await expect(
        service.findOneForUser('att-a', undefined as unknown as string),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });
  });
});
