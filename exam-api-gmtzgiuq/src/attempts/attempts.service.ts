import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import {
  StartAttemptDto,
  SubmitAttemptInput,
  PaginatedAttempts,
  AttemptStats,
  UserAttemptStats,
  ExamAttemptStats,
} from './dto/attempt.dto';
import { User } from '../users/user.entity';
import { QuestionCategory } from '../questions/question.entity';
import { ExamAccessService } from '../exam-access/exam-access.service';
import type { AccessViewer } from '../exam-access/exam-access';

const ATTEMPT_ALREADY_COMPLETED = 'ส่งข้อสอบชุดนี้ไปแล้ว ไม่สามารถส่งซ้ำได้';

@Injectable()
export class AttemptsService {
  constructor(
    @InjectRepository(ExamAttempt)
    private attemptsRepository: Repository<ExamAttempt>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    private examAccessService: ExamAccessService,
  ) {}

  // ── IN-PROGRESS ────────────────────────────────────────────

  /**
   * Opening the exam page starts an attempt every time. If the user already
   * has an in-progress attempt for this exam that was never touched (no
   * answers, still on the first question), that row is reused instead of
   * abandoning it and inserting another, so just visiting the page does not
   * pile up rows. In-progress attempts with answers keep the old behaviour
   * (abandoned, then a new row is created). Extra untouched rows (left over
   * from earlier concurrent starts) are abandoned too, never deleted: a tab
   * may still hold one and must be able to submit it.
   *
   * Starts of the same user run one at a time (row lock on the user inside a
   * transaction), so two simultaneous requests (React StrictMode, double
   * click, two tabs) end up with the same single row instead of two.
   *
   * A locked Mock Exam without access → 403 EXAM_LOCKED (task 15).
   * `viewer` is the logged-in user (role decides admin); not passed = a
   * regular user with id `userId`.
   */
  async startInProgress(
    userId: string,
    data: StartAttemptDto,
    viewer?: AccessViewer,
  ): Promise<ExamAttempt> {
    // The controller validates the body; this also guards other callers.
    // Without examId TypeORM would drop the key from `where` and match the
    // user's in-progress attempts of every exam.
    if (!userId || typeof data?.examId !== 'string' || !data.examId) {
      throw new BadRequestException('ต้องระบุข้อสอบ (examId)');
    }
    const startedAt = new Date(data.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('เวลาเริ่มทำข้อสอบ (startedAt) ไม่ถูกต้อง');
    }

    // An unknown examId would otherwise fail on the foreign key with a 500
    const examExists = await this.examsRepository.exists({
      where: { id: data.examId },
      loadEagerRelations: false,
    });
    if (!examExists) {
      throw new NotFoundException('ไม่พบข้อสอบนี้');
    }
    await this.examAccessService.assertCanAccessExamId(
      viewer ?? { id: userId },
      data.examId,
    );

    const fields = {
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
      mode: data.mode ?? 'practice',
      startedAt,
    };

    const attemptId = await this.attemptsRepository.manager.transaction(
      async (em) => {
        const repo = em.getRepository(ExamAttempt);
        const restoreLockTimeout = await this.shortLockTimeout(em);
        try {
          try {
            await em.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [
              userId,
            ]);
          } catch {
            // Lock timeout: carry on unserialized (same as before this change)
          }

          const inProgress = (
            await repo.find({
              where: { userId, examId: data.examId, status: 'in_progress' },
              order: { createdAt: 'ASC', id: 'ASC' },
              loadEagerRelations: false,
            })
          ).filter((a) => a.examId === data.examId);

          // Every in-progress row except the reused one is abandoned: rows
          // with answers, and extra untouched rows left over from earlier
          // concurrent starts (not deleted — a tab that still holds one would
          // get 404 when it submits).
          const reusable = inProgress.find((a) => this.isUntouched(a));
          const toAbandon = inProgress
            .filter((a) => a !== reusable)
            .map((a) => a.id);

          if (toAbandon.length > 0) {
            try {
              await repo.update(
                { id: In(toAbandon), status: 'in_progress' },
                { status: 'abandoned' },
              );
            } catch {
              // If lock timeout or error, skip abandoning — proceed to start
            }
          }

          if (reusable) {
            // createdAt is the attempt date shown in history/dashboard and
            // the sort key of findMyAttempts, so it must be the time of this
            // start, not of the first visit. save() never writes a
            // @CreateDateColumn, hence update().
            await repo.update(reusable.id, {
              ...fields,
              createdAt: () => 'CURRENT_TIMESTAMP(6)',
            });
            return reusable.id;
          }

          const saved = await repo.save(
            repo.create({
              ...fields,
              userId,
              examId: data.examId,
              status: 'in_progress',
            }),
          );
          return saved.id;
        } finally {
          await restoreLockTimeout();
        }
      },
    );

