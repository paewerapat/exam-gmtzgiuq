import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ getAdminExam: jest.fn(), updateExam: jest.fn() }));
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

const baseExam = {
  id: 'exam-1',
  title: 'ชุดเก่า',
  description: '',
  category: 'tgat',
  status: 'published',
  durationMinutes: null,
  subjectId: null,
  bannerImage: null,
  passages: [],
  // วินาทีไม่เป็น 0 เหมือนข้อมูลที่ backfill จาก createdAt
  releaseDate: '2026-01-10T17:30:42.000Z',
  createdAt: '2025-06-01T03:00:00.000Z',
  updatedAt: '2025-06-01T03:00:00.000Z',
  questions: [{ id: 'q1', question: 'โจทย์', type: 'short_answer', correctAnswer: '1', choices: [] }],
};

const releaseInput = () => screen.getByLabelText('วันเผยแพร่') as HTMLInputElement;

async function renderPage(exam: object = baseExam) {
  (getAdminExam as jest.Mock).mockResolvedValue(exam);
  render(<EditExamPage params={Promise.resolve({ id: 'exam-1' })} />);
  await waitFor(() => expect(screen.getByDisplayValue('ชุดเก่า')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
}

async function saveAndGetPayload() {
  await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
  await waitFor(() => expect(updateExam).toHaveBeenCalled());
  return (updateExam as jest.Mock).mock.calls[0][1];
}

describe('EditExamPage — วันเผยแพร่ (task 10 AC3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('แสดงค่าเดิมเป็นเวลาไทย (UTC 17:30 → 00:30 วันถัดไป)', async () => {
    await renderPage();
    expect(releaseInput().value).toBe('2026-01-11T00:30');
  });

  it('ไม่แก้ช่อง → ไม่ส่ง releaseDate (API คงค่าเดิมพร้อมวินาที)', async () => {
    await renderPage();
    const payload = await saveAndGetPayload();
    expect(payload).not.toHaveProperty('releaseDate');
  });

  it('แก้เป็นวันใหม่ → ส่ง ISO ที่แปลงกลับเป็นเวลาไทยได้ค่าเดิม', async () => {
    await renderPage();
    fireEvent.change(releaseInput(), { target: { value: '2026-11-05T14:30' } });
    const payload = await saveAndGetPayload();
    expect(payload.releaseDate).toBe('2026-11-05T07:30:00.000Z');
  });

  it('API เก่าที่ยังไม่มี releaseDate → แสดง createdAt เป็นเวลาไทย และไม่ส่งถ้าไม่แก้', async () => {
    const { releaseDate: _omit, ...legacy } = baseExam;
    void _omit;
    await renderPage(legacy);
    expect(releaseInput().value).toBe('2025-06-01T10:00');
    const payload = await saveAndGetPayload();
    expect(payload).not.toHaveProperty('releaseDate');
  });
});
