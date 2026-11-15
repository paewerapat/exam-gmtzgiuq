import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { Subject } from '../curriculum/subject.entity';
import { ProVenue } from '../pro/pro-venue.entity';
import { QuestionStatus } from '../questions/question.entity';
import { isAdminViewer, type AccessViewer } from '../exam-access/exam-access';
import { findLatestProgress } from '../exams/exam-progress';
import type { MockExamProgress } from '../exams/exam-mock';
import { isDuplicateKey, isMissingReference } from '../pro/pro-errors';
import { PredictedSeries } from './predicted-series.entity';
import { PredictedSet, PredictedSetAccess } from './predicted-set.entity';
import { PredictedAccessService } from './predicted-access.service';
import {
  PredictedViewerAccess,
  computePredictedAccess,
  normalizePreviewCount,
  notPredictedExamSql,
  playableCountSql,
  proIndexSql,
} from './predicted-access';
import {
  CreatePredictedSeriesDto,
  PredictedSetInputDto,
  UpdatePredictedSeriesDto,
} from './dto/predicted.dto';

// ── public shapes (GET /predicted) ──────────────────────────────────────

export interface PredictedVenueTab {
  key: string;
  name: string;
}

export interface PredictedSubjectChip {
  id: string;
  name: string;
  // Sets (not series) of the venue in this subject
  count: number;
}

export interface PredictedSetCard {
  setNo: number;
  examId: string;
  title: string;
  questionCount: number;
  durationMinutes: number | null;
  access: PredictedSetAccess;
  // null = no Preview
  previewCount: number | null;
  viewerAccess: PredictedViewerAccess;
  myProgress: MockExamProgress | null;
  // Status of the exam: always 'published' for non-admins (drafts are left
  // out); admins also get their drafts, shown as "ฉบับร่าง" without a start
  // button (GET /exams/:id of a draft is 404)
  status: PredictedSetStatus;
}

export type PredictedSetStatus = 'draft' | 'published';

export interface PredictedSeriesCard {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  venueKey: string;
  subject: { id: string; name: string } | null;
  sets: PredictedSetCard[];
}

export interface PredictedPage {
  venues: PredictedVenueTab[];
  // The venue shown (?venue=, else the first active one); null = none
  venueKey: string | null;
  // An active plan with rank > 0 in that venue (hide the Upgrade banner);
  // false for guests, true for admins
  viewerHasPaidPlan: boolean;
  subjects: PredictedSubjectChip[];
  series: PredictedSeriesCard[];
  // Sets of the venue (every subject): "ทั้งหมด N ชุด"
  total: number;
}

// ── admin shapes ────────────────────────────────────────────────────────

export interface AdminPredictedSet {
  id: string;
  examId: string;
  setNo: number;
  access: PredictedSetAccess;
  previewCount: number | null;
  exam: {
    id: string;
    title: string;
    questionCount: number;
    status: string;
  } | null;
}

