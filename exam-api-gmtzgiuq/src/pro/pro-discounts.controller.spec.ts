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
import { ProDiscountsController } from './pro-discounts.controller';
import { ProDiscountsService } from './pro-discounts.service';

const ID = '11111111-1111-4111-8111-111111111111';

type TestRequest = { headers: Record<string, string>; user?: unknown };

/** x-test-user = logged in (role from x-test-role); none → 401 like JWT. */
const fakeJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<TestRequest>();
    const id = req.headers['x-test-user'];
    if (!id) throw new UnauthorizedException();
    req.user = { id, role: req.headers['x-test-role'] ?? 'user' };
    return true;
  },
};

describe('ProDiscountsController (task 19)', () => {
  let app: INestApplication<App>;
  let discounts: Record<string, jest.Mock>;

  beforeEach(async () => {
    discounts = {
      listForAdmin: jest.fn().mockResolvedValue({ route: 'list' }),
      create: jest.fn().mockResolvedValue({ route: 'create' }),
      getForAdmin: jest.fn().mockResolvedValue({ route: 'get' }),
      update: jest.fn().mockResolvedValue({ route: 'update' }),
      listRedemptions: jest.fn().mockResolvedValue({ route: 'redemptions' }),
    };
    const module = await Test.createTestingModule({
      controllers: [ProDiscountsController],
      providers: [{ provide: ProDiscountsService, useValue: discounts }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwt)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) =>
    r.set('x-test-user', 'adm').set('x-test-role', 'admin');

  it('JWT + Admin on the whole controller; 401 / 403 for others (AC8)', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProDiscountsController),
    ).toEqual([JwtAuthGuard, AdminGuard]);
    await server().get('/pro/admin/discount-codes').expect(401);
    for (const [method, path] of [
      ['get', '/pro/admin/discount-codes'],
      ['post', '/pro/admin/discount-codes'],
      ['get', `/pro/admin/discount-codes/${ID}`],
      ['put', `/pro/admin/discount-codes/${ID}`],
      ['get', `/pro/admin/discount-codes/${ID}/redemptions`],
    ] as const) {
      await server()[method](path).set('x-test-user', 'u').expect(403);
    }
    for (const fn of Object.values(discounts)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('routes reach the service; :id/redemptions is not taken by :id', async () => {
    await asAdmin(
      server().get('/pro/admin/discount-codes?search=NEW&isActive=true&page=2'),
    ).expect(200, { route: 'list' });
    expect(discounts.listForAdmin).toHaveBeenCalledWith({
      page: 2,
      limit: undefined,
      search: 'NEW',
      isActive: 'true',
    });
    await asAdmin(
      server().get(`/pro/admin/discount-codes/${ID}/redemptions?limit=100`),
    ).expect(200, { route: 'redemptions' });
    expect(discounts.listRedemptions).toHaveBeenCalledWith(ID, undefined, 100);
    expect(discounts.getForAdmin).not.toHaveBeenCalled();
    await asAdmin(server().get(`/pro/admin/discount-codes/${ID}`)).expect(200);
    expect(discounts.getForAdmin).toHaveBeenCalledWith(ID);
  });

  it('create / update validate the body (class DTO); unknown keys dropped', async () => {
    await asAdmin(server().post('/pro/admin/discount-codes'))
      .send({ code: 'x' })
      .expect(400);
    await asAdmin(server().post('/pro/admin/discount-codes'))
      .send({
        code: 'NEWYEAR20',
        discountType: 'percent',
        discountValue: 20,
        redeemedCount: 50,
      })
      .expect(201);
    expect(discounts.create).toHaveBeenCalledWith(
      { code: 'NEWYEAR20', discountType: 'percent', discountValue: 20 },
      expect.objectContaining({ id: 'adm' }),
    );
    await asAdmin(server().put(`/pro/admin/discount-codes/${ID}`))
      .send({ isActive: false, redeemedCount: 0 })
      .expect(200);
    expect(discounts.update).toHaveBeenCalledWith(ID, { isActive: false });
  });
});
