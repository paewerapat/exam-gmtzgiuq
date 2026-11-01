import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
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

    // Saved: drop image files neither this question nor its siblings use
    deleteUnusedImages(this.uploadService, oldImageUrls, [
      ...collectQuestionImageUrls(saved),
      ...siblingUrls,
    ]);
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    const question = await this.findOne(id);
    const imageUrls = collectQuestionImageUrls(question);
    const siblingUrls = await this.siblingImageUrls(question);

    await this.questionsRepository.remove(question);

    // Removed: delete its image files unless another question of the same
    // exam still uses them
    deleteUnusedImages(this.uploadService, imageUrls, siblingUrls);
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

  async findByTopic(topicId: string): Promise<Question[]> {
    return this.questionsRepository
      .createQueryBuilder('q')
      .innerJoin('q.exam', 'exam')
      .where('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      .andWhere('q.topicId = :topicId', { topicId })
      .orderBy('exam.createdAt', 'ASC')
      .addOrderBy('q.orderIndex', 'ASC')
      .getMany();
  }

  async findBySubject(subjectId: string): Promise<Question[]> {
    return this.questionsRepository
      .createQueryBuilder('q')
      .innerJoin('q.exam', 'exam')
      .innerJoin('topics', 'topic', 'topic.id = q.topicId')
      .innerJoin('chapters', 'chapter', 'chapter.id = topic.chapterId')
      .where('exam.status = :status', { status: QuestionStatus.PUBLISHED })
      .andWhere('chapter.subjectId = :subjectId', { subjectId })
      .orderBy('exam.createdAt', 'ASC')
      .addOrderBy('q.orderIndex', 'ASC')
      .getMany();
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
