import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CAMPAIGN_ENDED,
  CAMPAIGN_NOT_OPEN,
  assertCampaignWindow,
  buildCampaign,
  campaignClosedForAttempt,
  enforcedCampaignStatus,
  getCampaignStatus,
  parseCampaignDate,
  thaiDayNumber,
  thaiDaysBetween,
} from './exam-campaign';
import {
  ExamAccessType,
  MockExamRow,
  mockExamColor,
  parseMockExamSort,
  toMockExamItem,
  toMockExamProgress,
} from './exam-mock';

/** An instant given in Thai time (UTC+7). */
const th = (local: string) => new Date(`${local}+07:00`);

describe('campaign window (task 21)', () => {
  describe('Thai calendar days', () => {
    it('a Thai day starts at 00:00 Bangkok = 17:00 UTC the day before', () => {
      expect(thaiDayNumber(new Date('2026-11-14T16:59:59.999Z'))).toBe(
        thaiDayNumber(th('2026-11-14T00:00:00')),
      );
      expect(thaiDayNumber(new Date('2026-11-14T17:00:00.000Z'))).toBe(
        thaiDayNumber(th('2026-11-15T00:00:00')),
      );
    });

    it.each([
      [
        '23:59 → 00:01 the next day',
        '2026-11-14T23:59:00',
        '2026-11-15T00:01:00',
        1,
      ],
      [
        '00:01 → 23:59 the same day',
        '2026-11-14T00:01:00',
        '2026-11-14T23:59:00',
        0,
      ],
      ['across a month end', '2026-11-30T12:00:00', '2026-12-01T08:00:00', 1],
      ['a week', '2026-11-14T09:00:00', '2026-11-21T08:00:00', 7],
      ['backwards', '2026-11-15T00:00:00', '2026-11-14T23:59:59', -1],
    ])('%s', (_label, from, to, days) => {
      expect(thaiDaysBetween(th(from), th(to))).toBe(days);
    });
  });

  describe('getCampaignStatus', () => {
    const now = th('2026-11-14T12:00:00');

    it.each([
      ['no window', null, null, 'open'],
      ['before the start', th('2026-11-14T12:00:01'), null, 'upcoming'],
      ['exactly at the start', now, null, 'open'],
      [
        'inside the window',
        th('2026-11-01T00:00:00'),
        th('2026-11-30T23:59:00'),
        'open',
      ],
      ['exactly at the end', null, now, 'open'],
      ['after the end', null, th('2026-11-14T11:59:59'), 'ended'],
      ['only an end in the future', null, th('2026-12-01T00:00:00'), 'open'],
    ])('%s → %s', (_label, startsAt, endsAt, status) => {
      expect(getCampaignStatus(startsAt, endsAt, now)).toBe(status);
    });
  });

  describe('buildCampaign', () => {
    const code = (startsAt: Date | null, endsAt: Date | null) => ({
      accessType: ExamAccessType.CODE,
      campaignStartsAt: startsAt,
      campaignEndsAt: endsAt,
    });

    it('null for free and purchase exams (window stored but no effect)', () => {
      const window = {
        campaignStartsAt: th('2030-01-01T00:00:00'),
        campaignEndsAt: th('2030-02-01T00:00:00'),
      };
      const now = th('2026-11-14T12:00:00');
      expect(
        buildCampaign({ accessType: ExamAccessType.FREE, ...window }, now),
      ).toBeNull();
      expect(
        buildCampaign({ accessType: ExamAccessType.PURCHASE, ...window }, now),
      ).toBeNull();
    });

    it('code without a window = open, no days', () => {
      expect(buildCampaign(code(null, null), new Date())).toEqual({
        status: 'open',
        startsAt: null,
        endsAt: null,
        daysLeft: null,
        daysUntilOpen: null,
      });
    });

    it('open: daysLeft in Thai calendar days, 0 on the last day', () => {
      const endsAt = th('2026-11-20T23:59:00');
      expect(
        buildCampaign(code(null, endsAt), th('2026-11-14T08:00:00')),
      ).toEqual({
        status: 'open',
        startsAt: null,
        endsAt: '2026-11-20T16:59:00.000Z',
        daysLeft: 6,
        daysUntilOpen: null,
      });
      // 23:59 Thai the evening before vs 00:00 Thai on the last day
      expect(
        buildCampaign(code(null, endsAt), th('2026-11-19T23:59:59'))?.daysLeft,
      ).toBe(1);
      expect(
        buildCampaign(code(null, endsAt), th('2026-11-20T00:00:00'))?.daysLeft,
      ).toBe(0);
    });

    it('upcoming: daysUntilOpen across the Thai midnight, 0 = opens later today', () => {
      const startsAt = th('2026-11-16T09:00:00');
      const at = (now: string) => buildCampaign(code(startsAt, null), th(now));
      expect(at('2026-11-14T23:59:59')).toMatchObject({
        status: 'upcoming',
        startsAt: '2026-11-16T02:00:00.000Z',
        daysUntilOpen: 2,
        daysLeft: null,
      });
      expect(at('2026-11-15T00:00:00')?.daysUntilOpen).toBe(1);
      expect(at('2026-11-16T08:59:59')?.daysUntilOpen).toBe(0);
      expect(at('2026-11-16T09:00:00')).toMatchObject({
        status: 'open',
        daysUntilOpen: null,
      });
    });

    it('ended: no days', () => {
      expect(
        buildCampaign(
          code(th('2026-11-01T00:00:00'), th('2026-11-10T00:00:00')),
          th('2026-11-14T00:00:00'),
        ),
      ).toEqual({
        status: 'ended',
        startsAt: '2026-10-31T17:00:00.000Z',
        endsAt: '2026-11-09T17:00:00.000Z',
        daysLeft: null,
        daysUntilOpen: null,
      });
    });

    it('reads raw-row values tolerantly (strings, invalid → no limit)', () => {
      expect(
        buildCampaign(
          {
            accessType: 'code',
            campaignStartsAt: 'not a date',
            campaignEndsAt: '2026-11-20T00:00:00.000Z',
          },
          new Date('2026-11-14T00:00:00.000Z'),
        ),
      ).toMatchObject({ status: 'open', startsAt: null, daysLeft: 6 });
    });
  });

  describe('enforcedCampaignStatus', () => {
    const now = th('2026-11-14T12:00:00');
    const future = th('2026-12-01T00:00:00');
    const past = th('2026-11-01T00:00:00');

    it('code Mock Exam: the status of its window (raw 0/1 too)', () => {
      const exam = { isMock: 1, accessType: 'code', bankOnly: 0 };
      expect(
        enforcedCampaignStatus({ ...exam, campaignStartsAt: future }, now),
      ).toBe('upcoming');
      expect(
        enforcedCampaignStatus({ ...exam, campaignEndsAt: past }, now),
      ).toBe('ended');
      expect(enforcedCampaignStatus(exam, now)).toBe('open');
    });

    it.each([
      ['a free Mock Exam', { isMock: true, accessType: 'free' }],
      ['a purchase Mock Exam', { isMock: true, accessType: 'purchase' }],
      ['a non-mock exam', { isMock: false, accessType: 'code' }],
      ['a bankOnly exam', { isMock: true, accessType: 'code', bankOnly: true }],
    ])('null for %s', (_label, exam) => {
      expect(
        enforcedCampaignStatus({ ...exam, campaignEndsAt: past }, now),
      ).toBeNull();
    });
  });

  it('campaignClosedForAttempt: 403 with errorCode and a Thai message', () => {
    const notOpen = campaignClosedForAttempt('upcoming');
    const ended = campaignClosedForAttempt('ended');
    expect(notOpen).toBeInstanceOf(ForbiddenException);
    expect(notOpen.getResponse()).toEqual({
      statusCode: 403,
      message: expect.stringContaining('ยังไม่เปิด') as string,
      errorCode: CAMPAIGN_NOT_OPEN,
    });
    expect(ended.getResponse()).toEqual({
      statusCode: 403,
      message: expect.stringContaining('จบแล้ว') as string,
      errorCode: CAMPAIGN_ENDED,
    });
  });

  describe('admin input', () => {
    it('parseCampaignDate: null/undefined → null, whole seconds, bad year → 400', () => {
      expect(parseCampaignDate(undefined, 'วันเปิดแคมเปญ')).toBeNull();
      expect(parseCampaignDate(null, 'วันเปิดแคมเปญ')).toBeNull();
      expect(
        parseCampaignDate('2026-11-20T09:00:00.999+07:00', 'x')?.toISOString(),
      ).toBe('2026-11-20T02:00:00.000Z');
      expect(() =>
        parseCampaignDate('0999-01-01T00:00:00Z', 'วันปิดแคมเปญ'),
      ).toThrow(new BadRequestException('วันปิดแคมเปญไม่ถูกต้อง'));
    });

    it('assertCampaignWindow: end must be after start (Thai 400)', () => {
      const start = th('2026-11-20T09:00:00');
      expect(() => assertCampaignWindow(start, start)).toThrow(
        new BadRequestException('วันปิดแคมเปญต้องอยู่หลังวันเปิดแคมเปญ'),
      );
      expect(() =>
        assertCampaignWindow(start, th('2026-11-20T08:59:59')),
      ).toThrow(BadRequestException);
      expect(() =>
        assertCampaignWindow(start, th('2026-11-20T09:00:01')),
      ).not.toThrow();
      expect(() => assertCampaignWindow(null, start)).not.toThrow();
      expect(() => assertCampaignWindow(start, null)).not.toThrow();
    });
  });
});

