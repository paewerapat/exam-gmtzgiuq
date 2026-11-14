import {
  accuracyTone,
  cardTextTone,
  formatWeekLabel,
  groupLabel,
  parsePracticeParams,
  practiceHref,
  practiceSessionKey,
  selectedQuestionCount,
  sortGroups,
  topicQuestionCount,
  upgradeHref,
  weeklySummary,
  weightedAccuracy,
  withoutLockedQuestions,
} from './question-bank';
import type { QbGroup, QbTopic } from './api/question-bank';
import { toLockedQuestion } from './api/question-bank';
import type { Question } from './api/questions';
import type { ExamSession } from '@/types/exam';

const topic = (id: string, over: Partial<QbTopic> = {}): QbTopic => ({
  id,
  name: `บท ${id}`,
  total: 10,
  answered: 0,
  accuracy: null,
  counts: { easy: 5, medium: 3, hardChallenge: 2 },
  ...over,
});

const groups: QbGroup[] = [
  { gradeLabel: 'ม.4', term: 1, topics: [topic('a', { answered: 9, accuracy: 91 }), topic('b', { answered: 2, accuracy: 50 })] },
  { gradeLabel: 'ม.4', term: 2, topics: [topic('c', { total: 4, counts: { easy: 0, medium: 0, hardChallenge: 4 } })] },
];

describe('lib/question-bank — จำนวนข้อตามตัวกรองความยาก', () => {
  it('ไม่เลือกระดับ = total ; เลือกหลายระดับ = ผลรวมของระดับนั้น', () => {
    const t = topic('x');
    expect(topicQuestionCount(t, [], 'bank')).toBe(10);
    expect(topicQuestionCount(t, ['easy'], 'bank')).toBe(5);
    expect(topicQuestionCount(t, ['easy', 'hard_challenge'], 'bank')).toBe(7);
    expect(topicQuestionCount(t, ['medium', 'hard_challenge'], 'bank')).toBe(5);
  });

  it('โหมด challenge ไม่สนตัวกรองความยาก (counts มีแค่ hardChallenge)', () => {
    const t = topic('x', { total: 3, counts: { hardChallenge: 3 } });
    expect(topicQuestionCount(t, ['easy'], 'challenge')).toBe(3);
  });

  it('รวมทุกบท / เฉพาะบทที่เลือก', () => {
    expect(selectedQuestionCount(groups, [], 'bank')).toBe(24);
    expect(selectedQuestionCount(groups, ['hard_challenge'], 'bank')).toBe(8);
    expect(selectedQuestionCount(groups, ['easy'], 'bank', new Set(['a', 'c']))).toBe(5);
  });
});

