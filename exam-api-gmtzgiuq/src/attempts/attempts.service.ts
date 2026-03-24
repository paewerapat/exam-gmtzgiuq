import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamAttempt } from './attempt.entity';
import {
  SubmitAttemptInput,
  PaginatedAttempts,
  AttemptStats,
  UserAttemptStats,
  ExamAttemptStats,
} from './dto/attempt.dto';
import { User } from '../users/user.entity';
import { QuestionCategory } from '../questions/question.entity';

@Injectable()
export class AttemptsService {
  constructor(
    @InjectRepository(ExamAttempt)
    private attemptsRepository: Repository<ExamAttempt>,
  ) {}

  // ── IN-PROGRESS ────────────────────────────────────────────

  async startInProgress(
    userId: string,
    data: {
      examId: string;
      examTitle: string;
      category: QuestionCategory;
      totalQuestions: number;
      questionIds: string[];
      startedAt: string;
      mode?: string;
    },
  ): Promise<ExamAttempt> {
    // Abandon any existing in-progress attempt for the same exam
    // Use short lock timeout to avoid hanging if row is locked
    try {
      await this.attemptsRepository.query('SET innodb_lock_wait_timeout = 3');
      await this.attemptsRepository.update(
        { userId, examId: data.examId, status: 'in_progress' },
        { status: 'abandoned' },
      );
    } catch {
      // If lock timeout or error, skip abandoning — proceed to create new attempt
    } finally {
      await this.attemptsRepository.query('SET innodb_lock_wait_timeout = 50').catch(() => {});
    }

    const attempt = this.attemptsRepository.create({
      userId,
      examId: data.examId,
      examTitle: data.examTitle,
      category: data.category,
      totalQuestions: data.totalQuestions,
      questionIds: data.questionIds,
      answers: {},
      timePerQuestion: {},
      currentIndex: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      unanswered: data.totalQuestions,
      score: 0,
      totalTime: 0,
      status: 'in_progress',
      mode: data.mode ?? 'practice',
      startedAt: new Date(data.startedAt),
    });

    return this.attemptsRepository.save(attempt);
  }

  async updateProgress(
    id: string,
    userId: string,
    data: {
      currentIndex: number;
      answers: Record<string, string>;
      timePerQuestion: Record<string, number>;
    },
  ): Promise<void> {
    const attempt = await this.attemptsRepository.findOne({ where: { id } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== 'in_progress') return; // ignore if already done

    await this.attemptsRepository.update(id, {
      currentIndex: data.currentIndex,
      answers: data.answers,
      timePerQuestion: data.timePerQuestion,
      totalTime: Object.values(data.timePerQuestion).reduce((a, b) => a + b, 0),
    });
  }

  async completeAttempt(
    id: string,
    userId: string,
    input: SubmitAttemptInput,
  ): Promise<ExamAttempt> {
    const attempt = await this.attemptsRepository.findOne({ where: { id } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();

    await this.attemptsRepository.update(id, {
      correctAnswers: input.correctAnswers,
      incorrectAnswers: input.incorrectAnswers,
      unanswered: input.unanswered,
      score: input.score,
      totalTime: input.totalTime,
      timePerQuestion: input.timePerQuestion,
      answers: input.answers,
      questionIds: input.questionIds,
      currentIndex: input.totalQuestions - 1,
      status: 'completed',
      completedAt: input.completedAt ? new Date(input.completedAt) : new Date(),
    });

    return this.findOne(id);
  }

  async findInProgress(userId: string): Promise<ExamAttempt[]> {
    return this.attemptsRepository.find({
      where: { userId, status: 'in_progress' },
      order: { updatedAt: 'DESC' },
    });
  }

  async findInProgressForExam(
    userId: string,
    examId: string,
  ): Promise<ExamAttempt | null> {
    return this.attemptsRepository.findOne({
      where: { userId, examId, status: 'in_progress' },
    });
  }

  // ── COMPLETED ──────────────────────────────────────────────

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
      mode: (input as any).mode ?? 'practice',
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
      .andWhere('attempt.status = :status', { status: 'completed' })
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

  async getMyStats(userId: string): Promise<UserAttemptStats> {
    const base = this.attemptsRepository
      .createQueryBuilder('attempt')
      .where('attempt.userId = :userId', { userId });

    const totalAttempts = await base.clone().getCount();

    const aggResult = await base
      .clone()
      .select('AVG(attempt.score)', 'avg')
      .addSelect('MAX(attempt.score)', 'best')
      .addSelect('SUM(attempt.totalTime)', 'totalTime')
      .getRawOne();

    const byCategoryRaw = await base
      .clone()
      .select('attempt.category', 'category')
      .addSelect('COUNT(*)', 'attempts')
      .addSelect('AVG(attempt.score)', 'averageScore')
      .addSelect('MAX(attempt.score)', 'bestScore')
      .groupBy('attempt.category')
      .getRawMany();

    const byCategory = byCategoryRaw.map((row) => ({
      category: row.category,
      attempts: parseInt(row.attempts, 10),
      averageScore: parseFloat(row.averageScore) || 0,
      bestScore: parseFloat(row.bestScore) || 0,
    }));

    return {
      totalAttempts,
      averageScore: parseFloat(aggResult?.avg) || 0,
      bestScore: parseFloat(aggResult?.best) || 0,
      totalTime: parseInt(aggResult?.totalTime, 10) || 0,
      byCategory,
    };
  }

  async getExamAttemptStats(examId: string): Promise<ExamAttemptStats> {
    const base = this.attemptsRepository
      .createQueryBuilder('attempt')
      .where('attempt.examId = :examId', { examId });

    const totalAttempts = await base.clone().getCount();

    const aggResult = await base
      .clone()
      .select('AVG(attempt.score)', 'avg')
      .addSelect('MAX(attempt.score)', 'highest')
      .addSelect('MIN(attempt.score)', 'lowest')
      .addSelect('AVG(attempt.totalTime)', 'avgTime')
      .getRawOne();

    const uniqueUsersResult = await base
      .clone()
      .select('COUNT(DISTINCT attempt.userId)', 'count')
      .getRawOne();

    return {
      totalAttempts,
      averageScore: parseFloat(aggResult?.avg) || 0,
      highestScore: parseFloat(aggResult?.highest) || 0,
      lowestScore: parseFloat(aggResult?.lowest) || 0,
      averageTime: Math.round(parseFloat(aggResult?.avgTime) || 0),
      uniqueUsers: parseInt(uniqueUsersResult?.count, 10) || 0,
    };
  }
}
