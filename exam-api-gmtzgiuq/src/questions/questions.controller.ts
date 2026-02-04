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
import { QuestionsService } from './questions.service';
import {
  CreateQuestionInput,
  UpdateQuestionInput,
  PaginatedQuestions,
  QuestionStats,
} from './dto/question.dto';
import {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  QuestionStatus,
} from './question.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('questions')
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  // Public - Get published questions
  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('category') category?: QuestionCategory,
    @Query('difficulty') difficulty?: QuestionDifficulty,
    @Query('search') search?: string,
  ): Promise<PaginatedQuestions> {
    return this.questionsService.findPublished(
      +page,
      +limit,
      category,
      difficulty,
      search,
    );
  }

  // Admin - Get all questions
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: QuestionStatus,
    @Query('category') category?: QuestionCategory,
    @Query('difficulty') difficulty?: QuestionDifficulty,
    @Query('search') search?: string,
  ): Promise<PaginatedQuestions> {
    return this.questionsService.findAll(
      +page,
      +limit,
      status,
      category,
      difficulty,
      search,
    );
  }

  // Admin - Get question stats
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getStats(): Promise<QuestionStats> {
    return this.questionsService.getStats();
  }

  // Admin - Get single question by ID
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindOne(@Param('id') id: string): Promise<Question> {
    return this.questionsService.findOne(id);
  }

  // Admin - Create question
  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(
    @Body() createQuestionInput: CreateQuestionInput,
    @Request() req,
  ): Promise<Question> {
    return this.questionsService.create(createQuestionInput, req.user);
  }

  // Admin - Update question
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateQuestionInput: UpdateQuestionInput,
  ): Promise<Question> {
    return this.questionsService.update(id, updateQuestionInput);
  }

  // Admin - Delete question
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.questionsService.remove(id);
    return { success: true };
  }
}
