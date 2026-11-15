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
  MockExamListItem,
  MockExamProgress,
  MockExamTopicCount,
  OTHER_TOPIC_NAME,
  PaginatedMockExams,
  assertMockAccess,
  collectDetailBlockImageUrls,
  normalizeStoredDetailBlocks,
  prepareDetailBlocks,
  MockExamRow,
  normalizeStoredCodeInstructions,
  parseMockExamSort,
  prepareCodeInstructions,
  toMockExamItem,
} from './exam-mock';
import {
  assertCampaignWindow,
  buildCampaign,
  campaignClosedForAttempt,
  enforcedCampaignStatus,
  parseCampaignDate,
} from './exam-campaign';
import { ExamAccessService } from '../exam-access/exam-access.service';
import { ExamAttempt } from '../attempts/attempt.entity';
import { ProVenue } from '../pro/pro-venue.entity';
import { isAdminViewer, type AccessViewer } from '../exam-access/exam-access';
import { challengeNotInBankOnly } from '../question-bank/question-bank-errors';
import { PredictedAccessService } from '../predicted/predicted-access.service';
import {
  PredictedExamInfo,
  notPredictedExamSql,
  predictedLockedException,
} from '../predicted/predicted-access';
import { findLatestProgress } from './exam-progress';

export { LATER_ATTEMPT_MISSING } from './exam-progress';

/**
 * GET /exams/:id: the exam, plus `predicted` when it is a Predicted set
 * (task 22; absent for every other exam).
 */
export type PublishedExam = Exam & { predicted?: PredictedExamInfo };

/** Exam PUT that would make a Predicted set a Mock / bankOnly exam. */
export const PREDICTED_EXAM_NOT_MOCK =
  'ชุดนี้อยู่ในซีรีส์ Predicted Exam ตั้งเป็นชุด Mock หรือ "ใช้เฉพาะ Question Bank" ไม่ได้ ให้นำออกจากซีรีส์ก่อน';

/**
 * Exam PUT that would leave a Predicted set with no more questions than its
 * Preview (B2/Q3: the Preview would be the whole set).
 */
export function predictedPreviewTooLarge(previewCount: number): string {
  return `ชุดนี้ตั้ง Preview ไว้ ${previewCount} ข้อ ต้องมีข้อมากกว่า ${previewCount} ข้อ`;
}

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

/**
 * Challenge questions only in a bankOnly exam (task 20): 400
 * CHALLENGE_NOT_IN_BANK_ONLY naming the first sent question marked
 * Challenge. `sent` = the questions of the request; `stored` = the exam's
 * current questions, checked when no questions are sent (PUT that only
 * turns bankOnly off).
 */
export function assertChallengeInBankOnly(
  bankOnly: boolean,
  sent: Pick<CreateExamQuestionInput, 'isChallenge'>[] | undefined,
  stored: Pick<Question, 'isChallenge'>[] = [],
): void {
  if (bankOnly) return;
  if (sent) {
    const index = sent.findIndex((q) => q.isChallenge === true);
    if (index >= 0) throw challengeNotInBankOnly(index);
    return;
  }
  if (stored.some((q) => isTrue(q.isChallenge))) {
    throw challengeNotInBankOnly(null);
  }
}