    // Same shape for a new and a reused attempt: no eager user/exam relations
    return this.attemptsRepository.findOneOrFail({
      where: { id: attemptId },
      loadEagerRelations: false,
    });
  }

  /**
   * Lowers innodb_lock_wait_timeout on the transaction's own connection so a
   * locked row cannot hang the request, and returns a function that puts the
   * previous value back before the connection goes back to the pool.
   */
  private async shortLockTimeout(
    em: EntityManager,
  ): Promise<() => Promise<void>> {
    try {
      const rows: unknown = await em.query(
        'SELECT @@SESSION.innodb_lock_wait_timeout AS t',
      );
      const previous = Number(
        Array.isArray(rows) ? (rows[0] as { t?: unknown })?.t : undefined,
      );
      await em.query('SET SESSION innodb_lock_wait_timeout = 5');
      const restoreTo =
        Number.isInteger(previous) && previous > 0 ? previous : 50;
      return async () => {
        await em
          .query('SET SESSION innodb_lock_wait_timeout = ?', [restoreTo])
          .catch(() => {});
      };
    } catch {
      return () => Promise.resolve();
    }
  }

  /** In progress with no answer given and still on the first question. */
  private isUntouched(attempt: ExamAttempt): boolean {
    const answered = Object.values(attempt.answers ?? {}).some(
      (value) => value !== null && value !== undefined && value !== '',
    );
    return !answered && (attempt.currentIndex ?? 0) === 0;
  }

  /** Autosave. Locked exam whose access ended → 403 EXAM_LOCKED (task 15). */
  async updateProgress(
    id: string,
    userId: string,
    data: {
      currentIndex: number;
      answers: Record<string, string>;
      timePerQuestion: Record<string, number>;
    },
    viewer?: AccessViewer,
  ): Promise<void> {
    const attempt = await this.attemptsRepository.findOne({ where: { id } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== 'in_progress') return; // ignore if already done
    await this.examAccessService.assertCanAccessExamId(
      viewer ?? { id: userId },
      attempt.examId,
    );

    await this.attemptsRepository.update(id, {
      currentIndex: data.currentIndex,
      answers: data.answers,
      timePerQuestion: data.timePerQuestion,
      totalTime: Object.values(data.timePerQuestion).reduce((a, b) => a + b, 0),
    });
  }

  /** Submit. Locked exam whose access ended → 403 EXAM_LOCKED (task 15). */
  async completeAttempt(
    id: string,
    userId: string,
    input: SubmitAttemptInput,
    viewer?: AccessViewer,
  ): Promise<ExamAttempt> {
    const attempt = await this.attemptsRepository.findOne({ where: { id } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    // A submitted result is final (BUG-21: a second tab or a retried request
    // must not overwrite it). Abandoned attempts can still be submitted — an
    // older tab's attempt may have been abandoned by a newer start.
    if (attempt.status === 'completed') {
      throw new ConflictException(ATTEMPT_ALREADY_COMPLETED);
    }
    await this.examAccessService.assertCanAccessExamId(
      viewer ?? { id: userId },
      attempt.examId,
    );

    // The status condition makes the check atomic: of two simultaneous
    // submits only one matches the row.
    const result = await this.attemptsRepository.update(
      { id, status: In(['in_progress', 'abandoned']) },
      {
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
        completedAt: input.completedAt
          ? new Date(input.completedAt)
          : new Date(),
      },
    );
    if (!result.affected) {
      throw new ConflictException(ATTEMPT_ALREADY_COMPLETED);
    }

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

  /** Legacy direct submit. Locked exam without access → 403 (task 15). */
  async submit(input: SubmitAttemptInput, user: User): Promise<ExamAttempt> {
    await this.examAccessService.assertCanAccessExamId(user, input.examId);

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

  /**
   * Single attempt for its owner. Another user's attempt is reported as not
   * found (404) so attempt ids cannot be probed. Admins use findOne via
   * /attempts/admin/:id.
   */
  async findOneForUser(id: string, userId: string): Promise<ExamAttempt> {
    if (!userId) throw new NotFoundException('Attempt not found');

    const attempt = await this.attemptsRepository.findOne({
      where: { id, userId },
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

  // Stats count only submitted attempts. in_progress/abandoned rows have
  // score 0 and would inflate the count and drag the average down (BUG-12).
  private completedAttempts() {
    return this.attemptsRepository
      .createQueryBuilder('attempt')
      .where('attempt.status = :status', { status: 'completed' });
  }

  async getStats(): Promise<AttemptStats> {
    const totalAttempts = await this.attemptsRepository.count({
      where: { status: 'completed' },
    });

    const avgResult = await this.completedAttempts()
      .select('AVG(attempt.score)', 'avg')
      .getRawOne();

    const uniqueUsersResult = await this.completedAttempts()
      .select('COUNT(DISTINCT attempt.userId)', 'count')
      .getRawOne();

    const byCategoryRaw = await this.completedAttempts()
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
    const base = this.completedAttempts().andWhere('attempt.userId = :userId', {
      userId,
    });

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
    const base = this.completedAttempts().andWhere('attempt.examId = :examId', {
      examId,
    });

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
