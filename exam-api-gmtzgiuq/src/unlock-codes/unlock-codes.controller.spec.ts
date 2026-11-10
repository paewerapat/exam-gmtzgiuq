import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UnlockCodesController } from './unlock-codes.controller';
import { UnlockCodesService } from './unlock-codes.service';
import { RedeemException } from './unlock-code-format';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Header x-test-user = logged in (role from x-test-role), else 401/403. */
const fakeJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const id = req.headers['x-test-user'];
    if (!id) return false;
    req.user = { id, role: req.headers['x-test-role'] ?? 'user' };
    return true;
  },
};

describe('UnlockCodesController (task 15)', () => {
  let app: INestApplication<App>;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      redeem: jest.fn().mockResolvedValue({
        unlockedExamIds: [UUID],
        expiresAt: '2026-12-10T05:00:00.000Z',
      }),
      listBatches: jest.fn().mockResolvedValue({ route: 'batches' }),
      createBatch: jest.fn().mockResolvedValue({ route: 'create' }),
      getBatch: jest.fn().mockResolvedValue({ route: 'batch' }),
      updateBatch: jest.fn().mockResolvedValue({ route: 'update' }),
      listCodes: jest.fn().mockResolvedValue({ route: 'codes' }),
      updateCode: jest.fn().mockResolvedValue({ route: 'code' }),
      exportCsv: jest.fn().mockResolvedValue({
        name: 'แคมเปญ ม.6',
        csv: '﻿code,status\r\nABC,unused\r\n',
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [UnlockCodesController],
      providers: [{ provide: UnlockCodesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwt)
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
      Object.getOwnPropertyDescriptor(UnlockCodesController.prototype, name)!
        .value as object,
    ) as unknown[];

  it('redeem needs a JWT; every admin route needs JWT + AdminGuard (in that order)', () => {
    expect(guardsOf('redeem')).toEqual([JwtAuthGuard]);
    for (const name of [
      'listBatches',
      'createBatch',
      'exportCsv',
      'listCodes',
      'getBatch',
      'updateBatch',
      'updateCode',
    ]) {
      expect(guardsOf(name)).toEqual([JwtAuthGuard, AdminGuard]);
    }
  });

  describe('POST /unlock-codes/redeem', () => {
    it('200 with the result; passes the logged-in user', async () => {
      const res = await request(app.getHttpServer())
        .post('/unlock-codes/redeem')
        .set('x-test-user', 'user-a')
        .send({ code: 'abcde-fghjk', examId: UUID })
        .expect(200);

      expect(res.body).toEqual({
        unlockedExamIds: [UUID],
        expiresAt: '2026-12-10T05:00:00.000Z',
      });
      expect(service.redeem).toHaveBeenCalledWith(
        { id: 'user-a', role: 'user' },
        { code: 'abcde-fghjk', examId: UUID },
      );
    });

    it('not logged in → rejected before the service', async () => {
      await request(app.getHttpServer())
        .post('/unlock-codes/redeem')
        .send({ code: 'ABCDEFGHJK', examId: UUID })
        .expect(403);
      expect(service.redeem).not.toHaveBeenCalled();
    });

    it('redeem errors reach the client as { statusCode, message, errorCode }', async () => {
      service.redeem.mockRejectedValue(new RedeemException('EXPIRED'));
      const res = await request(app.getHttpServer())
        .post('/unlock-codes/redeem')
        .set('x-test-user', 'user-a')
        .send({ code: 'ABCDEFGHJK', examId: UUID })
        .expect(410);
      expect(res.body).toEqual({
        statusCode: 410,
        message: 'โค้ดนี้หมดอายุแล้ว',
        errorCode: 'EXPIRED',
      });

      service.redeem.mockRejectedValue(
        new RedeemException('TOO_MANY_ATTEMPTS'),
      );
      await request(app.getHttpServer())
        .post('/unlock-codes/redeem')
        .set('x-test-user', 'user-a')
        .send({ code: 'ABCDEFGHJK', examId: UUID })
        .expect(429);
    });

    it('a bad body reaches the service as-is (it answers in the contract shape); extra keys are stripped', async () => {
      service.redeem.mockRejectedValue(new RedeemException('INVALID_FORMAT'));
      const res = await request(app.getHttpServer())
        .post('/unlock-codes/redeem')
        .set('x-test-user', 'user-a')
        .send({ code: 42, examId: 'x', extra: true })
        .expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        message: 'รูปแบบโค้ดไม่ถูกต้อง',
        errorCode: 'INVALID_FORMAT',
      });
      expect(service.redeem).toHaveBeenCalledWith(expect.anything(), {
        code: 42,
        examId: 'x',
      });
    });
  });

  describe('admin routes', () => {
    const asAdmin = (req: request.Test) =>
      req.set('x-test-user', 'admin-1').set('x-test-role', 'admin');

    it('a student gets 403 from AdminGuard', async () => {
      await request(app.getHttpServer())
        .get('/unlock-codes/admin/batches')
        .set('x-test-user', 'user-a')
        .expect(403);
      expect(service.listBatches).not.toHaveBeenCalled();
    });

    it('routes reach the right handler (codes.csv / codes / :id)', async () => {
      const server = app.getHttpServer();
      await asAdmin(
        request(server).get(
          '/unlock-codes/admin/batches?page=2&limit=5&search=ม.6',
        ),
      ).expect(200);
      expect(service.listBatches).toHaveBeenCalledWith(2, 5, 'ม.6');

      await asAdmin(
        request(server).get(
          `/unlock-codes/admin/batches/${UUID}/codes?status=used&search=AB&page=3&limit=10`,
        ),
      ).expect(200);
      expect(service.listCodes).toHaveBeenCalledWith(UUID, 'used', 'AB', 3, 10);

      await asAdmin(
        request(server).get(`/unlock-codes/admin/batches/${UUID}/codes`),
      ).expect(200);
      expect(service.listCodes).toHaveBeenLastCalledWith(
        UUID,
        'all',
        undefined,
        1,
        50,
      );

      await asAdmin(
        request(server).get(`/unlock-codes/admin/batches/${UUID}`),
      ).expect(200);
      expect(service.getBatch).toHaveBeenCalledWith(UUID);
      expect(service.exportCsv).not.toHaveBeenCalled();
    });

    it('POST admin/batches → 201, validated body, the admin as creator', async () => {
      const body = {
        name: 'แคมเปญ',
        examIds: [UUID],
        allMock: false,
        count: 5000,
        accessDays: 30,
      };
      await asAdmin(
        request(app.getHttpServer()).post('/unlock-codes/admin/batches'),
      )
        .send(body)
        .expect(201);
      expect(service.createBatch).toHaveBeenCalledWith(body, {
        id: 'admin-1',
        role: 'admin',
      });

      await asAdmin(
        request(app.getHttpServer()).post('/unlock-codes/admin/batches'),
      )
        .send({ ...body, count: 5001 })
        .expect(400);
    });

    it('PATCH batch and code', async () => {
      await asAdmin(
        request(app.getHttpServer()).patch(
          `/unlock-codes/admin/batches/${UUID}`,
        ),
      )
        .send({ isActive: false, codeExpiresAt: null })
        .expect(200);
      expect(service.updateBatch).toHaveBeenCalledWith(UUID, {
        isActive: false,
        codeExpiresAt: null,
      });

      await asAdmin(
        request(app.getHttpServer()).patch('/unlock-codes/admin/codes/c1'),
      )
        .send({ isActive: false })
        .expect(200);
      expect(service.updateCode).toHaveBeenCalledWith('c1', false);
    });

    it('GET codes.csv: text/csv utf-8 with BOM, attachment named after the campaign', async () => {
      const res = await asAdmin(
        request(app.getHttpServer()).get(
          `/unlock-codes/admin/batches/${UUID}/codes.csv`,
        ),
      )
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(service.exportCsv).toHaveBeenCalledWith(UUID);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toContain('attachment;');
      expect(res.headers['content-disposition']).toContain(
        "filename*=UTF-8''unlock-codes-",
      );
      const body = res.body as Buffer;
      expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(body.toString('utf8')).toBe('﻿code,status\r\nABC,unused\r\n');
    });
  });
});
