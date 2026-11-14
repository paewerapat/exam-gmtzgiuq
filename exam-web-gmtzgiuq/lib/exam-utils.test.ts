import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';
import {
  calculateExamResult,
  formatChoiceAnswer,
  formatChoiceLetters,
  getAnswerStatus,
  getCorrectChoiceId,
  getCorrectChoiceIds,
  backendResumeTiming,
  hasSessionProgress,
  isAnswerCorrect,
  isMultiAnswer,
  nextChoiceId,
  parseChoiceAnswer,
  sameQuestionSet,
  toggleChoiceAnswer,
  withCurrentQuestionTime,
} from '@/lib/exam-utils';

function mcq(id: string, correctIds: string[], ids = ['a', 'b', 'c', 'd', 'e']): Question {
  return {
    id,
    question: `ข้อ ${id}`,
    choices: ids.map((c) => ({ id: c, text: `ตัวเลือก ${c}`, isCorrect: correctIds.includes(c) })),
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

function session(questionIds: string[], answers: Record<string, string>): ExamSession {
  return {
    id: 's1',
    examId: 'e1',
    examTitle: 'ชุดทดสอบ',
    category: 'general_knowledge',
    questionIds,
    currentIndex: 0,
    answers,
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date(0).toISOString(),
    status: 'completed',
  };
}

const multi = mcq('m', ['b', 'c', 'd']);
const single = mcq('s', ['c']);

describe('parseChoiceAnswer / formatChoiceAnswer / toggleChoiceAnswer', () => {
  it('parse: เรียง ตัดซ้ำ ตัดค่าว่าง/ช่องว่าง', () => {
    expect(parseChoiceAnswer('d,c,b')).toEqual(['b', 'c', 'd']);
    expect(parseChoiceAnswer(' b , b,,c ')).toEqual(['b', 'c']);
    expect(parseChoiceAnswer('c')).toEqual(['c']);
    expect(parseChoiceAnswer('')).toEqual([]);
    expect(parseChoiceAnswer(undefined)).toEqual([]);
    expect(parseChoiceAnswer(',')).toEqual([]);
  });

  it('format: "b,c,d" ไม่มีช่องว่าง เรียงตามตัวอักษร', () => {
    expect(formatChoiceAnswer(['d', 'b', 'c', 'b', ''])).toBe('b,c,d');
    expect(formatChoiceAnswer([])).toBe('');
  });

  it('toggle: เพิ่ม/ยกเลิก เลือกออกหมดได้ ""', () => {
    expect(toggleChoiceAnswer(undefined, 'c')).toBe('c');
    expect(toggleChoiceAnswer('c', 'b')).toBe('b,c');
    expect(toggleChoiceAnswer('b,c', 'd')).toBe('b,c,d');
    expect(toggleChoiceAnswer('b,c,d', 'c')).toBe('b,d');
    expect(toggleChoiceAnswer('b', 'b')).toBe('');
  });
});

describe('getCorrectChoiceIds / isMultiAnswer / formatChoiceLetters', () => {
  it('ข้อถูกหลายตัว', () => {
    expect(getCorrectChoiceIds(multi)).toEqual(['b', 'c', 'd']);
    expect(isMultiAnswer(multi)).toBe(true);
    expect(getCorrectChoiceId(multi)).toBe('b'); // ของเดิมยังคืนตัวแรก
  });

  it('ข้อถูกตัวเดียว / อัตนัย ไม่ใช่ข้อหลายคำตอบ', () => {
    expect(isMultiAnswer(single)).toBe(false);
    expect(isMultiAnswer({ ...multi, type: 'short_answer' })).toBe(false);
  });

  it('เงื่อนไขเดียวกับ isAnswerCorrect: type อื่นที่ไม่ใช่ short_answer ก็เป็นข้อหลายคำตอบได้', () => {
    const tf = { ...multi, type: 'true_false' as const };
    expect(isMultiAnswer(tf)).toBe(true);
    expect(isAnswerCorrect(tf, 'b,c,d')).toBe(true);
    expect(isAnswerCorrect(tf, 'b')).toBe(false);
  });

  it('nextChoiceId: ตัวอักษรแรกที่ว่าง ไม่ซ้ำหลังลบ เต็มแล้ว = null', () => {
    const ids = (s: string) => s.split('').map((id) => ({ id }));
    expect(nextChoiceId(ids('abcd'))).toBe('e');
    expect(nextChoiceId(ids('acd'))).toBe('b');
    expect(nextChoiceId(ids('abcdef'))).toBeNull();
    expect(nextChoiceId([])).toBe('a');
  });

  it('ตัวอักษรตามตำแหน่งตัวเลือก เรียงตามตำแหน่ง', () => {
    expect(formatChoiceLetters(multi, ['d', 'b', 'c'])).toBe('B, C, D');
    // id ไม่ตรงลำดับตัวอักษร → ใช้ตำแหน่งที่นักเรียนเห็น
    const shuffled = mcq('x', ['a'], ['c', 'a', 'b']);
    expect(formatChoiceLetters(shuffled, ['a'])).toBe('B');
  });
});

describe('isAnswerCorrect — all-or-none (AC1)', () => {
  it('ข้อถูก b,c,d', () => {
    expect(isAnswerCorrect(multi, 'b,c,d')).toBe(true);
    expect(isAnswerCorrect(multi, 'd,c,b')).toBe(true);
    expect(isAnswerCorrect(multi, 'b,c')).toBe(false);
    expect(isAnswerCorrect(multi, 'b,c,d,e')).toBe(false);
    expect(isAnswerCorrect(multi, 'b')).toBe(false);
    expect(isAnswerCorrect(multi, '')).toBe(false);
  });

  it('"" ไม่นับว่าตอบ', () => {
    expect(getAnswerStatus(multi, '')).toBe('unanswered');
    expect(getAnswerStatus(multi, undefined)).toBe('unanswered');
    expect(getAnswerStatus(multi, ',')).toBe('unanswered');
    expect(getAnswerStatus(multi, 'b,c')).toBe('incorrect');
    expect(getAnswerStatus(multi, 'b,c,d')).toBe('correct');
  });

  it('ข้อถูกตัวเดียว c — ผลเดิมไม่เปลี่ยน', () => {
    expect(isAnswerCorrect(single, 'c')).toBe(true);
    expect(isAnswerCorrect(single, 'b')).toBe(false);
    expect(isAnswerCorrect(single, 'b,c')).toBe(false);
  });

  it('ข้อที่ไม่มีเฉลยเลย ไม่มีคำตอบไหนถูก', () => {
    const none = mcq('n', []);
    expect(isAnswerCorrect(none, 'a')).toBe(false);
    expect(isAnswerCorrect(none, '')).toBe(false);
  });
});

describe('calculateExamResult — ผสมข้อปกติกับข้อหลายคำตอบ', () => {
  const m2 = mcq('m2', ['a', 'e']);
  const s2 = mcq('s2', ['a']);
  const questions = [multi, single, m2, s2, mcq('u', ['b'])];

  it('นับถูก/ผิด/ไม่ตอบ ถูกต้อง', () => {
    const result = calculateExamResult(
      session(['m', 's', 'm2', 's2', 'u'], {
        m: 'b,c,d', // ถูก
        s: 'c', // ถูก
        m2: 'a', // ขาด → ผิด
        s2: 'b', // ผิด
        // u ไม่ตอบ
      }),
      questions,
    );
    expect(result.totalQuestions).toBe(5);
    expect(result.correctAnswers).toBe(2);
    expect(result.incorrectAnswers).toBe(2);
    expect(result.unanswered).toBe(1);
    expect(result.score).toBe(40);
    expect(result.incorrectQuestionIds).toEqual(['m2', 's2', 'u']);
  });
});

describe('withCurrentQuestionTime — นับเวลาข้อที่เปิดอยู่ตอนส่ง (BUG-22)', () => {
  it('ชุด 1 ข้อที่ยังไม่เคยเปลี่ยนข้อ → เวลาที่ใช้ไม่เป็น 0', () => {
    const s = session(['s'], { s: 'c' });
    expect(calculateExamResult(s, [single]).totalTime).toBe(0);
    const flushed = withCurrentQuestionTime(s, 15);
    expect(flushed.timePerQuestion).toEqual({ s: 15 });
    expect(calculateExamResult(flushed, [single]).totalTime).toBe(15);
    // ไม่แก้ object เดิม
    expect(s.timePerQuestion).toEqual({});
  });

  it('หลายข้อ: เขียนทับเฉพาะข้อปัจจุบัน (currentTimer สะสมจากค่าที่เคยบันทึก) ข้ออื่นคงเดิม เรียกซ้ำผลเท่าเดิม', () => {
    const s = { ...session(['m', 's'], {}), currentIndex: 1, timePerQuestion: { m: 7, s: 4 } };
    const once = withCurrentQuestionTime(s, 10);
    expect(once.timePerQuestion).toEqual({ m: 7, s: 10 });
    expect(withCurrentQuestionTime(once, 10)).toBe(once);
    expect(calculateExamResult(once, [multi, single]).totalTime).toBe(17);
  });

  it('currentTimer น้อยกว่าค่าที่บันทึกไว้ (state ยังไม่ sync) → ไม่ลดเวลา', () => {
    const s = { ...session(['s'], {}), timePerQuestion: { s: 9 } };
    expect(withCurrentQuestionTime(s, 0)).toBe(s);
  });

  it('ไม่มีข้อปัจจุบัน / เวลาไม่ใช่ตัวเลข → คืน session เดิม', () => {
    const empty = session([], {});
    expect(withCurrentQuestionTime(empty, 5)).toBe(empty);
    const s = session(['s'], {});
    expect(withCurrentQuestionTime(s, Number.NaN)).toBe(s);
  });
});

describe('hasSessionProgress (task 21 Q1/Q2)', () => {
  it('ข้อแรกและยังไม่ตอบ → false / ตอบแล้วหรือเลื่อนข้อแล้ว → true', () => {
    expect(hasSessionProgress(null)).toBe(false);
    expect(hasSessionProgress(undefined)).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: {} })).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: null })).toBe(false);
    expect(hasSessionProgress({})).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: 'a' } })).toBe(true);
    expect(hasSessionProgress({ currentIndex: 2, answers: {} })).toBe(true);
  });
  it('M4: คำตอบว่าง (สตริงว่าง / null / undefined / array ว่าง) ไม่นับ — ตรงกับ isUntouched ของ API', () => {
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: '' } })).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: null } })).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: undefined } })).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: [] } })).toBe(false);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: '', q2: 'b' } })).toBe(true);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: ['a'] } })).toBe(true);
    expect(hasSessionProgress({ currentIndex: 0, answers: { q1: '0' } })).toBe(true);
  });
});

