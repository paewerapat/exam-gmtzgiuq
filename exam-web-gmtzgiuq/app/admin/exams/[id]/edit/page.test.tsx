import { render, screen, waitFor } from '@testing-library/react';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
// response จริงของ GET /exams/admin/:id ของชุดที่นำเข้าจาก zip ที่มีข้อผิดพลาด (QA task 01, author ตัดฟิลด์ลับออกแล้ว)
// ข้อ 1 correct ไม่ตรง label (ไม่มี isCorrect), ข้อ 2 มีตัวเลือกเดียว, ข้อ 4 correct ว่าง, ข้อ 5 อัตนัย correctAnswer ว่าง, ข้อ 6–7 ไม่มี topicId
import problems from '@/lib/__fixtures__/qa-imported-exam-problems-draft.json';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
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
