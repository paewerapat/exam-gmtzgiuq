import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
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
import {
  collectQuestionImageUrls,
  deleteUnusedImages,
  normalizeChoices,
  resolveQuestionImages,
} from './question-images';
import { Exam } from '../exams/exam.entity';
import { ExamPassage, normalizeStoredPassages } from '../exams/exam-passage';
import {
  LOCKED_ACCESS_TYPES,
  isBankOnlyExam,
  isLockedExam,
} from '../exam-access/exam-access';

/** Largest page of the public question list (GET /questions, GraphQL). */
export const PUBLIC_QUESTIONS_MAX_LIMIT = 100;

/** A whole number ≥ 1, else the fallback (NaN, 0, negative). */
function clampPositiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    private uploadService: UploadService,
  ) {}

  async create(
    createQuestionInput: CreateQuestionInput,
    author: User,
  ): Promise<Question> {
    const question = this.questionsRepository.create({
      ...createQuestionInput,
      ...resolveQuestionImages(createQuestionInput),
      choices: normalizeChoices(createQuestionInput.choices),
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
    options: { excludeLocked?: boolean; maxLimit?: number } = {},
  ): Promise<PaginatedQuestions> {
    // page/limit ≤ 0, fractions or NaN (REST "abc") used to reach SQL as a
    // negative/NaN OFFSET/LIMIT → 500. Now: page ≥ 1, 1 ≤ limit ≤ maxLimit.
    page = clampPositiveInt(page, 1);
    limit = Math.min(
      clampPositiveInt(limit, 10),
      options.maxLimit ?? Number.MAX_SAFE_INTEGER,
    );
    const skip = (page - 1) * limit;

    const queryBuilder = this.questionsRepository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.author', 'author')
      .orderBy('question.createdAt', 'DESC');

    // Public lists never include questions of a locked Mock Exam
    // (code/purchase), whoever asks: those are taken from the exam page only
    // (task 15). Questions without an exam stay.
    // Nor questions of a bankOnly exam (Question Bank only, task 20) or
    // Challenge questions.
    if (options.excludeLocked) {
      queryBuilder
        .leftJoin('question.exam', 'lockExam')
        .andWhere(
          '(lockExam.id IS NULL OR lockExam.isMock = :lockIsMock OR lockExam.accessType NOT IN (:...lockedTypes))',
          { lockIsMock: false, lockedTypes: [...LOCKED_ACCESS_TYPES] },
        )
        .andWhere(
          '(lockExam.id IS NULL OR lockExam.bankOnly = :lockBankOnly)',
          { lockBankOnly: false },
        )
        .andWhere('question.isChallenge = :lockIsChallenge', {
          lockIsChallenge: false,
        });
    }

    if (status) {
      queryBuilder.andWhere('question.status = :status', { status });
    }

    if (category) {
      queryBuilder.andWhere('question.category = :category', { category });
    }

    if (difficulty) {
      queryBuilder.andWhere('question.difficulty = :difficulty', {
        difficulty,
      });
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
    const result = await this.findAll(
      page,
      limit,
      QuestionStatus.PUBLISHED,
      category,
      difficulty,
      search,
      { excludeLocked: true, maxLimit: PUBLIC_QUESTIONS_MAX_LIMIT },
    );
    result.items = await this.attachPassages(result.items);
    return result;
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

  /**
   * Public single question: a draft (SEC-9), a question of a locked Mock
   * Exam (task 15), a Challenge question or a question of a bankOnly exam
   * (task 20) is reported as not found.
   */
  async findPublishedOne(id: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { id, status: QuestionStatus.PUBLISHED },
      relations: ['author'],
    });

    if (!question || question.isChallenge) {
      throw new NotFoundException('Question not found');
    }

    if (question.examId) {
      const exam = await this.examsRepository.findOne({
        select: { id: true, isMock: true, accessType: true, bankOnly: true },
        where: { id: question.examId },
        loadEagerRelations: false,
      });
      if (exam && (isLockedExam(exam) || isBankOnlyExam(exam))) {
        throw new NotFoundException('Question not found');
      }
    }

    return question;
  }

  async update(
    id: string,
    updateQuestionInput: UpdateQuestionInput,
  ): Promise<Question> {
    const question = await this.findOne(id);
    const oldImageUrls = collectQuestionImageUrls(question);

    const { questionImage, questionImages, choices, ...fields } =
      updateQuestionInput;
    Object.assign(question, fields);

    // Images change only when sent: questionImages (array) wins, otherwise a
    // legacy questionImage replaces the whole list with [questionImage]
    if (Array.isArray(questionImages) || questionImage !== undefined) {
      Object.assign(
        question,
        resolveQuestionImages({ questionImage, questionImages }),
      );
    }
    if (choices !== undefined) {
      question.choices = normalizeChoices(choices);
    }

    const siblingUrls = await this.siblingImageUrls(question);
    const saved = await this.questionsRepository.save(question);

    // Saved: drop image files that neither this question, its siblings nor
    // anything else in the database still uses
    await deleteUnusedImages(
      this.uploadService,
      this.questionsRepository,
      oldImageUrls,
      [...collectQuestionImageUrls(saved), ...siblingUrls],
    );
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    const question = await this.findOne(id);
    const imageUrls = collectQuestionImageUrls(question);
    const siblingUrls = await this.siblingImageUrls(question);

    await this.questionsRepository.remove(question);

    // Removed: delete its image files unless another question (of this or
    // another exam), an exam, a blog or a user still uses them
    await deleteUnusedImages(
      this.uploadService,
      this.questionsRepository,
      imageUrls,
      siblingUrls,
    );
    return true;
  }

  /** Image URLs used by the other questions of the same exam. */
  private async siblingImageUrls(question: Question): Promise<string[]> {
    if (!question.examId) return [];
    const siblings = await this.questionsRepository.find({
      select: ['id', 'questionImage', 'questionImages', 'choices'],
      where: { examId: question.examId, id: Not(question.id) },
      loadEagerRelations: false,
    });
    return siblings.flatMap((q) => collectQuestionImageUrls(q));
  }

  /**
   * Set `passage` on each question: the passage of its exam that
   * `passageId` refers to, or null. Loads the passages of all distinct exams
   * in one query, and only from published exams (these lists are public).
   * Also used by the Question Bank sessions (task 20).
   */
  async attachPassages(questions: Question[]): Promise<Question[]> {
    const examIds = [
      ...new Set(
        questions.filter((q) => q.passageId && q.examId).map((q) => q.examId),
      ),
    ];

    const passagesByExam = new Map<string, Map<string, ExamPassage>>();
    if (examIds.length > 0) {
      const exams = await this.examsRepository.find({
        select: { id: true, passages: true },
        where: { id: In(examIds), status: QuestionStatus.PUBLISHED },
        loadEagerRelations: false,
      });
      for (const exam of exams) {
        passagesByExam.set(
          exam.id,
          new Map(normalizeStoredPassages(exam.passages).map((p) => [p.id, p])),
        );
      }
    }

    for (const question of questions) {
      question.passage =
        (question.passageId &&
          passagesByExam.get(question.examId)?.get(question.passageId)) ||
        null;
    }
    return questions;
  }

  async findByTopic(topicId: string): Promise<Question[]> {
    const questions = await this.questionsRepository
      .createQueryBuilder('q')
      .innerJoin('q.exam', 'exam')
      .where('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      // Questions of Mock Exams stay in the Mock Exam pages (task 11)
      .andWhere('exam.isMock = :isMock', { isMock: false })
      // Challenge questions only through the Question Bank (task 20)
      .andWhere('q.isChallenge = :isChallenge', { isChallenge: false })
      .andWhere('q.topicId = :topicId', { topicId })
      // Oldest release first (task 10), then the old createdAt order
      .orderBy('exam.releaseDate', 'ASC')
      .addOrderBy('exam.createdAt', 'ASC')
      .addOrderBy('q.orderIndex', 'ASC')
      .getMany();
    return this.attachPassages(questions);
  }

  async findBySubject(subjectId: string): Promise<Question[]> {
    const questions = await this.questionsRepository
      .createQueryBuilder('q')
      .innerJoin('q.exam', 'exam')
      .innerJoin('topics', 'topic', 'topic.id = q.topicId')
      .innerJoin('chapters', 'chapter', 'chapter.id = topic.chapterId')
      .where('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      // Questions of Mock Exams stay in the Mock Exam pages (task 11)
      .andWhere('exam.isMock = :isMock', { isMock: false })
      // Challenge questions only through the Question Bank (task 20)
      .andWhere('q.isChallenge = :isChallenge', { isChallenge: false })
      .andWhere('chapter.subjectId = :subjectId', { subjectId })
      // Oldest release first (task 10), then the old createdAt order
      .orderBy('exam.releaseDate', 'ASC')
      .addOrderBy('exam.createdAt', 'ASC')
      .addOrderBy('q.orderIndex', 'ASC')
      .getMany();
    return this.attachPassages(questions);
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
