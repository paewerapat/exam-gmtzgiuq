import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { toast } from 'react-toastify';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

jest.setTimeout(30000);

async function fillBasics() {
  const user = userEvent.setup();
  render(<NewExamPage />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'Campaign 1' } });
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
  fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: '1+1' } });
  await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
  fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '2' } });
  return user;
}

describe('NewExamPage — ช่วงแคมเปญ (task 21 AC9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('ช่องเวลาทำข้อสอบมีคำอธิบาย "ใช้เป็นเวลาแนะนำในหน้าทำข้อสอบด้วย"', async () => {
    await fillBasics();
    expect(screen.getByText(/ใช้เป็นเวลาแนะนำในหน้าทำข้อสอบด้วย/)).toBeInTheDocument();
  });

  it('ชุดใช้โค้ด + ช่วงแคมเปญ (เวลาไทย) → ส่ง ISO UTC', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    expect(screen.queryByLabelText('วัน-เวลาเปิด')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /ใช้โค้ด/ }));
    fireEvent.change(screen.getByLabelText('วัน-เวลาเปิด'), { target: { value: '2026-12-01T00:00' } });
    fireEvent.change(screen.getByLabelText('วัน-เวลาปิด'), { target: { value: '2026-12-31T23:59' } });
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0]).toMatchObject({
      isMock: true,
      accessType: 'code',
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
  });

  it('ไม่กรอกช่วง → ส่ง null ทั้งคู่ (เปิดตลอด)', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('radio', { name: /ใช้โค้ด/ }));
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0]).toMatchObject({ campaignStartsAt: null, campaignEndsAt: null });
  });

  it('วันปิดไม่หลังวันเปิด → แจ้งใต้ช่อง + toast และไม่บันทึก', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('radio', { name: /ใช้โค้ด/ }));
    fireEvent.change(screen.getByLabelText('วัน-เวลาเปิด'), { target: { value: '2026-12-10T09:00' } });
    fireEvent.change(screen.getByLabelText('วัน-เวลาปิด'), { target: { value: '2026-12-10T09:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('ช่วงแคมเปญ: วัน-เวลาปิดต้องหลังวัน-เวลาเปิด');
    expect(screen.getByLabelText('วัน-เวลาปิด')).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    expect(toast.error).toHaveBeenCalledWith('ช่วงแคมเปญ: วัน-เวลาปิดต้องหลังวัน-เวลาเปิด');
    expect(createExam).not.toHaveBeenCalled();
  });
});
