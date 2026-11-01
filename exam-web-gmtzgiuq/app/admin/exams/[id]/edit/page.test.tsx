import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
// response จริงของ GET /exams/admin/:id ของชุดที่นำเข้าจาก zip ที่มีข้อผิดพลาด (QA task 01, author ตัดฟิลด์ลับออกแล้ว)
// ข้อ 1 correct ไม่ตรง label (ไม่มี isCorrect), ข้อ 2 มีตัวเลือกเดียว, ข้อ 4 correct ว่าง, ข้อ 5 อัตนัย correctAnswer ว่าง, ข้อ 6–7 ไม่มี topicId
import problems from '@/lib/__fixtures__/qa-imported-exam-problems-draft.json';

const push = jest.fn();
// router ต้องเป็น object เดิมทุก render เหมือนของจริง ไม่งั้น effect โหลดข้อสอบ ([examId, router]) รันซ้ำแล้วรีเซ็ตฟอร์ม
const mockRouter = { push };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ getAdminExam: jest.fn(), updateExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({
  __esModule: true,
  default: ({ value }: { value?: string }) => <div data-testid="image-upload">{value}</div>,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('EditExamPage — เปิดชุดที่นำเข้า (task 01 AC7 / หน้าแก้ไข)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAdminExam as jest.Mock).mockResolvedValue(problems);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'A-LEVEL MATH', slug: 'a-level-math', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('โหลดชุดที่มีข้อไม่มีเฉลย/ไม่มี topic ได้โดยไม่ crash และไม่ redirect ออก', async () => {
    render(<EditExamPage params={Promise.resolve({ id: problems.id })} />);
    await waitFor(() => expect(screen.getByDisplayValue(problems.title)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    expect(updateExam).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('คำอธิบายและคำใบ้เขียนโดย AI ไม่ใช่เฉลยทางการ')).toBeInTheDocument();
  });
});

describe('EditExamPage — ติ๊กคำตอบที่ถูกได้หลายตัว (task 06 AC5)', () => {
  const multiExam = {
    id: 'exam-multi',
    title: 'ชุด TGAT3',
    description: '',
    category: 'a-level-math',
    status: 'draft',
    durationMinutes: null,
    subjectId: null,
    bannerImage: null,
    questions: [
      {
        id: 'q1',
        question: 'ข้อใดถูก (ตอบได้มากกว่า 1 ข้อ)',
        type: 'multiple_choice',
        choices: [
          { id: 'a', text: 'หนึ่ง', isCorrect: false },
          { id: 'b', text: 'สอง', isCorrect: true },
          { id: 'c', text: 'สาม', isCorrect: true },
          { id: 'd', text: 'สี่', isCorrect: false },
        ],
        explanation: 'เฉลย',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAdminExam as jest.Mock).mockResolvedValue(multiExam);
    (updateExam as jest.Mock).mockResolvedValue({});
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'A-LEVEL MATH', slug: 'a-level-math', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  async function openQuestion() {
    render(<EditExamPage params={Promise.resolve({ id: multiExam.id })} />);
    await waitFor(() => expect(screen.getByDisplayValue('ชุด TGAT3')).toBeInTheDocument());
    await userEvent.click(screen.getByText('ข้อที่ 1'));
  }
  const box = (letter: string) => screen.getByRole('checkbox', { name: `ตัวเลือก ${letter} เป็นคำตอบที่ถูก` });

  it('เปิดแก้ไขแล้วติ๊กครบตามที่บันทึก ติ๊กเพิ่มได้โดยตัวอื่นไม่หลุด แล้วบันทึกส่งครบ', async () => {
    await openQuestion();
    expect(box('A')).not.toBeChecked();
    expect(box('B')).toBeChecked();
    expect(box('C')).toBeChecked();
    expect(screen.getByText('ถ้าติ๊กหลายข้อ นักเรียนต้องเลือกครบทุกข้อที่ถูกจึงได้คะแนน')).toBeInTheDocument();

    await userEvent.click(box('D'));
    expect(box('B')).toBeChecked();
    expect(box('C')).toBeChecked();
    expect(box('D')).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    const payload = (updateExam as jest.Mock).mock.calls[0][1];
    expect(payload.questions[0].choices.filter((c: { isCorrect: boolean }) => c.isCorrect).map((c: { id: string }) => c.id))
      .toEqual(['b', 'c', 'd']);
  });

  async function saveAndGetChoices() {
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    return (updateExam as jest.Mock).mock.calls[0][1].questions[0].choices as { id: string; isCorrect: boolean }[];
  }

  it('ข้อที่ติ๊ก ≥ 2 ตัวแสดงข้อความเตือนพร้อมจำนวนและตัวอักษร', async () => {
    await openQuestion();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ข้อนี้เป็นแบบตอบได้หลายข้อ — นักเรียนต้องเลือกครบ 2 ตัว (B, C) จึงได้คะแนน',
    );
  });

  it('ลบตัวเลือก B แล้วกดเพิ่ม → id ไม่ซ้ำ', async () => {
    await openQuestion();
    const removeB = box('B').closest('div')!.querySelector('button')!;
    await userEvent.click(removeB);
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มตัวเลือก/ }));
    const inputs = screen.getAllByPlaceholderText(/^ตัวเลือก [A-F]$/);
    expect(inputs).toHaveLength(4);
    await userEvent.type(inputs[3], 'ใหม่');
    const ids = (await saveAndGetChoices()).map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(['a', 'c', 'd', 'b']);
  });

  it('ข้อจาก DB ที่ id เป็น a,c,d แล้วเพิ่ม → ได้ b ไม่ซ้ำ', async () => {
    (getAdminExam as jest.Mock).mockResolvedValue({
      ...multiExam,
      questions: [
        {
          ...multiExam.questions[0],
          choices: [
            { id: 'a', text: 'หนึ่ง', isCorrect: true },
            { id: 'c', text: 'สาม', isCorrect: false },
            { id: 'd', text: 'สี่', isCorrect: true },
          ],
        },
      ],
    });
    await openQuestion();
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มตัวเลือก/ }));
    const inputs = screen.getAllByPlaceholderText(/^ตัวเลือก [A-F]$/);
    await userEvent.type(inputs[3], 'ใหม่');
    const choices = await saveAndGetChoices();
    expect(choices.map((c) => c.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('ติ๊กออกหมดแล้วบันทึก → toast error เดิม ไม่เรียก API', async () => {
    await openQuestion();
    await userEvent.click(box('B'));
    await userEvent.click(box('C'));
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    expect(toast.error).toHaveBeenCalledWith('ข้อที่ 1: กรุณาเลือกคำตอบที่ถูกต้อง');
    expect(updateExam).not.toHaveBeenCalled();
  });
});
