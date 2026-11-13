import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { ProController } from './pro.controller';
import { ProConfigService } from './pro-config.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import { ProException } from './pro-errors';

const UUID = '11111111-1111-4111-8111-111111111111';

type TestRequest = { headers: Record<string, string>; user?: unknown };

const userFrom = (req: TestRequest) => {
  const id = req.headers['x-test-user'];
  return id ? { id, role: req.headers['x-test-role'] ?? 'user' } : null;
};

/** x-test-user = logged in (role from x-test-role); none → 401 like JWT. */
const fakeJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<TestRequest>();
    const user = userFrom(req);
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  },
};
const fakeOptionalJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<TestRequest>();
    req.user = userFrom(req);
    return true;
  },
};

describe('ProController (task 17)', () => {
  let app: INestApplication<App>;
  let config: Record<string, jest.Mock>;
  let subscriptions: Record<string, jest.Mock>;

  beforeEach(async () => {
    config = {
      getUpgrade: jest.fn().mockResolvedValue({ route: 'upgrade' }),
      getAdminConfig: jest.fn().mockResolvedValue({ route: 'config' }),
      updatePage: jest.fn().mockResolvedValue({ route: 'page' }),
      createVenue: jest.fn().mockResolvedValue({ route: 'createVenue' }),
      updateVenue: jest.fn().mockResolvedValue({ route: 'updateVenue' }),
      deleteVenue: jest.fn().mockResolvedValue({ success: true }),
      createPlan: jest.fn().mockResolvedValue({ route: 'createPlan' }),
      updatePlan: jest.fn().mockResolvedValue({ route: 'updatePlan' }),
      deletePlan: jest.fn().mockResolvedValue({ success: true }),
    };
    subscriptions = {
      findMine: jest.fn().mockResolvedValue([]),
      listForAdmin: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      grant: jest.fn().mockResolvedValue({ route: 'grant' }),
      revoke: jest.fn().mockResolvedValue({ route: 'revoke' }),
    };

    const module = await Test.createTestingModule({
      controllers: [ProController],
      providers: [
        { provide: ProConfigService, useValue: config },
        { provide: ProSubscriptionsService, useValue: subscriptions },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwt)
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(fakeOptionalJwt)
      .compile();

    app = module.createNestApplication();
    // same pipe as main.ts
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const guardsOf = (name: string) =>
    Reflect.getMetadata(
      GUARDS_METADATA,
      Object.getOwnPropertyDescriptor(ProController.prototype, name)!
        .value as object,
    ) as unknown[];

  it('upgrade is public (optional JWT), me needs JWT, every admin route JWT + AdminGuard', () => {
    expect(guardsOf('upgrade')).toEqual([OptionalJwtAuthGuard]);
    expect(guardsOf('me')).toEqual([JwtAuthGuard]);
    for (const name of [
      'adminConfig',
      'updatePage',
      'createVenue',
      'updateVenue',
      'deleteVenue',
      'createPlan',
      'updatePlan',
      'deletePlan',
      'listSubscriptions',
      'grant',
      'revoke',
    ]) {
      expect(guardsOf(name)).toEqual([JwtAuthGuard, AdminGuard]);
    }
  });

  it('GET /pro/upgrade: guest → null viewer; logged in → the user', async () => {
    await request(app.getHttpServer()).get('/pro/upgrade').expect(200);
    expect(config.getUpgrade).toHaveBeenLastCalledWith(null);
    await request(app.getHttpServer())
      .get('/pro/upgrade')
      .set('x-test-user', 'user-a')
      .expect(200);
    expect(config.getUpgrade).toHaveBeenLastCalledWith({
      id: 'user-a',
      role: 'user',
    });
  });

  it('GET /pro/me: 401 without login; the own id otherwise', async () => {
    await request(app.getHttpServer()).get('/pro/me').expect(401);
    await request(app.getHttpServer())
      .get('/pro/me')
      .set('x-test-user', 'user-a')
      .expect(200);
    expect(subscriptions.findMine).toHaveBeenCalledWith('user-a');
  });

  describe('admin routes (AC4)', () => {
    const asAdmin = (req: request.Test) =>
      req.set('x-test-user', 'admin-1').set('x-test-role', 'admin');

    it('student → 403, guest → 401, service not called', async () => {
      await request(app.getHttpServer())
        .get('/pro/admin/config')
        .set('x-test-user', 'user-a')
        .expect(403);
      await request(app.getHttpServer())
        .post('/pro/admin/subscriptions')
        .send({ email: 'a@example.com', planId: UUID, days: 30 })
        .expect(401);
      expect(config.getAdminConfig).not.toHaveBeenCalled();
      expect(subscriptions.grant).not.toHaveBeenCalled();
    });

    it('routes reach their service methods', async () => {
      const server = app.getHttpServer();
      await asAdmin(request(server).get('/pro/admin/config')).expect(200);
      await asAdmin(request(server).put('/pro/admin/page'))
        .send({ title: 'แพ็กเกจ' })
        .expect(200);
      await asAdmin(request(server).post('/pro/admin/venues'))
        .send({ key: 'netsat', name: 'NETSAT' })
        .expect(201);
      await asAdmin(request(server).put(`/pro/admin/venues/${UUID}`))
        .send({ isActive: false })
        .expect(200);
      await asAdmin(request(server).delete(`/pro/admin/venues/${UUID}`)).expect(
        200,
      );
      await asAdmin(request(server).put(`/pro/admin/plans/${UUID}`))
        .send({ isVisible: false })
        .expect(200);
      await asAdmin(request(server).delete(`/pro/admin/plans/${UUID}`)).expect(
        200,
      );
      await asAdmin(
        request(server).get(
          '/pro/admin/subscriptions?page=2&limit=500&status=active&search=a@x&venueId=v',
        ),
      ).expect(200);
      await asAdmin(request(server).post('/pro/admin/subscriptions'))
        .send({ email: 'a@example.com', planId: UUID, days: 30 })
        .expect(201);
      await asAdmin(
        request(server).post(`/pro/admin/subscriptions/${UUID}/revoke`),
      )
        .send({ note: 'x' })
        .expect(200);

      expect(config.updateVenue).toHaveBeenCalledWith(UUID, {
        isActive: false,
      });
      expect(config.deletePlan).toHaveBeenCalledWith(UUID);
      expect(subscriptions.listForAdmin).toHaveBeenCalledWith({
        page: 2,
        limit: 500,
        venueId: 'v',
        planId: undefined,
        status: 'active',
        search: 'a@x',
      });
      expect(subscriptions.grant).toHaveBeenCalledWith(
        { email: 'a@example.com', planId: UUID, days: 30 },
        { id: 'admin-1', role: 'admin' },
      );
      expect(subscriptions.revoke).toHaveBeenCalledWith(
        UUID,
        { note: 'x' },
        { id: 'admin-1', role: 'admin' },
      );
    });

    it('bad body → 400 with Thai messages before the service', async () => {
      const res = await asAdmin(
        request(app.getHttpServer()).put(`/pro/admin/venues/${UUID}`),
      )
        .send({
          comparison: {
            groups: Array.from({ length: 21 }, () => ({
              title: 'x',
              rows: [],
            })),
          },
        })
        .expect(400);
      expect((res.body as { message: unknown }).message).toEqual([
        'ตารางเปรียบเทียบมีได้ไม่เกิน 20 กลุ่ม',
      ]);
      expect(config.updateVenue).not.toHaveBeenCalled();
    });

    it('service errors → { statusCode, message, errorCode }', async () => {
      config.deletePlan.mockRejectedValue(new ProException('PLAN_IN_USE'));
      const res = await asAdmin(
        request(app.getHttpServer()).delete(`/pro/admin/plans/${UUID}`),
      ).expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        message: 'แพ็กเกจนี้มีสมาชิกอ้างอิงอยู่ ลบไม่ได้ ให้ซ่อนแพ็กเกจแทน',
        errorCode: 'PLAN_IN_USE',
      });
    });
  });
});
