import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { PredictedService } from './predicted.service';

@Controller('predicted')
export class PredictedController {
  constructor(private predictedService: PredictedService) {}

  // Public - Predicted Exam page (task 22): venue tabs, subject chips,
  // series and sets with the viewer's access/progress; never question
  // content. ?venue=<venue key> (else the first active venue),
  // ?subject=<subjectId>
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async findPage(
    @Query('venue') venue?: string,
    @Query('subject') subject?: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.predictedService.findPage(user ?? null, {
      venue: typeof venue === 'string' ? venue : undefined,
      subject: typeof subject === 'string' ? subject : undefined,
    });
  }
}
