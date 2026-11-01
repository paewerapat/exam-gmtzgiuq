import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/user.entity';

describe('JwtStrategy.validate', () => {
  const findById = jest.fn();
  const strategy = new JwtStrategy(
    { get: () => 'test-secret' } as unknown as ConfigService,
    { findById } as unknown as UsersService,
  );

  beforeEach(() => findById.mockReset());

  it.each([undefined, null, '', '   ', 123, {}, []])(
    'rejects sub=%p with 401 without looking up a user',
    async (sub) => {
      await expect(
        strategy.validate({ sub, email: 'x@example.com' } as JwtPayload),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findById).not.toHaveBeenCalled();
    },
  );

  it('rejects a token whose user no longer exists', async () => {
    findById.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'gone', email: 'x@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the user for a valid sub', async () => {
    const user = Object.assign(new User(), { id: 'u1' });
    findById.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: 'u1', email: 'x@example.com' }),
    ).resolves.toBe(user);
    expect(findById).toHaveBeenCalledWith('u1');
  });
});
