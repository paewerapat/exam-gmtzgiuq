import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ getAdminExam: jest.fn(), updateExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({
  __esModule: true,
  default: () => <div data-testid="image-upload" />,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const Q1 = '11111111-1111-4111-8111-111111111111';
const Q2 = '22222222-2222-4222-8222-222222222222';
const Q3 = '33333333-3333-4333-8333-333333333333';

function shortAnswer(id: string, n: number) {
  return { id, question: `โจทย์ข้อ ${n}`, type: 'short_answer', correctAnswer: String(n), choices: [], passageId: null };
}

// response ตามสัญญา GET /exams/admin/:id (ฟิลด์ที่หน้านี้ใช้)
const exam = {
  id: 'exam-ids',
  title: 'ชุดรหัสข้อคงที่',
  description: '',
  category: 'tgat',
  status: 'draft',
  durationMinutes: null,
  subjectId: null,
  bannerImage: null,
  passages: [],
  questions: [shortAnswer(Q1, 1), shortAnswer(Q2, 2), shortAnswer(Q3, 3)],
};

async function renderPage() {
  (getAdminExam as jest.Mock).mockResolvedValue(exam);
  const user = userEvent.setup();
  render(<EditExamPage params={Promise.resolve({ id: exam.id })} />);
  await waitFor(() => expect(screen.getByDisplayValue('ชุดรหัสข้อคงที่')).toBeInTheDocument());
  return user;
}

async function saveAndGetQuestions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
  await waitFor(() => expect(updateExam).toHaveBeenCalled());
  return (updateExam as jest.Mock).mock.calls[0][1].questions as Record<string, unknown>[];
}

/** แถวหัวของ "ข้อที่ n" (มีปุ่มลบข้อ) */
const questionHeader = (n: number) => screen.getByText(`ข้อที่ ${n}`).closest('div.justify-between') as HTMLElement;

describe('EditExamPage — ส่ง id ของข้อเดิมกลับ (task 16 ส่วนที่ 1 / BUG-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('บันทึกโดยไม่แก้ → ส่ง id ทุกข้อตามลำดับเดิม', async () => {
    const user = await renderPage();
    const questions = await saveAndGetQuestions(user);
    expect(questions.map((q) => q.id)).toEqual([Q1, Q2, Q3]);
    expect(questions.map((q) => q.orderIndex)).toEqual([0, 1, 2]);
  });

  it('แก้ข้อ 1, ลบข้อ 2, เพิ่มข้อใหม่ → ข้อเดิมพา id ไปด้วย ข้อใหม่ไม่มี id และ orderIndex เรียงใหม่', async () => {
    const user = await renderPage();

    // แก้ข้อความข้อ 1
    await user.click(screen.getByText('ข้อที่ 1'));
    const q1Text = screen.getByDisplayValue('โจทย์ข้อ 1');
    await user.clear(q1Text);
    await user.type(q1Text, 'โจทย์ข้อ 1 แก้แล้ว');

    // ลบข้อ 2
    await user.click(within(questionHeader(2)).getByRole('button'));
    expect(screen.queryByText('ข้อที่ 3')).not.toBeInTheDocument();

    // เพิ่มข้อใหม่ (อัตนัย)
    await user.click(screen.getByRole('button', { name: /เพิ่มข้อใหม่/ }));
    await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
    await user.type(screen.getByPlaceholderText(/พิมพ์คำถาม/), 'โจทย์ใหม่');
    await user.type(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), '9');

    const questions = await saveAndGetQuestions(user);
    expect(questions).toHaveLength(3);
    expect(questions.map((q) => q.question)).toEqual(['โจทย์ข้อ 1 แก้แล้ว', 'โจทย์ข้อ 3', 'โจทย์ใหม่']);
    expect(questions[0].id).toBe(Q1);
    expect(questions[1].id).toBe(Q3);
    // ข้อใหม่ไม่ส่ง key id เลย (API สร้างใหม่) — ไม่ใช่ tempId ของฟอร์ม
    expect('id' in questions[2]).toBe(false);
    expect(questions.map((q) => q.orderIndex)).toEqual([0, 1, 2]);
  });

  it('ลบข้อแรก → ข้อที่เหลือยังส่ง id ของตัวเอง (ไม่เลื่อนตามตำแหน่ง)', async () => {
    const user = await renderPage();
    await user.click(within(questionHeader(1)).getByRole('button'));
    const questions = await saveAndGetQuestions(user);
    expect(questions.map((q) => [q.id, q.question, q.orderIndex])).toEqual([
      [Q2, 'โจทย์ข้อ 2', 0],
      [Q3, 'โจทย์ข้อ 3', 1],
    ]);
  });
});
