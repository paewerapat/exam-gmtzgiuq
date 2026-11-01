import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { ExamAttempt } from './attempt.entity';

describe('AttemptsController', () => {
  let controller: AttemptsController;
  let service: { findOneForUser: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    service = {
      findOneForUser: jest.fn(),
      findOne: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [AttemptsController],
      providers: [{ provide: AttemptsService, useValue: service }],
    }).compile();

    controller = module.get(AttemptsController);
  });

  describe('GET /attempts/my/:id (SEC-6)', () => {
    it('looks the attempt up for the logged-in user, not by id alone', async () => {
      const attempt = { id: 'att-a', userId: 'user-a' } as ExamAttempt;
      service.findOneForUser.mockResolvedValue(attempt);

      await expect(
        controller.findMyAttempt('att-a', { user: { id: 'user-a' } }),
      ).resolves.toBe(attempt);

      expect(service.findOneForUser).toHaveBeenCalledWith('att-a', 'user-a');
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('requires a JWT', () => {
      const handler = Object.getOwnPropertyDescriptor(
        AttemptsController.prototype,
        'findMyAttempt',
      )?.value as object;
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
