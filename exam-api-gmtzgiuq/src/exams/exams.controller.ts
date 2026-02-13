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
  ) {
    return this.examsService.findAll(+page, +limit, status, category, search);
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

  // Public - Get single published exam with questions (MUST be after admin routes)
  @Get(':id')
  async findPublishedOne(@Param('id') id: string) {
    return this.examsService.findPublishedOne(id);
  }
}
