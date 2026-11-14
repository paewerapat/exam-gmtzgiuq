// logic ของหน้า Question Bank / Challenge Questions (task 20) แยกจาก UI เพื่อทดสอบได้
import type {
  QbDifficulty,
  QbGroup,
  QbMode,
  QbProgressFilter,
  QbTopic,
  QbWeek,
} from '@/lib/api/question-bank';
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

export type QbSortOrder = 'normal' | 'accuracy_low' | 'least_done';

export interface QbModeConfig {
  mode: QbMode;
  title: string;
  description: string;
  /** path หน้า 1 (หน้า 2 = `${basePath}/<subjectId>`) */
  basePath: string;
  /** ป้ายสถิติ "ข้อที่ทำแล้ว" */
  answeredLabel: string;
}

export const QB_MODE_CONFIG: Record<QbMode, QbModeConfig> = {
  bank: {
    mode: 'bank',
    title: 'Question Bank',
    description: 'โจทย์ความยากประมาณข้อสอบจริง จัดทำโดยทีมวิชาการ LUMO EXAM',
    basePath: '/dashboard/question-bank',
    answeredLabel: 'ข้อที่ทำแล้ว',
  },
  challenge: {
    mode: 'challenge',
    title: 'Challenge Questions',
    description: 'ข้อที่ยากที่สุดของแต่ละวิชา',
    basePath: '/dashboard/challenge',
    answeredLabel: 'ข้อ Challenge ที่ทำแล้ว',
  },
};

export const QB_DIFFICULTIES: { value: QbDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard_challenge', label: 'Hard & Challenge' },
];

export const QB_PROGRESS_OPTIONS: { value: QbProgressFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'undone', label: 'ยังไม่ทำ' },
  { value: 'done', label: 'ทำแล้ว' },
  { value: 'wrong', label: 'ตอบผิด' },
];

export const QB_SORT_OPTIONS: { value: QbSortOrder; label: string }[] = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'accuracy_low', label: 'ความแม่นยำต่ำก่อน' },
  { value: 'least_done', label: 'ทำน้อยก่อน' },
];

/** จำนวนข้อต่อการฝึกหนึ่งครั้ง (API รับ 1–200) */
export const QB_SESSION_LIMIT = 50;
/** topicIds สูงสุดต่อ session ตามสัญญา API */
export const QB_MAX_TOPICS = 100;

export function isQbMode(v: unknown): v is QbMode {
  return v === 'bank' || v === 'challenge';
}

/** href หน้า Upgrade พร้อมเลือกสนามไว้ */
export function upgradeHref(venueKey: string | null | undefined): string {
  return venueKey ? `/upgrade?venue=${encodeURIComponent(venueKey)}` : '/upgrade';
}

// ── จำนวนข้อตามตัวกรองความยาก ─────────────────────────────

/**
 * จำนวนข้อของบทตามระดับที่เลือก — ไม่เลือกเลย = ทุกระดับ (total)
 * โหมด challenge ไม่มีตัวกรองความยาก → total เสมอ
 */
export function topicQuestionCount(topic: QbTopic, difficulties: QbDifficulty[], mode: QbMode): number {
  if (mode === 'challenge' || difficulties.length === 0) return topic.total;
  let sum = 0;
  for (const d of difficulties) {
    if (d === 'easy') sum += topic.counts.easy ?? 0;
    else if (d === 'medium') sum += topic.counts.medium ?? 0;
    else sum += topic.counts.hardChallenge ?? 0;
  }
  return sum;
}

/** รวมจำนวนข้อของบทที่เลือก (ไม่ส่ง ids = ทุกบท) */
export function selectedQuestionCount(
  groups: QbGroup[],
  difficulties: QbDifficulty[],
  mode: QbMode,
  topicIds?: ReadonlySet<string>,
): number {
  let sum = 0;
  for (const g of groups) {
    for (const t of g.topics) {
      if (topicIds && !topicIds.has(t.id)) continue;
      sum += topicQuestionCount(t, difficulties, mode);
    }
  }
  return sum;
}

export function topicCountOf(groups: QbGroup[]): number {
  return groups.reduce((n, g) => n + g.topics.length, 0);
}

// ── กลุ่ม / ลำดับ ─────────────────────────────────────────