export interface AdminPredictedSeries {
  id: string;
  venueId: string;
  venue: { id: string; key: string; name: string } | null;
  subjectId: string | null;
  subject: { id: string; name: string } | null;
  title: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  setCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPredictedSeriesDetail extends AdminPredictedSeries {
  sets: AdminPredictedSet[];
}

export interface PredictedExamOption {
  id: string;
  title: string;
  category: string;
  subjectId: string | null;
  questionCount: number;
  durationMinutes: number | null;
  status: string;
}

export const MAX_EXAM_OPTIONS = 50;

interface SeriesRawRow {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  sortOrder: number | string;
  isActive: number | string | boolean;
  venueId: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectOrder: number | string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SetCardRawRow {
  seriesId: string;
  examId: string;
  setNo: number | string;
  access: string;
  previewCount: number | string | null;
  proIndex: number | string | null;
  playableCount: number | string | null;
  title: string;
  questionCount: number | string | null;
  durationMinutes: number | string | null;
  status: string;
}

function isTrue(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toAccess(value: unknown): PredictedSetAccess {
  return value === 'free' ? 'free' : 'pro';
}

/**
 * Predicted Exam (task 22): the public page (GET /predicted) and the admin
 * series / sets (/admin/predicted/...). Access of each set is worked out by
 * PredictedAccessService's rule.
 */
@Injectable()
export class PredictedService {
  constructor(
    @InjectRepository(PredictedSeries)
    private seriesRepository: Repository<PredictedSeries>,
    @InjectRepository(PredictedSet)
    private setsRepository: Repository<PredictedSet>,
    @InjectRepository(ProVenue)
    private venuesRepository: Repository<ProVenue>,
    @InjectRepository(Subject)
    private subjectsRepository: Repository<Subject>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
    @InjectRepository(ExamAttempt)
    private attemptsRepository: Repository<ExamAttempt>,
    private dataSource: DataSource,
    private predictedAccessService: PredictedAccessService,
  ) {}

  // ── public ────────────────────────────────────────────────────────────

  /**
   * GET /predicted: venue tabs, subject chips (sets per subject) and the
   * series of one venue with their sets and the viewer's access /
   * progress, no question content. Fixed number of queries: venues,
   * rights (logged-in non-admins), series, sets, progress (logged in).
   * Series off and sets whose exam is not published are left out (admins
   * see them); a series without a set to show is left out too.
   */
  async findPage(
    viewer: AccessViewer | null,
    options: { venue?: string; subject?: string } = {},
    now: Date = new Date(),
  ): Promise<PredictedPage> {
    const venues = await this.venuesRepository.find({
      select: { id: true, key: true, name: true },
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const tabs = venues.map((v) => ({ key: v.key, name: v.name }));
    const wanted = (options.venue ?? '').trim().toLowerCase();
    const venue = wanted
      ? venues.find((v) => v.key.toLowerCase() === wanted)
      : venues[0];
    const empty: PredictedPage = {
      venues: tabs,
      venueKey: venue?.key ?? null,
      viewerHasPaidPlan: false,
      subjects: [],
      series: [],
      total: 0,
    };
    if (!venue) return empty;

    // One rights lookup for the venue (none for guests and admins): access
    // of the sets + viewerHasPaidPlan (the Upgrade banner)
    const rights = await this.predictedAccessService.getRights(
      viewer,
      venue.id,
      now,
    );
    empty.viewerHasPaidPlan = rights.loggedIn && rights.paid;

    const admin = isAdminViewer(viewer);
    const seriesQuery = this.seriesRepository
      .createQueryBuilder('series')
      .leftJoin('subjects', 'subject', 'subject.id = series.subjectId')
      .select('series.id', 'id')
      .addSelect('series.title', 'title')
      .addSelect('series.description', 'description')
      .addSelect('series.color', 'color')
      .addSelect('series.sortOrder', 'sortOrder')
      .addSelect('series.isActive', 'isActive')
      .addSelect('series.venueId', 'venueId')
      .addSelect('series.subjectId', 'subjectId')
      .addSelect('subject.name', 'subjectName')
      .addSelect('subject.orderIndex', 'subjectOrder')
      .where('series.venueId = :venueId', { venueId: venue.id });
    if (!admin) {
      seriesQuery.andWhere('series.isActive = :active', { active: true });
    }
    const seriesRows = await seriesQuery
      .orderBy('series.sortOrder', 'ASC')
      .addOrderBy('series.title', 'ASC')
      .addOrderBy('series.id', 'ASC')
      .getRawMany<SeriesRawRow>();
    if (seriesRows.length === 0) return empty;

    const setQuery = this.setsRepository
      .createQueryBuilder('ps')
      .innerJoin('exams', 'exam', 'exam.id = ps.examId')
      .select('ps.seriesId', 'seriesId')
      .addSelect('ps.examId', 'examId')
      .addSelect('ps.setNo', 'setNo')
      .addSelect('ps.access', 'access')
      .addSelect('ps.previewCount', 'previewCount')
      .addSelect(proIndexSql('ps'), 'proIndex')
      .addSelect(playableCountSql('ps.examId'), 'playableCount')
      .addSelect('exam.title', 'title')
      .addSelect('exam.questionCount', 'questionCount')
      .addSelect('exam.durationMinutes', 'durationMinutes')
      .addSelect('exam.status', 'status')
      .where('ps.seriesId IN (:...seriesIds)', {
        seriesIds: seriesRows.map((s) => s.id),
      });
    if (!admin) {
      setQuery.andWhere('exam.status = :published', {
        published: QuestionStatus.PUBLISHED,
      });
    }
    const setRows = await setQuery
      .orderBy('ps.setNo', 'ASC')
      .getRawMany<SetCardRawRow>();

    const progress = await findLatestProgress(
      this.attemptsRepository,
      viewer?.id,
      setRows.map((s) => s.examId),
    );

    const setsBySeries = new Map<string, PredictedSetCard[]>();
    for (const row of setRows) {
      const previewCount = normalizePreviewCount(row.previewCount);
      const card: PredictedSetCard = {
        setNo: Number(row.setNo),
        examId: row.examId,
        title: row.title,
        questionCount: Number(row.questionCount ?? 0),
        durationMinutes: toNumberOrNull(row.durationMinutes),
        access: toAccess(row.access),
        previewCount,
        viewerAccess: computePredictedAccess(
          {
            access: toAccess(row.access),
            previewCount,
            proIndex: toNumberOrNull(row.proIndex),
            // A Preview not below the real questions = locked (B2/Q3)
            playableCount: Number(row.playableCount ?? 0),
          },
          rights,
        ),
        myProgress: progress.get(row.examId) ?? null,
        status:
          row.status === String(QuestionStatus.PUBLISHED)
            ? 'published'
            : 'draft',
      };
      const list = setsBySeries.get(row.seriesId) ?? [];
      list.push(card);
      setsBySeries.set(row.seriesId, list);
    }

    const allSeries: PredictedSeriesCard[] = [];
    const subjectOrder = new Map<string, number>();
    for (const row of seriesRows) {
      const sets = setsBySeries.get(row.id) ?? [];
      if (sets.length === 0 && !admin) continue;
      allSeries.push({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        color: row.color ?? null,
        venueKey: venue.key,
        subject:
          row.subjectId && row.subjectName
            ? { id: row.subjectId, name: row.subjectName }
            : null,
        sets,
      });
      if (row.subjectId) {
        subjectOrder.set(
          row.subjectId,
          toNumberOrNull(row.subjectOrder) ?? Number.MAX_SAFE_INTEGER,
        );
      }
    }

    // Chips: subjects of the venue's series, sets counted (order: subject
    // orderIndex, then name)
    const chips = new Map<string, PredictedSubjectChip & { order: number }>();
    let total = 0;
    for (const series of allSeries) {
      total += series.sets.length;
      if (!series.subject) continue;
      const chip = chips.get(series.subject.id) ?? {
        ...series.subject,
        count: 0,
        order: subjectOrder.get(series.subject.id) ?? Number.MAX_SAFE_INTEGER,
      };
      chip.count += series.sets.length;
      chips.set(series.subject.id, chip);
    }
    const subjects = [...chips.values()]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'th'))
      .map(({ id, name, count }) => ({ id, name, count }));

    const subjectFilter = (options.subject ?? '').trim().toLowerCase();
    const series = allSeries.filter(
      (s) => !subjectFilter || s.subject?.id.toLowerCase() === subjectFilter,
    );

    return {
      venues: tabs,
      venueKey: venue.key,
      viewerHasPaidPlan: empty.viewerHasPaidPlan,
      subjects,
      series,
      total,
    };
  }

  // ── admin ─────────────────────────────────────────────────────────────

  /** GET /admin/predicted/series?venue=<key or id> */
  async adminList(venue?: string): Promise<AdminPredictedSeries[]> {
    const qb = this.adminSeriesQuery();
    const wanted = (venue ?? '').trim();
    if (wanted) {
      qb.andWhere('(venue.key = :venueKey OR series.venueId = :venueKey)', {
        venueKey: wanted,
      });
    }
    const rows = await qb
      .orderBy('venue.sortOrder', 'ASC')
      .addOrderBy('series.sortOrder', 'ASC')
      .addOrderBy('series.title', 'ASC')
      .addOrderBy('series.id', 'ASC')
      .getRawMany<AdminSeriesRawRow>();
    return rows.map(toAdminSeries);
  }

  /** GET /admin/predicted/series/:id — with its sets (setNo order). */
  async adminGet(id: string): Promise<AdminPredictedSeriesDetail> {
    const row = await this.adminSeriesQuery()
      .andWhere('series.id = :id', { id })
      .getRawOne<AdminSeriesRawRow>();
    if (!row) throw new NotFoundException('ไม่พบซีรีส์');

    const sets = await this.setsRepository
      .createQueryBuilder('ps')
      .leftJoin('exams', 'exam', 'exam.id = ps.examId')
      .select('ps.id', 'id')
      .addSelect('ps.examId', 'examId')
      .addSelect('ps.setNo', 'setNo')
      .addSelect('ps.access', 'access')
      .addSelect('ps.previewCount', 'previewCount')
      .addSelect('exam.id', 'examRowId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('exam.questionCount', 'examQuestionCount')
      .addSelect('exam.status', 'examStatus')
      .where('ps.seriesId = :id', { id })
      .orderBy('ps.setNo', 'ASC')
      .getRawMany<{
        id: string;
        examId: string;
        setNo: number | string;
        access: string;
        previewCount: number | string | null;
        examRowId: string | null;
        examTitle: string | null;
        examQuestionCount: number | string | null;
        examStatus: string | null;
      }>();

    return {
      ...toAdminSeries(row),
      sets: sets.map((s) => ({
        id: s.id,
        examId: s.examId,
        setNo: Number(s.setNo),
        access: toAccess(s.access),
        previewCount: normalizePreviewCount(s.previewCount),
        exam: s.examRowId
          ? {
              id: s.examRowId,
              title: s.examTitle ?? '',
              questionCount: Number(s.examQuestionCount ?? 0),
              status: s.examStatus ?? '',
            }
          : null,
      })),
    };
  }

  /** POST /admin/predicted/series (sets optional). */
  async adminCreate(
    input: CreatePredictedSeriesDto,
  ): Promise<AdminPredictedSeriesDetail> {
    await this.assertVenue(input.venueId);
    await this.assertSubject(input.subjectId);
    const sets = input.sets ?? [];
    assertSetList(sets);

    const id = await this.runWrite(() =>
      this.dataSource.transaction(async (manager) => {
        // Exams read in the same transaction as the insert (N8)
        await this.assertSets(sets, null, manager);
        const saved = await manager.save(
          manager.create(PredictedSeries, {
            venueId: input.venueId,
            subjectId: input.subjectId ?? null,
            title: input.title.trim(),
            description: cleanText(input.description),
            color: input.color ?? null,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          }),
        );
        await this.insertSets(manager, saved.id, sets);
        return saved.id;
      }),
    );
    return this.adminGet(id);
  }

  /**
   * PUT /admin/predicted/series/:id: fields not sent stay; `sets` sent =
   * replaces every set of the series in one transaction (the series row is
   * locked so two saves run one after the other).
   */
  async adminUpdate(
    id: string,
    input: UpdatePredictedSeriesDto,
  ): Promise<AdminPredictedSeriesDetail> {
    const existing = await this.seriesRepository.findOne({
      where: { id },
      loadEagerRelations: false,
    });
    if (!existing) throw new NotFoundException('ไม่พบซีรีส์');
    if (input.venueId !== undefined) await this.assertVenue(input.venueId);
    if (input.subjectId !== undefined)
      await this.assertSubject(input.subjectId);
    if (input.sets) assertSetList(input.sets);

    await this.runWrite(() =>
      this.dataSource.transaction(async (manager) => {
        const locked = await manager.findOne(PredictedSeries, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!locked) throw new NotFoundException('ไม่พบซีรีส์');
        // After the lock (N8): the exams and the other series are read as
        // they are now, not before another save of this series committed
        if (input.sets) await this.assertSets(input.sets, id, manager);
        const fields: Partial<PredictedSeries> = {};
        if (input.venueId !== undefined) fields.venueId = input.venueId;
        if (input.subjectId !== undefined) {
          fields.subjectId = input.subjectId ?? null;
        }
        if (input.title !== undefined) fields.title = input.title.trim();
        if (input.description !== undefined) {
          fields.description = cleanText(input.description);
        }
        if (input.color !== undefined) fields.color = input.color ?? null;
        if (input.sortOrder !== undefined) fields.sortOrder = input.sortOrder;
        if (input.isActive !== undefined) fields.isActive = input.isActive;
        if (Object.keys(fields).length > 0) {
          await manager.update(PredictedSeries, { id }, fields);
        }
        if (input.sets) {
          await manager.delete(PredictedSet, { seriesId: id });
          await this.insertSets(manager, id, input.sets);
        }
      }),
    );
    return this.adminGet(id);
  }

  /**
   * DELETE /admin/predicted/series/:id: the series and its sets; the exams
   * become ordinary exam sets again (listed everywhere like before).
   */
  async adminDelete(
    id: string,
  ): Promise<{ success: true; releasedExamIds: string[] }> {
    return this.dataSource.transaction(async (manager) => {
      const series = await manager.findOne(PredictedSeries, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!series) throw new NotFoundException('ไม่พบซีรีส์');
      const sets = await manager.find(PredictedSet, {
        select: { id: true, examId: true },
        where: { seriesId: id },
        loadEagerRelations: false,
      });
      await manager.delete(PredictedSet, { seriesId: id });
      await manager.delete(PredictedSeries, { id });
      return { success: true, releasedExamIds: sets.map((s) => s.examId) };
    });
  }

  /**
   * GET /admin/predicted/exams?search=: exams that can be added to a series
   * (not in any series, not Mock, not bankOnly), newest first, at most
   * MAX_EXAM_OPTIONS. Drafts too (shown with their status).
   */
  async adminExamOptions(search?: string): Promise<PredictedExamOption[]> {
    const qb = this.examsRepository
      .createQueryBuilder('exam')
      .select('exam.id', 'id')
      .addSelect('exam.title', 'title')
      .addSelect('exam.category', 'category')
      .addSelect('exam.subjectId', 'subjectId')
      .addSelect('exam.questionCount', 'questionCount')
      .addSelect('exam.durationMinutes', 'durationMinutes')
      .addSelect('exam.status', 'status')
      .where('exam.isMock = :isMock', { isMock: false })
      .andWhere('exam.bankOnly = :bankOnly', { bankOnly: false })
      .andWhere(notPredictedExamSql('exam.id'));
    const text = (search ?? '').trim();
    if (text) {
      qb.andWhere('exam.title LIKE :search', {
        search: `%${escapeLike(text)}%`,
      });
    }
    const rows = await qb
      .orderBy('exam.releaseDate', 'DESC')
      .addOrderBy('exam.createdAt', 'DESC')
      .addOrderBy('exam.id', 'ASC')
      .limit(MAX_EXAM_OPTIONS)
      .getRawMany<{
        id: string;
        title: string;
        category: string;
        subjectId: string | null;
        questionCount: number | string | null;
        durationMinutes: number | string | null;
        status: string;
      }>();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      subjectId: r.subjectId ?? null,
      questionCount: Number(r.questionCount ?? 0),
      durationMinutes: toNumberOrNull(r.durationMinutes),
      status: r.status,
    }));
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private adminSeriesQuery() {
    return this.seriesRepository
      .createQueryBuilder('series')
      .leftJoin(ProVenue, 'venue', 'venue.id = series.venueId')
      .leftJoin('subjects', 'subject', 'subject.id = series.subjectId')
      .select('series.id', 'id')
      .addSelect('series.venueId', 'venueId')
      .addSelect('venue.key', 'venueKey')
      .addSelect('venue.name', 'venueName')
      .addSelect('series.subjectId', 'subjectId')
      .addSelect('subject.name', 'subjectName')
      .addSelect('series.title', 'title')
      .addSelect('series.description', 'description')
      .addSelect('series.color', 'color')
      .addSelect('series.sortOrder', 'sortOrder')
      .addSelect('series.isActive', 'isActive')
      .addSelect('series.createdAt', 'createdAt')
      .addSelect('series.updatedAt', 'updatedAt')
      .addSelect(
        '(SELECT COUNT(*) FROM predicted_sets cnt WHERE cnt.seriesId = series.id)',
        'setCount',
      )
      .where('1 = 1');
  }

  private async assertVenue(venueId: string): Promise<void> {
    const exists = await this.venuesRepository.exists({
      where: { id: venueId },
    });
    if (!exists) throw new BadRequestException('ไม่พบสนามสอบที่เลือก');
  }

  private async assertSubject(subjectId: string | null | undefined) {
    if (!subjectId) return;
    const exists = await this.subjectsRepository.exists({
      where: { id: subjectId },
    });
    if (!exists) throw new BadRequestException('ไม่พบวิชาที่เลือก');
  }

  /**
   * Checks of the whole `sets` list before writing (inside the write's
   * transaction when `manager` is given, N8): the same exam or setNo twice
   * → 409; exam not found → 400; a Mock / bankOnly exam → 400 (turn it off
   * first; nothing is changed silently); previewCount ≥ the exam's
   * questions → 400; an exam already in another series → 409.
   */
  async assertSets(
    sets: PredictedSetInputDto[],
    seriesId: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    assertSetList(sets);
    if (sets.length === 0) return;
    const examsRepository = manager
      ? manager.getRepository(Exam)
      : this.examsRepository;
    const setsRepository = manager
      ? manager.getRepository(PredictedSet)
      : this.setsRepository;

    const ids = sets.map((s) => s.examId);
    const exams = await examsRepository.find({
      select: {
        id: true,
        title: true,
        isMock: true,
        bankOnly: true,
        questionCount: true,
      },
      where: { id: In(ids) },
      loadEagerRelations: false,
    });
    const examsById = new Map(exams.map((e) => [e.id.toLowerCase(), e]));

    for (const set of sets) {
      const exam = examsById.get(set.examId.toLowerCase());
      if (!exam) {
        throw new BadRequestException(`ไม่พบชุดข้อสอบของชุดที่ ${set.setNo}`);
      }
      if (isTrue(exam.isMock)) {
        throw new BadRequestException(
          `"${exam.title}" เป็นชุด Mock Exam อยู่ ให้ปิด Mock Exam ของชุดนี้ในหน้าแก้ไขชุดข้อสอบก่อน จึงจะเพิ่มเข้าซีรีส์ได้`,
        );
      }
      if (isTrue(exam.bankOnly)) {
        throw new BadRequestException(
          `"${exam.title}" ตั้งเป็น "ใช้เฉพาะ Question Bank" อยู่ ให้ปิดตัวเลือกนี้ในหน้าแก้ไขชุดข้อสอบก่อน จึงจะเพิ่มเข้าซีรีส์ได้`,
        );
      }
      const preview = normalizePreviewCount(set.previewCount);
      const total = Number(exam.questionCount ?? 0);
      if (preview !== null && preview >= total) {
        throw new BadRequestException(
          `Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด (ชุดที่ ${set.setNo} มี ${total} ข้อ)`,
        );
      }
    }

    const elsewhere = await setsRepository
      .createQueryBuilder('ps')
      .innerJoin('predicted_series', 'other', 'other.id = ps.seriesId')
      .innerJoin('exams', 'exam', 'exam.id = ps.examId')
      .select('ps.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('other.title', 'seriesTitle')
      .where('ps.examId IN (:...ids)', { ids })
      .andWhere(seriesId ? 'ps.seriesId <> :seriesId' : '1 = 1', { seriesId })
      .getRawOne<{ examId: string; examTitle: string; seriesTitle: string }>();
    if (elsewhere) {
      throw new ConflictException(
        `"${elsewhere.examTitle}" อยู่ในซีรีส์ "${elsewhere.seriesTitle}" แล้ว ชุดหนึ่งอยู่ได้ซีรีส์เดียว`,
      );
    }
  }

  private async insertSets(
    manager: EntityManager,
    seriesId: string,
    sets: PredictedSetInputDto[],
  ): Promise<void> {
    if (sets.length === 0) return;
    await manager.save(
      sets.map((set) =>
        manager.create(PredictedSet, {
          seriesId,
          examId: set.examId,
          setNo: set.setNo,
          access: set.access,
          previewCount: normalizePreviewCount(set.previewCount),
        }),
      ),
    );
  }

  /** A write that lost a race on UNIQUE(examId) / a deleted exam → 409/400. */
  private async runWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ConflictException(
          'ชุดข้อสอบนี้เพิ่งถูกเพิ่มเข้าซีรีส์อื่น หรือลำดับชุดซ้ำ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง',
        );
      }
      if (isMissingReference(err)) {
        throw new BadRequestException(
          'ไม่พบชุดข้อสอบ สนาม หรือวิชาที่เลือก (อาจเพิ่งถูกลบ)',
        );
      }
      throw err;
    }
  }
}

