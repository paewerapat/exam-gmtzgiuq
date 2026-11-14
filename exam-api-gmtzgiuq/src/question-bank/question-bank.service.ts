import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProVenue } from '../pro/pro-venue.entity';
import { Subject } from '../curriculum/subject.entity';
import { Topic } from '../curriculum/topic.entity';
import { Question } from '../questions/question.entity';
import { QuestionsService } from '../questions/questions.service';
import type { AccessViewer } from '../exam-access/exam-access';
import { ChallengeAccessService } from './challenge-access.service';
import {
  BUCKET_SQL,
  POOL_JOINS,
  ANSWERED_SQL,
  PoolScope,
  QbMode,
  buildPoolWhere,
} from './question-bank-pool';
import {
  DailyCount,
  STATS_WINDOW_DAYS,
  THAI_OFFSET_MINUTES,
  WeeklyCount,
  buildWeekly,
  compareTopics,
  computeStreak,
  groupTopics,
  normalizeGrade,
  normalizeTerm,
  orderByTopic,
  percentOrNull,
  thaiDay,
  toCount,
} from './question-bank-stats';
import {
  qbLoginRequired,
  qbSubjectNotFound,
  qbVenueNotFound,
} from './question-bank-errors';
import {
  CreateQbSessionDto,
  DEFAULT_SESSION_LIMIT,
} from './dto/question-bank.dto';

export interface QbVenue {
  id: string;
  key: string;
  name: string;
}

export interface QbStats {
  // Distinct questions of the scope the user has answered (any mode)
  answered: number;
  // % of first answers that were correct (isFirstAttempt); null = none yet
  accuracy: number | null;
  streakDays: number;
  weekly: WeeklyCount[];
}

export interface QbVenuePage {
  venue: QbVenue;
  mode: QbMode;
  subjects: {
    id: string;
    label: string;
    color: string;
    iconEmoji: string | null;
    total: number;
    answered: number;
    percent: number;
  }[];
  stats: QbStats | null;
  challengeUnlocked: boolean;
}

export interface QbBucketCounts {
  easy: number;
  medium: number;
  hardChallenge: number;
}

export interface QbTopicItem {
  id: string;
  name: string;
  total: number;
  answered: number;
  accuracy: number | null;
  counts: QbBucketCounts | { hardChallenge: number };
}

export interface QbSubjectPage {
  subject: { id: string; label: string; color: string };
  venue: QbVenue;
  mode: QbMode;
  totals: { all: number } & QbBucketCounts;
  groups: {
    gradeLabel: string | null;
    term: number | null;
    label: string;
    topics: QbTopicItem[];
  }[];
  challengeUnlocked: boolean;
}

export interface QbLockedQuestion {
  id: string;
  topicId: string;
  locked: true;
  isChallenge: true;
}

export interface QbSession {
  venueKey: string;
  venueName: string;
  subjectLabel: string;
  // Questions matching the filters, before `limit`
  total: number;
  questions: (Question | QbLockedQuestion)[];
  challengeUnlocked: boolean;
}

type Viewer = AccessViewer | null | undefined;

function venueOut(venue: ProVenue): QbVenue {
  return { id: venue.id, key: venue.key, name: venue.name };
}

function subjectLabel(subject: Subject): string {
  return (subject.bankLabel && subject.bankLabel.trim()) || subject.name;
}

