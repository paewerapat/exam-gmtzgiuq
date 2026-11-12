import {
  Body,
  Controller,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AnswerLogsService } from './answer-logs.service';
import { CreateAnswerLogsDto } from './dto/answer-log.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';

@Controller('answer-logs')
export class AnswerLogsController {
  constructor(private answerLogsService: AnswerLogsService) {}

  // User - log answers of practice without an attempt (task 16).
  // Responds with the number of rows written only (no answers/isCorrect).
  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: CreateAnswerLogsDto,
    @Request() req: { user: User },
  ): Promise<{ saved: number }> {
    return this.answerLogsService.logPractice(req.user, body.items);
  }
}
