import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
jest.mock('@/components/upload/ImageUpload', () => ({
  __esModule: true,
  default: ({ value, label = 'รูป' }: { value: string; label?: string }) => (
    <span data-testid="image-upload" data-label={label}>
      {value}
    </span>
  ),
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const baseExam = {
  id: 'exam-1',
  title: 'ชุด Mock',
  description: '',
  category: 'tgat',
  status: 'published',
  durationMinutes: 60,
  subjectId: null,
  bannerImage: null,
  passages: [],
  releaseDate: '2026-01-10T17:30:42.000Z',
  createdAt: '2025-06-01T03:00:00.000Z',
  updatedAt: '2025-06-01T03:00:00.000Z',
  questions: [{ id: 'q1', question: 'โจทย์', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

const mockExam = {
  ...baseExam,
  isMock: true,
  accessType: 'purchase',
  price: '150.00',
  accessDays: 30,
  level: 'medium',
  detailBlocks: [
    { type: 'text', text: 'บน' },
    { type: 'image', url: '/uploads/saved.png' },
    { type: 'text', text: 'ล่าง' },
  ],
};

async function renderPage(exam: object) {
  (getAdminExam as jest.Mock).mockResolvedValue(exam);
  render(<EditExamPage params={Promise.resolve({ id: 'exam-1' })} />);
  await waitFor(() => expect(screen.getByDisplayValue(baseExam.title)).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
}

async function saveAndGetPayload() {
  await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
  await waitFor(() => expect(updateExam).toHaveBeenCalled());
  return (updateExam as jest.Mock).mock.calls[0][1];
}

describe('EditExamPage — Mock Exam (task 11 AC2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('เปิดแก้ชุด Mock เดิม → เห็นค่าครบและ block ตามลำดับ', async () => {
    await renderPage(mockExam);
    expect(screen.getByLabelText('เป็นชุด Mock Exam')).toBeChecked();
    expect(screen.getByRole('radio', { name: /ต้องซื้อ/ })).toBeChecked();
    expect(screen.getByLabelText(/ราคา \(บาท ก่อน VAT\)/)).toHaveValue(150);
    expect(screen.getByLabelText(/อายุการเข้าถึงหลังซื้อ/)).toHaveValue(30);
    expect(screen.getByLabelText('ระดับ')).toHaveValue('medium');
    expect(screen.getByLabelText('ข้อความช่องที่ 1')).toHaveValue('บน');
    expect(screen.getByLabelText('ข้อความช่องที่ 3')).toHaveValue('ล่าง');
    const image = screen.getAllByTestId('image-upload').find((el) => el.dataset.label === 'รูปช่องที่ 2');
    expect(image).toHaveTextContent('/uploads/saved.png');
  });

  it('บันทึกโดยไม่แก้ → ส่ง field ของ Mock ครบทุกตัวตามค่าเดิม (price string → number)', async () => {
    await renderPage(mockExam);
    const payload = await saveAndGetPayload();
    expect(payload).toMatchObject({
      isMock: true,
      accessType: 'purchase',
      price: 150,
      accessDays: 30,
      level: 'medium',
      detailBlocks: mockExam.detailBlocks,
    });
  });

  it('ลบ block รูปที่บันทึกแล้ว → ไม่ลบไฟล์ทันที (ให้ API ลบหลังบันทึก)', async () => {
    const user = userEvent.setup();
    await renderPage(mockExam);
    await user.click(screen.getByRole('button', { name: 'ลบช่องที่ 2' }));
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
    const payload = await saveAndGetPayload();
    expect(payload.detailBlocks).toEqual([
      { type: 'text', text: 'บน' },
      { type: 'text', text: 'ล่าง' },
    ]);
  });

  it('เอาติ๊ก Mock ออก → ส่ง isMock:false พร้อมค่าเดิมครบ (ไม่ล้าง ไม่ลบรูป) และติ๊กกลับเห็นค่าเดิม', async () => {
    const user = userEvent.setup();
    await renderPage(mockExam);
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    expect(screen.getByText(/ยังถูกเก็บไว้/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    expect(screen.getByLabelText(/ราคา \(บาท ก่อน VAT\)/)).toHaveValue(150);
    expect(screen.getByLabelText('ข้อความช่องที่ 3')).toHaveValue('ล่าง');
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));

    const payload = await saveAndGetPayload();
    expect(payload).toMatchObject({
      isMock: false,
      accessType: 'purchase',
      price: 150,
      accessDays: 30,
      level: 'medium',
      detailBlocks: mockExam.detailBlocks,
    });
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('ชุดเก่า (API ยังไม่มี field) → ไม่ใช่ Mock และส่งค่าเริ่มต้น', async () => {
    await renderPage(baseExam);
    expect(screen.getByLabelText('เป็นชุด Mock Exam')).not.toBeChecked();
    const payload = await saveAndGetPayload();
    expect(payload).toMatchObject({ isMock: false, accessType: 'free', detailBlocks: [] });
  });
});
