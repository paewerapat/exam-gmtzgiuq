import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Exam } from './exam.entity';
import {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '../questions/question.entity';
import {
  CreateExamInput,
  UpdateExamInput,
  PaginatedExams,
  ExamStats,
  ExamCategoryCount,
} from './dto/exam.dto';
import { User } from '../users/user.entity';
import { UploadService } from '../upload/upload.service';
import {
  collectQuestionImageUrls,
  deleteUnusedImages,
  normalizeChoices,
  resolveQuestionImages,
} from '../questions/question-images';
import {
  collectPassageImageUrls,
  normalizeStoredPassages,
  preparePassages,
} from './exam-passage';
import {
  ExamAccessType,
  MockExamCategory,
  MockExamDetail,
  PaginatedMockExams,
  assertMockAccess,
  collectDetailBlockImageUrls,
  normalizeStoredDetailBlocks,
  prepareDetailBlocks,
  MockExamRow,
  toMockExamItem,
} from './exam-mock';

/**
 * `releaseDate` of POST/PUT (already an ISO 8601 date, see the DTO) as a Date,
 * or null when not sent. Years outside 1000–9999 do not fit MySQL datetime.
 */
export function parseReleaseDate(value?: string | null): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  const year = date.getFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999) {
    throw new BadRequestException('วันเผยแพร่ไม่ถูกต้อง');
  }
  return date;
}

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    private dataSource: DataSource,
    private uploadService: UploadService,
  ) {}

  async create(input: CreateExamInput, author: User): Promise<Exam> {
    const passages = preparePassages(input.passages, input.questions);
    // Not sent = left out of the INSERT so the DB default (CURRENT_TIMESTAMP,
    // the clock createdAt uses) applies
    const releaseDate = parseReleaseDate(input.releaseDate);
    const accessType = input.accessType ?? ExamAccessType.FREE;
    assertMockAccess(accessType, input.price);

    const savedExamId = await this.dataSource.transaction(async (manager) => {
      const exam = manager.create(Exam, {
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status || QuestionStatus.DRAFT,
        questionCount: input.questions.length,
        subjectId: input.subjectId ?? null,
        bannerImage: input.bannerImage ?? null,
        durationMinutes: input.durationMinutes ?? null,
        ...(releaseDate ? { releaseDate } : {}),
        passages,
        isMock: input.isMock ?? false,
        accessType,
        price: input.price ?? null,
        accessDays: input.accessDays ?? null,
        level: input.level ?? null,
        detailBlocks: prepareDetailBlocks(input.detailBlocks),
        author,
        authorId: author.id,
      });
      const savedExam = await manager.save(exam);

      const questions = input.questions.map((q, index) =>
        manager.create(Question, {
          question: q.question,
          ...resolveQuestionImages(q),
          choices: normalizeChoices(q.choices),
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          hint: q.hint,
          category: input.category,
          difficulty: q.difficulty || QuestionDifficulty.MEDIUM,
          type: q.type || QuestionType.MULTIPLE_CHOICE,
          status: input.status || QuestionStatus.DRAFT,
          orderIndex: q.orderIndex ?? index,
          examId: savedExam.id,
          author,
          authorId: author.id,
          topicId: q.topicId || undefined,
          chapterId: q.chapterId || undefined,
          chapter: q.chapter || undefined,
          passageId: q.passageId || null,
        }),
      );
      await manager.save(questions);

      return savedExam.id;
    });

    return this.findOne(savedExamId);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: QuestionStatus,
    category?: QuestionCategory,
    search?: string,
    options: { excludeMock?: boolean } = {},
  ): Promise<PaginatedExams> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.examsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.author', 'author')
      // Newest release first, then newest created (task 10)
      .orderBy('exam.releaseDate', 'DESC')
      .addOrderBy('exam.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('exam.status = :status', { status });
    }

    if (category) {
      queryBuilder.andWhere('exam.category = :category', { category });
    }

    // Mock exams are listed only by GET /exams/mock (task 11)
    if (options.excludeMock) {
      queryBuilder.andWhere('exam.isMock = :isMock', { isMock: false });
    }

    if (search) {
      queryBuilder.andWhere('exam.title LIKE :search', {
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
    search?: string,
  ): Promise<PaginatedExams> {
    return this.findAll(
      page,
      limit,
      QuestionStatus.PUBLISHED,
      category,
      search,
      { excludeMock: true },
    );
  }

  async findOne(id: string): Promise<Exam> {
    const exam = await this.examsRepository.findOne({
      where: { id },
      relations: ['author', 'questions', 'questions.author'],
      order: { questions: { orderIndex: 'ASC' } },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.withPassages(exam, true);
  }

  async findPublishedOne(id: string): Promise<Exam> {
    const exam = await this.examsRepository.findOne({
      where: { id, status: QuestionStatus.PUBLISHED },
      relations: ['author', 'questions'],
      order: { questions: { orderIndex: 'ASC' } },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.withPassages(exam);
  }

  /**
   * Load `passages` (a select: false column) for a single exam and expose it
   * as an array (null/malformed → []). With `detailBlocks` (admin), also
   * load the Mock Exam description blocks the same way.
   */
  private async withPassages(exam: Exam, detailBlocks = false): Promise<Exam> {
    const row = await this.examsRepository.findOne({
      select: detailBlocks
        ? { id: true, passages: true, detailBlocks: true }
        : { id: true, passages: true },
      where: { id: exam.id },
      loadEagerRelations: false,
    });
    exam.passages = normalizeStoredPassages(row?.passages);
    if (detailBlocks) {
      exam.detailBlocks = normalizeStoredDetailBlocks(row?.detailBlocks);
    }
    return exam;
  }

  async update(id: string, input: UpdateExamInput): Promise<Exam> {
    const exam = await this.findOne(id);
    // Not sent (or null) = keep the current release date
    const releaseDate = parseReleaseDate(input.releaseDate);
    // Mock Exam fields: not sent = unchanged; price/accessDays/level may be
    // cleared with null. Checked on the values the exam will have.
    const accessType = input.accessType ?? exam.accessType;
    const price = input.price !== undefined ? input.price : exam.price;
    assertMockAccess(accessType, price);
    const replaceDetailBlocks = input.detailBlocks !== undefined;
    const detailBlocks = replaceDetailBlocks
      ? prepareDetailBlocks(input.detailBlocks)
      : null;
    const currentQuestionUrls = exam.questions.flatMap((q) =>
      collectQuestionImageUrls(q),
    );

    // Passages are replaced when sent, and also (with []) when questions are
    // sent without them: recreated questions may only refer to this request.
    // Sending passages alone checks the existing questions' passageId.
    const replacePassages =
      Boolean(input.questions) || Array.isArray(input.passages);
    const passages = replacePassages
      ? preparePassages(input.passages, input.questions ?? exam.questions)
      : null;

    // Remember every image that is being replaced (question images, choice
    // images, passage images); files are only removed after commit
    const oldImageUrls = [
      ...(input.questions ? currentQuestionUrls : []),
      ...(passages ? collectPassageImageUrls(exam.passages) : []),
      ...(replaceDetailBlocks
        ? collectDetailBlockImageUrls(exam.detailBlocks)
        : []),
    ];

    await this.dataSource.transaction(async (manager) => {
      // Update exam fields
      if (input.title !== undefined) exam.title = input.title;
      if (input.description !== undefined) exam.description = input.description;
      if (input.category !== undefined) exam.category = input.category;
      if (input.status !== undefined) exam.status = input.status;
      if (input.subjectId !== undefined)
        exam.subjectId = input.subjectId ?? null;
      if (input.bannerImage !== undefined) exam.bannerImage = input.bannerImage;
      if (input.durationMinutes !== undefined)
        exam.durationMinutes = input.durationMinutes ?? null;
      if (typeof input.isMock === 'boolean') exam.isMock = input.isMock;
      exam.accessType = accessType;
      exam.price = price ?? null;
      if (input.accessDays !== undefined)
        exam.accessDays = input.accessDays ?? null;
      if (input.level !== undefined) exam.level = input.level ?? null;

      // Replace questions if provided
      if (input.questions) {
        // Delete old questions
        await manager.delete(Question, { examId: id });

        // Create new questions
        const category = input.category || exam.category;
        const questions = input.questions.map((q, index) =>
          manager.create(Question, {
            question: q.question,
            ...resolveQuestionImages(q),
            choices: normalizeChoices(q.choices),
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            hint: q.hint,
            category,
            difficulty: q.difficulty || QuestionDifficulty.MEDIUM,
            type: q.type || QuestionType.MULTIPLE_CHOICE,
            status: exam.status,
            orderIndex: q.orderIndex ?? index,
            examId: id,
            authorId: exam.authorId,
            topicId: q.topicId || undefined,
            chapterId: q.chapterId || undefined,
            chapter: q.chapter || undefined,
            passageId: q.passageId || null,
          }),
        );
        await manager.save(questions);

        exam.questionCount = input.questions.length;
      }

      // Use update() instead of save() to avoid triggering cascade on questions
      await manager.update(Exam, id, {
        title: exam.title,
        description: exam.description,
        category: exam.category,
        status: exam.status,
        subjectId: exam.subjectId,
        questionCount: exam.questionCount,
        bannerImage: exam.bannerImage,
        durationMinutes: exam.durationMinutes,
        isMock: exam.isMock,
        accessType: exam.accessType,
        price: exam.price,
        accessDays: exam.accessDays,
        level: exam.level,
        ...(releaseDate ? { releaseDate } : {}),
        ...(passages ? { passages } : {}),
        ...(replaceDetailBlocks ? { detailBlocks } : {}),
      });
    });

    // Transaction committed: drop only the image files that neither this
    // exam nor anything else in the database still refers to
    if (oldImageUrls.length > 0) {
      const newQuestionUrls = input.questions
        ? input.questions.flatMap((q) =>
            collectQuestionImageUrls({
              ...resolveQuestionImages(q),
              choices: q.choices,
            }),
          )
        : currentQuestionUrls;
      await deleteUnusedImages(
        this.uploadService,
        this.dataSource,
        oldImageUrls,
        [
          ...newQuestionUrls,
          ...collectPassageImageUrls(passages ?? exam.passages),
          ...collectDetailBlockImageUrls(
            replaceDetailBlocks ? detailBlocks : exam.detailBlocks,
          ),
        ],
      );
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<boolean> {
    const exam = await this.findOne(id);
    const imageUrls = [
      ...exam.questions.flatMap((q) => collectQuestionImageUrls(q)),
      ...collectPassageImageUrls(exam.passages),
      ...collectDetailBlockImageUrls(exam.detailBlocks),
    ];

    await this.examsRepository.remove(exam);

    // Exam deleted: remove the images its questions, passages and Mock Exam
    // description referred to
    // unless another exam, question, blog or user still uses them
    await deleteUnusedImages(
      this.uploadService,
      this.dataSource,
      imageUrls,
      [],
    );
    return true;
  }

  async findByTopic(
    topicId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedExams> {
    const skip = (page - 1) * limit;
    const [items, total] = await this.examsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.author', 'author')
      .where('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      // Mock exams are listed only by GET /exams/mock (task 11)
      .andWhere('exam.isMock = :isMock', { isMock: false })
      .andWhere(
        'EXISTS (SELECT 1 FROM questions q WHERE q.examId = exam.id AND q.topicId = :topicId)',
        { topicId },
      )
      // Newest release first, then newest created (task 10)
      .orderBy('exam.releaseDate', 'DESC')
      .addOrderBy('exam.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Published Mock Exams (GET /exams/mock), newest release first. Only the
   * card fields are selected (no questions, answers or author). `category`
   * matches the exam category slug, or the category name.
   */
  async findMockExams(
    page = 1,
    limit = 12,
    category?: string,
  ): Promise<PaginatedMockExams> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 12));

    const [rows, total] = await Promise.all([
      this.mockExamQuery(category)
        // Newest release first, then newest created (task 10)
        .orderBy('exam.releaseDate', 'DESC')
        .addOrderBy('exam.createdAt', 'DESC')
        .offset((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .getRawMany<MockExamRow>(),
      this.mockExamQuery(category).getCount(),
    ]);

    return {
      items: rows.map(toMockExamItem),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * Categories that have at least one published Mock Exam
   * (GET /exams/mock/categories), in the admin category order.
   * `name` falls back to the slug when the category row was deleted.
   */
  async findMockCategories(): Promise<MockExamCategory[]> {
    const rows = await this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin('categories', 'cat', 'cat.slug = exam.category')
      .select('exam.category', 'slug')
      .addSelect('MAX(cat.name)', 'name')
      .addSelect('MIN(cat.orderIndex)', 'orderIndex')
      .addSelect('COUNT(*)', 'count')
      .where('exam.isMock = :isMock', { isMock: true })
      .andWhere('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      .groupBy('exam.category')
      .getRawMany<{
        slug: string;
        name: string | null;
        orderIndex: number | string | null;
        count: number | string;
      }>();

    const order = (value: number | string | null) =>
      value === null || value === undefined
        ? Number.MAX_SAFE_INTEGER
        : Number(value);

    return rows
      .map((row) => ({
        name: row.name || row.slug,
        slug: row.slug,
        count: Number(row.count),
        orderIndex: order(row.orderIndex),
      }))
      .sort(
        (a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name),
      )
      .map(({ name, slug, count }) => ({ name, slug, count }));
  }

  /**
   * One published Mock Exam for its detail page (GET /exams/mock/:id): the
   * card fields + description + detail blocks, never the questions.
   * Not a mock exam, not published or not found → 404.
   */
  async findMockOne(id: string): Promise<MockExamDetail> {
    const row = await this.mockExamQuery()
      .addSelect('exam.description', 'description')
      .addSelect('exam.detailBlocks', 'detailBlocks')
      .andWhere('exam.id = :id', { id })
      .getRawOne<
        MockExamRow & { description: string | null; detailBlocks: unknown }
      >();

    if (!row) {
      throw new NotFoundException('ไม่พบชุดข้อสอบ');
    }

    return {
      ...toMockExamItem(row),
      description: row.description ?? null,
      detailBlocks: normalizeStoredDetailBlocks(row.detailBlocks),
    };
  }

  /** Published Mock Exams with the card fields selected (raw rows). */
  private mockExamQuery(category?: string) {
    const qb = this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin('subjects', 'subject', 'subject.id = exam.subjectId')
      .leftJoin('categories', 'cat', 'cat.slug = exam.category')
      .select('exam.id', 'id')
      .addSelect('exam.title', 'title')
      .addSelect('exam.category', 'category')
      .addSelect('cat.name', 'categoryName')
      .addSelect('exam.subjectId', 'subjectId')
      .addSelect('subject.name', 'subjectName')
      .addSelect('exam.bannerImage', 'bannerImage')
      .addSelect('exam.questionCount', 'questionCount')
      .addSelect('exam.durationMinutes', 'durationMinutes')
      .addSelect('exam.level', 'level')
      .addSelect('exam.accessType', 'accessType')
      .addSelect('exam.price', 'price')
      .addSelect('exam.releaseDate', 'releaseDate')
      .where('exam.isMock = :isMock', { isMock: true })
      .andWhere('exam.status = :status', { status: QuestionStatus.PUBLISHED });

    if (category) {
      qb.andWhere('(exam.category = :category OR cat.name = :category)', {
        category,
      });
    }
    return qb;
  }

  async getStats(): Promise<ExamStats> {
    const total = await this.examsRepository.count();
    const published = await this.examsRepository.count({
      where: { status: QuestionStatus.PUBLISHED },
    });
    const draft = await this.examsRepository.count({
      where: { status: QuestionStatus.DRAFT },
    });

    const byCategoryRaw = await this.examsRepository
      .createQueryBuilder('exam')
      .select('exam.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('exam.category')
      .getRawMany();

    const byCategory: ExamCategoryCount[] = byCategoryRaw.map((row) => ({
      category: row.category,
      count: parseInt(row.count, 10),
    }));

    return { total, published, draft, byCategory };
  }
}
