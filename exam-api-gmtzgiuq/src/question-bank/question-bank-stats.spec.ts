import {
  STATS_WINDOW_DAYS,
  addDays,
  buildWeekly,
  compareTopics,
  computeStreak,
  groupTopics,
  mondayOf,
  orderByTopic,
  percentOrNull,
  thaiDay,
  toCount,
} from './question-bank-stats';

describe('Question Bank stats helpers (task 20)', () => {
  describe('thaiDay (UTC+7)', () => {
    it('16:59:59Z is still the same Thai day, 17:00Z is the next one', () => {
      expect(thaiDay(new Date('2026-11-13T16:59:59.999Z'))).toBe('2026-11-13');
      expect(thaiDay(new Date('2026-11-13T17:00:00.000Z'))).toBe('2026-11-14');
    });

    it('00:30 Thai time is the new day although UTC is still the day before', () => {
      // 2026-11-14 00:30 +07:00
      expect(thaiDay(new Date('2026-11-13T17:30:00Z'))).toBe('2026-11-14');
    });
  });

  describe('addDays / mondayOf', () => {
    it('crosses months and years', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('weeks start on Monday (Sunday belongs to the week before)', () => {
      expect(mondayOf('2026-11-16')).toBe('2026-11-16'); // Monday
      expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // Sunday
      expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // Sunday
      expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // Friday
    });
  });

  describe('computeStreak', () => {
    const today = '2026-11-14';

    it('counts back from today when today has answers', () => {
      expect(
        computeStreak(['2026-11-14', '2026-11-13', '2026-11-12'], today),
      ).toBe(3);
    });

    it('today without answers yet → counts from yesterday', () => {
      expect(computeStreak(['2026-11-13', '2026-11-12'], today)).toBe(2);
    });

    it('a gap ends the streak; no answer today nor yesterday → 0', () => {
      expect(
        computeStreak(['2026-11-14', '2026-11-12', '2026-11-11'], today),
      ).toBe(1);
      expect(computeStreak(['2026-11-12', '2026-11-11'], today)).toBe(0);
      expect(computeStreak([], today)).toBe(0);
    });

    it('stops at the cap (365 days by default)', () => {
      const days = Array.from({ length: 400 }, (_, i) => addDays(today, -i));
      expect(computeStreak(days, today)).toBe(365);
      expect(computeStreak(days, today, 10)).toBe(10);
      expect(STATS_WINDOW_DAYS).toBeGreaterThanOrEqual(366);
      expect(STATS_WINDOW_DAYS).toBeGreaterThanOrEqual(12 * 7 + 1);
    });

    it('crosses a month boundary', () => {
      expect(
        computeStreak(['2026-12-01', '2026-11-30', '2026-11-29'], '2026-12-01'),
      ).toBe(3);
    });
  });

  describe('buildWeekly', () => {
    it('12 Monday-based weeks, oldest first, the current week last', () => {
      const weekly = buildWeekly([], '2026-11-14'); // Saturday
      expect(weekly).toHaveLength(12);
      expect(weekly[11]).toEqual({
        weekStart: '2026-11-09',
        correct: 0,
        wrong: 0,
      });
      expect(weekly[0].weekStart).toBe('2026-08-24');
    });

    it('sums days into their week; Sunday goes to the week before; older days are ignored', () => {
      const weekly = buildWeekly(
        [
          { day: '2026-11-09', correct: 2, wrong: 1 }, // Monday, this week
          { day: '2026-11-14', correct: 1, wrong: 0 }, // Saturday, this week
          { day: '2026-11-08', correct: 0, wrong: 3 }, // Sunday, last week
          { day: '2026-08-23', correct: 9, wrong: 9 }, // 13 weeks ago
        ],
        '2026-11-14',
      );
      expect(weekly[11]).toMatchObject({ correct: 3, wrong: 1 });
      expect(weekly[10]).toMatchObject({
        weekStart: '2026-11-02',
        correct: 0,
        wrong: 3,
      });
      const total = weekly.reduce((n, w) => n + w.correct + w.wrong, 0);
      expect(total).toBe(7);
    });
  });

  it('percentOrNull / toCount', () => {
    expect(percentOrNull(2, 3)).toBe(67);
    expect(percentOrNull(0, 0)).toBeNull();
    expect(toCount('12')).toBe(12);
    expect(toCount(null)).toBe(0);
    expect(toCount('abc')).toBe(0);
  });

  describe('topic order and groups', () => {
    const topic = (
      id: string,
      gradeLabel: string | null,
      term: number | null,
      orderIndex = 0,
    ) => ({ id, name: id, gradeLabel, term, orderIndex });

    it('grade natural order (ม.1 … ม.10), then term, then orderIndex; no grade last as "อื่น ๆ"', () => {
      const sorted = [
        topic('other', null, null),
        topic('m10', 'ม.10', 1),
        topic('m4t2', 'ม.4', 2),
        topic('m4t1b', 'ม.4', 1, 2),
        topic('m4-noterm', 'ม.4', null),
        topic('m4t1a', 'ม.4', 1, 1),
        topic('m5', 'ม.5', 1),
      ].sort(compareTopics);
      expect(sorted.map((t) => t.id)).toEqual([
        'm4t1a',
        'm4t1b',
        'm4t2',
        'm4-noterm',
        'm5',
        'm10',
        'other',
      ]);

      expect(
        groupTopics(sorted).map((g) => [
          g.label,
          g.gradeLabel,
          g.term,
          g.topics.length,
        ]),
      ).toEqual([
        ['ม.4 เทอม 1', 'ม.4', 1, 2],
        ['ม.4 เทอม 2', 'ม.4', 2, 1],
        ['ม.4', 'ม.4', null, 1],
        ['ม.5 เทอม 1', 'ม.5', 1, 1],
        ['ม.10 เทอม 1', 'ม.10', 1, 1],
        ['อื่น ๆ', null, null, 1],
      ]);
    });

    it('blank grade and invalid term are "not set"', () => {
      const groups = groupTopics(
        [topic('a', '  ', 3), topic('b', null, null)].sort(compareTopics),
      );
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({
        label: 'อื่น ๆ',
        gradeLabel: null,
        term: null,
      });
    });

    it('orderByTopic keeps the (random) order inside a topic', () => {
      const rows = [
        { id: '1', topicId: 'B' },
        { id: '2', topicId: 'a' },
        { id: '3', topicId: 'x' },
        { id: '4', topicId: 'b' },
        { id: '5', topicId: 'A' },
      ];
      expect(orderByTopic(rows, ['a', 'b']).map((r) => r.id)).toEqual([
        '2',
        '5',
        '1',
        '4',
        '3',
      ]);
    });
  });
});
