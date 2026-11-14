import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8 } from 'fflate';
import ImportExamPage from './page';
import { useAuth } from '@/contexts/AuthContext';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import sample from '@/lib/__fixtures__/exam-import-bank-sample.json';

jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ uploadImage: jest.fn(), deleteUploadedImage: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function jsonFile(json: unknown): File {
  return new File([strToU8(JSON.stringify(json))], 'exam.json', { type: 'application/json' });
}

async function selectFile(file: File) {
  fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } });
  await screen.findByText('รายการข้อ');
}

describe('ImportExamPage — Question Bank (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1', role: 'admin' }, loading: false });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'NETSAT', slug: 'netsat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
    (createExam as jest.Mock).mockResolvedValue({ id: 'e1', title: sample.exam.title });
  });

  it('สวิตช์ "ใช้เฉพาะ Question Bank" ตั้งตามไฟล์ ป้าย Challenge ในตาราง และส่ง bankOnly/isChallenge', async () => {
    const user = userEvent.setup();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await selectFile(jsonFile(sample));

    const sw = screen.getByRole('switch', { name: 'ใช้เฉพาะ Question Bank' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('Challenge', { selector: 'span' })).toHaveLength(1);

    const button = await screen.findByRole('button', { name: 'สร้างแบบร่าง' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await screen.findByText('สร้างแบบร่างแล้ว');
    const input = (createExam as jest.Mock).mock.calls[0][0];
    expect(input.bankOnly).toBe(true);
    expect(input.questions.map((q: { isChallenge: boolean }) => q.isChallenge)).toEqual([false, false, true]);
  });

  it('ปิดสวิตช์ก่อนสร้าง → เตือนว่าข้อ Challenge จะเป็นข้อปกติ และส่ง false ทั้งหมด', async () => {
    const user = userEvent.setup();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await selectFile(jsonFile(sample));
    await user.click(screen.getByRole('switch', { name: 'ใช้เฉพาะ Question Bank' }));
    expect(screen.getByRole('status')).toHaveTextContent('มีข้อที่ติ๊ก Challenge ไว้ 1 ข้อ');

    const button = await screen.findByRole('button', { name: 'สร้างแบบร่าง' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await screen.findByText('สร้างแบบร่างแล้ว');
    const input = (createExam as jest.Mock).mock.calls[0][0];
    expect(input.bankOnly).toBe(false);
    expect(input.questions.every((q: { isChallenge: boolean }) => q.isChallenge === false)).toBe(true);
  });

  it('มีคำอธิบายรูปแบบไฟล์ bank_only / is_challenge', () => {
    render(<ImportExamPage />);
    expect(screen.getByText('รูปแบบไฟล์สำหรับ Question Bank')).toBeInTheDocument();
    expect(screen.getByText('exam.bank_only: true')).toBeInTheDocument();
    expect(screen.getByText('questions[].is_challenge: true')).toBeInTheDocument();
  });
});
