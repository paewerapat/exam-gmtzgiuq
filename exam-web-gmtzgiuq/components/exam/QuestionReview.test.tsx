import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionReview from './QuestionReview';
import type { Question } from '@/lib/api/questions';

const THAI = ['ก', 'ข', 'ค', 'ง', 'จ'];

function mcq(id: string, correctIds: string[]): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    choices: ['a', 'b', 'c', 'd', 'e'].map((c, i) => ({
      id: c,
      text: `ตัวเลือก ${THAI[i]}`,
      isCorrect: correctIds.includes(c),
    })),
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
  };
}

async function renderOpen(question: Question, userAnswer: string | undefined) {
  render(<QuestionReview question={question} userAnswer={userAnswer} questionNumber={1} />);
  await userEvent.click(screen.getByRole('button'));
}

const row = (thai: string) => screen.getByText(`ตัวเลือก ${thai}`).closest('div')!;

describe('QuestionReview — ข้อที่ตอบถูกหลายตัว (task 06 AC4)', () => {
  it('ตอบครบชุด → ถูกต้อง แสดงคำตอบของคุณ/คำตอบที่ถูกเป็นตัวอักษร', async () => {
    await renderOpen(mcq('m', ['b', 'c', 'd']), 'b,c,d');
    expect(screen.getByText('ถูกต้อง')).toBeInTheDocument();
    expect(screen.getByText(/คำตอบของคุณ/)).toHaveTextContent('คำตอบของคุณ: B, C, D');
    expect(screen.getByText(/คำตอบที่ถูก:/)).toHaveTextContent('คำตอบที่ถูก: B, C, D');
  });

  it('ตอบไม่ครบ → ไม่ถูกต้อง แยกตัวที่ถูกแต่ไม่ได้เลือก และตัวที่เลือกผิด', async () => {
    await renderOpen(mcq('m', ['b', 'c', 'd']), 'c,e');
    expect(screen.getByText('ไม่ถูกต้อง')).toBeInTheDocument();
    expect(screen.getByText(/คำตอบของคุณ/)).toHaveTextContent('คำตอบของคุณ: C, E');
    expect(screen.getByText(/คำตอบที่ถูก:/)).toHaveTextContent('คำตอบที่ถูก: B, C, D');
    expect(screen.getAllByText('ข้อที่ถูก (ไม่ได้เลือก)')).toHaveLength(2);
    expect(row('ค').className).toContain('bg-green-100');
    expect(row('จ').className).toContain('bg-red-100');
    expect(row('ข').className).toContain('border-dashed');
  });

  it('ข้อถูกตัวเดียว: แสดงเหมือนเดิม (ไม่มีบรรทัดคำตอบ/ป้ายหลายข้อ)', async () => {
    await renderOpen(mcq('s', ['c']), 'b');
    expect(screen.getByText('ไม่ถูกต้อง')).toBeInTheDocument();
    expect(screen.queryByText(/คำตอบของคุณ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/เลือกได้มากกว่า 1 ข้อ/)).not.toBeInTheDocument();
    expect(screen.queryByText('ข้อที่ถูก (ไม่ได้เลือก)')).not.toBeInTheDocument();
    expect(row('ค').className).toContain('bg-green-100');
    expect(row('ข').className).toContain('bg-red-100');
  });

  it('ข้อถูกตัวเดียวตอบถูก / ไม่ได้ตอบ', async () => {
    const { unmount } = render(<QuestionReview question={mcq('s', ['c'])} userAnswer="c" questionNumber={1} />);
    expect(screen.getByText('ถูกต้อง')).toBeInTheDocument();
    unmount();
    render(<QuestionReview question={mcq('m', ['b', 'c'])} userAnswer={undefined} questionNumber={2} />);
    expect(screen.getAllByText('ไม่ได้ตอบ').length).toBeGreaterThan(0);
  });
});
