import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService, PASSWORD_RESET_REQUESTED_MESSAGE } from './auth.service';
import { LocalAuthGuard } from '../common/guards/local-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User, UserRole } from '../users/user.entity';

function makeUser(): User {
  return Object.assign(new User(), {
    id: 'u1',
    email: 'student@example.com',
    password: '$2b$10$hash',
    firstName: 'Somchai',
    lastName: 'Jaidee',
    isEmailVerified: true,
    emailVerificationToken: 'verify-secret',
    emailVerificationExpires: new Date(),
    resetPasswordToken: 'reset-secret',
    resetPasswordExpires: new Date(),
    provider: 'local',
    providerId: 'pid',
    isActive: true,
    role: UserRole.USER,
  });
}

// Matches the AC6 grep, but ignores the accessToken key of the login payload
function expectNoSecrets(text: string) {
  const body = text.replace(/"accessToken"/g, '"jwt"');
  expect(body).not.toMatch(/password/i);
  expect(body).not.toMatch(/Token"/);
  expect(body).not.toMatch(/Expires"/);
  expect(body).not.toMatch(/providerId/);
}

interface AuthBody {
  accessToken: string;
  user: Record<string, unknown>;
}

describe('AuthController (HTTP + ValidationPipe)', () => {
  let app: INestApplication<App>;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    verifyEmail: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  };
  const injectUser = {
    canActivate: (ctx: ExecutionContext) => {
      ctx.switchToHttp().getRequest<{ user: User }>().user = makeUser();
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(LocalAuthGuard)
      .useValue(injectUser)
      .overrideGuard(JwtAuthGuard)
      .useValue(injectUser)
      .compile();

    app = moduleRef.createNestApplication();
    // same options as main.ts
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /auth/request-password-reset (AC1)', () => {
    it.each([
      {},
      { email: null },
      { email: 123 },
      { email: '' },
      { email: 'x' },
    ])('returns 400 for %j and never reaches the service', async (body) => {
      await request(app.getHttpServer())
        .post('/auth/request-password-reset')
        .send(body)
        .expect(400);
      expect(authService.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('returns only the generic message for a valid email', async () => {
      authService.requestPasswordReset.mockResolvedValue(
        PASSWORD_RESET_REQUESTED_MESSAGE,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/request-password-reset')
        .send({ email: 'student@example.com' })
        .expect(201);

      expect(res.body).toEqual({ message: PASSWORD_RESET_REQUESTED_MESSAGE });
      expect(authService.requestPasswordReset).toHaveBeenCalledWith(
        'student@example.com',
      );
    });
  });

  describe('POST /auth/reset-password (AC2)', () => {
    it.each([
      { newPassword: 'x12345' },
      { token: null, newPassword: 'x12345' },
      { token: 123, newPassword: 'x12345' },
      { token: '', newPassword: 'x12345' },
      { token: 'tok' },
      { token: 'tok', newPassword: '123' },
    ])('returns 400 for %j and never reaches the service', async (body) => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send(body)
        .expect(400);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('returns { message } and no user data on success', async () => {
      authService.resetPassword.mockResolvedValue(makeUser());

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'tok', newPassword: 'x12345' })
        .expect(201);

      expect(Object.keys(res.body as object)).toEqual(['message']);
      expect(res.text).not.toContain('student@example.com');
      expect(authService.resetPassword).toHaveBeenCalledWith('tok', 'x12345');
    });
  });

  describe('POST /auth/verify-email (AC3)', () => {
    it.each([{}, { token: '' }, { token: null }, { token: 123 }])(
      'returns 400 for %j and never reaches the service',
      async (body) => {
        await request(app.getHttpServer())
          .post('/auth/verify-email')
          .send(body)
          .expect(400);
        expect(authService.verifyEmail).not.toHaveBeenCalled();
      },
    );

    it('returns { message } and no user data on success', async () => {
      authService.verifyEmail.mockResolvedValue(makeUser());

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'tok' })
        .expect(201);

      expect(Object.keys(res.body as object)).toEqual(['message']);
      expect(res.text).not.toContain('student@example.com');
      expect(authService.verifyEmail).toHaveBeenCalledWith('tok');
    });
  });

  describe('user secrets in responses (AC6)', () => {
    it('POST /auth/login returns the user without secrets', async () => {
      authService.login.mockImplementation((user: User) =>
        Promise.resolve({ accessToken: 'jwt', user }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'student@example.com', password: 'x' })
        .expect(201);

      expectNoSecrets(res.text);
      const body = res.body as AuthBody;
      expect(body.accessToken).toBe('jwt');
      expect(body.user).toMatchObject({
        id: 'u1',
        email: 'student@example.com',
        firstName: 'Somchai',
        role: 'user',
      });
    });

    it('POST /auth/register returns the user without secrets', async () => {
      authService.register.mockResolvedValue({
        accessToken: 'jwt',
        user: makeUser(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'student@example.com',
          password: 'secret123',
          firstName: 'Somchai',
          lastName: 'Jaidee',
        })
        .expect(201);

      expectNoSecrets(res.text);
      expect((res.body as AuthBody).user.email).toBe('student@example.com');
    });

    it('GET /auth/me returns the user without secrets', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(200);

      expectNoSecrets(res.text);
      expect(res.body).toMatchObject({
        email: 'student@example.com',
        firstName: 'Somchai',
        role: 'user',
      });
    });
  });
});
