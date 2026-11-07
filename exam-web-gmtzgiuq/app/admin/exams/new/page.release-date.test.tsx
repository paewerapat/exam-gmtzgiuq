import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({
  __esModule: true,
  default: () => <div data-testid="image-upload" />,
}));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

// ฟอร์ม admin ขนาดใหญ่ render ช้าเมื่อรัน jest ทั้งชุดแบบขนาน (เกิน default 5s) — ขยาย timeout เฉพาะไฟล์นี้
jest.setTimeout(30000);

// 2026-11-05 14:30 เวลาไทย
const NOW = new Date('2026-11-05T07:30:00.000Z');

const releaseInput = () => screen.getByLabelText('วันเผยแพร่') as HTMLInputElement;

async function renderFilledForm() {
  const user = userEvent.setup();
  render(<NewExamPage />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'ชุดใหม่' } });
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
  await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
  fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: 'โจทย์' } });
  fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '1' } });
  return user;
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
}

describe('NewExamPage — วันเผยแพร่ (task 10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ตรึงเฉพาะ Date ให้ "ตอนนี้" คงที่ timer อื่นยังเป็นของจริง (waitFor/userEvent ใช้ได้ตามปกติ)
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate',
        'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ค่าเริ่มต้นคือตอนนี้ตามเวลาไทย และมีคำอธิบายการใช้งาน', async () => {
    render(<NewExamPage />);
    await waitFor(() => expect(releaseInput().value).toBe('2026-11-05T14:30'));
    expect(releaseInput()).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByText(/ใช้จัดลำดับบนหน้าเว็บ \(ใหม่สุดอยู่บน\)/)).toBeInTheDocument();
  });

  it('ไม่แตะช่อง → ไม่ส่ง releaseDate (API ใช้เวลาตอนสร้าง ชุดใหม่อยู่บนสุด)', async () => {
    const user = await renderFilledForm();
    await save(user);
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0]).not.toHaveProperty('releaseDate');
  });

  it('ตั้งวันเวลาไทย → ส่ง ISO UTC ที่ถูกต้อง (ไม่เลื่อน 7 ชม.)', async () => {
    const user = await renderFilledForm();
    fireEvent.change(releaseInput(), { target: { value: '2026-12-01T06:00' } });
    await save(user);
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0].releaseDate).toBe('2026-11-30T23:00:00.000Z');
  });

  it('ลบค่าในช่องจนว่าง → แจ้งเตือนและไม่บันทึก', async () => {
    const user = await renderFilledForm();
    await waitFor(() => expect(releaseInput().value).not.toBe(''));
    fireEvent.change(releaseInput(), { target: { value: '' } });
    await save(user);
    expect(toast.error).toHaveBeenCalledWith('กรุณาระบุวันเผยแพร่ให้ถูกต้อง');
    expect(createExam).not.toHaveBeenCalled();
  });
});
