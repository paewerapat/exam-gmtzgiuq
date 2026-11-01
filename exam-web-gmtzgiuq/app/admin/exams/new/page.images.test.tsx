import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
// ImageUpload จำลอง: ปุ่ม "อัป..." = อัปโหลดสำเร็จได้ URL ใหม่ (onUploaded แล้ว onChange เหมือนของจริง)
jest.mock('@/components/upload/ImageUpload', () => {
  let n = 0;
  return {
    __esModule: true,
    default: ({
      onChange,
      onUploaded,
      compact,
      showUrlInput,
      label = 'รูป',
    }: {
      onChange: (url: string) => void;
      onUploaded?: (url: string) => void;
      compact?: boolean;
      showUrlInput?: boolean;
      label?: string;
    }) => (
      <button
        type="button"
        onClick={() => {
          const url = `http://localhost:3001/uploads/new-${++n}.png`;
          onUploaded?.(url);
          onChange(url);
        }}
      >
        {compact ? `อัป${label}` : showUrlInput === false ? 'อัปรูปโจทย์' : 'อัปแบนเนอร์'}
      </button>
    ),
  };
});
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('NewExamPage — หลายรูปต่อข้อ + ตัวเลือกรูปล้วน (task 07 AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('สร้างข้อที่มี 3 รูปและตัวเลือก A–D เป็นรูปล้วน → ส่ง questionImages + choices[].image', async () => {
    const user = userEvent.setup();
    render(<NewExamPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'ชุดรูป' } });
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
    fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: 'ข้อใดต่อจากรูป' } });

    const addQuestionImage = () => screen.getByRole('button', { name: 'อัปรูปโจทย์' });
    await user.click(addQuestionImage());
    await user.click(addQuestionImage());
    await user.click(addQuestionImage());
    expect(screen.getAllByRole('img', { name: /^รูปที่ \d$/ })).toHaveLength(3);

    for (const l of ['A', 'B', 'C', 'D']) {
      await user.click(screen.getByRole('button', { name: `อัปรูปตัวเลือก ${l}` }));
    }
    await user.click(screen.getByRole('checkbox', { name: 'ตัวเลือก C เป็นคำตอบที่ถูก' }));
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));

    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const q = (createExam as jest.Mock).mock.calls[0][0].questions[0];
    expect(q.questionImages).toHaveLength(3);
    q.questionImages.forEach((url: string) => expect(url).toMatch(/\/uploads\/new-\d+\.png$/));
    expect(new Set(q.questionImages).size).toBe(3);
    expect(q.questionImage).toBe(q.questionImages[0]);
    expect(q.choices.map((c: { text: string }) => c.text)).toEqual(['', '', '', '']);
    q.choices.forEach((c: { image: string }) => expect(c.image).toMatch(/\/uploads\/new-\d+\.png$/));
    expect(q.choices.filter((c: { isCorrect: boolean }) => c.isCorrect).map((c: { id: string }) => c.id)).toEqual([
      'c',
    ]);
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  }, 20000);

  it('หน้าใหม่: เอารูปที่อัปออก → ลบไฟล์ทันที (ยังไม่เคยบันทึก)', async () => {
    const user = userEvent.setup();
    render(<NewExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    const url = screen.getByRole('img', { name: 'รูปที่ 1' }).getAttribute('src');
    await user.click(screen.getByRole('button', { name: 'ลบรูปที่ 1' }));
    expect(deleteUploadedImageByUrl).toHaveBeenCalledWith(url);
  });
});