describe('lib/question-bank — กลุ่มและลำดับ', () => {
  it('ชื่อกลุ่มชั้น/เทอม', () => {
    expect(groupLabel({ gradeLabel: 'ม.4', term: 1 })).toBe('ม.4 เทอม 1');
    expect(groupLabel({ gradeLabel: 'ม.5', term: null })).toBe('ม.5');
    expect(groupLabel({ gradeLabel: null, term: 2 })).toBe('เทอม 2');
    expect(groupLabel({ gradeLabel: null, term: null })).toBe('อื่น ๆ');
    expect(groupLabel({ gradeLabel: '  ', term: 3 })).toBe('อื่น ๆ');
    // API ส่ง label มาแล้ว → ใช้ตามนั้น
    expect(groupLabel({ gradeLabel: 'ม.4', term: 1, label: 'ม.4 เทอม 1 (API)' })).toBe('ม.4 เทอม 1 (API)');
  });

  it('ความแม่นยำต่ำก่อน: บทที่ยังไม่มีข้อมูลไว้ท้าย ลำดับกลุ่มไม่เปลี่ยน', () => {
    const g: QbGroup[] = [
      {
        gradeLabel: 'ม.4',
        term: 1,
        topics: [topic('a', { accuracy: 91 }), topic('b', { accuracy: null }), topic('c', { accuracy: 40 })],
      },
      groups[1],
    ];
    const sorted = sortGroups(g, 'accuracy_low');
    expect(sorted[0].topics.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(sorted[1]).toEqual(groups[1]);
  });

  it('ทำน้อยก่อน: สัดส่วน answered/total น้อย → มาก', () => {
    const g: QbGroup[] = [
      {
        gradeLabel: null,
        term: null,
        topics: [topic('a', { answered: 5 }), topic('b', { answered: 0 }), topic('c', { answered: 9 })],
      },
    ];
    expect(sortGroups(g, 'least_done')[0].topics.map((t) => t.id)).toEqual(['b', 'a', 'c']);
    expect(sortGroups(g, 'normal')).toBe(g);
  });

  it('ระดับสีความแม่นยำ + ความแม่นยำรวมถ่วงด้วยจำนวนข้อที่ทำ', () => {
    expect(accuracyTone(null)).toBe('none');
    expect(accuracyTone(91)).toBe('good');
    expect(accuracyTone(68)).toBe('fair');
    expect(accuracyTone(30)).toBe('low');
    // (91*9 + 50*2) / 11 = 83.6
    expect(weightedAccuracy(groups.flatMap((g) => g.topics))).toBe(84);
    expect(weightedAccuracy([topic('x')])).toBeNull();
  });
});

describe('lib/question-bank — การ์ดและกราฟ', () => {
  it('ข้อความบนการ์ด: สีเข้มใช้ตัวอักษรขาว สีสว่างใช้ตัวอักษรเข้ม', () => {
    expect(cardTextTone('#4f46e5')).toBe('light');
    expect(cardTextTone('#facc15')).toBe('dark');
    expect(cardTextTone('not-a-color')).toBe('light');
  });

  it('ป้ายสัปดาห์เป็นวันที่ไทยแบบสั้น', () => {
    expect(formatWeekLabel('2026-11-09')).toBe('9 พ.ย.');
    expect(formatWeekLabel('2026-01-05T00:00:00+07:00')).toBe('5 ม.ค.');
    expect(formatWeekLabel('xx')).toBe('xx');
  });

  it('ข้อความสรุปกราฟสำหรับ screen reader', () => {
    expect(weeklySummary([])).toBe('ยังไม่มีข้อมูลการทำข้อสอบ');
    expect(weeklySummary([{ weekStart: '2026-11-02', correct: 0, wrong: 0 }])).toBe('1 สัปดาห์ล่าสุด ยังไม่มีการตอบข้อ');
    const text = weeklySummary([
      { weekStart: '2026-10-26', correct: 3, wrong: 1 },
      { weekStart: '2026-11-02', correct: 10, wrong: 2 },
      { weekStart: '2026-11-09', correct: 4, wrong: 3 },
    ]);
    expect(text).toContain('3 สัปดาห์ล่าสุด ตอบทั้งหมด 23 ข้อ ถูก 17 ข้อ ผิด 6 ข้อ');
    expect(text).toContain('สัปดาห์เริ่ม 2 พ.ย. (12 ข้อ)');
    expect(text).toContain('สัปดาห์นี้ถูก 4 ข้อ ผิด 3 ข้อ');
  });
});

describe('lib/question-bank — ลิงก์หน้าฝึก', () => {
  it('practiceHref ↔ parsePracticeParams ไปกลับได้ และส่งเฉพาะค่าที่ไม่ใช่ค่าเริ่มต้น', () => {
    const href = practiceHref({
      subjectId: 's1',
      mode: 'bank',
      topicIds: ['t1', 't2'],
      difficulties: ['easy', 'hard_challenge'],
      progress: 'undone',
    });
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/practice/bank');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      subject: 's1',
      mode: 'bank',
      topics: 't1,t2',
      diff: 'easy,hard_challenge',
      progress: 'undone',
    });
    expect(parsePracticeParams(url.searchParams)).toEqual({
      subjectId: 's1',
      mode: 'bank',
      topicIds: ['t1', 't2'],
      difficulties: ['easy', 'hard_challenge'],
      progress: 'undone',
    });
    expect(practiceHref({ subjectId: 's1', mode: 'challenge', topicIds: [], difficulties: ['easy'], progress: 'all' })).toBe(
      '/practice/bank?subject=s1&mode=challenge',
    );
  });

  it('parsePracticeParams: ไม่มี subject = null ; ค่าแปลกถูกตัด ; challenge ไม่มีตัวกรองความยาก', () => {
    expect(parsePracticeParams(new URLSearchParams('mode=bank'))).toBeNull();
    expect(parsePracticeParams(new URLSearchParams('subject=s&mode=xx&diff=hard,easy&progress=bad'))).toEqual({
      subjectId: 's',
      mode: 'bank',
      topicIds: [],
      difficulties: ['easy'],
      progress: 'all',
    });
    expect(parsePracticeParams(new URLSearchParams('subject=s&mode=challenge&diff=easy'))?.difficulties).toEqual([]);
  });

  it('session key เท่ากันเมื่อเลือกบทเดียวกัน (ลำดับต่างได้) และต่างเมื่อตัวกรองต่าง', () => {
    const base = { subjectId: 's', mode: 'bank' as const, topicIds: ['a', 'b'], difficulties: [], progress: 'all' as const };
    expect(practiceSessionKey(base)).toBe(practiceSessionKey({ ...base, topicIds: ['b', 'a'] }));
    expect(practiceSessionKey(base)).not.toBe(practiceSessionKey({ ...base, progress: 'wrong' }));
    expect(practiceSessionKey(base)).toMatch(/^bank_bank_s_/);
  });

  it('upgradeHref เลือกสนามไว้ให้', () => {
    expect(upgradeHref('netsat')).toBe('/upgrade?venue=netsat');
    expect(upgradeHref('a level')).toBe('/upgrade?venue=a%20level');
    expect(upgradeHref('')).toBe('/upgrade');
  });
});

describe('lib/question-bank — ตัดข้อที่ล็อกออกก่อนคิดคะแนน/ส่ง log', () => {
  it('ข้อที่ล็อกไม่อยู่ใน questionIds/answers/time และนับจำนวนไว้', () => {
    const q1 = { id: 'q1', locked: false } as Question;
    const locked = toLockedQuestion({ id: 'q2', topicId: 't' });
    const session = {
      id: 's',
      examId: 'bank_x',
      examTitle: '',
      category: 'general_knowledge',
      questionIds: ['q1', 'q2'],
      currentIndex: 1,
      answers: { q1: 'a' },
      markedForReview: ['q2'],
      timePerQuestion: { q1: 5, q2: 3 },
      startedAt: '',
      status: 'completed',
    } as ExamSession;
    const res = withoutLockedQuestions(session, [q1, locked]);
    expect(res.lockedCount).toBe(1);
    expect(res.session.questionIds).toEqual(['q1']);
    expect(res.session.timePerQuestion).toEqual({ q1: 5 });
    expect(res.session.markedForReview).toEqual([]);
    expect(res.questions).toEqual([q1]);
    // ไม่มีข้อที่ล็อก → คืนตัวเดิม
    expect(withoutLockedQuestions(session, [q1]).session).toBe(session);
  });
});
