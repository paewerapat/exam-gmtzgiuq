import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { QuestionBankService } from './question-bank.service';
import { CreateQbSessionDto, QbModeQueryDto } from './dto/question-bank.dto';

/**
 * Question Bank / Challenge Questions (task 20). All routes work for guests
 * (no stats, Challenge locked); a token adds the user's progress and Pro
 * rights. Responses never contain user fields.
 */
@Controller('question-bank')
@UseGuards(OptionalJwtAuthGuard)
export class QuestionBankController {
  constructor(private questionBankService: QuestionBankService) {}

  // Venues with subjects in the bank: [{ id, key, name }]. ?mode= is
  // accepted and does not change the list.
  @Get('venues')
  async listVenues() {
    return this.questionBankService.listVenues();
  }

  // Page 1: subject cards + the user's statistics of the venue in the mode
  @Get('venues/:key')
  async getVenue(
    @Param('key') key: string,
    @Query() query: QbModeQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.questionBankService.getVenuePage(
      key,
      query.mode ?? 'bank',
      user ?? null,
    );
  }

  // Page 2: topics of a subject grouped by grade/term, with counts
  @Get('subjects/:id')
  async getSubject(
    @Param('id') id: string,
    @Query() query: QbModeQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.questionBankService.getSubjectPage(
      id,
      query.mode ?? 'bank',
      user ?? null,
    );
  }

  // Practice questions; locked Challenge questions are placeholders only
  @Post('sessions')
  @HttpCode(200)
  async createSession(
    @Body() body: CreateQbSessionDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.questionBankService.createSession(body, user ?? null);
  }
}
