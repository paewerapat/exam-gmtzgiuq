import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';
import { toast } from 'react-toastify';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
// ImageUpload จำลอง: กดปุ่ม = อัปโหลดสำเร็จได้ URL ใหม่ (onUploaded แล้ว onChange เหมือนของจริง)
jest.mock('@/components/upload/ImageUpload', () => {
  let n = 0;
  return {
    __esModule: true,
    default: ({
      onChange,
      onUploaded,
      label = 'รูป',
    }: {
      onChange: (url: string) => void;
      onUploaded?: (url: string) => void;
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
        อัป{label}
      </button>
    ),
  };
});
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

// ฟอร์ม admin ขนาดใหญ่ render ช้าเมื่อรัน jest ทั้งชุดแบบขนาน (เกิน default 5s) — ขยาย timeout เฉพาะไฟล์นี้
jest.setTimeout(30000);

async function fillBasics() {
  const user = userEvent.setup();
  render(<NewExamPage />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'Mock 1' } });
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
  fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: '1+1' } });
  await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
  fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '2' } });
  return user;
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
}

describe('NewExamPage — Mock Exam (task 11 AC2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('ไม่ติ๊ก Mock → ส่ง field ของ Mock เป็นค่าเริ่มต้นครบทุกตัว', async () => {
    const user = await fillBasics();
    await save(user);
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0]).toMatchObject({
      isMock: false,
      accessType: 'free',
      price: null,
      accessDays: null,
      level: null,
      detailBlocks: [],
    });
  });

  it('ชุดต้องซื้อ 150 บาท + คำอธิบาย ข้อความ-รูป-ข้อความ (สลับลำดับ) → ส่งครบตามลำดับ', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('radio', { name: /ต้องซื้อ/ }));
    fireEvent.change(screen.getByLabelText(/ราคา \(บาท ก่อน VAT\)/), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText(/อายุการเข้าถึงหลังซื้อ/), { target: { value: '30' } });
    await user.selectOptions(screen.getByLabelText('ระดับ'), 'hard');

    await user.click(screen.getByRole('button', { name: '+ ข้อความ' }));
    await user.click(screen.getByRole('button', { name: '+ ข้อความ' }));
    await user.click(screen.getByRole('button', { name: '+ รูป' }));
    fireEvent.change(screen.getByLabelText('ข้อความช่องที่ 1'), { target: { value: 'บน' } });
    fireEvent.change(screen.getByLabelText('ข้อความช่องที่ 2'), { target: { value: 'ล่าง' } });
    await user.click(screen.getByRole('button', { name: 'อัปรูปช่องที่ 3' }));
    // ย้ายรูปขึ้นมาอยู่ตรงกลาง
    await user.click(screen.getByRole('button', { name: 'เลื่อนช่องที่ 3 ขึ้น' }));

    await save(user);
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const payload = (createExam as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({
      isMock: true,
      accessType: 'purchase',
      price: 150,
      accessDays: 30,
      level: 'hard',
    });
    expect(payload.detailBlocks).toEqual([
      { type: 'text', text: 'บน' },
      { type: 'image', url: expect.stringMatching(/\/uploads\/new-\d+\.png$/) },
      { type: 'text', text: 'ล่าง' },
    ]);
    // รูปที่บันทึกอยู่ในข้อสอบแล้วต้องไม่ถูกลบ
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalledWith(payload.detailBlocks[1].url);
  });

  it('ชุดต้องซื้อแต่ไม่ใส่ราคา → แจ้งเตือน ไม่บันทึก', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('radio', { name: /ต้องซื้อ/ }));
    await save(user);
    expect(toast.error).toHaveBeenCalledWith('Mock Exam: ชุดที่ต้องซื้อต้องระบุราคา');
    expect(createExam).not.toHaveBeenCalled();
  });

  it('ตั้ง "ต้องซื้อ" ไม่ใส่ราคาแล้วเอาติ๊ก Mock ออก → บันทึกได้ ส่ง free ค่าอื่นคงเดิม และรูปที่อัปไม่ถูกลบ', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('radio', { name: /ต้องซื้อ/ }));
    await user.selectOptions(screen.getByLabelText('ระดับ'), 'easy');
    await user.click(screen.getByRole('button', { name: '+ รูป' }));
    await user.click(screen.getByRole('button', { name: 'อัปรูปช่องที่ 1' }));
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));

    await save(user);
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const payload = (createExam as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({ isMock: false, accessType: 'free', price: null, level: 'easy' });
    expect(payload.detailBlocks).toEqual([{ type: 'image', url: expect.stringMatching(/\/uploads\/new-\d+\.png$/) }]);
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ลบ block รูปที่อัปในรอบนี้ → ลบไฟล์ทันที (useSessionUploads)', async () => {
    const user = await fillBasics();
    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    await user.click(screen.getByRole('button', { name: '+ รูป' }));
    await user.click(screen.getByRole('button', { name: 'อัปรูปช่องที่ 1' }));
    await user.click(screen.getByRole('button', { name: 'ลบช่องที่ 1' }));
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    expect((deleteUploadedImageByUrl as jest.Mock).mock.calls[0][0]).toMatch(/\/uploads\/new-\d+\.png$/);
  });
});
