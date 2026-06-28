import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from './analytics-event.entity';
import { TrackEventDto } from './dto/track-event.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  async track(dto: TrackEventDto, userId: string | null): Promise<{ ok: true }> {
    const record = this.analyticsRepository.create({
      event: dto.event,
      userId,
      properties: dto.properties ?? null,
    });
    await this.analyticsRepository.save(record);
    this.logger.log(`event=${dto.event} userId=${userId ?? 'anonymous'}`);
    return { ok: true };
  }
}
