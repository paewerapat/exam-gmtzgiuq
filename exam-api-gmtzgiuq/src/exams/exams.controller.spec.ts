import { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

/**
 * Stands in for OptionalJwtAuthGuard: header x-test-user = logged-in user id
 * (role from x-test-role), no header = guest (req.user = null).
 */
const fakeOptionalJwt = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const id = req.headers['x-test-user'];
    req.user = id ? { id, role: req.headers['x-test-role'] ?? 'user' } : null;
    return true;
  },
};

/**
 * Real Express routing with a mocked service: the public Mock Exam routes
 * (task 11) must be declared before `GET /exams/:id`, otherwise "mock" would
 * be taken as an exam id.
 */
describe('ExamsController routes (HTTP)', () => {
  let app: INestApplication<App>;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      findMockExams: jest.fn().mockResolvedValue({ route: 'mock-list' }),
      findMockCategories: jest.fn().mockResolvedValue([{ route: 'mock-cat' }]),
      findMockOne: jest.fn().mockResolvedValue({ route: 'mock-one' }),
      findPublishedOne: jest.fn().mockResolvedValue({ route: 'exam-one' }),
      findPublished: jest.fn().mockResolvedValue({ route: 'exam-list' }),
    };

    const module = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [{ provide: ExamsService, useValue: service }],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(fakeOptionalJwt)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /exams/mock → mock list (not :id), passing page/limit/category', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/mock?page=2&limit=6&category=tgat')
      .expect(200);

    expect(res.body).toEqual({ route: 'mock-list' });
    expect(service.findMockExams).toHaveBeenCalledWith(2, 6, 'tgat', null);
    expect(service.findPublishedOne).not.toHaveBeenCalled();
  });

  it('GET /exams/mock defaults to page 1, limit 12, no category', async () => {
    await request(app.getHttpServer()).get('/exams/mock').expect(200);

    expect(service.findMockExams).toHaveBeenCalledWith(1, 12, undefined, null);
  });

  it('GET /exams/mock/categories → categories (not mock/:id)', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/mock/categories')
      .expect(200);

    expect(res.body).toEqual([{ route: 'mock-cat' }]);
    expect(service.findMockOne).not.toHaveBeenCalled();
    expect(service.findPublishedOne).not.toHaveBeenCalled();
  });

  it('GET /exams/mock/:id → mock detail', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/mock/exam-123')
      .expect(200);

    expect(res.body).toEqual({ route: 'mock-one' });
    expect(service.findMockOne).toHaveBeenCalledWith('exam-123', null);
    expect(service.findPublishedOne).not.toHaveBeenCalled();
  });

  it('GET /exams/:id still reaches the exam with questions', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/exam-123')
      .expect(200);

    expect(res.body).toEqual({ route: 'exam-one' });
    expect(service.findPublishedOne).toHaveBeenCalledWith('exam-123', null);
  });

  describe('viewer for the lock (task 15)', () => {
    it('GET /exams/:id, /exams/mock and /exams/mock/:id use OptionalJwtAuthGuard', () => {
      for (const name of ['findPublishedOne', 'findMockExams', 'findMockOne']) {
        const handler = Object.getOwnPropertyDescriptor(
          ExamsController.prototype,
          name,
        )?.value as object;
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          handler,
        ) as unknown[];
        expect(guards).toContain(OptionalJwtAuthGuard);
      }
    });

    it('passes the logged-in user to the service', async () => {
      const server = app.getHttpServer();
      await request(server).get('/exams/exam-123').set('x-test-user', 'u1');
      await request(server).get('/exams/mock').set('x-test-user', 'u1');
      await request(server).get('/exams/mock/m1').set('x-test-user', 'u1');

      const viewer = { id: 'u1', role: 'user' };
      expect(service.findPublishedOne).toHaveBeenCalledWith('exam-123', viewer);
      expect(service.findMockExams).toHaveBeenCalledWith(
        1,
        12,
        undefined,
        viewer,
      );
      expect(service.findMockOne).toHaveBeenCalledWith('m1', viewer);
    });
  });
});
