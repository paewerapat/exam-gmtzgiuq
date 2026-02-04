import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  QuestionStatus,
} from './question.entity';
import {
  CreateQuestionInput,
  UpdateQuestionInput,
  PaginatedQuestions,
  QuestionStats,
  CategoryCount,
} from './dto/question.dto';
import { User } from '../users/user.entity';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    private uploadService: UploadService,
  ) {}

  async create(
    createQuestionInput: CreateQuestionInput,
    author: User,
  ): Promise<Question> {
    const question = this.questionsRepository.create({
      ...createQuestionInput,
      author,
      authorId: author.id,
    });

    return await this.questionsRepository.save(question);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: QuestionStatus,
    category?: QuestionCategory,
    difficulty?: QuestionDifficulty,
    search?: string,
  ): Promise<PaginatedQuestions> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.questionsRepository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.author', 'author')
      .orderBy('question.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('question.status = :status', { status });
    }

    if (category) {
      queryBuilder.andWhere('question.category = :category', { category });
    }

    if (difficulty) {
      queryBuilder.andWhere('question.difficulty = :difficulty', { difficulty });
    }

    if (search) {
      queryBuilder.andWhere('question.question LIKE :search', {
        search: `%${search}%`,
      });
    }

    const [items, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublished(
    page: number = 1,
    limit: number = 10,
    category?: QuestionCategory,
    difficulty?: QuestionDifficulty,
    search?: string,
  ): Promise<PaginatedQuestions> {
    return this.findAll(
      page,
      limit,
      QuestionStatus.PUBLISHED,
      category,
      difficulty,
      search,
    );
  }

  async findOne(id: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { id },
      relations: ['author'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }

  async update(
    id: string,
    updateQuestionInput: UpdateQuestionInput,
  ): Promise<Question> {
    const question = await this.findOne(id);

    // Delete old image if it's being replaced
    if (
      updateQuestionInput.questionImage &&
      question.questionImage &&
      updateQuestionInput.questionImage !== question.questionImage
    ) {
      this.uploadService.deleteByUrl(question.questionImage);
    }

    Object.assign(question, updateQuestionInput);
    return this.questionsRepository.save(question);
  }

  async remove(id: string): Promise<boolean> {
    const question = await this.findOne(id);

    // Delete associated image file
    if (question.questionImage) {
      this.uploadService.deleteByUrl(question.questionImage);
    }

    await this.questionsRepository.remove(question);
    return true;
  }

  async getStats(): Promise<QuestionStats> {
    const total = await this.questionsRepository.count();
    const published = await this.questionsRepository.count({
      where: { status: QuestionStatus.PUBLISHED },
    });
    const draft = await this.questionsRepository.count({
      where: { status: QuestionStatus.DRAFT },
    });

    const byCategoryRaw = await this.questionsRepository
      .createQueryBuilder('question')
      .select('question.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('question.category')
      .getRawMany();

    const byCategory: CategoryCount[] = byCategoryRaw.map((row) => ({
      category: row.category,
      count: parseInt(row.count, 10),
    }));

    return { total, published, draft, byCategory };
  }
}
