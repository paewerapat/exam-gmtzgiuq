import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './analytics-event.entity';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repo: jest.Mocked<Repository<AnalyticsEvent>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(AnalyticsEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    repo = module.get(getRepositoryToken(AnalyticsEvent));
  });

  it('records the event with its properties and the resolved userId', async () => {
    const created = { id: 'e1' } as AnalyticsEvent;
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);

    const result = await service.track(
      { event: 'timer_start', properties: { examId: 'exam-1' } },
      'user-1',
    );

    expect(repo.create).toHaveBeenCalledWith({
      event: 'timer_start',
      userId: 'user-1',
      properties: { examId: 'exam-1' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('defaults properties to null and supports anonymous tracking', async () => {
    const created = { id: 'e2' } as AnalyticsEvent;
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);

    await service.track({ event: 'feedback_submit' }, null);

    expect(repo.create).toHaveBeenCalledWith({
      event: 'feedback_submit',
      userId: null,
      properties: null,
    });
  });
});
