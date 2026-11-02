import { Injectable, NotFoundException } from '@nestjs/common';
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
        passages,
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
  ): Promise<PaginatedExams> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.examsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.author', 'author')
      .orderBy('exam.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('exam.status = :status', { status });
    }

    if (category) {
      queryBuilder.andWhere('exam.category = :category', { category });
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

    return this.withPassages(exam);
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
   * as an array (null/malformed → []).
   */
  private async withPassages(exam: Exam): Promise<Exam> {
    const row = await this.examsRepository.findOne({
      select: { id: true, passages: true },
      where: { id: exam.id },
      loadEagerRelations: false,
    });
    exam.passages = normalizeStoredPassages(row?.passages);
    return exam;
  }

  async update(id: string, input: UpdateExamInput): Promise<Exam> {
    const exam = await this.findOne(id);
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
        ...(passages ? { passages } : {}),
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
        [...newQuestionUrls, ...collectPassageImageUrls(passages)],
      );
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<boolean> {
    const exam = await this.findOne(id);
    const imageUrls = [
      ...exam.questions.flatMap((q) => collectQuestionImageUrls(q)),
      ...collectPassageImageUrls(exam.passages),
    ];

    await this.examsRepository.remove(exam);

    // Exam deleted: remove the images its questions and passages referred to
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
      .andWhere(
        'EXISTS (SELECT 1 FROM questions q WHERE q.examId = exam.id AND q.topicId = :topicId)',
        { topicId },
      )
      .orderBy('exam.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
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
