// QA task 06 — กรณีขอบของข้อที่ตอบถูกหลายตัว (คำตอบที่ server เก็บไว้ไม่ได้ normalize เสมอ, SEC-5)
import type { Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';
import {
  calculateExamResult,
  formatChoiceLetters,
  getAnswerStatus,
  isAnswerCorrect,
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

const multi = mcq('m', ['b', 'c', 'd']);
const single = mcq('s', ['c']);

describe('all-or-none: คำตอบที่เก็บไว้ไม่เป็นรูปมาตรฐาน', () => {
  it('ตัวคั่น/ช่องว่าง/ซ้ำ ไม่ทำให้ผลเปลี่ยน', () => {
    expect(isAnswerCorrect(multi, ',b,,c, d,')).toBe(true);
    expect(isAnswerCorrect(multi, 'b,b,c,d')).toBe(true);
    expect(getAnswerStatus(multi, ' , ')).toBe('unanswered');
  });

  it('ข้อถูกตัวเดียว: คำตอบเก่าที่ซ้ำ/มีช่องว่างยังถูก แต่เลือกเกินผิด', () => {
    expect(isAnswerCorrect(single, ' c ')).toBe(true);
    expect(isAnswerCorrect(single, 'c,c')).toBe(true);
    expect(isAnswerCorrect(single, 'c,d')).toBe(false);
  });

  it('เลือกครบชุดแต่ปน id ที่ไม่มีในตัวเลือก = ผิด', () => {
    expect(isAnswerCorrect(multi, 'b,c,d,z')).toBe(false);
  });

  it('toggle ทีละตัวจนครบแล้วยกเลิกตัวหนึ่ง ได้รูปมาตรฐานเสมอ', () => {
    let a = '';
    for (const id of ['d', 'b', 'e', 'c']) a = toggleChoiceAnswer(a, id);
    expect(a).toBe('b,c,d,e');
    a = toggleChoiceAnswer(a, 'e');
    expect(a).toBe('b,c,d');
    expect(isAnswerCorrect(multi, a)).toBe(true);
  });

  it('formatChoiceLetters แสดงตามตำแหน่งตัวเลือก ไม่ใช่ตาม id', () => {
    const q = mcq('x', ['a', 'c'], ['c', 'b', 'a']);
    expect(formatChoiceLetters(q, ['a', 'c'])).toBe('A, C');
  });

  it('calculateExamResult: ข้อหลายคำตอบที่ตอบ "," ล้วน นับเป็นไม่ตอบ', () => {
    const session: ExamSession = {
      id: 's1',
      examId: 'e1',
      examTitle: 't',
      category: 'general_knowledge',
      questionIds: ['m', 's'],
      currentIndex: 0,
      answers: { m: ',', s: 'c' },
      markedForReview: [],
      timePerQuestion: {},
      startedAt: new Date(0).toISOString(),
      status: 'completed',
    };
    const r = calculateExamResult(session, [multi, single]);
    expect(r.correctAnswers).toBe(1);
    expect(r.incorrectAnswers).toBe(0);
    expect(r.unanswered).toBe(1);
    expect(r.score).toBe(50);
  });
});