describe('sameQuestionSet (task 21 M1)', () => {
  const qs = (...ids: string[]) => ids.map((id) => ({ id }));
  it('id ครบเท่ากัน (ลำดับต่างได้) → true / เพิ่ม ลบ เปลี่ยนข้อ / ว่าง → false', () => {
    expect(sameQuestionSet(['a', 'b'], qs('a', 'b'))).toBe(true);
    expect(sameQuestionSet(['b', 'a'], qs('a', 'b'))).toBe(true);
    expect(sameQuestionSet(['a'], qs('a', 'b'))).toBe(false);
    expect(sameQuestionSet(['a', 'b'], qs('a'))).toBe(false);
    expect(sameQuestionSet(['a', 'x'], qs('a', 'b'))).toBe(false);
    expect(sameQuestionSet(['a', 'a'], qs('a', 'b'))).toBe(false);
    expect(sameQuestionSet([], qs())).toBe(false);
    expect(sameQuestionSet(null, qs('a'))).toBe(false);
  });
});

describe('backendResumeTiming (task 21 M2)', () => {
  const now = Date.parse('2026-11-14T10:00:00.000Z');
  const startedAt = '2026-11-14T08:00:00.000Z'; // 2 ชั่วโมงก่อน
  const remainingAt = (t: ReturnType<typeof backendResumeTiming>, nowMs: number) =>
    (Date.parse(t.startedAt) + (t.durationSeconds ?? 0) * 1000 + t.totalPausedMs - nowMs) / 1000;

  it('เหลือเวลาบางส่วน: เวลาที่เหลือ = duration − ผลรวม timePerQuestion ไม่นับช่วงปิดหน้า ; startedAt เดิม', () => {
    const t = backendResumeTiming({ durationSeconds: 3600, startedAt, timePerQuestion: { q1: 400, q2: 200 }, nowMs: now });
    expect(t.startedAt).toBe(startedAt);
    expect(t.durationSeconds).toBe(3600);
    expect(t.remainingSeconds).toBe(3000);
    // สูตรเดียวกับ ExamContainer ให้ผลตรงกัน
    expect(remainingAt(t, now)).toBe(3000);
    // ผ่านไป 10 วินาที → เหลือ 2990
    expect(remainingAt(t, now + 10_000)).toBe(2990);
  });

  it('ใช้เวลาครบ/เกินแล้ว → remainingSeconds ≤ 0', () => {
    expect(backendResumeTiming({ durationSeconds: 600, startedAt, timePerQuestion: { q1: 600 }, nowMs: now }).remainingSeconds).toBe(0);
    expect(backendResumeTiming({ durationSeconds: 600, startedAt, timePerQuestion: { q1: 700 }, nowMs: now }).remainingSeconds).toBe(-100);
  });

  it('ไม่มี duration → นับขึ้น (remaining null, ไม่มี paused) ; ค่า timePerQuestion ที่ผิดไม่นับ', () => {
    const t = backendResumeTiming({ durationSeconds: null, startedAt, timePerQuestion: { q1: 50 }, nowMs: now });
    expect(t).toEqual({ startedAt, durationSeconds: null, totalPausedMs: 0, remainingSeconds: null });
    const odd = backendResumeTiming({
      durationSeconds: 100,
      startedAt,
      timePerQuestion: { a: -5, b: Number.NaN, c: 30 } as Record<string, number>,
      nowMs: now,
    });
    expect(odd.remainingSeconds).toBe(70);
  });

  it('startedAt ใช้ไม่ได้ → ตั้ง startedAt = now − เวลาที่ใช้ไป', () => {
    const t = backendResumeTiming({ durationSeconds: 100, startedAt: 'xx', timePerQuestion: { q1: 30 }, nowMs: now });
    expect(t.startedAt).toBe(new Date(now - 30_000).toISOString());
    expect(t.totalPausedMs).toBe(0);
    expect(remainingAt(t, now)).toBe(70);
  });
});
