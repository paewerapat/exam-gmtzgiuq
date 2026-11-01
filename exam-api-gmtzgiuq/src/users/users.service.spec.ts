import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';

// Values that TypeORM would turn into a query without a WHERE (undefined) or
// that a JSON body can carry instead of a string
const INVALID_VALUES: unknown[] = [undefined, null, '', '   ', 123, {}, []];

function future(hours = 1): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: { findOne: jest.Mock; save: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((u: User) => Promise.resolve(u)),
      update: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findByEmail', () => {
    it.each(INVALID_VALUES)(
      'rejects %p before querying (no WHERE-less findOne)',
      async (value) => {
        await expect(
          service.findByEmail(value as string),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.findOne).not.toHaveBeenCalled();
      },
    );

    it('looks up a real email', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.findByEmail('a@example.com');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'a@example.com' },
      });
    });
  });

  describe('findById', () => {
    it.each(INVALID_VALUES)(
      'rejects id %p before querying (no WHERE-less findOne)',
      async (value) => {
        await expect(service.findById(value as string)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(repo.findOne).not.toHaveBeenCalled();
      },
    );

    it('looks up a real id (admin users/:id, updateProfile)', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.findById('u1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('findByProviderId', () => {
    it.each(INVALID_VALUES)(
      'rejects provider id %p before querying',
      async (value) => {
        await expect(
          service.findByProviderId('google', value as string),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('verifyEmail', () => {
    it.each(INVALID_VALUES)(
      'rejects token %p before querying and verifies nobody',
      async (value) => {
        await expect(
          service.verifyEmail(value as string),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.findOne).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown token', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.verifyEmail('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('verifies and clears the token with null so it cannot be reused', async () => {
      const user = Object.assign(new User(), {
        id: 'u1',
        isEmailVerified: false,
        emailVerificationToken: 'tok',
        emailVerificationExpires: future(24),
      });
      repo.findOne.mockResolvedValue(user);

      const result = await service.verifyEmail('tok');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { emailVerificationToken: 'tok' },
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        }),
      );
      expect(result.isEmailVerified).toBe(true);
    });

    it('rejects an expired token', async () => {
      repo.findOne.mockResolvedValue(
        Object.assign(new User(), {
          id: 'u1',
          emailVerificationToken: 'tok',
          emailVerificationExpires: new Date(Date.now() - 1000),
        }),
      );
      await expect(service.verifyEmail('tok')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it.each(INVALID_VALUES)(
      'rejects token %p before querying and changes no password',
      async (value) => {
        await expect(
          service.resetPassword(value as string, 'newpass123'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.findOne).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null, '', 123])(
      'rejects new password %p before querying',
      async (value) => {
        await expect(
          service.resetPassword('tok', value as string),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.findOne).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown token', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.resetPassword('nope', 'newpass123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('hashes the new password and clears the token with null', async () => {
      const user = Object.assign(new User(), {
        id: 'u1',
        password: 'old-hash',
        resetPasswordToken: 'tok',
        resetPasswordExpires: future(1),
      });
      repo.findOne.mockResolvedValue(user);

      await service.resetPassword('tok', 'newpass123');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { resetPasswordToken: 'tok' },
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          resetPasswordToken: null,
          resetPasswordExpires: null,
        }),
      );
      expect(user.password).not.toBe('old-hash');
      await expect(service.validatePassword(user, 'newpass123')).resolves.toBe(
        true,
      );
    });

    it('rejects an expired token', async () => {
      repo.findOne.mockResolvedValue(
        Object.assign(new User(), {
          id: 'u1',
          resetPasswordToken: 'tok',
          resetPasswordExpires: new Date(Date.now() - 1000),
        }),
      );
      await expect(
        service.resetPassword('tok', 'newpass123'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('validatePassword', () => {
    it('still reads the hash from the entity (toJSON does not affect it)', async () => {
      const user = Object.assign(new User(), {
        password: await bcrypt.hash('secret123', 4),
      });
      JSON.stringify(user);

      await expect(service.validatePassword(user, 'secret123')).resolves.toBe(
        true,
      );
      await expect(service.validatePassword(user, 'wrong')).resolves.toBe(
        false,
      );
    });

    it.each([123, null, undefined, {}, ['secret123']])(
      'returns false (no bcrypt throw) for a non-string password %p',
      async (value) => {
        const user = Object.assign(new User(), {
          password: await bcrypt.hash('secret123', 4),
        });
        await expect(
          service.validatePassword(user, value as string),
        ).resolves.toBe(false);
      },
    );
  });
});
