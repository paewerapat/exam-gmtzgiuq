import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Post('events')
  @UseGuards(OptionalJwtAuthGuard)
  async track(@Body() dto: TrackEventDto, @Request() req) {
    return this.analyticsService.track(dto, req.user?.id ?? null);
  }
}
