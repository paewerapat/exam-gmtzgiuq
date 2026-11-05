import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

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
    }).compile();

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
    expect(service.findMockExams).toHaveBeenCalledWith(2, 6, 'tgat');
    expect(service.findPublishedOne).not.toHaveBeenCalled();
  });

  it('GET /exams/mock defaults to page 1, limit 12, no category', async () => {
    await request(app.getHttpServer()).get('/exams/mock').expect(200);

    expect(service.findMockExams).toHaveBeenCalledWith(1, 12, undefined);
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
    expect(service.findMockOne).toHaveBeenCalledWith('exam-123');
    expect(service.findPublishedOne).not.toHaveBeenCalled();
  });

  it('GET /exams/:id still reaches the exam with questions', async () => {
    const res = await request(app.getHttpServer())
      .get('/exams/exam-123')
      .expect(200);

    expect(res.body).toEqual({ route: 'exam-one' });
    expect(service.findPublishedOne).toHaveBeenCalledWith('exam-123');
  });
});
