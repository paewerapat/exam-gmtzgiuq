import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';

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
  fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'QB 1' } });
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
  fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: '1+1' } });
  await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
  fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '2' } });
  return user;
}

const challengeBox = () => screen.getByRole('checkbox', { name: /ข้อ Challenge/ });
const bankSwitch = () => screen.getByRole('switch', { name: 'ใช้เฉพาะ Question Bank' });

describe('NewExamPage — ใช้เฉพาะ Question Bank / ข้อ Challenge (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('ค่าเริ่มต้น: ชุดปกติ, checkbox Challenge กดไม่ได้ → ส่ง bankOnly:false, isChallenge:false', async () => {
    const user = await fillBasics();
    expect(bankSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(challengeBox()).toBeDisabled();
    expect(screen.getByText('เปิดได้เมื่อชุดนี้ "ใช้เฉพาะ Question Bank"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const payload = (createExam as jest.Mock).mock.calls[0][0];
    expect(payload.bankOnly).toBe(false);
    expect(payload.questions[0].isChallenge).toBe(false);
  });

  it('เปิด bankOnly → ติ๊ก Challenge ได้ มีป้ายในหัวข้อ และส่ง bankOnly:true, isChallenge:true', async () => {
    const user = await fillBasics();
    await user.click(bankSwitch());
    expect(bankSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(challengeBox()).toBeEnabled();
    await user.click(challengeBox());
    expect(screen.getByText('Challenge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const payload = (createExam as jest.Mock).mock.calls[0][0];
    expect(payload.bankOnly).toBe(true);
    expect(payload.questions[0].isChallenge).toBe(true);
  });

  it('round 2: ระดับความยากต่อข้อ ค่าเริ่มต้นปานกลาง เลือก "ยาก" แล้วส่ง difficulty: hard', async () => {
    const user = await fillBasics();
    const select = screen.getByLabelText('ระดับความยาก');
    expect(select).toHaveValue('medium');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(['ง่าย', 'ปานกลาง', 'ยาก']);
    await user.selectOptions(select, 'hard');
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    expect((createExam as jest.Mock).mock.calls[0][0].questions[0].difficulty).toBe('hard');
  });

  it('ติ๊ก Challenge แล้วปิด bankOnly → เตือน และส่ง isChallenge:false (กัน API 400)', async () => {
    const user = await fillBasics();
    await user.click(bankSwitch());
    await user.click(challengeBox());
    await user.click(bankSwitch());
    expect(screen.getByRole('status')).toHaveTextContent('มีข้อที่ติ๊ก Challenge ไว้ 1 ข้อ');
    expect(challengeBox()).toBeDisabled();
    expect(challengeBox()).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const payload = (createExam as jest.Mock).mock.calls[0][0];
    expect(payload.bankOnly).toBe(false);
    expect(payload.questions[0].isChallenge).toBe(false);
  });
});
