/**
 * Pure helpers of the Question Bank statistics and ordering (task 20).
 * Days are Thai calendar days (UTC+7, no DST) as 'YYYY-MM-DD'.
 */

/** Thailand is UTC+7 all year. */
export const THAI_OFFSET_MINUTES = 7 * 60;
export const WEEKLY_WEEKS = 12;
/** Longest streak reported; older days are not read. */
export const STREAK_MAX_DAYS = 365;
/**
 * Days of answers the daily stats query reads (back from now): the streak
 * cap + 1 for today/yesterday, which also covers the 12 weekly weeks
 * (≤ 12 × 7 days). Not the user's whole history.
 */
export const STATS_WINDOW_DAYS = Math.max(
  STREAK_MAX_DAYS + 1,
  WEEKLY_WEEKS * 7 + 1,
);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Thai calendar day of an instant. */
export function thaiDay(now: Date): string {
  return new Date(now.getTime() + THAI_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function dayToUtcMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** day + n days (n may be negative). */
export function addDays(day: string, n: number): string {
  return utcMsToDay(dayToUtcMs(day) + n * DAY_MS);
}

/** Monday of the week (Monday–Sunday) of the day. */
export function mondayOf(day: string): string {
  const weekday = new Date(dayToUtcMs(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * Days in a row with at least one answer, counted back from today; when
 * today has none yet, from yesterday (the streak is not broken until the
 * day ends). No answer yesterday nor today = 0. Stops at the first gap or
 * at `max` days.
 */
export function computeStreak(
  answerDays: Iterable<string>,
  today: string,
  max = STREAK_MAX_DAYS,
) {
  const days = new Set(answerDays);
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (streak < max && days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export interface DailyCount {
  day: string;
  correct: number;
  wrong: number;
}

export interface WeeklyCount {
  // Monday, 'YYYY-MM-DD' (Thai day)
  weekStart: string;
  correct: number;
  wrong: number;
}

/**
 * The last `weeks` weeks (Monday-based, Thai days), oldest first; the last
 * one is the current week. Every answer counts (not distinct questions).
 * Days outside the range are ignored.
 */
export function buildWeekly(
  daily: DailyCount[],
  today: string,
  weeks = WEEKLY_WEEKS,
): WeeklyCount[] {
  const currentMonday = mondayOf(today);
  const result: WeeklyCount[] = [];
  const byWeek = new Map<string, WeeklyCount>();
  for (let i = weeks - 1; i >= 0; i--) {
    const week = {
      weekStart: addDays(currentMonday, -7 * i),
      correct: 0,
      wrong: 0,
    };
    result.push(week);
    byWeek.set(week.weekStart, week);
  }
  for (const row of daily) {
    const week = byWeek.get(mondayOf(row.day));
    if (!week) continue;
    week.correct += row.correct;
    week.wrong += row.wrong;
  }
  return result;
}

/** Whole percent 0–100 of part / whole; whole 0 → null. */
export function percentOrNull(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part * 100) / whole);
}

/** Number from a raw SQL value (COUNT/SUM come back as strings). */
export function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface OrderedTopic {
  id: string;
  name: string;
  orderIndex: number;
  gradeLabel: string | null;
  term: number | null;
}

/** null/empty label → null; others trimmed. */
export function normalizeGrade(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
}

/** 1/2 → the term, anything else → null. */
export function normalizeTerm(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && (n === 1 || n === 2)
    ? n
    : null;
}

function compareNullLast<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/** "ม.1" < "ม.2" < … < "ม.10" (natural), null last. */
export function compareGrade(a: string | null, b: string | null): number {
  return compareNullLast(a, b, (x, y) =>
    x.localeCompare(y, 'th', { numeric: true, sensitivity: 'base' }),
  );
}

/** Topics in Question Bank order: grade → term → orderIndex → name. */
export function compareTopics(a: OrderedTopic, b: OrderedTopic): number {
  return (
    compareGrade(normalizeGrade(a.gradeLabel), normalizeGrade(b.gradeLabel)) ||
    compareNullLast(
      normalizeTerm(a.term),
      normalizeTerm(b.term),
      (x, y) => x - y,
    ) ||
    (a.orderIndex ?? 0) - (b.orderIndex ?? 0) ||
    a.name.localeCompare(b.name, 'th', { numeric: true })
  );
}

/** "ม.4 เทอม 1" / "ม.4" / "เทอม 1" / "อื่น ๆ". */
export function groupLabel(grade: string | null, term: number | null) {
  if (grade && term) return `${grade} เทอม ${term}`;
  if (grade) return grade;
  if (term) return `เทอม ${term}`;
  return 'อื่น ๆ';
}

export interface TopicGroup<T> {
  gradeLabel: string | null;
  term: number | null;
  label: string;
  topics: T[];
}

/**
 * Group topics (already sorted with compareTopics) by grade + term, in
 * that order.
 */
export function groupTopics<T extends OrderedTopic>(
  sorted: T[],
): TopicGroup<T>[] {
  const groups: TopicGroup<T>[] = [];
  for (const topic of sorted) {
    const grade = normalizeGrade(topic.gradeLabel);
    const term = normalizeTerm(topic.term);
    const last = groups[groups.length - 1];
    if (last && last.gradeLabel === grade && last.term === term) {
      last.topics.push(topic);
    } else {
      groups.push({
        gradeLabel: grade,
        term,
        label: groupLabel(grade, term),
        topics: [topic],
      });
    }
  }
  return groups;
}

/**
 * Session order: by topic (index in `topicOrder`), keeping the given order
 * inside a topic (the rows come from ORDER BY RAND(), so that is random).
 * Rows of an unknown topic go last.
 */
export function orderByTopic<T extends { topicId: string | null }>(
  rows: T[],
  topicOrder: string[],
): T[] {
  const index = new Map(topicOrder.map((id, i) => [id.toLowerCase(), i]));
  const position = (row: T) =>
    index.get(String(row.topicId ?? '').toLowerCase()) ?? topicOrder.length;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => position(a.row) - position(b.row) || a.i - b.i)
    .map(({ row }) => row);
}
