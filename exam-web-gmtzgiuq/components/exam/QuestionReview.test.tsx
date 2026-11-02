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

describe('QuestionReview — หลายรูปต่อข้อ + รูปในตัวเลือก (task 07 AC5)', () => {
  it('แสดงรูปโจทย์ทุกรูปและรูปตัวเลือก (รูปล้วน) พร้อมไฮไลต์ถูก/ผิด', async () => {
    const q: Question = {
      ...mcq('img', ['b']),
      questionImage: '/uploads/q1.png',
      questionImages: ['/uploads/q1.png', '/uploads/q2.png'],
      choices: ['a', 'b', 'c'].map((id) => ({
        id,
        text: id === 'c' ? 'ข้อความกับรูป' : '',
        isCorrect: id === 'b',
        image: `/uploads/choice-${id}.png`,
      })),
    };
    await renderOpen(q, 'a');
    expect(
      screen.getAllByRole('img', { name: /รูปประกอบโจทย์/ }).map((img) => img.getAttribute('src')),
    ).toEqual(['/uploads/q1.png', '/uploads/q2.png']);
    const choiceRow = (letter: string) => screen.getByRole('img', { name: `รูปตัวเลือก ${letter}` }).closest('div')!;
    expect(choiceRow('A').className).toContain('bg-red-100');
    expect(choiceRow('B').className).toContain('bg-green-100');
    expect(choiceRow('C')).toHaveTextContent('ข้อความกับรูป');
  });

  it('ข้อเก่าที่มีแค่ questionImage → รูปเดียว', async () => {
    await renderOpen({ ...mcq('old', ['a']), questionImage: '/uploads/old.png', questionImages: null }, 'a');
    const imgs = screen.getAllByRole('img', { name: /รูปประกอบโจทย์/ });
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', '/uploads/old.png');
  });
});

describe('QuestionReview — บทอ่านร่วม (task 08 AC7)', () => {
  it('ข้อที่ผูกบทอ่าน: กางข้อแล้วเห็นปุ่มบทอ่าน (พับไว้) กดแล้วเห็นเนื้อหา', async () => {
    const q: Question = {
      ...mcq('pq', ['a']),
      passageId: 'reading-1',
      passage: { id: 'reading-1', title: 'บทสนทนา', body: 'A: สวัสดี\nB: สวัสดีครับ', images: [] },
    };
    await renderOpen(q, 'a');
    const toggle = screen.getByRole('button', { name: 'บทอ่าน: บทสนทนา' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/สวัสดีครับ/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/สวัสดีครับ/)).toBeInTheDocument();
  });

  it('ข้อไม่มีบทอ่าน → ไม่มีปุ่มบทอ่าน', async () => {
    await renderOpen(mcq('plain', ['a']), 'a');
    expect(screen.queryByRole('button', { name: /^บทอ่าน/ })).not.toBeInTheDocument();
  });
});
