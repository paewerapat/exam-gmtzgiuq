import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { CreateExamInput, UpdateExamInput } from './dto/exam.dto';
import { QuestionCategory, QuestionStatus } from '../questions/question.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('exams')
export class ExamsController {
  constructor(private examsService: ExamsService) {}

  // Public - Get published exams (listing)
  @Get()
  async findPublished(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('category') category?: QuestionCategory,
    @Query('search') search?: string,
  ) {
    return this.examsService.findPublished(+page, +limit, category, search);
  }

  // Public - Mock Exam pages (task 11). MUST be before :id.
  // Card fields only: no questions or answers. With a token, `access` is the
  // logged-in user's (task 15); without one, locked exams are `locked`.
  @Get('mock')
  @UseGuards(OptionalJwtAuthGuard)
  async findMockExams(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 12,
    @Query('category') category?: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.examsService.findMockExams(
      +page,
      +limit,
      category,
      user ?? null,
    );
  }

  // Public - categories that have published Mock Exams (dropdown)
  @Get('mock/categories')
  async findMockCategories() {
    return this.examsService.findMockCategories();
  }

  // Public - Mock Exam detail page (no questions); not mock/published → 404
  @Get('mock/:id')
  @UseGuards(OptionalJwtAuthGuard)
  async findMockOne(
    @Param('id') id: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.examsService.findMockOne(id, user ?? null);
  }

  // Admin routes MUST be before :id to avoid route conflict
  // Admin - Get all exams
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: QuestionStatus,
    @Query('category') category?: QuestionCategory,
    @Query('search') search?: string,
    // task 20: 'true' = only "ใช้เฉพาะ Question Bank" exams, 'false' = only
    // the others, not sent / anything else = all
    @Query('bankOnly') bankOnly?: string,
  ) {
    return this.examsService.findAll(+page, +limit, status, category, search, {
      bankOnly:
        bankOnly === 'true' ? true : bankOnly === 'false' ? false : undefined,
    });
  }

  // Admin - Get exam stats
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getStats() {
    return this.examsService.getStats();
  }

  // Admin - Get single exam
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  // Admin - Create exam with questions
  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() input: CreateExamInput, @Request() req) {
    return this.examsService.create(input, req.user);
  }

  // Admin - Update exam
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() input: UpdateExamInput) {
    return this.examsService.update(id, input);
  }

  // Admin - Delete exam
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    await this.examsService.remove(id);
    return { success: true };
  }

  // Public - Get exams by topic
  @Get('topic/:topicId')
  async findByTopic(
    @Param('topicId') topicId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.examsService.findByTopic(topicId, +page, +limit);
  }

  // Public - Get single published exam with questions (MUST be after admin
  // routes). A locked Mock Exam needs a token with access → else 403
  // EXAM_LOCKED (task 15).
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findPublishedOne(
    @Param('id') id: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.examsService.findPublishedOne(id, user ?? null);
  }
}
