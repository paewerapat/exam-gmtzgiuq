import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';
import {
  calculateExamResult,
  formatChoiceAnswer,
  formatChoiceLetters,
  getAnswerStatus,
  getCorrectChoiceId,
  getCorrectChoiceIds,
  isAnswerCorrect,
  isMultiAnswer,
  nextChoiceId,
  parseChoiceAnswer,
  toggleChoiceAnswer,
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
