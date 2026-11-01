import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewExamPage from './page';
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
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const box = (letter: string) => screen.getByRole('checkbox', { name: `ตัวเลือก ${letter} เป็นคำตอบที่ถูก` });

describe('NewExamPage — คำตอบที่ถูก (task 06 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCategories as jest.Mock).mockResolvedValue([]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('ข้อแรกและ "เพิ่มข้อใหม่" เริ่มต้นไม่มีตัวที่ติ๊ก', async () => {
    render(<NewExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    screen.getAllByRole('checkbox').forEach((c) => expect(c).not.toBeChecked());

    await userEvent.click(screen.getByRole('button', { name: /เพิ่มข้อใหม่/ }));
    // ข้อเดิมถูกพับ เหลือเฉพาะตัวเลือกของข้อใหม่
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    screen.getAllByRole('checkbox').forEach((c) => expect(c).not.toBeChecked());
  });

  it('ติ๊กตัวเดียวไม่เตือน ติ๊ก 2 ตัวขึ้นข้อความเตือนข้อหลายคำตอบ', async () => {
    render(<NewExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await userEvent.click(box('C'));
    expect(box('C')).toBeChecked();
    expect(box('A')).not.toBeChecked();
    expect(screen.queryByText(/ข้อนี้เป็นแบบตอบได้หลายข้อ/)).not.toBeInTheDocument();

    await userEvent.click(box('B'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'ข้อนี้เป็นแบบตอบได้หลายข้อ — นักเรียนต้องเลือกครบ 2 ตัว (B, C) จึงได้คะแนน',
    );

    await userEvent.click(box('B'));
    expect(screen.queryByText(/ข้อนี้เป็นแบบตอบได้หลายข้อ/)).not.toBeInTheDocument();
  });
});
