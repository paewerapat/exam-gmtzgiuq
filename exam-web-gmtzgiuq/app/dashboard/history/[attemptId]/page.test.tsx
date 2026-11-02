import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttemptDetailPage from './page';
import { getMyAttempt, type ExamAttempt } from '@/lib/api/attempts';
import { getPublicExam } from '@/lib/api/exams';
import type { Question } from '@/lib/api/questions';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/attempts', () => ({ getMyAttempt: jest.fn() }));
jest.mock('@/lib/api/exams', () => ({ getPublicExam: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function question(partial: Partial<Question> & Pick<Question, 'id' | 'question' | 'choices'>): Question {
  return {
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

// ข้อ 1: 2 รูป + ตัวเลือกรูปล้วน (ไม่มีคำอธิบาย) / ข้อ 2: ข้อเก่ารูปเดียว ข้อความล้วน
const q1 = question({
  id: 'q1',
  question: 'ข้อใดต่อจากรูป',
  questionImage: '/uploads/q1-a.png',
  questionImages: ['/uploads/q1-a.png', '/uploads/q1-b.png'],
  choices: ['a', 'b', 'c'].map((id) => ({ id, text: '', isCorrect: id === 'b', image: `/uploads/c-${id}.png` })),
});
const q2 = question({
  id: 'q2',
  question: 'ข้อเก่า',
  questionImage: '/uploads/old.png',
  questionImages: null,
  explanation: 'คำอธิบายข้อ 2',
  choices: [
    { id: 'a', text: 'หนึ่ง', isCorrect: true },
    { id: 'b', text: 'สอง', isCorrect: false },
  ],
});

const attempt = {
  id: 'att-1',
  examId: 'exam-1',
  examTitle: 'ชุดรูป',
  category: 'general_knowledge',
  totalQuestions: 2,
  correctAnswers: 1,
  incorrectAnswers: 1,
  unanswered: 0,
  score: 50,
  totalTime: 60,
  timePerQuestion: {},
  answers: { q1: 'c', q2: 'a' },
  questionIds: ['q1', 'q2'],
  currentIndex: 1,
  status: 'completed',
  mode: 'practice',
  startedAt: '2026-11-01T00:00:00.000Z',
  completedAt: '2026-11-01T00:01:00.000Z',
} as unknown as ExamAttempt;

describe('AttemptDetailPage — รูปโจทย์หลายรูป + รูปตัวเลือก (task 07 AC5)', () => {
  beforeEach(() => {
    (getMyAttempt as jest.Mock).mockResolvedValue(attempt);
    (getPublicExam as jest.Mock).mockResolvedValue({ id: 'exam-1', title: 'ชุดรูป', questions: [q1, q2] });
  });

  it('ช่องเฉลย/คำตอบแสดงรูปตัวเลือก และกด View เห็นรูปโจทย์ทุกรูป + ตัวเลือกพร้อมไฮไลต์', async () => {
    const user = userEvent.setup();
    render(<AttemptDetailPage params={Promise.resolve({ attemptId: 'att-1' })} />);
    const row1 = (await screen.findByText('ข้อใดต่อจากรูป')).closest('tr')!;

    // ตัวเลือกรูปล้วน: ช่องเฉลยแสดง B + รูป, ช่องคำตอบแสดง C + รูป
    expect(within(row1).getByRole('img', { name: 'รูปตัวเลือก B' })).toHaveAttribute('src', '/uploads/c-b.png');
    expect(within(row1).getByRole('img', { name: 'รูปตัวเลือก C' })).toHaveAttribute('src', '/uploads/c-c.png');

    // ไม่มีคำอธิบายแต่มีรูป → ยังกด View ได้
    await user.click(within(row1).getByRole('button', { name: 'View' }));
    expect(
      screen.getAllByRole('img', { name: /รูปประกอบโจทย์/ }).map((img) => img.getAttribute('src')),
    ).toEqual(['/uploads/q1-a.png', '/uploads/q1-b.png']);
    const expandedRow = row1.nextElementSibling as HTMLElement;
    const choiceBox = (letter: string) =>
      within(expandedRow).getByRole('img', { name: `รูปตัวเลือก ${letter}` }).closest('div.flex')!;
    expect(choiceBox('B').className).toContain('border-green-300');
    expect(choiceBox('C').className).toContain('border-red-300');
    expect(choiceBox('C')).toHaveTextContent('คำตอบของคุณ');
    expect(within(expandedRow).queryByText('คำอธิบาย')).not.toBeInTheDocument();
  });

  it('ข้อเก่ารูปเดียว: View แสดงรูปเดียว + คำอธิบาย ไม่มีรายการรูปตัวเลือก', async () => {
    const user = userEvent.setup();
    render(<AttemptDetailPage params={Promise.resolve({ attemptId: 'att-1' })} />);
    const row2 = (await screen.findByText('ข้อเก่า')).closest('tr')!;
    expect(within(row2).getAllByText('หนึ่ง').length).toBeGreaterThan(0);
    await user.click(within(row2).getByRole('button', { name: 'View' }));
    const expandedRow = row2.nextElementSibling as HTMLElement;
    const imgs = within(expandedRow).getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', '/uploads/old.png');
    expect(within(expandedRow).getByText('คำอธิบายข้อ 2')).toBeInTheDocument();
  });
});

describe('AttemptDetailPage — บทอ่านร่วม (task 08 AC7)', () => {
  it('API /exams/:id คืน passages + passageId (ไม่มี passage) → View เห็นบทอ่านแบบพับได้', async () => {
    const withPassage = question({
      id: 'q1',
      question: 'ข้อใดถูกตามบทอ่าน',
      passageId: 'reading-1',
      choices: [
        { id: 'a', text: 'หนึ่ง', isCorrect: true },
        { id: 'b', text: 'สอง', isCorrect: false },
      ],
    });
    const plain = question({ id: 'q2', question: 'ข้อไม่มีบทอ่าน', choices: withPassage.choices });
    (getMyAttempt as jest.Mock).mockResolvedValue(attempt);
    (getPublicExam as jest.Mock).mockResolvedValue({
      id: 'exam-1',
      title: 'ชุดบทอ่าน',
      passages: [{ id: 'reading-1', title: 'บทความเรื่องน้ำ', body: 'น้ำเป็นสิ่งจำเป็น', images: [] }],
      questions: [withPassage, plain],
    });
    const user = userEvent.setup();
    render(<AttemptDetailPage params={Promise.resolve({ attemptId: 'att-1' })} />);

    const row1 = (await screen.findByText('ข้อใดถูกตามบทอ่าน')).closest('tr')!;
    // ไม่มีคำอธิบาย/รูป แต่มีบทอ่าน → กด View ได้
    await user.click(within(row1).getByRole('button', { name: 'View' }));
    const expandedRow = row1.nextElementSibling as HTMLElement;
    await user.click(within(expandedRow).getByRole('button', { name: 'บทอ่าน: บทความเรื่องน้ำ' }));
    expect(within(expandedRow).getByText('น้ำเป็นสิ่งจำเป็น')).toBeInTheDocument();

    // ข้อไม่มีบทอ่าน/คำอธิบาย/รูป → ไม่มีปุ่ม View
    const row2 = screen.getByText('ข้อไม่มีบทอ่าน').closest('tr')!;
    expect(within(row2).queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });
});
