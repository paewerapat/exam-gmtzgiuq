import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User, UserRole } from '../users/user.entity';

// POST /auth/login through the real LocalStrategy → AuthService → UsersService
// (bcrypt included); only the repository is mocked
describe('POST /auth/login (real local strategy)', () => {
  let app: INestApplication<App>;
  const findOne = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        UsersService,
        LocalStrategy,
        { provide: getRepositoryToken(User), useValue: { findOne } },
        { provide: JwtService, useValue: { sign: () => 'jwt' } },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 'client' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    findOne.mockResolvedValue(
      Object.assign(new User(), {
        id: 'u1',
        email: 'a@example.com',
        provider: 'local',
        role: UserRole.USER,
        password: await bcrypt.hash('secret123', 4),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([123, { $gt: '' }, ['secret123'], true])(
    'answers 401, not 500, for password %j',
    async (password) => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@example.com', password })
        .expect(401);
    },
  );

  it('answers 401 for a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'a@example.com', password: 'wrong' })
      .expect(401);
  });

  it('logs in with the right password and returns no secrets', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'a@example.com', password: 'secret123' })
      .expect(201);

    expect((res.body as { accessToken: string }).accessToken).toBe('jwt');
    expect(res.text).not.toMatch(/password/i);
  });
});
