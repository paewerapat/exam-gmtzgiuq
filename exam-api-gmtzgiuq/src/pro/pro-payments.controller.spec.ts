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
import { ProPaymentsController } from './pro-payments.controller';
import { ProPaymentsService } from './pro-payments.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProPageDto } from './dto/pro.dto';

const PLAN = '11111111-1111-4111-8111-111111111111';

type TestRequest = { headers: Record<string, string>; user?: unknown };

/** x-test-user = logged in (role from x-test-role); none → 401 like JWT. */
const fakeJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<TestRequest>();
    const id = req.headers['x-test-user'];
    if (!id) throw new UnauthorizedException();
    req.user = {
      id,
      email: `${id}@example.test`,
      role: req.headers['x-test-role'] ?? 'user',
    };
    return true;
  },
};

describe('ProPaymentsController (task 18)', () => {
  let app: INestApplication<App>;
  let payments: Record<string, jest.Mock>;

  beforeEach(async () => {
    payments = {
      quote: jest.fn().mockResolvedValue({ route: 'quote' }),
      checkout: jest.fn().mockResolvedValue({ route: 'checkout' }),
      listMine: jest.fn().mockResolvedValue({ route: 'listMine' }),
      handleWebhook: jest.fn().mockResolvedValue({ ok: true }),
      listForAdmin: jest.fn().mockResolvedValue({ route: 'admin' }),
      getMine: jest.fn().mockResolvedValue({ route: 'getMine' }),
      cancelRenewal: jest.fn().mockResolvedValue({ route: 'cancel' }),
      changeCard: jest.fn().mockResolvedValue({ route: 'changeCard' }),
    };
    const module = await Test.createTestingModule({
      controllers: [ProPaymentsController],
      providers: [{ provide: ProPaymentsService, useValue: payments }],
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

  const guardsOf = (name: string) =>
    Reflect.getMetadata(
      GUARDS_METADATA,
      Object.getOwnPropertyDescriptor(ProPaymentsController.prototype, name)!
        .value as object,
    ) as unknown[] | undefined;
  const server = () => request(app.getHttpServer());

  it('guards: webhook public, admin list JWT + Admin, the rest JWT', () => {
    expect(guardsOf('webhook')).toBeUndefined();
    expect(guardsOf('adminPayments')).toEqual([JwtAuthGuard, AdminGuard]);
    for (const name of [
      'quote',
      'checkout',
      'myPayments',
      'payment',
      'cancelRenewal',
      'changeCard',
    ]) {
      expect(guardsOf(name)).toEqual([JwtAuthGuard]);
    }
  });

  it('401 without login; admin list 403 for a user (AC12)', async () => {
    await server().get(`/pro/checkout/quote?planId=${PLAN}`).expect(401);
    await server().post('/pro/checkout').send({}).expect(401);
    await server().get('/pro/payments/me').expect(401);
    await server().get(`/pro/payments/${PLAN}`).expect(401);
    await server()
      .get('/pro/admin/payments')
      .set('x-test-user', 'u')
      .expect(403);
    await server()
      .get('/pro/admin/payments?status=failed&limit=100')
      .set('x-test-user', 'adm')
      .set('x-test-role', 'admin')
      .expect(200);
    expect(payments.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', limit: 100 }),
    );
  });

  it('quote: planId must be a uuid', async () => {
    await server()
      .get('/pro/checkout/quote?planId=x')
      .set('x-test-user', 'u')
      .expect(400);
    await server()
      .get(`/pro/checkout/quote?planId=${PLAN}`)
      .set('x-test-user', 'u')
      .expect(200);
    expect(payments.quote).toHaveBeenCalledWith('u', PLAN);
  });

  it('checkout: card needs a tokn_ token; amount from the client is dropped (AC13)', async () => {
    await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({ planId: PLAN, method: 'card' })
      .expect(400);
    await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({ planId: PLAN, method: 'card', cardToken: '4242424242424242' })
      .expect(400);
    await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({ planId: PLAN, method: 'cash' })
      .expect(400);
    await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({
        planId: PLAN,
        method: 'card',
        cardToken: 'tokn_test_abc123',
        amount: 1,
        totalSatang: 1,
      })
      .expect(200);
    const body = (payments.checkout.mock.calls[0] as unknown[])[1];
    expect(body).toEqual({
      planId: PLAN,
      method: 'card',
      cardToken: 'tokn_test_abc123',
    });
    await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({ planId: PLAN, method: 'promptpay' })
      .expect(200);
  });

  it('validation messages (round 2): one Thai message for a bad card token; VAT flag text', async () => {
    const res = await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({ planId: PLAN, method: 'card' })
      .expect(400);
    expect((res.body as { message: string[] }).message).toEqual([
      'ข้อมูลบัตรไม่ถูกต้อง กรุณากรอกบัตรใหม่อีกครั้ง',
    ]);
    const long = await server()
      .post('/pro/checkout')
      .set('x-test-user', 'u')
      .send({
        planId: PLAN,
        method: 'card',
        cardToken: `tokn_test_${'a'.repeat(90)}`,
      })
      .expect(400);
    expect((long.body as { message: string[] }).message).toHaveLength(1);
    const errors = await validate(
      plainToInstance(UpdateProPageDto, { vatEnabled: 'yes' }),
    );
    expect(Object.values(errors[0].constraints ?? {})).toEqual([
      'การเปิด VAT ต้องเป็น true หรือ false',
    ]);
  });

  it('webhook: only the id reaches the service, 200', async () => {
    await server()
      .post('/pro/payments/omise/webhook')
      .send({
        object: 'event',
        id: 'evnt_test_1',
        key: 'charge.complete',
        data: { status: 'successful' },
      })
      .expect(200, { ok: true });
    expect(payments.handleWebhook).toHaveBeenCalledWith(
      'evnt_test_1',
      expect.any(String),
    );
  });

  it('fixed paths come before payments/:id', async () => {
    await server()
      .get('/pro/payments/me?page=2')
      .set('x-test-user', 'u')
      .expect(200);
    expect(payments.listMine).toHaveBeenCalledWith('u', 2, undefined);
    expect(payments.getMine).not.toHaveBeenCalled();
    await server()
      .get(`/pro/payments/${PLAN}`)
      .set('x-test-user', 'u')
      .expect(200);
    expect(payments.getMine).toHaveBeenCalledWith('u', PLAN);
  });

  it('cancel-renewal / change-card pass the owner; change-card needs a token', async () => {
    await server()
      .post(`/pro/subscriptions/${PLAN}/cancel-renewal`)
      .set('x-test-user', 'u')
      .expect(200);
    expect(payments.cancelRenewal).toHaveBeenCalledWith('u', PLAN);
    await server()
      .post(`/pro/subscriptions/${PLAN}/change-card`)
      .set('x-test-user', 'u')
      .send({})
      .expect(400);
    await server()
      .post(`/pro/subscriptions/${PLAN}/change-card`)
      .set('x-test-user', 'u')
      .send({ cardToken: 'tokn_test_9' })
      .expect(200);
    expect(payments.changeCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u' }),
      PLAN,
      'tokn_test_9',
    );
  });
});
