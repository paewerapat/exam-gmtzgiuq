import { isAnswerCorrect } from '@/lib/exam-utils';
import type { Question } from '@/lib/api/questions';
// response จริงของ GET /exams/:id หลังนำเข้า fixture 01 แล้วเปลี่ยนเป็นเผยแพร่ (QA task 01, author ตัดฟิลด์ลับออกแล้ว)
import published from '@/lib/__fixtures__/qa-imported-exam-published.json';

const qs = [...published.questions].sort((a, b) => a.orderIndex - b.orderIndex) as unknown as Question[];

describe('ชุดที่นำเข้าแล้วเผยแพร่ — ตรวจคำตอบ (task 01 AC7)', () => {
  it('ได้ 7 ข้อเรียงตามลำดับในไฟล์', () => {
    expect(qs).toHaveLength(7);
    expect(published.questions.map((q) => q.orderIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('ข้อ 5 (อัตนัย) ตอบ 90 ถูก, 90.0 ถูก, 89 ผิด', () => {
    const q5 = qs[4];
    expect(q5.type).toBe('short_answer');
    expect(isAnswerCorrect(q5, '90')).toBe(true);
    expect(isAnswerCorrect(q5, ' 90 ')).toBe(true);
    expect(isAnswerCorrect(q5, '90.0')).toBe(true);
    expect(isAnswerCorrect(q5, '89')).toBe(false);
  });

  it('ข้อ 1 ปรนัย ตอบ d ถูก (correct = D), ตอบ a ผิด; ข้อ 6 ตอบ c ถูก', () => {
    expect(isAnswerCorrect(qs[0], 'd')).toBe(true);
    expect(isAnswerCorrect(qs[0], 'a')).toBe(false);
    expect(isAnswerCorrect(qs[5], 'c')).toBe(true);
  });

  it('ข้อ 1 hint มี 2 บรรทัด และข้อ 4 โจทย์มีตาราง Markdown', () => {
    expect(qs[0].hint?.split('\n')).toHaveLength(2);
    expect(qs[3].question).toMatch(/\n\|---\|---\|\n/);
  });
});
