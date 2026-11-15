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
import { PredictedController } from './predicted.controller';
import { PredictedAdminController } from './predicted-admin.controller';
import { PredictedService } from './predicted.service';

const ID = '11111111-1111-4111-8111-111111111111';
const EXAM = '22222222-2222-4222-8222-222222222222';

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

/** Optional JWT: x-test-user = logged in, none = guest (null). */
const fakeOptionalJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<TestRequest>();
    const id = req.headers['x-test-user'];
    req.user = id ? { id, role: req.headers['x-test-role'] ?? 'user' } : null;
    return true;
  },
};

describe('Predicted controllers (task 22)', () => {
  let app: INestApplication<App>;
  let predicted: Record<string, jest.Mock>;

  beforeEach(async () => {
    predicted = {
      findPage: jest.fn().mockResolvedValue({ route: 'page' }),
      adminExamOptions: jest.fn().mockResolvedValue([]),
      adminList: jest.fn().mockResolvedValue([]),
      adminCreate: jest.fn().mockResolvedValue({ route: 'create' }),
      adminGet: jest.fn().mockResolvedValue({ route: 'get' }),
      adminUpdate: jest.fn().mockResolvedValue({ route: 'update' }),
      adminDelete: jest.fn().mockResolvedValue({ success: true }),
    };
    const module = await Test.createTestingModule({
      controllers: [PredictedController, PredictedAdminController],
      providers: [{ provide: PredictedService, useValue: predicted }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwt)
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(fakeOptionalJwt)
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

  it('GET /predicted: guests and users, ?venue / ?subject passed on', async () => {
    await server()
      .get(`/predicted?venue=netsat&subject=${ID}`)
      .expect(200, { route: 'page' });
    expect(predicted.findPage).toHaveBeenCalledWith(null, {
      venue: 'netsat',
      subject: ID,
    });
    await server().get('/predicted').set('x-test-user', 'u').expect(200);
    expect(predicted.findPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'u' }),
      { venue: undefined, subject: undefined },
    );
  });

  it('admin routes: JWT + Admin on the controller; 401 guest, 403 user (AC6)', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PredictedAdminController),
    ).toEqual([JwtAuthGuard, AdminGuard]);
    await server().get('/admin/predicted/series').expect(401);
    for (const [method, path] of [
      ['get', '/admin/predicted/exams'],
      ['get', '/admin/predicted/series'],
      ['post', '/admin/predicted/series'],
      ['get', `/admin/predicted/series/${ID}`],
      ['put', `/admin/predicted/series/${ID}`],
      ['delete', `/admin/predicted/series/${ID}`],
    ] as const) {
      await server()[method](path).set('x-test-user', 'u').expect(403);
    }
    for (const fn of Object.values(predicted)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('admin routes reach the service; "exams" is not taken by series/:id', async () => {
    await asAdmin(server().get('/admin/predicted/exams?search=jan')).expect(
      200,
    );
    expect(predicted.adminExamOptions).toHaveBeenCalledWith('jan');
    await asAdmin(server().get('/admin/predicted/series?venue=netsat')).expect(
      200,
    );
    expect(predicted.adminList).toHaveBeenCalledWith('netsat');
    await asAdmin(server().get(`/admin/predicted/series/${ID}`)).expect(200, {
      route: 'get',
    });
    expect(predicted.adminGet).toHaveBeenCalledWith(ID);
    await asAdmin(server().delete(`/admin/predicted/series/${ID}`)).expect(200);
    expect(predicted.adminDelete).toHaveBeenCalledWith(ID);
  });

  it('POST validates the body (Thai messages); unknown keys dropped', async () => {
    const bad = async (body: object, text: string) => {
      const res = await asAdmin(server().post('/admin/predicted/series'))
        .send(body)
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(text);
    };
    await bad({ title: 'x' }, 'กรุณาเลือกสนามสอบ');
    await bad({ venueId: ID, title: '   ' }, 'กรุณาใส่ชื่อซีรีส์');
    await bad({ venueId: ID, title: 'x', color: 'red' }, 'สีต้องเป็นรหัสสี');
    await bad(
      {
        venueId: ID,
        title: 'x',
        sets: [{ examId: EXAM, setNo: 0, access: 'pro' }],
      },
      'ลำดับชุด (setNo) ต้องเป็นจำนวนเต็ม 1–1000',
    );
    await bad(
      {
        venueId: ID,
        title: 'x',
        sets: [{ examId: EXAM, setNo: 1, access: 'gold' }],
      },
      'ต้องเป็น free หรือ pro',
    );
    await bad(
      {
        venueId: ID,
        title: 'x',
        sets: [{ examId: EXAM, setNo: 1, access: 'pro', previewCount: -1 }],
      },
      'จำนวนข้อ Preview',
    );
    await bad(
      { venueId: ID, title: 'x', sets: [{ examId: 'nope', setNo: 1 }] },
      'รหัสชุดข้อสอบ (examId) ไม่ถูกต้อง',
    );
    expect(predicted.adminCreate).not.toHaveBeenCalled();

    await asAdmin(server().post('/admin/predicted/series'))
      .send({
        venueId: ID,
        title: 'NETSAT MATH JAN',
        color: '#abc',
        isMock: true,
        sets: [
          { examId: EXAM, setNo: 1, access: 'pro', previewCount: null, x: 1 },
        ],
      })
      .expect(201, { route: 'create' });
    expect(predicted.adminCreate).toHaveBeenCalledWith({
      venueId: ID,
      title: 'NETSAT MATH JAN',
      color: '#abc',
      sets: [{ examId: EXAM, setNo: 1, access: 'pro', previewCount: null }],
    });
  });

  it('title: one Thai message per problem (missing, blank, not text, too long)', async () => {
    const messages = async (method: 'post' | 'put', body: object) => {
      const path =
        method === 'post'
          ? '/admin/predicted/series'
          : `/admin/predicted/series/${ID}`;
      const res = await asAdmin(server()[method](path)).send(body).expect(400);
      return (res.body as { message: string[] }).message;
    };
    await expect(messages('post', { venueId: ID })).resolves.toEqual([
      'กรุณาใส่ชื่อซีรีส์',
    ]);
    await expect(
      messages('post', { venueId: ID, title: '  ' }),
    ).resolves.toEqual(['กรุณาใส่ชื่อซีรีส์']);
    await expect(messages('post', { venueId: ID, title: 5 })).resolves.toEqual([
      'ชื่อซีรีส์ต้องเป็นข้อความ',
    ]);
    await expect(
      messages('post', { venueId: ID, title: 'ก'.repeat(151) }),
    ).resolves.toEqual(['ชื่อซีรีส์ยาวได้ไม่เกิน 150 ตัวอักษร']);
    await expect(messages('put', { title: null })).resolves.toEqual([
      'กรุณาใส่ชื่อซีรีส์',
    ]);
    await asAdmin(server().post('/admin/predicted/series'))
      .send({ venueId: ID, title: 'ก'.repeat(150) })
      .expect(201);
  });

  it('PUT: partial body; null clears subject / colour; null title → 400', async () => {
    await asAdmin(server().put(`/admin/predicted/series/${ID}`))
      .send({ subjectId: null, color: null, isActive: false })
      .expect(200);
    expect(predicted.adminUpdate).toHaveBeenCalledWith(ID, {
      subjectId: null,
      color: null,
      isActive: false,
    });
    await asAdmin(server().put(`/admin/predicted/series/${ID}`))
      .send({ title: null })
      .expect(400);
  });
});