/**
 * Checks of `sets` that need no query: the same exam or setNo twice → 409
 * (run before a transaction is opened).
 */
function assertSetList(sets: PredictedSetInputDto[]): void {
  const examSeen = new Set<string>();
  const setNoSeen = new Set<number>();
  sets.forEach((set, index) => {
    const key = set.examId.toLowerCase();
    if (examSeen.has(key)) {
      throw new ConflictException(
        `ชุดข้อสอบซ้ำกันในซีรีส์ (รายการที่ ${index + 1})`,
      );
    }
    examSeen.add(key);
    if (setNoSeen.has(set.setNo)) {
      throw new ConflictException(`ลำดับชุดที่ ${set.setNo} ซ้ำกัน`);
    }
    setNoSeen.add(set.setNo);
  });
}

interface AdminSeriesRawRow {
  id: string;
  venueId: string;
  venueKey: string | null;
  venueName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  title: string;
  description: string | null;
  color: string | null;
  sortOrder: number | string;
  isActive: number | string | boolean;
  createdAt: Date;
  updatedAt: Date;
  setCount: number | string;
}

function toAdminSeries(row: AdminSeriesRawRow): AdminPredictedSeries {
  return {
    id: row.id,
    venueId: row.venueId,
    venue:
      row.venueKey !== null && row.venueKey !== undefined
        ? { id: row.venueId, key: row.venueKey, name: row.venueName ?? '' }
        : null,
    subjectId: row.subjectId ?? null,
    subject:
      row.subjectId && row.subjectName
        ? { id: row.subjectId, name: row.subjectName }
        : null,
    title: row.title,
    description: row.description ?? null,
    color: row.color ?? null,
    sortOrder: Number(row.sortOrder ?? 0),
    isActive: isTrue(row.isActive),
    setCount: Number(row.setCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Trimmed text, blank → null. */
function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/** Escape LIKE wildcards of a search text (\ is MySQL's escape). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