/** "ม.4 เทอม 1" / "ม.4" / "เทอม 2" / "อื่น ๆ" — ใช้ label จาก API ถ้ามี */
export function groupLabel(group: Pick<QbGroup, 'gradeLabel' | 'term' | 'label'>): string {
  if (group.label?.trim()) return group.label.trim();
  const grade = group.gradeLabel?.trim();
  const term = group.term === 1 || group.term === 2 ? `เทอม ${group.term}` : '';
  if (grade && term) return `${grade} ${term}`;
  if (grade) return grade;
  if (term) return term;
  return 'อื่น ๆ';
}

/**
 * เรียงบทภายในแต่ละกลุ่ม (ลำดับกลุ่มตามที่ API ส่งมาเสมอ)
 * - normal: ตามที่ API ส่ง (orderIndex)
 * - accuracy_low: ความแม่นยำน้อย → มาก ; บทที่ยังไม่มีข้อมูลไว้ท้าย
 * - least_done: สัดส่วนที่ทำแล้วน้อย → มาก
 * เท่ากัน → คงลำดับเดิม
 */
export function sortGroups(groups: QbGroup[], order: QbSortOrder): QbGroup[] {
  if (order === 'normal') return groups;
  return groups.map((g) => {
    const indexed = g.topics.map((t, i) => ({ t, i }));
    indexed.sort((a, b) => {
      if (order === 'accuracy_low') {
        const x = a.t.accuracy;
        const y = b.t.accuracy;
        if (x === null && y === null) return a.i - b.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y || a.i - b.i;
      }
      const ra = a.t.total > 0 ? a.t.answered / a.t.total : 1;
      const rb = b.t.total > 0 ? b.t.answered / b.t.total : 1;
      return ra - rb || a.i - b.i;
    });
    return { ...g, topics: indexed.map((x) => x.t) };
  });
}

/** ระดับสีของความแม่นยำ (คู่กับข้อความ % เสมอ ไม่ใช้สีอย่างเดียว) */
export type AccuracyTone = 'good' | 'fair' | 'low' | 'none';

export function accuracyTone(accuracy: number | null): AccuracyTone {
  if (accuracy === null) return 'none';
  if (accuracy >= 80) return 'good';
  if (accuracy >= 60) return 'fair';
  return 'low';
}

