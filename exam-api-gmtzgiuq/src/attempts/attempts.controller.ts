import {
  Controller,
  Get,
  Post,
  Patch,
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

  // User - Start in-progress attempt
  @Post('start')
  @UseGuards(JwtAuthGuard)
  async startInProgress(
    @Body()
    body: {
      examId: string;
      examTitle: string;
      category: QuestionCategory;
      totalQuestions: number;
      questionIds: string[];
      startedAt: string;
    },
    @Request() req,
  ) {
    return this.attemptsService.startInProgress(req.user.id, body);
  }

  // User - Update in-progress attempt
  @Patch(':id/progress')
  @UseGuards(JwtAuthGuard)
  async updateProgress(
    @Param('id') id: string,
    @Body()
    body: {
      currentIndex: number;
      answers: Record<string, string>;
      timePerQuestion: Record<string, number>;
    },
    @Request() req,
  ) {
    await this.attemptsService.updateProgress(id, req.user.id, body);
    return { ok: true };
  }

  // User - Complete an in-progress attempt
  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard)
  async completeAttempt(
    @Param('id') id: string,
    @Body() input: SubmitAttemptInput,
    @Request() req,
  ) {
    return this.attemptsService.completeAttempt(id, req.user.id, input);
  }

  // User - Get in-progress attempts
  @Get('my/in-progress')
  @UseGuards(JwtAuthGuard)
  async findMyInProgress(@Request() req) {
    return this.attemptsService.findInProgress(req.user.id);
  }

  // User - Check in-progress for specific exam
  @Get('my/in-progress/exam/:examId')
  @UseGuards(JwtAuthGuard)
  async findMyInProgressForExam(
    @Param('examId') examId: string,
    @Request() req,
  ) {
    return this.attemptsService.findInProgressForExam(req.user.id, examId);
  }

  // User - Submit attempt (legacy / direct submit)
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

  // User - Get my stats
  @Get('my/stats')
  @UseGuards(JwtAuthGuard)
  async getMyStats(@Request() req) {
    return this.attemptsService.getMyStats(req.user.id);
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

  // Admin - Get exam attempt stats
  @Get('admin/exam/:examId/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getExamAttemptStats(@Param('examId') examId: string) {
    return this.attemptsService.getExamAttemptStats(examId);
  }

  // Admin - Get attempts by user
  @Get('admin/user/:userId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindByUser(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('category') category?: QuestionCategory,
  ) {
    return this.attemptsService.findAll(+page, +limit, userId, undefined, category);
  }

  // Admin - Get single attempt
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindOne(@Param('id') id: string) {
    return this.attemptsService.findOne(id);
  }
}
