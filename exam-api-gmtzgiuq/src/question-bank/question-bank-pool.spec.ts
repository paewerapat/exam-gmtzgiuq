import {
  ANSWERED_SQL,
  BUCKET_SQL,
  LAST_WRONG_SQL,
  buildPoolWhere,
} from './question-bank-pool';

describe('buildPoolWhere — Question Bank pool rules (task 20)', () => {
  const base = [
    "e.status = 'published'",
    'e.isMock = 0',
    't.isActive = 1',
    'c.isActive = 1',
    's.isActive = 1',
  ];

  it('published, non-Mock exams (bankOnly included), active topic/chapter/subject of the venue', () => {
    const { where, params } = buildPoolWhere({ mode: 'bank', venueId: 'v1' });
    expect(where).toBe([...base, 's.venueId = ?'].join(' AND '));
    expect(where).not.toContain('bankOnly');
    expect(params).toEqual(['v1']);
  });

  it('challenge mode = isChallenge only; difficulties are ignored there', () => {
    const { where, params } = buildPoolWhere({
      mode: 'challenge',
      subjectId: 's1',
      difficulties: ['easy'],
    });
    expect(where).toContain('s.id = ?');
    expect(where).toContain('q.isChallenge = 1');
    expect(where).not.toContain(BUCKET_SQL);
    expect(params).toEqual(['s1']);
  });

  it('bank mode: difficulty buckets (hard OR Challenge = hard_challenge), bound and de-duplicated', () => {
    expect(BUCKET_SQL).toContain(
      "WHEN q.isChallenge = 1 OR q.difficulty = 'hard' THEN 'hard_challenge'",
    );
    const { where, params } = buildPoolWhere({
      mode: 'bank',
      subjectId: 's1',
      difficulties: ['easy', 'hard_challenge', 'easy'],
    });
    expect(where).toContain(`${BUCKET_SQL} IN (?,?)`);
    expect(params).toEqual(['s1', 'easy', 'hard_challenge']);
    // [] = every bucket
    expect(
      buildPoolWhere({ mode: 'bank', subjectId: 's1', difficulties: [] }).where,
    ).not.toContain(BUCKET_SQL);
  });

  it('topicIds are bound; [] matches nothing', () => {
    const { where, params } = buildPoolWhere({
      mode: 'bank',
      subjectId: 's1',
      topicIds: ['t1', 't2'],
    });
    expect(where).toContain('t.id IN (?,?)');
    expect(params).toEqual(['s1', 't1', 't2']);
    expect(
      buildPoolWhere({ mode: 'bank', subjectId: 's1', topicIds: [] }).where,
    ).toContain('1 = 0');
  });

  it('AC4 progress filters from question_answers of the user', () => {
    const done = buildPoolWhere({
      mode: 'bank',
      progress: 'done',
      userId: 'u1',
    });
    expect(done.where.endsWith(ANSWERED_SQL)).toBe(true);
    expect(done.params).toEqual(['u1']);

    const undone = buildPoolWhere({
      mode: 'bank',
      progress: 'undone',
      userId: 'u1',
    });
    expect(undone.where.endsWith(`NOT ${ANSWERED_SQL}`)).toBe(true);

    const wrong = buildPoolWhere({
      mode: 'bank',
      progress: 'wrong',
      userId: 'u1',
    });
    expect(wrong.where.endsWith(LAST_WRONG_SQL)).toBe(true);
    // latest answer wrong: no later answer of the same user to the question
    expect(LAST_WRONG_SQL).toContain('qa_w.isCorrect = 0');
    expect(LAST_WRONG_SQL).toContain('qa_l.answeredAt > qa_w.answeredAt');

    // all = no filter
    expect(
      buildPoolWhere({ mode: 'bank', progress: 'all', userId: 'u1' }).params,
    ).toEqual([]);
  });

  it('a progress filter without a user matches nothing (never another user)', () => {
    const { where, params } = buildPoolWhere({
      mode: 'bank',
      progress: 'done',
    });
    expect(where).toContain('1 = 0');
    expect(params).toEqual([]);
  });

  it('params follow the placeholders in order', () => {
    const { where, params } = buildPoolWhere({
      mode: 'bank',
      venueId: 'v1',
      subjectId: 's1',
      topicIds: ['t1'],
      difficulties: ['medium'],
      progress: 'undone',
      userId: 'u1',
    });
    expect(where.split('?').length - 1).toBe(params.length);
    expect(params).toEqual(['v1', 's1', 't1', 'medium', 'u1']);
  });
});
