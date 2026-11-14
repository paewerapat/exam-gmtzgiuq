import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { ProVenue } from '../pro/pro-venue.entity';
import { Subject } from '../curriculum/subject.entity';
import { Topic } from '../curriculum/topic.entity';
import { Question } from '../questions/question.entity';
import { QuestionsService } from '../questions/questions.service';
import { ChallengeAccessService } from './challenge-access.service';
import { CreateQbSessionDto } from './dto/question-bank.dto';

const NETSAT = { id: 'v-net', key: 'netsat', name: 'NETSAT', isActive: true };

type QueryHandler = (sql: string, params: unknown[]) => unknown[];

describe('QuestionBankService (task 20)', () => {
  let service: QuestionBankService;
  let venues: (typeof NETSAT & { sortOrder?: number })[];
  let subjects: Partial<Subject>[];
  let topics: Partial<Topic>[];
  let fullQuestions: Partial<Question>[];
  let query: jest.Mock;
  let onQuery: QueryHandler;
  let isUnlocked: jest.Mock;
  let unlocked: boolean;
  let questionQb: Record<string, jest.Mock>;
  let venueIdsRaw: { venueId: string }[];

  const user = { id: 'u1', role: 'user' };

  beforeEach(async () => {
    venues = [NETSAT];
    subjects = [
      {
        id: 's-bio',
        name: 'NETSAT BIO',
        bankLabel: 'ชีวะ',
        color: '#10b981',
        iconEmoji: null as unknown as string,
        venueId: 'v-net',
        isActive: true,
      },
      {
        id: 's-chem',
        name: 'NETSAT CHEM',
        bankLabel: null,
        color: '#f59e0b',
        venueId: 'v-net',
        isActive: true,
      },
    ];
    topics = [
      {
        id: 't-other',
        name: 'อื่น',
        gradeLabel: null,
        term: null,
        orderIndex: 0,
      },
      {
        id: 't-m4t2',
        name: 'พันธุศาสตร์',
        gradeLabel: 'ม.4',
        term: 2,
        orderIndex: 0,
      },
      {
        id: 't-m4t1',
        name: 'เซลล์',
        gradeLabel: 'ม.4',
        term: 1,
        orderIndex: 0,
      },
      {
        id: 't-empty',
        name: 'ว่าง',
        gradeLabel: 'ม.5',
        term: 1,
        orderIndex: 0,
      },
    ];
    fullQuestions = [];
    unlocked = false;
    venueIdsRaw = [{ venueId: 'v-net' }];
    onQuery = () => [];
    query = jest.fn((sql: string, params: unknown[]) =>
      Promise.resolve(onQuery(sql, params)),
    );
    isUnlocked = jest.fn(() => Promise.resolve(unlocked));

    const chain = (result: () => unknown, extra: Record<string, jest.Mock>) => {
      const qb: Record<string, jest.Mock> = { ...extra };
      for (const m of [
        'select',
        'innerJoin',
        'where',
        'andWhere',
        'orderBy',
        'addSelect',
      ]) {
        qb[m] = jest.fn(() => qb);
      }
      qb.getMany = jest.fn(() => Promise.resolve(result()));
      qb.getRawMany = jest.fn(() => Promise.resolve(result()));
      return qb;
    };
    questionQb = chain(() => fullQuestions, {});

    const module = await Test.createTestingModule({
      providers: [
        QuestionBankService,
        {
          provide: getRepositoryToken(ProVenue),
          useValue: {
            find: jest.fn(() => Promise.resolve(venues)),
            findOne: jest.fn(({ where }: { where: Partial<ProVenue> }) =>
              Promise.resolve(
                venues.find(
                  (v) =>
                    (where.key === undefined || v.key === where.key) &&
                    (where.id === undefined || v.id === where.id) &&
                    v.isActive,
                ) ?? null,
              ),
            ),
          },
        },
        {
          provide: getRepositoryToken(Subject),
          useValue: {
            createQueryBuilder: jest.fn(() => chain(() => venueIdsRaw, {})),
            find: jest.fn(() => Promise.resolve(subjects)),
            findOne: jest.fn(({ where }: { where: { id: string } }) =>
              Promise.resolve(subjects.find((s) => s.id === where.id) ?? null),
            ),
          },
        },
        {
          provide: getRepositoryToken(Topic),
          useValue: {
            createQueryBuilder: jest.fn(() => chain(() => [...topics], {})),
          },
        },
        {
          provide: getRepositoryToken(Question),
          useValue: {
            manager: { query },
            createQueryBuilder: jest.fn(() => questionQb),
          },
        },
        {
          provide: QuestionsService,
          useValue: {
            attachPassages: jest.fn((q: Question[]) => Promise.resolve(q)),
          },
        },
        { provide: ChallengeAccessService, useValue: { isUnlocked } },
      ],
    }).compile();
    service = module.get(QuestionBankService);
  });

  const errorCode = async (promise: Promise<unknown>) => {
    const error = (await promise.catch((e: unknown) => e)) as HttpException;
    expect(error).toBeInstanceOf(HttpException);
    return [
      error.getStatus(),
      (error.getResponse() as { errorCode: string }).errorCode,
    ];
  };

  describe('listVenues', () => {
    it('active venues with subjects, by sortOrder', async () => {
      await expect(service.listVenues()).resolves.toEqual([
        { id: 'v-net', key: 'netsat', name: 'NETSAT' },
      ]);
    });

    it('no subject bound → [] without reading venues', async () => {
      venueIdsRaw = [];
      await expect(service.listVenues()).resolves.toEqual([]);
    });
  });

  describe('getVenuePage (page 1)', () => {
    beforeEach(() => {
      onQuery = (sql) => {
        if (sql.includes('GROUP BY s.id')) {
          // a guest's query has no answered column
          return [
            sql.includes('question_answers')
              ? { subjectId: 's-bio', total: '10', answered: '4' }
              : { subjectId: 's-bio', total: '10' },
          ];
        }
        if (sql.includes('COUNT(DISTINCT qa.questionId)')) {
          return [{ answered: '4', firstCount: '4', firstCorrect: '3' }];
        }
        if (sql.includes('GROUP BY answerDay')) {
          return [
            { answerDay: '2026-11-14', correct: '2', wrong: '1' },
            { answerDay: '2026-11-13', correct: '1', wrong: '0' },
          ];
        }
        return [];
      };
    });

    it('unknown / inactive venue → 404 QB_VENUE_NOT_FOUND', async () => {
      await expect(
        errorCode(service.getVenuePage('nope', 'bank', user)),
      ).resolves.toEqual([404, 'QB_VENUE_NOT_FOUND']);
    });

    it('AC2 cards: label = bankLabel (else name), subjects without questions in the mode are hidden', async () => {
      const page = await service.getVenuePage('NETSAT', 'bank', null);
      expect(page.venue).toEqual({
        id: 'v-net',
        key: 'netsat',
        name: 'NETSAT',
      });
      expect(page.subjects).toEqual([
        {
          id: 's-bio',
          label: 'ชีวะ',
          color: '#10b981',
          iconEmoji: null,
          total: 10,
          answered: 0,
          percent: 0,
        },
      ]);
    });

    it('AC9 guest: no stats, no user in the SQL, Challenge locked', async () => {
      const page = await service.getVenuePage('netsat', 'bank', null);
      expect(page.stats).toBeNull();
      expect(page.challengeUnlocked).toBe(false);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('question_answers');
      expect(params).toEqual(['v-net']);
    });

    it('AC3 user: answered/percent and stats (first-attempt accuracy, Thai streak, 12 weeks)', async () => {
      const page = await service.getVenuePage(
        'netsat',
        'bank',
        user,
        new Date('2026-11-14T05:00:00Z'),
      );
      expect(page.subjects[0]).toMatchObject({ answered: 4, percent: 40 });
      expect(page.stats).toMatchObject({
        answered: 4,
        accuracy: 75,
        streakDays: 2,
      });
      expect(page.stats!.weekly).toHaveLength(12);
      expect(page.stats!.weekly[11]).toEqual({
        weekStart: '2026-11-09',
        correct: 3,
        wrong: 1,
      });

      // the answered sub-query is bound to the user, before the pool params
      expect((query.mock.calls as unknown[][])[0][1]).toEqual(['u1', 'v-net']);
      // first-attempt rows only for accuracy
      const totalsCall = query.mock.calls.find(([sql]: [string]) =>
        sql.includes('COUNT(DISTINCT qa.questionId)'),
      ) as [string, unknown[]];
      expect(totalsCall[0]).toContain(
        'SUM(qa.isFirstAttempt = 1 AND qa.isCorrect = 1)',
      );
      expect(totalsCall[1]).toEqual(['u1', 'v-net']);
      // Thai day: shift by 420 min minus the DB session offset
      const dailyCall = query.mock.calls.find(([sql]: [string]) =>
        sql.includes('GROUP BY answerDay'),
      ) as [string, unknown[]];
      expect(dailyCall[0]).toContain(
        'TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW())',
      );
      expect(dailyCall[1]).toEqual([420, 'u1', 'v-net', 366]);
      // only the recent window is grouped (streak cap + 12 weeks), not the whole history
      expect(dailyCall[0]).toContain(
        'AND qa.answeredAt >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY answerDay',
      );
    });

    it('challenge mode scopes everything to Challenge questions', async () => {
      unlocked = true;
      const page = await service.getVenuePage('netsat', 'challenge', user);
      expect(page.mode).toBe('challenge');
      expect(page.challengeUnlocked).toBe(true);
      for (const [sql] of query.mock.calls as [string][]) {
        expect(sql).toContain('q.isChallenge = 1');
      }
    });

    it('no answers → accuracy null, streak 0', async () => {
      onQuery = (sql) =>
        sql.includes('GROUP BY s.id')
          ? [{ subjectId: 's-bio', total: '3', answered: '0' }]
          : sql.includes('COUNT(DISTINCT')
            ? [{ answered: 0, firstCount: null, firstCorrect: null }]
            : [];
      const page = await service.getVenuePage('netsat', 'bank', user);
      expect(page.stats).toMatchObject({
        answered: 0,
        accuracy: null,
        streakDays: 0,
      });
    });
  });

  describe('getSubjectPage (page 2)', () => {
    beforeEach(() => {
      onQuery = (sql) => {
        if (sql.includes('GROUP BY t.id, bucket')) {
          return [
            { topicId: 't-m4t1', bucket: 'easy', total: '2', answered: '1' },
            {
              topicId: 't-m4t1',
              bucket: 'hard_challenge',
              total: '3',
              answered: '1',
            },
            { topicId: 't-m4t2', bucket: 'medium', total: '4', answered: '0' },
            { topicId: 't-other', bucket: 'medium', total: '1', answered: '0' },
          ];
        }
        if (sql.includes('GROUP BY t.id')) {
          return [{ topicId: 't-m4t1', firstCount: '2', firstCorrect: '1' }];
        }
        return [];
      };
    });

    it('subject without venue / inactive / unknown → 404 QB_SUBJECT_NOT_FOUND', async () => {
      subjects[1].venueId = null;
      await expect(
        errorCode(service.getSubjectPage('s-chem', 'bank', user)),
      ).resolves.toEqual([404, 'QB_SUBJECT_NOT_FOUND']);
      await expect(
        errorCode(service.getSubjectPage('missing', 'bank', user)),
      ).resolves.toEqual([404, 'QB_SUBJECT_NOT_FOUND']);
      venues = [{ ...NETSAT, isActive: false }];
      await expect(
        errorCode(service.getSubjectPage('s-bio', 'bank', user)),
      ).resolves.toEqual([404, 'QB_SUBJECT_NOT_FOUND']);
    });

    it('AC2/AC4 groups by grade → term (null last), counts per bucket, totals, accuracy', async () => {
      const page = await service.getSubjectPage('s-bio', 'bank', user);
      expect(page.subject).toEqual({
        id: 's-bio',
        label: 'ชีวะ',
        color: '#10b981',
      });
      expect(page.totals).toEqual({
        all: 10,
        easy: 2,
        medium: 5,
        hardChallenge: 3,
      });
      expect(page.groups.map((g) => g.label)).toEqual([
        'ม.4 เทอม 1',
        'ม.4 เทอม 2',
        'อื่น ๆ',
      ]);
      expect(page.groups[0]).toMatchObject({ gradeLabel: 'ม.4', term: 1 });
      expect(page.groups[2]).toMatchObject({ gradeLabel: null, term: null });
      expect(page.groups[0].topics).toEqual([
        {
          id: 't-m4t1',
          name: 'เซลล์',
          total: 5,
          answered: 2,
          accuracy: 50,
          counts: { easy: 2, medium: 0, hardChallenge: 3 },
        },
      ]);
      // a topic without questions (t-empty, ม.5) is not listed
      expect(JSON.stringify(page.groups)).not.toContain('t-empty');
      expect(page.groups[1].topics[0].accuracy).toBeNull();
    });

    it('challenge mode: counts only hardChallenge', async () => {
      onQuery = (sql) =>
        sql.includes('GROUP BY t.id, bucket')
          ? [{ topicId: 't-m4t1', bucket: 'hard_challenge', total: '3' }]
          : [];
      const page = await service.getSubjectPage('s-bio', 'challenge', null);
      expect(page.groups[0].topics[0].counts).toEqual({ hardChallenge: 3 });
      expect(page.totals).toEqual({
        all: 3,
        easy: 0,
        medium: 0,
        hardChallenge: 3,
      });
    });
  });

  describe('createSession', () => {
    const session = (extra: Partial<CreateQbSessionDto> = {}) =>
      ({ subjectId: 's-bio', mode: 'bank', ...extra }) as CreateQbSessionDto;
    let picked: { id: string; topicId: string; isChallenge: number }[];

    beforeEach(() => {
      picked = [
        { id: 'q-ch', topicId: 't-m4t1', isChallenge: 1 },
        { id: 'q-other', topicId: 't-other', isChallenge: 0 },
        { id: 'q-a', topicId: 't-m4t1', isChallenge: 0 },
      ];
      fullQuestions = [
        { id: 'q-a', question: 'โจทย์ A', explanation: 'เฉลย A' },
        { id: 'q-other', question: 'โจทย์ O', explanation: 'เฉลย O' },
        {
          id: 'q-ch',
          question: 'โจทย์ลับ',
          explanation: 'เฉลยลับ',
          isChallenge: true,
        },
      ];
      onQuery = (sql) => {
        if (sql.startsWith('SELECT COUNT(*) AS total')) return [{ total: '7' }];
        if (sql.includes('ORDER BY RAND()')) return picked;
        return [];
      };
      questionQb.getMany.mockImplementation(() => {
        const ids = (
          questionQb.where.mock.calls.at(-1) as [string, { ids: string[] }]
        )[1].ids;
        return Promise.resolve(
          fullQuestions.filter((q) => ids.includes(q.id!)),
        );
      });
    });

    it('AC9 guest asking for done/undone/wrong → 401 QB_LOGIN_REQUIRED', async () => {
      for (const progress of ['done', 'undone', 'wrong'] as const) {
        await expect(
          errorCode(service.createSession(session({ progress }), null)),
        ).resolves.toEqual([401, 'QB_LOGIN_REQUIRED']);
      }
      expect(query).not.toHaveBeenCalled();
    });

    it('AC6 without the right: Challenge = placeholder only, its content is never loaded', async () => {
      const result = await service.createSession(session(), user);
      expect(result).toMatchObject({
        venueKey: 'netsat',
        venueName: 'NETSAT',
        subjectLabel: 'ชีวะ',
        total: 7,
        challengeUnlocked: false,
      });
      // by topic order (ม.4 เทอม 1 first, อื่น ๆ last), random order kept inside
      expect(result.questions.map((q) => q.id)).toEqual([
        'q-ch',
        'q-a',
        'q-other',
      ]);
      expect(result.questions[0]).toEqual({
        id: 'q-ch',
        topicId: 't-m4t1',
        locked: true,
        isChallenge: true,
      });
      const raw = JSON.stringify(result);
      expect(raw).not.toContain('โจทย์ลับ');
      expect(raw).not.toContain('เฉลยลับ');
      expect(questionQb.where).toHaveBeenCalledWith('q.id IN (:...ids)', {
        ids: ['q-other', 'q-a'],
      });
    });

    it('AC7 with the right: the Challenge question comes with its content', async () => {
      unlocked = true;
      const result = await service.createSession(session(), user);
      expect(result.challengeUnlocked).toBe(true);
      expect(result.questions[0]).toMatchObject({
        id: 'q-ch',
        question: 'โจทย์ลับ',
      });
      expect(JSON.stringify(result)).not.toContain('"locked"');
    });

    it('AC4 filters reach the SQL: topics of the subject only, difficulties (bank), progress, limit', async () => {
      await service.createSession(
        session({
          topicIds: ['T-M4T2', '11111111-1111-4111-8111-111111111111'],
          difficulties: ['hard_challenge'],
          progress: 'wrong',
          limit: 20,
        }),
        user,
      );
      const [countSql, countParams] = query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(countSql).toContain('t.id IN (?)');
      expect(countSql).toContain('qa_w.isCorrect = 0');
      expect(countParams).toEqual(['s-bio', 't-m4t2', 'hard_challenge', 'u1']);
      const [pickSql, pickParams] = query.mock.calls[1] as [string, unknown[]];
      expect(pickSql).toContain('ORDER BY RAND() LIMIT ?');
      expect(pickParams.at(-1)).toBe(20);
    });

    it('default limit 50; challenge mode ignores difficulties', async () => {
      await service.createSession(
        session({ mode: 'challenge', difficulties: ['easy'] }),
        user,
      );
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('q.isChallenge = 1');
      expect(params).toEqual(['s-bio', 50]);
    });

    it('topics that are not of the subject / no match → 200 with no questions', async () => {
      const result = await service.createSession(
        session({ topicIds: ['11111111-1111-4111-8111-111111111111'] }),
        user,
      );
      expect(result).toMatchObject({ total: 0, questions: [] });
      expect(query).not.toHaveBeenCalled();

      onQuery = () => [{ total: 0 }];
      await expect(
        service.createSession(session(), null),
      ).resolves.toMatchObject({ total: 0, questions: [] });
    });

    it('subject not in the bank → 404', async () => {
      await expect(
        errorCode(
          service.createSession(session({ subjectId: 'missing' }), user),
        ),
      ).resolves.toEqual([404, 'QB_SUBJECT_NOT_FOUND']);
    });
  });
});
