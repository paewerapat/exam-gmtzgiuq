import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { SubmitAttemptInput } from './dto/attempt.dto';
import { QuestionCategory } from '../questions/question.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('attempts')
export class AttemptsController {
  constructor(private attemptsService: AttemptsService) {}

  // User - Submit attempt
  @Post()
  @UseGuards(JwtAuthGuard)
  async submit(@Body() input: SubmitAttemptInput, @Request() req) {
    return this.attemptsService.submit(input, req.user);
  }

  // User - Get my attempts
  @Get('my')
  @UseGuards(JwtAuthGuard)
  async findMyAttempts(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('category') category?: QuestionCategory,
  ) {
    return this.attemptsService.findMyAttempts(
      req.user.id,
      +page,
      +limit,
      undefined,
      category,
    );
  }

  // User - Get my attempts for a specific exam
  @Get('my/exam/:examId')
  @UseGuards(JwtAuthGuard)
  async findMyExamAttempts(
    @Request() req,
    @Param('examId') examId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.attemptsService.findMyAttempts(
      req.user.id,
      +page,
      +limit,
      examId,
    );
  }

  // User - Get single attempt detail
  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  async findMyAttempt(@Param('id') id: string) {
    return this.attemptsService.findOne(id);
  }

  // Admin - Get all attempts
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('userId') userId?: string,
    @Query('examId') examId?: string,
    @Query('category') category?: QuestionCategory,
    @Query('search') search?: string,
  ) {
    return this.attemptsService.findAll(
      +page,
      +limit,
      userId,
      examId,
      category,
      search,
    );
  }

  // Admin - Get stats
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getStats() {
    return this.attemptsService.getStats();
  }

  // Admin - Get single attempt
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindOne(@Param('id') id: string) {
    return this.attemptsService.findOne(id);
  }
}
