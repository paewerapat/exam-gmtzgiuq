import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamAttempt } from './attempt.entity';
import { SubmitAttemptInput, PaginatedAttempts, AttemptStats } from './dto/attempt.dto';
import { User } from '../users/user.entity';
import { QuestionCategory } from '../questions/question.entity';

@Injectable()
export class AttemptsService {
  constructor(
    @InjectRepository(ExamAttempt)
    private attemptsRepository: Repository<ExamAttempt>,
  ) {}

  async submit(input: SubmitAttemptInput, user: User): Promise<ExamAttempt> {
    const attempt = this.attemptsRepository.create({
      userId: user.id,
      examId: input.examId,
      examTitle: input.examTitle,
      category: input.category,
      totalQuestions: input.totalQuestions,
      correctAnswers: input.correctAnswers,
      incorrectAnswers: input.incorrectAnswers,
      unanswered: input.unanswered,
      score: input.score,
      totalTime: input.totalTime,
      timePerQuestion: input.timePerQuestion,
      answers: input.answers,
      questionIds: input.questionIds,
      status: 'completed',
      startedAt: new Date(input.startedAt),
      completedAt: input.completedAt ? new Date(input.completedAt) : new Date(),
    });

    const saved = await this.attemptsRepository.save(attempt);

    return this.findOne(saved.id);
  }

  async findMyAttempts(
    userId: string,
    page: number = 1,
    limit: number = 10,
    examId?: string,
    category?: QuestionCategory,
  ): Promise<PaginatedAttempts> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.attemptsRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.exam', 'exam')
      .where('attempt.userId = :userId', { userId })
      .orderBy('attempt.createdAt', 'DESC');

    if (examId) {
      queryBuilder.andWhere('attempt.examId = :examId', { examId });
    }

    if (category) {
      queryBuilder.andWhere('attempt.category = :category', { category });
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

  async findOne(id: string): Promise<ExamAttempt> {
    const attempt = await this.attemptsRepository.findOne({
      where: { id },
      relations: ['user', 'exam'],
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    return attempt;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    userId?: string,
    examId?: string,
    category?: QuestionCategory,
    search?: string,
  ): Promise<PaginatedAttempts> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.attemptsRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.user', 'user')
      .leftJoinAndSelect('attempt.exam', 'exam')
      .orderBy('attempt.createdAt', 'DESC');

    if (userId) {
      queryBuilder.andWhere('attempt.userId = :userId', { userId });
    }

    if (examId) {
      queryBuilder.andWhere('attempt.examId = :examId', { examId });
    }

    if (category) {
      queryBuilder.andWhere('attempt.category = :category', { category });
    }

    if (search) {
      queryBuilder.andWhere(
        '(user.name LIKE :search OR user.email LIKE :search OR attempt.examTitle LIKE :search)',
        { search: `%${search}%` },
      );
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

  async getStats(): Promise<AttemptStats> {
    const totalAttempts = await this.attemptsRepository.count();

    const avgResult = await this.attemptsRepository
      .createQueryBuilder('attempt')
      .select('AVG(attempt.score)', 'avg')
      .getRawOne();

    const uniqueUsersResult = await this.attemptsRepository
      .createQueryBuilder('attempt')
      .select('COUNT(DISTINCT attempt.userId)', 'count')
      .getRawOne();

    const byCategoryRaw = await this.attemptsRepository
      .createQueryBuilder('attempt')
      .select('attempt.category', 'category')
      .addSelect('COUNT(*)', 'attempts')
      .addSelect('AVG(attempt.score)', 'averageScore')
      .groupBy('attempt.category')
      .getRawMany();

    const byCategory = byCategoryRaw.map((row) => ({
      category: row.category,
      attempts: parseInt(row.attempts, 10),
      averageScore: parseFloat(row.averageScore) || 0,
    }));

    return {
      totalAttempts,
      averageScore: parseFloat(avgResult.avg) || 0,
      uniqueUsers: parseInt(uniqueUsersResult.count, 10),
      byCategory,
    };
  }
}