export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/** ความแม่นยำรวมของวิชา = ถ่วงด้วยจำนวนข้อที่ทำของแต่ละบท (ไม่มีข้อมูล = null) */
export function weightedAccuracy(topics: QbTopic[]): number | null {
  let weight = 0;
  let sum = 0;
  for (const t of topics) {
    if (t.accuracy === null || t.answered <= 0) continue;
    weight += t.answered;
    sum += t.accuracy * t.answered;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

// ── สีการ์ดวิชา ─────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * ข้อความบนการ์ดสีวิชา: ขาวหรือเกือบดำตามความสว่างของสี (สีสว่างเช่นเหลือง ขาวอ่านไม่ออก)
 * เลือกตัวที่ contrast สูงกว่า
 */
export function cardTextTone(hex: string): 'light' | 'dark' {
  const rgb = parseHex(hex);
  if (!rgb) return 'light';
  const l = relativeLuminance(rgb);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastDark = (l + 0.05) / (relativeLuminance([17, 24, 39]) + 0.05);
  return contrastWhite >= contrastDark ? 'light' : 'dark';
}

/** สีปลาย gradient ของการ์ด (ผสมขาว 35%) */
export function lighten(hex: string, amount = 0.35): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const mix = rgb.map((c) => Math.round(c + (255 - c) * amount));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ── กราฟรายสัปดาห์ ───────────────────────────────────────

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-11-09" → "9 พ.ย." (อ่านเป็นวันตามปฏิทิน ไม่แปลง timezone) */
export function formatWeekLabel(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(weekStart);
  if (!m) return weekStart;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return weekStart;
  return `${Number(m[3])} ${THAI_MONTHS_SHORT[month]}`;
}

/** ข้อความสรุปกราฟสำหรับ screen reader / คนที่ไม่ดูกราฟ */
export function weeklySummary(weekly: QbWeek[]): string {
  if (weekly.length === 0) return 'ยังไม่มีข้อมูลการทำข้อสอบ';
  const correct = weekly.reduce((n, w) => n + w.correct, 0);
  const wrong = weekly.reduce((n, w) => n + w.wrong, 0);
  const total = correct + wrong;
  const span = `${weekly.length} สัปดาห์ล่าสุด`;
  if (total === 0) return `${span} ยังไม่มีการตอบข้อ`;
  let best = weekly[0];
  for (const w of weekly) if (w.correct + w.wrong > best.correct + best.wrong) best = w;
  const last = weekly[weekly.length - 1];
  return (
    `${span} ตอบทั้งหมด ${total} ข้อ ถูก ${correct} ข้อ ผิด ${wrong} ข้อ` +
    ` สัปดาห์ที่ทำมากที่สุดคือสัปดาห์เริ่ม ${formatWeekLabel(best.weekStart)} (${best.correct + best.wrong} ข้อ)` +
    ` สัปดาห์นี้ถูก ${last.correct} ข้อ ผิด ${last.wrong} ข้อ`
  );
}

// ── ลิงก์หน้าฝึก ─────────────────────────────────────────

export interface QbPracticeParams {
  subjectId: string;
  mode: QbMode;
  /** ว่าง = ทุกบท */
  topicIds: string[];
  difficulties: QbDifficulty[];
  progress: QbProgressFilter;
}

const DIFF_VALUES: QbDifficulty[] = ['easy', 'medium', 'hard_challenge'];
const PROGRESS_VALUES: QbProgressFilter[] = ['all', 'undone', 'done', 'wrong'];

/** `/practice/bank?subject=&mode=&topics=a,b&diff=easy,medium&progress=undone` (ส่งเฉพาะที่ไม่ใช่ค่าเริ่มต้น) */
export function practiceHref(p: QbPracticeParams): string {
  const params = new URLSearchParams();
  params.set('subject', p.subjectId);
  params.set('mode', p.mode);
  if (p.topicIds.length > 0) params.set('topics', p.topicIds.join(','));
  if (p.mode === 'bank' && p.difficulties.length > 0) params.set('diff', p.difficulties.join(','));
  if (p.progress !== 'all') params.set('progress', p.progress);
  return `/practice/bank?${params.toString()}`;
}

/** อ่านพารามิเตอร์หน้าฝึก — ไม่มี subject = null ; ค่าแปลกถูกตัดทิ้ง */
export function parsePracticeParams(search: { get(name: string): string | null }): QbPracticeParams | null {
  const subjectId = (search.get('subject') ?? '').trim();
  if (!subjectId) return null;
  const mode: QbMode = search.get('mode') === 'challenge' ? 'challenge' : 'bank';
  const list = (name: string) =>
    (search.get(name) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const topicIds = [...new Set(list('topics'))].slice(0, QB_MAX_TOPICS);
  const difficulties =
    mode === 'bank'
      ? DIFF_VALUES.filter((d) => list('diff').includes(d))
      : [];
  const rawProgress = search.get('progress') as QbProgressFilter | null;
  const progress = rawProgress && PROGRESS_VALUES.includes(rawProgress) ? rawProgress : 'all';
  return { subjectId, mode, topicIds, difficulties, progress };
}

/** key ของ session ในเครื่อง — ตัวกรองเดียวกันถึง resume ได้ (hash สั้น ๆ แทนรายการ id ยาว) */
export function practiceSessionKey(p: QbPracticeParams): string {
  const raw = [p.mode, p.subjectId, [...p.topicIds].sort().join(','), p.difficulties.join(','), p.progress].join('|');
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `bank_${p.mode}_${p.subjectId}_${h.toString(36)}`;
}

// ── ข้อที่ล็อกในหน้าฝึก ───────────────────────────────────

/** ตัดข้อที่ล็อกออกจาก session ก่อนคิดคะแนน/ส่ง log — ข้อที่ล็อกไม่มีเฉลยและไม่ใช่ข้อที่ผู้ใช้ทำ */
export function withoutLockedQuestions(
  session: ExamSession,
  questions: Question[],
): { session: ExamSession; questions: Question[]; lockedCount: number } {
  const locked = new Set(questions.filter((q) => q.locked === true).map((q) => q.id));
  if (locked.size === 0) return { session, questions, lockedCount: 0 };
  const keep = (id: string) => !locked.has(id);
  const answers = Object.fromEntries(Object.entries(session.answers ?? {}).filter(([id]) => keep(id)));
  const timePerQuestion = Object.fromEntries(Object.entries(session.timePerQuestion ?? {}).filter(([id]) => keep(id)));
  return {
    session: {
      ...session,
      questionIds: session.questionIds.filter(keep),
      answers,
      timePerQuestion,
      markedForReview: (session.markedForReview ?? []).filter(keep),
    },
    questions: questions.filter((q) => keep(q.id)),
    lockedCount: locked.size,
  };
}