describe('Mock Exam card fields (task 21)', () => {
  const row: MockExamRow = {
    id: 'm1',
    title: 'Mock',
    category: 'tgat',
    categoryName: 'TGAT',
    subjectId: 's1',
    subjectName: 'คณิตศาสตร์',
    bannerImage: null,
    questionCount: 20,
    durationMinutes: 60,
    level: null,
    accessType: ExamAccessType.CODE,
    price: null,
    releaseDate: new Date('2026-11-01T00:00:00.000Z'),
  };

  it('subjectLabel = bankLabel, else the subject name, null without a subject', () => {
    expect(
      toMockExamItem({ ...row, subjectBankLabel: 'คณิต 1' }).subjectLabel,
    ).toBe('คณิต 1');
    expect(
      toMockExamItem({ ...row, subjectBankLabel: '  ' }).subjectLabel,
    ).toBe('คณิตศาสตร์');
    expect(
      toMockExamItem({ ...row, subjectId: null, subjectName: null })
        .subjectLabel,
    ).toBeNull();
  });

  it('color = the subject colour when it is a #hex, else by access type', () => {
    expect(mockExamColor('#ff0000', ExamAccessType.FREE)).toBe('#ff0000');
    expect(mockExamColor('red;background:url(x)', ExamAccessType.FREE)).toBe(
      '#10b981',
    );
    expect(mockExamColor(null, ExamAccessType.CODE)).toBe('#f59e0b');
    expect(mockExamColor(undefined, ExamAccessType.PURCHASE)).toBe('#6366f1');
    expect(toMockExamItem({ ...row, subjectColor: '#123abc' }).color).toBe(
      '#123abc',
    );
  });

  it('parseMockExamSort: the 3 sorts, anything else = newest', () => {
    expect(parseMockExamSort('recommended')).toBe('recommended');
    expect(parseMockExamSort('name')).toBe('name');
    expect(parseMockExamSort('newest')).toBe('newest');
    expect(parseMockExamSort('NAME')).toBe('newest');
    expect(parseMockExamSort(undefined)).toBe('newest');
    expect(parseMockExamSort(['name'])).toBe('newest');
  });

  describe('toMockExamProgress', () => {
    it('in_progress: counts answers given (not null/empty), total from totalQuestions', () => {
      expect(
        toMockExamProgress({
          id: 'att-1',
          examId: 'm1',
          status: 'in_progress',
          mode: 'practice',
          answers: { q1: 'a', q2: '', q3: null, q4: 'b' },
          questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
          totalQuestions: 20,
          score: '0.00',
        }),
      ).toEqual({
        status: 'in_progress',
        mode: 'practice',
        answered: 2,
        total: 20,
        scorePercent: null,
        attemptId: 'att-1',
      });
    });

    it('completed: scorePercent from the decimal score; JSON text columns (MariaDB)', () => {
      expect(
        toMockExamProgress({
          id: 'att-2',
          examId: 'm1',
          status: 'completed',
          mode: 'exam',
          answers: '{"q1":"a","q2":"c"}',
          questionIds: '["q1","q2","q3"]',
          totalQuestions: null,
          score: '82.50',
        }),
      ).toEqual({
        status: 'completed',
        mode: 'exam',
        answered: 2,
        total: 3,
        scorePercent: 82.5,
        attemptId: 'att-2',
      });
    });

    it('malformed answers → 0 answered; missing mode → practice', () => {
      expect(
        toMockExamProgress({
          id: 'att-3',
          examId: 'm1',
          status: 'in_progress',
          mode: null,
          answers: 'not json',
          questionIds: null,
          totalQuestions: 0,
          score: null,
        }),
      ).toMatchObject({ answered: 0, total: 0, mode: 'practice' });
    });
  });
});
