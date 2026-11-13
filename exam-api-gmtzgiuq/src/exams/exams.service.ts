import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
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
  CreateExamQuestionInput,
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
  normalizeStoredCodeInstructions,
  prepareCodeInstructions,
  toMockExamItem,
} from './exam-mock';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ProVenue } from '../pro/pro-venue.entity';
import type { AccessViewer } from '../exam-access/exam-access';

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

/**
 * Pair the questions sent to PUT with the exam's current questions by id
 * (task 16, BUG-1). `keptIdByIndex`: input index → id of the row it updates;
 * `removedIds`: current questions not sent. An id that is not a question of
 * this exam (e.g. copied from another exam) is ignored, so that question is
 * created anew and the other exam's row is never touched. Ids compare
 * case-insensitively, as MySQL does; the same id twice → 400.
 */
export function matchQuestionIds(
  current: Pick<Question, 'id'>[],
  input: Pick<CreateExamQuestionInput, 'id'>[],
): { keptIdByIndex: Map<number, string>; removedIds: string[] } {
  const currentIds = new Map(current.map((q) => [q.id.toLowerCase(), q.id]));
  const sent = new Set<string>();
  const keptIdByIndex = new Map<number, string>();

  input.forEach((q, index) => {
    if (!q.id) return;
    const key = q.id.toLowerCase();
    if (sent.has(key)) {
      throw new BadRequestException(
        `รหัสข้อซ้ำกันในชุดข้อสอบ (ข้อที่ ${index + 1})`,
      );
    }
    sent.add(key);
    const keptId = currentIds.get(key);
    if (keptId) keptIdByIndex.set(index, keptId);
  });

  const kept = new Set(keptIdByIndex.values());
  return {
    keptIdByIndex,
    removedIds: current.filter((q) => !kept.has(q.id)).map((q) => q.id),
  };
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
    private examAccessService: ExamAccessService,
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
        codeInstructions: prepareCodeInstructions(input.codeInstructions),
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

  /**
   * Published exam with its questions and answers (GET /exams/:id). A locked
   * Mock Exam (code/purchase) → 403 EXAM_LOCKED unless the viewer is an
   * admin or has access that has not expired (task 15); guests too.
   */
  async findPublishedOne(
    id: string,
    viewer: AccessViewer | null = null,
  ): Promise<Exam> {
    const exam = await this.examsRepository.findOne({
      where: { id, status: QuestionStatus.PUBLISHED },
      relations: ['author', 'questions'],
      order: { questions: { orderIndex: 'ASC' } },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    await this.examAccessService.assertCanAccess(viewer, exam);

    return this.withPassages(exam);
  }

  /**
   * Load `passages` (a select: false column) for a single exam and expose it
   * as an array (null/malformed → []). With `adminFields` (admin findOne),
   * also load the Mock Exam description blocks and "วิธีรับโค้ด" the same way.
   */
  private async withPassages(exam: Exam, adminFields = false): Promise<Exam> {
    const row = await this.examsRepository.findOne({
      select: adminFields
        ? {
            id: true,
            passages: true,
            detailBlocks: true,
            codeInstructions: true,
          }
        : { id: true, passages: true },
      where: { id: exam.id },
      loadEagerRelations: false,
    });
    exam.passages = normalizeStoredPassages(row?.passages);
    if (adminFields) {
      exam.detailBlocks = normalizeStoredDetailBlocks(row?.detailBlocks);
      exam.codeInstructions = normalizeStoredCodeInstructions(
        row?.codeInstructions,
      );
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
    // Sent = replaced (null clears); not sent = unchanged
    const replaceCodeInstructions = input.codeInstructions !== undefined;
    const currentQuestionUrls = exam.questions.flatMap((q) =>
      collectQuestionImageUrls(q),
    );
    // A repeated id → 400 before the transaction starts
    if (input.questions) matchQuestionIds([], input.questions);

    // Passages are replaced when sent, and also (with []) when questions are
    // sent without them: the questions may only refer to this request.
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

      // Sync questions by id if provided (task 16, BUG-1): a sent id of this
      // exam updates that row so its id (and the answer history pointing at
      // it) stays; anything else is a new question; questions not sent are
      // deleted
      if (input.questions) {
        // Lock the exam row so two admins saving the same exam run one
        // after the other, then pair ids with the questions as committed
        // now (not as loaded before the transaction): a question the
        // other save deleted is created anew instead of "updated"
        await manager.findOne(Exam, {
          select: { id: true },
          where: { id },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        const currentRows = await manager.find(Question, {
          select: { id: true },
          where: { examId: id },
          loadEagerRelations: false,
        });
        const { keptIdByIndex, removedIds } = matchQuestionIds(
          currentRows,
          input.questions,
        );

        if (removedIds.length > 0) {
          await manager.delete(Question, { examId: id, id: In(removedIds) });
        }

        const category = input.category || exam.category;
        const questions = input.questions.map((q, index) => {
          const fields = {
            question: q.question,
            ...resolveQuestionImages(q),
            choices: normalizeChoices(q.choices),
            category,
            difficulty: q.difficulty || QuestionDifficulty.MEDIUM,
            type: q.type || QuestionType.MULTIPLE_CHOICE,
            status: exam.status,
            orderIndex: q.orderIndex ?? index,
            examId: id,
            passageId: q.passageId || null,
          };
          const keptId = keptIdByIndex.get(index);
          if (keptId) {
            // Not sent = cleared, as when the question was recreated
            return manager.create(Question, {
              ...fields,
              id: keptId,
              ...({
                correctAnswer: q.correctAnswer ?? null,
                explanation: q.explanation ?? null,
                hint: q.hint ?? null,
                topicId: q.topicId || null,
                chapterId: q.chapterId || null,
                chapter: q.chapter || null,
              } as Partial<Question>),
            });
          }
          return manager.create(Question, {
            ...fields,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            hint: q.hint,
            authorId: exam.authorId,
            topicId: q.topicId || undefined,
            chapterId: q.chapterId || undefined,
            chapter: q.chapter || undefined,
          });
        });
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
        ...(replaceCodeInstructions
          ? {
              codeInstructions: prepareCodeInstructions(input.codeInstructions),
            }
          : {}),
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
    viewer: AccessViewer | null = null,
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

    // Access of the viewer to every card, one query (task 15)
    const items = rows.map(toMockExamItem);
    const access = await this.examAccessService.getAccessMany(
      viewer,
      items.map((item) => ({ ...item, isMock: true })),
    );

    return {
      items: items.map((item) => ({
        ...item,
        access: access.get(item.id) ?? {
          status: 'locked',
          expiresAt: null,
          via: null,
        },
      })),
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
   * card fields + description + detail blocks + "วิธีรับโค้ด" + the viewer's
   * access, never the questions. Not a mock exam, not published or not
   * found → 404.
   */
  async findMockOne(
    id: string,
    viewer: AccessViewer | null = null,
  ): Promise<MockExamDetail> {
    const row = await this.mockExamQuery()
      .addSelect('exam.description', 'description')
      .addSelect('exam.detailBlocks', 'detailBlocks')
      .addSelect('exam.codeInstructions', 'codeInstructions')
      .andWhere('exam.id = :id', { id })
      .getRawOne<
        MockExamRow & {
          description: string | null;
          detailBlocks: unknown;
          codeInstructions: unknown;
        }
      >();

    if (!row) {
      throw new NotFoundException('ไม่พบชุดข้อสอบ');
    }

    const item = toMockExamItem(row);
    const access = await this.examAccessService.getAccess(viewer, {
      ...item,
      isMock: true,
    });

    return {
      ...item,
      access,
      description: row.description ?? null,
      detailBlocks: normalizeStoredDetailBlocks(row.detailBlocks),
      codeInstructions: normalizeStoredCodeInstructions(row.codeInstructions),
    };
  }

  /** Published Mock Exams with the card fields selected (raw rows). */
  private mockExamQuery(category?: string) {
    const qb = this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin('subjects', 'subject', 'subject.id = exam.subjectId')
      .leftJoin('categories', 'cat', 'cat.slug = exam.category')
      // Pro venue of the category (task 17), only while /upgrade shows it
      .leftJoin(
        ProVenue,
        'venue',
        'venue.id = cat.venueId AND venue.isActive = :venueActive',
        { venueActive: true },
      )
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
      .addSelect('venue.key', 'venueKey')
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