function isTrue(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

/**
 * Question Bank and Challenge Questions (task 20): the pool of questions of
 * a venue / subject (rules in question-bank-pool.ts), counts and the user's
 * statistics from question_answers (task 16) with aggregate SQL only, and
 * practice sessions. Challenge questions are sent with their content only
 * to users with the venue's `challenge` right (ChallengeAccessService);
 * others get a placeholder without question/choices/explanation.
 */
@Injectable()
export class QuestionBankService {
  constructor(
    @InjectRepository(ProVenue)
    private venuesRepository: Repository<ProVenue>,
    @InjectRepository(Subject)
    private subjectsRepository: Repository<Subject>,
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>,
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    private questionsService: QuestionsService,
    private challengeAccessService: ChallengeAccessService,
  ) {}

  /**
   * GET /question-bank/venues: active venues that have at least one active
   * subject, by sortOrder. `mode` does not change the list.
   */
  async listVenues(): Promise<QbVenue[]> {
    const rows = await this.subjectsRepository
      .createQueryBuilder('s')
      .select('DISTINCT s.venueId', 'venueId')
      .where('s.isActive = :active', { active: true })
      .andWhere('s.venueId IS NOT NULL')
      .getRawMany<{ venueId: string }>();
    const ids = rows.map((r) => r.venueId).filter(Boolean);
    if (ids.length === 0) return [];

    const venues = await this.venuesRepository.find({
      select: { id: true, key: true, name: true, sortOrder: true },
      where: { id: In(ids), isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return venues.map(venueOut);
  }

  /** GET /question-bank/venues/:key (page 1). */
  async getVenuePage(
    key: string,
    mode: QbMode,
    viewer: Viewer,
    now: Date = new Date(),
  ): Promise<QbVenuePage> {
    const venue = await this.findActiveVenue({
      key: String(key).toLowerCase(),
    });
    if (!venue) throw qbVenueNotFound();

    const subjects = await this.subjectsRepository.find({
      where: { venueId: venue.id, isActive: true },
      order: { orderIndex: 'ASC', name: 'ASC' },
    });
    const userId = viewer?.id ?? null;
    const pool = buildPoolWhere({ venueId: venue.id, mode });

    const rows = await this.query<{
      subjectId: string;
      total: unknown;
      answered?: unknown;
    }>(
      `SELECT s.id AS subjectId, COUNT(*) AS total` +
        (userId ? `, SUM(${ANSWERED_SQL}) AS answered` : '') +
        ` FROM questions q ${POOL_JOINS} WHERE ${pool.where}` +
        ` GROUP BY s.id`,
      [...(userId ? [userId] : []), ...pool.params],
    );
    const bySubject = new Map(rows.map((r) => [String(r.subjectId), r]));

    const subjectItems = subjects
      .map((subject) => {
        const row = bySubject.get(subject.id);
        const total = toCount(row?.total);
        const answered = toCount(row?.answered);
        return {
          id: subject.id,
          label: subjectLabel(subject),
          color: subject.color,
          iconEmoji: subject.iconEmoji ?? null,
          total,
          answered,
          percent: percentOrNull(answered, total) ?? 0,
        };
      })
      .filter((s) => s.total > 0);

    const [stats, challengeUnlocked] = await Promise.all([
      userId
        ? this.getStats({ venueId: venue.id, mode }, userId, now)
        : Promise.resolve(null),
      this.challengeAccessService.isUnlocked(viewer, venue.id),
    ]);

    return {
      venue: venueOut(venue),
      mode,
      subjects: subjectItems,
      stats,
      challengeUnlocked,
    };
  }

  /** GET /question-bank/subjects/:id (page 2). */
  async getSubjectPage(
    id: string,
    mode: QbMode,
    viewer: Viewer,
  ): Promise<QbSubjectPage> {
    const { subject, venue } = await this.findBankSubject(id);
    const topics = await this.findSubjectTopics(subject.id);
    const userId = viewer?.id ?? null;
    const pool = buildPoolWhere({ subjectId: subject.id, mode });

    const countRows = await this.query<{
      topicId: string;
      bucket: string;
      total: unknown;
      answered?: unknown;
    }>(
      `SELECT t.id AS topicId, ${BUCKET_SQL} AS bucket, COUNT(*) AS total` +
        (userId ? `, SUM(${ANSWERED_SQL}) AS answered` : '') +
        ` FROM questions q ${POOL_JOINS} WHERE ${pool.where}` +
        ` GROUP BY t.id, bucket`,
      [...(userId ? [userId] : []), ...pool.params],
    );

    const firstRows = userId
      ? await this.query<{
          topicId: string;
          firstCount: unknown;
          firstCorrect: unknown;
        }>(
          `SELECT t.id AS topicId,` +
            ` SUM(qa.isFirstAttempt = 1) AS firstCount,` +
            ` SUM(qa.isFirstAttempt = 1 AND qa.isCorrect = 1) AS firstCorrect` +
            ` FROM question_answers qa` +
            ` INNER JOIN questions q ON q.id = qa.questionId ${POOL_JOINS}` +
            ` WHERE qa.userId = ? AND ${pool.where}` +
            ` GROUP BY t.id`,
          [userId, ...pool.params],
        )
      : [];

    const perTopic = new Map<
      string,
      { total: number; answered: number } & QbBucketCounts
    >();
    const totals = { all: 0, easy: 0, medium: 0, hardChallenge: 0 };
    for (const row of countRows) {
      const key = String(row.topicId).toLowerCase();
      const entry = perTopic.get(key) ?? {
        total: 0,
        answered: 0,
        easy: 0,
        medium: 0,
        hardChallenge: 0,
      };
      const total = toCount(row.total);
      const bucket =
        row.bucket === 'easy'
          ? 'easy'
          : row.bucket === 'hard_challenge'
            ? 'hardChallenge'
            : 'medium';
      entry.total += total;
      entry.answered += toCount(row.answered);
      entry[bucket] += total;
      totals.all += total;
      totals[bucket] += total;
      perTopic.set(key, entry);
    }
    const firstByTopic = new Map(
      firstRows.map((r) => [String(r.topicId).toLowerCase(), r]),
    );

    const items = topics
      .map((topic) => {
        const entry = perTopic.get(topic.id.toLowerCase());
        const first = firstByTopic.get(topic.id.toLowerCase());
        const item: QbTopicItem & {
          orderIndex: number;
          gradeLabel: string | null;
          term: number | null;
        } = {
          id: topic.id,
          name: topic.name,
          total: entry?.total ?? 0,
          answered: entry?.answered ?? 0,
          accuracy: percentOrNull(
            toCount(first?.firstCorrect),
            toCount(first?.firstCount),
          ),
          counts:
            mode === 'challenge'
              ? { hardChallenge: entry?.hardChallenge ?? 0 }
              : {
                  easy: entry?.easy ?? 0,
                  medium: entry?.medium ?? 0,
                  hardChallenge: entry?.hardChallenge ?? 0,
                },
          orderIndex: topic.orderIndex,
          gradeLabel: normalizeGrade(topic.gradeLabel),
          term: normalizeTerm(topic.term),
        };
        return item;
      })
      // Topics without a question in this mode are not listed
      .filter((item) => item.total > 0);

    const groups = groupTopics(items).map((group) => ({
      gradeLabel: group.gradeLabel,
      term: group.term,
      label: group.label,
      topics: group.topics.map(
        ({ id: topicId, name, total, answered, accuracy, counts }) => ({
          id: topicId,
          name,
          total,
          answered,
          accuracy,
          counts,
        }),
      ),
    }));

    return {
      subject: {
        id: subject.id,
        label: subjectLabel(subject),
        color: subject.color,
      },
      venue: venueOut(venue),
      mode,
      totals,
      groups,
      challengeUnlocked: await this.challengeAccessService.isUnlocked(
        viewer,
        venue.id,
      ),
    };
  }

  /** POST /question-bank/sessions. */
  async createSession(
    input: CreateQbSessionDto,
    viewer: Viewer,
  ): Promise<QbSession> {
    const mode = input.mode;
    const progress = input.progress ?? 'all';
    const userId = viewer?.id ?? null;
    if (progress !== 'all' && !userId) throw qbLoginRequired();

    const { subject, venue } = await this.findBankSubject(input.subjectId);
    const challengeUnlocked = await this.challengeAccessService.isUnlocked(
      viewer,
      venue.id,
    );
    const empty: QbSession = {
      venueKey: venue.key,
      venueName: venue.name,
      subjectLabel: subjectLabel(subject),
      total: 0,
      questions: [],
      challengeUnlocked,
    };

    const topics = await this.findSubjectTopics(subject.id);
    const topicOrder = topics.map((t) => t.id);
    let topicIds: string[] | undefined;
    if (input.topicIds && input.topicIds.length > 0) {
      const wanted = new Set(input.topicIds.map((id) => id.toLowerCase()));
      topicIds = topicOrder.filter((id) => wanted.has(id.toLowerCase()));
      if (topicIds.length === 0) return empty;
    }

    const scope: PoolScope = {
      mode,
      subjectId: subject.id,
      topicIds,
      difficulties: mode === 'bank' ? input.difficulties : undefined,
      progress,
      userId,
    };
    const pool = buildPoolWhere(scope);
    const [countRow] = await this.query<{ total: unknown }>(
      `SELECT COUNT(*) AS total FROM questions q ${POOL_JOINS} WHERE ${pool.where}`,
      pool.params,
    );
    const total = toCount(countRow?.total);
    if (total === 0) return empty;

    const limit = input.limit ?? DEFAULT_SESSION_LIMIT;
    const picked = await this.query<{
      id: string;
      topicId: string;
      isChallenge: unknown;
    }>(
      `SELECT q.id AS id, q.topicId AS topicId, q.isChallenge AS isChallenge` +
        ` FROM questions q ${POOL_JOINS} WHERE ${pool.where}` +
        ` ORDER BY RAND() LIMIT ?`,
      [...pool.params, limit],
    );

    // Content only for questions the viewer may see; never loaded for a
    // locked Challenge question
    const visibleIds = picked
      .filter((row) => challengeUnlocked || !isTrue(row.isChallenge))
      .map((row) => row.id);
    const full =
      visibleIds.length > 0
        ? await this.questionsService.attachPassages(
            await this.questionsRepository
              .createQueryBuilder('q')
              .where('q.id IN (:...ids)', { ids: visibleIds })
              .getMany(),
          )
        : [];
    const fullById = new Map(full.map((q) => [q.id.toLowerCase(), q]));

    const questions: (Question | QbLockedQuestion)[] = [];
    for (const row of orderByTopic(picked, topicOrder)) {
      const question = fullById.get(String(row.id).toLowerCase());
      if (question) {
        questions.push(question);
      } else if (isTrue(row.isChallenge) && !challengeUnlocked) {
        questions.push({
          id: row.id,
          topicId: row.topicId,
          locked: true,
          isChallenge: true,
        });
      }
    }

    return { ...empty, total, questions };
  }

  /**
   * Statistics of the user in a scope (venue + mode): one aggregate query
   * for answered/accuracy and one per Thai day (streak + weekly).
   */
  async getStats(
    scope: Pick<PoolScope, 'venueId' | 'subjectId' | 'mode'>,
    userId: string,
    now: Date = new Date(),
  ): Promise<QbStats> {
    const pool = buildPoolWhere(scope);
    const from =
      ` FROM question_answers qa` +
      ` INNER JOIN questions q ON q.id = qa.questionId ${POOL_JOINS}` +
      ` WHERE qa.userId = ? AND ${pool.where}`;
    const params = [userId, ...pool.params];

    const [totalsRow] = await this.query<{
      answered: unknown;
      firstCount: unknown;
      firstCorrect: unknown;
    }>(
      `SELECT COUNT(DISTINCT qa.questionId) AS answered,` +
        ` SUM(qa.isFirstAttempt = 1) AS firstCount,` +
        ` SUM(qa.isFirstAttempt = 1 AND qa.isCorrect = 1) AS firstCorrect` +
        from,
      params,
    );

    // answeredAt is written by the DB clock (CURRENT_TIMESTAMP of the
    // session time zone): shift it by (Thai offset − DB offset) to get the
    // Thai day, whatever time zone the DB runs in. Only the last
    // STATS_WINDOW_DAYS days (streak cap, 12 weeks) are read, not the
    // user's whole history.
    const dailyRows = await this.query<{
      answerDay: string;
      correct: unknown;
      wrong: unknown;
    }>(
      `SELECT DATE_FORMAT(DATE_ADD(qa.answeredAt, INTERVAL` +
        ` (? - TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW())) MINUTE),` +
        ` '%Y-%m-%d') AS answerDay,` +
        ` SUM(qa.isCorrect = 1) AS correct,` +
        ` SUM(qa.isCorrect = 0) AS wrong` +
        from +
        ` AND qa.answeredAt >= DATE_SUB(NOW(), INTERVAL ? DAY)` +
        ` GROUP BY answerDay`,
      [THAI_OFFSET_MINUTES, ...params, STATS_WINDOW_DAYS],
    );
    const daily: DailyCount[] = dailyRows.map((row) => ({
      day: String(row.answerDay),
      correct: toCount(row.correct),
      wrong: toCount(row.wrong),
    }));
    const today = thaiDay(now);

    return {
      answered: toCount(totalsRow?.answered),
      accuracy: percentOrNull(
        toCount(totalsRow?.firstCorrect),
        toCount(totalsRow?.firstCount),
      ),
      streakDays: computeStreak(
        daily.map((d) => d.day),
        today,
      ),
      weekly: buildWeekly(daily, today),
    };
  }

  private query<T>(sql: string, params: unknown[]): Promise<T[]> {
    return this.questionsRepository.manager.query(sql, params);
  }

  private findActiveVenue(where: { key?: string; id?: string }) {
    return this.venuesRepository.findOne({
      where: { ...where, isActive: true },
    });
  }

  /** Active subject with an active venue, else 404 QB_SUBJECT_NOT_FOUND. */
  private async findBankSubject(
    id: string,
  ): Promise<{ subject: Subject; venue: ProVenue }> {
    const subject = await this.subjectsRepository.findOne({
      where: { id, isActive: true },
    });
    if (!subject?.venueId) throw qbSubjectNotFound();
    const venue = await this.findActiveVenue({ id: subject.venueId });
    if (!venue) throw qbSubjectNotFound();
    return { subject, venue };
  }

  /** Active topics of active chapters of the subject, in bank order. */
  private async findSubjectTopics(subjectId: string): Promise<Topic[]> {
    const topics = await this.topicsRepository
      .createQueryBuilder('t')
      .innerJoin('t.chapter', 'c')
      .where('c.subjectId = :subjectId', { subjectId })
      .andWhere('t.isActive = :active', { active: true })
      .andWhere('c.isActive = :active', { active: true })
      .getMany();
    return topics.sort(compareTopics);
  }
}
