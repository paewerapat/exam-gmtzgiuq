import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, LoginTicket, TokenPayload } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { AuthService, PASSWORD_RESET_REQUESTED_MESSAGE } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User, UserRole } from '../users/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'setResetPasswordToken'
      | 'findOrCreateGoogleUser'
      | 'validatePassword'
    >
  >;
  let mail: { sendPasswordResetEmail: jest.Mock };

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn(),
      setResetPasswordToken: jest.fn(),
      findOrCreateGoogleUser: jest.fn(),
      validatePassword: jest.fn(),
    };
    mail = { sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: MailService, useValue: mail },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt') } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'client') } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('requestPasswordReset (SEC-3 / SEC-12)', () => {
    it.each([undefined, null, '', 123])(
      'rejects email %p before any lookup and sets no token',
      async (value) => {
        await expect(
          service.requestPasswordReset(value as string),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(users.findByEmail).not.toHaveBeenCalled();
        expect(users.setResetPasswordToken).not.toHaveBeenCalled();
      },
    );

    it('returns the generic message, not the token, for an existing email', async () => {
      users.findByEmail.mockResolvedValue(
        Object.assign(new User(), { id: 'u1', email: 'a@example.com' }),
      );

      const result = await service.requestPasswordReset('a@example.com');

      expect(result).toBe(PASSWORD_RESET_REQUESTED_MESSAGE);
      const token = users.setResetPasswordToken.mock.calls[0][1];
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(result).not.toContain(token);
      expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@example.com',
        token,
      );
    });

    it('returns the same message for an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('ghost@example.com'),
      ).resolves.toBe(PASSWORD_RESET_REQUESTED_MESSAGE);
      expect(users.setResetPasswordToken).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('validateUser (local login)', () => {
    it('checks the password against the stored hash', async () => {
      const user = Object.assign(new User(), {
        id: 'u1',
        email: 'a@example.com',
        provider: 'local',
        role: UserRole.USER,
        password: await bcrypt.hash('secret123', 4),
      });
      users.findByEmail.mockResolvedValue(user);
      users.validatePassword.mockImplementation((u, p) =>
        bcrypt.compare(p, u.password as string),
      );

      await expect(
        service.validateUser('a@example.com', 'secret123'),
      ).resolves.toBe(user);
      await expect(
        service.validateUser('a@example.com', 'wrong'),
      ).resolves.toBeNull();
    });
  });

  describe('validateUser with a non-string password', () => {
    it.each([123, null, undefined, '', {}, ['x']])(
      'returns null (→ 401) for password %p without touching bcrypt',
      async (value) => {
        await expect(
          service.validateUser('a@example.com', value as string),
        ).resolves.toBeNull();
        expect(users.findByEmail).not.toHaveBeenCalled();
        expect(users.validatePassword).not.toHaveBeenCalled();
      },
    );
  });

  describe('googleLogin', () => {
    function mockGooglePayload(payload: Partial<TokenPayload>) {
      const ticket = {
        getPayload: () => payload as TokenPayload,
      } as LoginTicket;
      // verifyIdToken is overloaded (promise / callback); `never` picks neither
      return jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(ticket as never);
    }

    const basePayload: Partial<TokenPayload> = {
      sub: 'google-sub',
      email: 'g@example.com',
      given_name: 'G',
    };

    it.each([false, undefined])(
      'rejects email_verified=%p without creating or loading a user',
      async (emailVerified) => {
        mockGooglePayload({ ...basePayload, email_verified: emailVerified });

        await expect(service.googleLogin('cred')).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(service.googleLogin('cred')).rejects.toThrow(
          /ยังไม่ได้รับการยืนยัน/,
        );
        expect(users.findOrCreateGoogleUser).not.toHaveBeenCalled();
      },
    );

    it('rejects a payload without sub', async () => {
      mockGooglePayload({
        email: 'g@example.com',
        email_verified: true,
      });

      await expect(service.googleLogin('cred')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findOrCreateGoogleUser).not.toHaveBeenCalled();
    });

    it('logs in when Google says the email is verified', async () => {
      mockGooglePayload({ ...basePayload, email_verified: true });
      const user = Object.assign(new User(), {
        id: 'u9',
        email: 'g@example.com',
        role: UserRole.USER,
      });
      users.findOrCreateGoogleUser.mockResolvedValue(user);

      await expect(service.googleLogin('cred')).resolves.toEqual({
        accessToken: 'jwt',
        user,
      });
      expect(users.findOrCreateGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'g@example.com',
          googleId: 'google-sub',
        }),
      );
    });

    it('turns an invalid Google token into the Thai error', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockRejectedValue(new Error('bad token') as never);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(service.googleLogin('cred')).rejects.toThrow(
        'ไม่สามารถเข้าสู่ระบบด้วย Google ได้',
      );
    });
  });
});
