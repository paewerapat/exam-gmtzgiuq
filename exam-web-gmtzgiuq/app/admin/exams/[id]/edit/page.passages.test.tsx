import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ getAdminExam: jest.fn(), updateExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('@/components/upload/ImageUpload', () => ({
  __esModule: true,
  default: () => <div data-testid="image-upload" />,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const LONG_BODY = 'ย่อหน้าแรก\n\nย่อหน้าที่สอง\n| ปี | ค่า |\n|---|---|\n| 2566 | 10 |';

function shortAnswer(id: string, n: number, passageId: string | null) {
  return { id, question: `โจทย์ข้อ ${n}`, type: 'short_answer', correctAnswer: '1', choices: [], passageId };
}

// AC4: บทอ่าน 2 ชุด ผูกข้อ 2–4 และ 6–7 ข้อ 1, 5 ไม่มีบทอ่าน (response ตามสัญญา GET /exams/admin/:id)
const exam = {
  id: 'exam-p',
  title: 'ชุดบทอ่าน',
  description: '',
  category: 'tgat',
  status: 'draft',
  durationMinutes: null,
  subjectId: null,
  bannerImage: null,
  passages: [
    { id: 'reading-a', title: 'บทความเรื่องน้ำ', body: LONG_BODY, images: [] },
    { id: 'reading-b', title: null, body: null, images: ['http://localhost:3001/uploads/chart.png'] },
  ],
  questions: [
    shortAnswer('q1', 1, null),
    shortAnswer('q2', 2, 'reading-a'),
    shortAnswer('q3', 3, 'reading-a'),
    shortAnswer('q4', 4, 'reading-a'),
    shortAnswer('q5', 5, null),
    shortAnswer('q6', 6, 'reading-b'),
    shortAnswer('q7', 7, 'reading-b'),
  ],
};

async function renderPage(data: unknown = exam) {
  (getAdminExam as jest.Mock).mockResolvedValue(data);
  const user = userEvent.setup();
  render(<EditExamPage params={Promise.resolve({ id: 'exam-p' })} />);
  await waitFor(() => expect(screen.getByDisplayValue('ชุดบทอ่าน')).toBeInTheDocument());
  return user;
}

const passageForms = () => screen.queryAllByTestId('passage-form');
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));

describe('EditExamPage — บทอ่านร่วม (task 08 AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('เปิดแก้ไขเห็นบทอ่านครบและการผูกถูก แล้วบันทึกโดยไม่แก้ → payload เท่าเดิม (id บทอ่านคงที่)', async () => {
    const user = await renderPage();
    const [formA, formB] = passageForms();
    expect(within(formA).getByDisplayValue('บทความเรื่องน้ำ')).toBeInTheDocument();
    expect((within(formA).getByLabelText('เนื้อหาบทอ่าน') as HTMLTextAreaElement).value).toBe(LONG_BODY);
    expect(within(formA).getAllByText('ใช้กับข้อ 2, 3, 4').length).toBeGreaterThan(0);
    expect(within(formB).getByRole('img', { name: 'รูปที่ 1' })).toHaveAttribute(
      'src',
      'http://localhost:3001/uploads/chart.png',
    );
    expect(within(formB).getAllByText('ใช้กับข้อ 6, 7').length).toBeGreaterThan(0);

    // ป้ายบนหัวข้อ (ข้อพับอยู่) บอกบทอ่านที่ใช้
    expect(screen.getAllByText('บทความเรื่องน้ำ').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('บทอ่านที่ 2').length).toBeGreaterThanOrEqual(2);

    await save(user);
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    const input = (updateExam as jest.Mock).mock.calls[0][1];
    expect(input.passages).toEqual([
      { id: 'reading-a', title: 'บทความเรื่องน้ำ', body: LONG_BODY, images: [] },
      { id: 'reading-b', title: null, body: null, images: ['http://localhost:3001/uploads/chart.png'] },
    ]);
    expect(input.questions.map((q: { passageId: string | null }) => q.passageId)).toEqual([
      null,
      'reading-a',
      'reading-a',
      'reading-a',
      null,
      'reading-b',
      'reading-b',
    ]);
  });

  it('ลบบทอ่านชุดหนึ่ง → ข้อที่อ้างกลายเป็นไม่ใช้บทอ่าน แจ้งข้อที่กระทบ ไม่ลบไฟล์รูปที่บันทึกแล้ว (รอ API)', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'ลบบทอ่านที่ 2' }));
    expect(passageForms()).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledWith('ลบ "บทอ่านที่ 2" แล้ว ข้อ 6, 7 เปลี่ยนเป็นไม่ใช้บทอ่าน');
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();

    await save(user);
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    const input = (updateExam as jest.Mock).mock.calls[0][1];
    expect(input.passages.map((p: { id: string }) => p.id)).toEqual(['reading-a']);
    expect(input.questions.map((q: { passageId: string | null }) => q.passageId)).toEqual([
      null,
      'reading-a',
      'reading-a',
      'reading-a',
      null,
      null,
      null,
    ]);
  });

  it('เปลี่ยนบทอ่านของข้อด้วย select "ใช้บทอ่านไหน"', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('ข้อที่ 1'));
    await user.selectOptions(screen.getByLabelText('ใช้บทอ่านไหน'), 'บทอ่านที่ 2');
    await save(user);
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    expect((updateExam as jest.Mock).mock.calls[0][1].questions[0].passageId).toBe('reading-b');
  });

  it('ข้อสอบเก่าไม่มีบทอ่าน (passages ไม่มี key) → ส่ง passages [] ทุกครั้ง', async () => {
    const { passages: _omit, ...old } = exam;
    void _omit;
    const user = await renderPage({ ...old, questions: [shortAnswer('q1', 1, null)] });
    expect(passageForms()).toHaveLength(0);
    await save(user);
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    const input = (updateExam as jest.Mock).mock.calls[0][1];
    expect(input.passages).toEqual([]);
    expect(input.questions[0].passageId).toBeNull();
  });
});
