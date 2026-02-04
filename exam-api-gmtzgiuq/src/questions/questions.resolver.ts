import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  QuestionStatus,
} from './question.entity';
import { QuestionsService } from './questions.service';
import {
  CreateQuestionInput,
  UpdateQuestionInput,
  PaginatedQuestions,
  QuestionStats,
} from './dto/question.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { User } from '../users/user.entity';

@Resolver(() => Question)
export class QuestionsResolver {
  constructor(private questionsService: QuestionsService) {}

  // Public - Get published questions
  @Query(() => PaginatedQuestions)
  async questions(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 })
    limit: number,
    @Args('category', { type: () => QuestionCategory, nullable: true })
    category?: QuestionCategory,
    @Args('difficulty', { type: () => QuestionDifficulty, nullable: true })
    difficulty?: QuestionDifficulty,
    @Args('search', { nullable: true })
    search?: string,
  ): Promise<PaginatedQuestions> {
    return this.questionsService.findPublished(
      page,
      limit,
      category,
      difficulty,
      search,
    );
  }

  // Public - Get single question
  @Query(() => Question)
  async question(@Args('id') id: string): Promise<Question> {
    return this.questionsService.findOne(id);
  }

  // Admin - Get all questions (including drafts)
  @Query(() => PaginatedQuestions)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async adminQuestions(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 })
    limit: number,
    @Args('status', { type: () => QuestionStatus, nullable: true })
    status?: QuestionStatus,
    @Args('category', { type: () => QuestionCategory, nullable: true })
    category?: QuestionCategory,
    @Args('difficulty', { type: () => QuestionDifficulty, nullable: true })
    difficulty?: QuestionDifficulty,
    @Args('search', { nullable: true })
    search?: string,
  ): Promise<PaginatedQuestions> {
    return this.questionsService.findAll(
      page,
      limit,
      status,
      category,
      difficulty,
      search,
    );
  }

  // Admin - Get single question by ID
  @Query(() => Question)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async adminQuestion(@Args('id') id: string): Promise<Question> {
    return this.questionsService.findOne(id);
  }

  // Admin - Get question stats
  @Query(() => QuestionStats)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async questionStats(): Promise<QuestionStats> {
    return this.questionsService.getStats();
  }

  // Admin - Create question
  @Mutation(() => Question)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async createQuestion(
    @Args('input') createQuestionInput: CreateQuestionInput,
    @CurrentUser() user: User,
  ): Promise<Question> {
    return this.questionsService.create(createQuestionInput, user);
  }

  // Admin - Update question
  @Mutation(() => Question)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async updateQuestion(
    @Args('id') id: string,
    @Args('input') updateQuestionInput: UpdateQuestionInput,
  ): Promise<Question> {
    return this.questionsService.update(id, updateQuestionInput);
  }

  // Admin - Delete question
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async deleteQuestion(@Args('id') id: string): Promise<boolean> {
    return this.questionsService.remove(id);
  }
}