function isTrue(value: unknown): boolean {
  return value === true || Number(value) === 1;
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
    @InjectRepository(ExamAttempt)
    private attemptsRepository: Repository<ExamAttempt>,
    private predictedAccessService: PredictedAccessService,
  ) {}

  async create(input: CreateExamInput, author: User): Promise<Exam> {
    const passages = preparePassages(input.passages, input.questions);
    // Not sent = left out of the INSERT so the DB default (CURRENT_TIMESTAMP,
    // the clock createdAt uses) applies
    const releaseDate = parseReleaseDate(input.releaseDate);
    const accessType = input.accessType ?? ExamAccessType.FREE;
    assertMockAccess(accessType, input.price);
    const bankOnly = input.bankOnly ?? false;
    assertChallengeInBankOnly(bankOnly, input.questions);
    // Campaign window (task 21): not sent = none
    const campaignStartsAt = parseCampaignDate(
      input.campaignStartsAt,
      'วันเปิดแคมเปญ',
    );
    const campaignEndsAt = parseCampaignDate(
      input.campaignEndsAt,
      'วันปิดแคมเปญ',
    );
    assertCampaignWindow(campaignStartsAt, campaignEndsAt);

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
        bankOnly,
        accessType,
        price: input.price ?? null,
        accessDays: input.accessDays ?? null,
        level: input.level ?? null,
        detailBlocks: prepareDetailBlocks(input.detailBlocks),
        codeInstructions: prepareCodeInstructions(input.codeInstructions),
        campaignStartsAt,
        campaignEndsAt,
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
          isChallenge: q.isChallenge === true,
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
    options: {
      excludeMock?: boolean;
      // Public lists: never bankOnly exams (task 20)
      excludeBankOnly?: boolean;
      // Admin list filter (task 20): true = bankOnly only, false = others
      bankOnly?: boolean;
      // Public lists: never Predicted sets (task 22)
      excludePredicted?: boolean;
    } = {},
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

    // bankOnly exams are used by the Question Bank only (task 20)
    if (options.excludeBankOnly) {
      queryBuilder.andWhere('exam.bankOnly = :bankOnly', { bankOnly: false });
    } else if (typeof options.bankOnly === 'boolean') {
      queryBuilder.andWhere('exam.bankOnly = :bankOnly', {
        bankOnly: options.bankOnly,
      });
    }

    // Predicted sets are listed only by GET /predicted (task 22)
    if (options.excludePredicted) {
      queryBuilder.andWhere(notPredictedExamSql('exam.id'));
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
      { excludeMock: true, excludeBankOnly: true, excludePredicted: true },
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
   *
   * A campaign that has not opened yet (task 21) → 403 CAMPAIGN_NOT_OPEN for
   * everyone but admins, checked before access (as POST /attempts/start):
   * holders of an all-Mock or multi-exam code, or of a code redeemed before
   * an admin moved the window, must not see the questions early. An ended
   * campaign stays readable (resume an attempt / result and answers).
   *
   * A Predicted set (task 22): series off → 404 (non-admins); locked → 403
   * PREDICTED_LOCKED with no question; preview → only the first
   * previewCount questions (orderIndex, createdAt, id) and the passages
   * they refer to; `predicted` tells the web which (full / preview).
   */
  async findPublishedOne(
    id: string,
    viewer: AccessViewer | null = null,
    now: Date = new Date(),
  ): Promise<PublishedExam> {
    const exam = await this.examsRepository.findOne({
      where: { id, status: QuestionStatus.PUBLISHED },
      relations: ['author', 'questions'],
      order: { questions: { orderIndex: 'ASC' } },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    if (
      !isAdminViewer(viewer) &&
      enforcedCampaignStatus(exam, now) === 'upcoming'
    ) {
      throw campaignClosedForAttempt('upcoming');
    }

    await this.examAccessService.assertCanAccess(viewer, exam);

    // Second layer (task 20): Challenge questions only reach non-admins
    // through the Question Bank, even if one ever ends up in an exam that
    // is not bankOnly
    if (!isAdminViewer(viewer)) {
      exam.questions = (exam.questions ?? []).filter(
        (q) => !isTrue(q.isChallenge),
      );
    }

    const predicted = await this.predictedAccessService.resolveExam(
      viewer,
      exam.id,
      now,
    );
    if (!predicted) return this.withPassages(exam);
    if (predicted.access === 'locked') {
      throw predictedLockedException(predicted.set.venueKey);
    }

    const totalQuestions = (exam.questions ?? []).length;
    if (predicted.access === 'preview') {
      // The same ids (and order) the attempt of this Preview gets
      const ids = await this.predictedAccessService.questionIds(
        exam.id,
        predicted.previewCount,
      );
      const order = new Map(ids.map((qid, i) => [qid.toLowerCase(), i]));
      exam.questions = (exam.questions ?? [])
        .filter((q) => order.has(q.id.toLowerCase()))
        .sort(
          (a, b) =>
            (order.get(a.id.toLowerCase()) ?? 0) -
            (order.get(b.id.toLowerCase()) ?? 0),
        );
    }

    const result: PublishedExam = await this.withPassages(exam);
    if (predicted.access === 'preview') {
      // Only the passages of the questions sent
      const used = new Set(
        exam.questions.map((q) => q.passageId).filter((p): p is string => !!p),
      );
      result.passages = (result.passages ?? []).filter((p) => used.has(p.id));
    }
    result.predicted = {
      access: predicted.access,
      previewCount: predicted.previewCount,
      totalQuestions,
      seriesId: predicted.set.seriesId,
      setNo: predicted.set.setNo,
      venueKey: predicted.set.venueKey,
    };
    return result;
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
    // Campaign window (task 21): sent = replaced (null clears), not sent =
    // unchanged; end after start checked on the values the exam will have
    const campaignStartsAt =
      input.campaignStartsAt !== undefined
        ? parseCampaignDate(input.campaignStartsAt, 'วันเปิดแคมเปญ')
        : (exam.campaignStartsAt ?? null);
    const campaignEndsAt =
      input.campaignEndsAt !== undefined
        ? parseCampaignDate(input.campaignEndsAt, 'วันปิดแคมเปญ')
        : (exam.campaignEndsAt ?? null);
    assertCampaignWindow(campaignStartsAt, campaignEndsAt);
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
    // Not sent (or null) = unchanged; Challenge questions (sent, or the
    // stored ones when questions are not sent) need bankOnly (task 20)
    const bankOnly =
      typeof input.bankOnly === 'boolean' ? input.bankOnly : exam.bankOnly;
    assertChallengeInBankOnly(bankOnly, input.questions, exam.questions);
    // A Predicted set is never a Mock / bankOnly exam (task 22): its access
    // comes from its series, not from exam_access or the Question Bank
    const isMock =
      typeof input.isMock === 'boolean' ? input.isMock : exam.isMock;
    if (
      (isTrue(isMock) || isTrue(bankOnly)) &&
      (await this.predictedAccessService.isPredictedExam(id))
    ) {
      throw new BadRequestException(PREDICTED_EXAM_NOT_MOCK);
    }
    // Questions sent: a Predicted set keeps more (non-Challenge) questions
    // than its Preview (B2/Q3); GET /exams/:id and attempts check it again
    // on every read (questions can also go through /questions/admin)
    if (input.questions) {
      const previewCount =
        await this.predictedAccessService.findPreviewCount(id);
      const playable = input.questions.filter(
        (q) => !isTrue(q.isChallenge),
      ).length;
      if (previewCount !== null && playable <= previewCount) {
        throw new BadRequestException(predictedPreviewTooLarge(previewCount));
      }
    }

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
      exam.bankOnly = bankOnly;
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
            // Not sent = false, like the other optional fields (task 20)
            isChallenge: q.isChallenge === true,
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
        bankOnly: exam.bankOnly,
        accessType: exam.accessType,
        price: exam.price,
        accessDays: exam.accessDays,
        level: exam.level,
        campaignStartsAt,
        campaignEndsAt,
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
      // bankOnly exams are used by the Question Bank only (task 20)
      .andWhere('exam.bankOnly = :bankOnly', { bankOnly: false })
      // Predicted sets are listed only by GET /predicted (task 22)
      .andWhere(notPredictedExamSql('exam.id'))
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
   * Published Mock Exams (GET /exams/mock). Only the card fields are
   * selected (no questions, answers or author). `category` matches the exam
   * category slug, or the category name; `venue` (task 21) the key of the
   * active Pro venue of the category.
   *
   * `sort` (task 21): newest (default) = newest release first, then newest
   * created (task 10); name = title A–Z; recommended = campaigns open (and
   * every non-campaign exam) → upcoming → ended, then newest release.
   *
   * Free Mock lists only free and code (campaign) exams: purchase exams are
   * no longer listed (task 22, they moved to Predicted Exam series).
   */
  async findMockExams(
    page = 1,
    limit = 12,
    category?: string,
    viewer: AccessViewer | null = null,
    options: { sort?: string; venue?: string } = {},
    now: Date = new Date(),
  ): Promise<PaginatedMockExams> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 12));
    const sort = parseMockExamSort(options.sort);
    const venue =
      typeof options.venue === 'string' && options.venue.trim() !== ''
        ? options.venue.trim()
        : undefined;

    const listQuery = this.mockExamQuery(category, venue, true);
    if (sort === 'recommended') {
      // Same rule as getCampaignStatus, on the same clock (now is a
      // parameter, never the DB's NOW())
      listQuery
        .addSelect(
          `CASE
            WHEN exam.accessType <> :campaignType THEN 0
            WHEN exam.campaignStartsAt IS NOT NULL AND exam.campaignStartsAt > :now THEN 1
            WHEN exam.campaignEndsAt IS NOT NULL AND exam.campaignEndsAt < :now THEN 2
            ELSE 0
          END`,
          'campaignRank',
        )
        .setParameters({ campaignType: ExamAccessType.CODE, now })
        .orderBy('campaignRank', 'ASC')
        .addOrderBy('exam.releaseDate', 'DESC')
        .addOrderBy('exam.createdAt', 'DESC');
    } else if (sort === 'name') {
      listQuery
        .orderBy('exam.title', 'ASC')
        .addOrderBy('exam.releaseDate', 'DESC');
    } else {
      // Newest release first, then newest created (task 10)
      listQuery
        .orderBy('exam.releaseDate', 'DESC')
        .addOrderBy('exam.createdAt', 'DESC');
    }
    // Deterministic pages when everything above ties
    listQuery.addOrderBy('exam.id', 'ASC');

    const [rows, total] = await Promise.all([
      listQuery
        .offset((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .getRawMany<MockExamRow>(),
      this.mockExamQuery(category, venue, true).getCount(),
    ]);

    return {
      items: await this.toMockListItems(rows, viewer, now),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * Categories that have at least one published Mock Exam listed by
   * GET /exams/mock (GET /exams/mock/categories; purchase exams not counted,
   * task 22), in the admin category order.
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
      .andWhere('exam.bankOnly = :bankOnly', { bankOnly: false })
      .andWhere('exam.accessType <> :purchaseType', {
        purchaseType: ExamAccessType.PURCHASE,
      })
      .andWhere(notPredictedExamSql('exam.id'))
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
    now: Date = new Date(),
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
    const [access, progress, topicBreakdown] = await Promise.all([
      this.examAccessService.getAccess(viewer, { ...item, isMock: true }),
      this.findMockProgress(viewer, [item.id]),
      this.findTopicBreakdown(item.id),
    ]);

    return {
      ...item,
      access,
      campaign: buildCampaign(row, now),
      myProgress: progress.get(item.id) ?? null,
      description: row.description ?? null,
      detailBlocks: normalizeStoredDetailBlocks(row.detailBlocks),
      codeInstructions: normalizeStoredCodeInstructions(row.codeInstructions),
      topicBreakdown,
    };
  }

  /**
   * Cards of GET /exams/mock: card fields + the viewer's access (one query,
   * task 15) + campaign status + the viewer's latest attempt (one query,
   * task 21).
   */
  private async toMockListItems(
    rows: MockExamRow[],
    viewer: AccessViewer | null,
    now: Date,
  ): Promise<MockExamListItem[]> {
    const items = rows.map(toMockExamItem);
    const ids = items.map((item) => item.id);
    const [access, progress] = await Promise.all([
      this.examAccessService.getAccessMany(
        viewer,
        items.map((item) => ({ ...item, isMock: true })),
      ),
      this.findMockProgress(viewer, ids),
    ]);

    return items.map((item, index) => ({
      ...item,
      access: access.get(item.id) ?? {
        status: 'locked',
        expiresAt: null,
        via: null,
      },
      campaign: buildCampaign(rows[index], now),
      myProgress: progress.get(item.id) ?? null,
    }));
  }

  /**
   * `myProgress` per exam (task 21): the viewer's latest in_progress or
   * completed attempt of each exam (findLatestProgress, shared with GET
   * /predicted). Guests: none, no query.
   */
  private async findMockProgress(
    viewer: AccessViewer | null,
    examIds: string[],
  ): Promise<Map<string, MockExamProgress>> {
    return findLatestProgress(this.attemptsRepository, viewer?.id, examIds);
  }

  /**
   * "เนื้อหาที่ออก" of a Mock Exam (task 21): number of questions per topic
   * (questions.topicId → topics.name), most first; questions without a topic
   * (or whose topic was deleted) are counted together as "อื่น ๆ", listed
   * last. Counts only, never question content. Challenge questions are left
   * out as on GET /exams/:id.
   */
  private async findTopicBreakdown(
    examId: string,
  ): Promise<MockExamTopicCount[]> {
    const rows = await this.questionsRepository
      .createQueryBuilder('q')
      .leftJoin('topics', 'topic', 'topic.id = q.topicId')
      .select('topic.id', 'topicId')
      .addSelect('topic.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('q.examId = :examId', { examId })
      .andWhere('q.isChallenge = :isChallenge', { isChallenge: false })
      .groupBy('topic.id')
      .addGroupBy('topic.name')
      .getRawMany<{
        topicId: string | null;
        name: string | null;
        count: number | string;
      }>();

    let other = 0;
    const topics: MockExamTopicCount[] = [];
    for (const row of rows) {
      const count = Number(row.count) || 0;
      if (count <= 0) continue;
      if (row.topicId && row.name) {
        topics.push({ topicId: row.topicId, name: row.name, count });
      } else {
        other += count;
      }
    }
    topics.sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'),
    );
    if (other > 0) {
      topics.push({ topicId: null, name: OTHER_TOPIC_NAME, count: other });
    }
    return topics;
  }

  /**
   * Published Mock Exams with the card fields selected (raw rows).
   * `listed` = only what GET /exams/mock lists: no purchase exams (task 22);
   * the detail page (GET /exams/mock/:id) still opens them.
   */
  private mockExamQuery(category?: string, venue?: string, listed = false) {
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
      // task 21: card subject label / colour and the campaign window
      .addSelect('subject.bankLabel', 'subjectBankLabel')
      .addSelect('subject.color', 'subjectColor')
      .addSelect('exam.campaignStartsAt', 'campaignStartsAt')
      .addSelect('exam.campaignEndsAt', 'campaignEndsAt')
      .where('exam.isMock = :isMock', { isMock: true })
      .andWhere('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      // bankOnly exams are hidden from every exam list (task 20)
      .andWhere('exam.bankOnly = :bankOnly', { bankOnly: false })
      // Predicted sets are never Mock Exams (task 22); defensive
      .andWhere(notPredictedExamSql('exam.id'));

    if (listed) {
      qb.andWhere('exam.accessType <> :purchaseType', {
        purchaseType: ExamAccessType.PURCHASE,
      });
    }

    if (category) {
      qb.andWhere('(exam.category = :category OR cat.name = :category)', {
        category,
      });
    }
    // Venue tab (task 21): exams whose category belongs to that active venue
    if (venue) {
      qb.andWhere('venue.key = :venueKey', { venueKey: venue });
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
