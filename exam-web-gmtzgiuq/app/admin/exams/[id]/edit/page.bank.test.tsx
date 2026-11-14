import { render, screen, waitFor } from '@testing-library/react';
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
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

jest.setTimeout(30000);

const exam = (over: Record<string, unknown> = {}) => ({
  id: 'exam-1',
  title: 'ชุด QB',
  description: '',
  category: 'tgat',
  status: 'published',
  durationMinutes: null,
  subjectId: null,
  bannerImage: null,
  passages: [],
  releaseDate: '2026-01-10T17:30:42.000Z',
  createdAt: '2025-06-01T03:00:00.000Z',
  updatedAt: '2025-06-01T03:00:00.000Z',
  bankOnly: true,
  questions: [
    { id: 'q1', question: 'ข้อปกติ', type: 'short_answer', correctAnswer: '1', choices: [], isChallenge: false },
    { id: 'q2', question: 'ข้อยาก', type: 'short_answer', correctAnswer: '2', choices: [], isChallenge: true, difficulty: 'hard' },
  ],
  ...over,
});

async function renderPage(data: object) {
  (getAdminExam as jest.Mock).mockResolvedValue(data);
  render(<EditExamPage params={Promise.resolve({ id: 'exam-1' })} />);
  await waitFor(() => expect(screen.getByDisplayValue('ชุด QB')).toBeInTheDocument());
}

async function saveAndGetPayload() {
  await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
  await waitFor(() => expect(updateExam).toHaveBeenCalled());
  return (updateExam as jest.Mock).mock.calls[0][1];
}

describe('EditExamPage — Question Bank (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('โหลด bankOnly + isChallenge จาก API (ป้าย Challenge ในหัวข้อข้อ) และส่งกลับครบพร้อม id ข้อเดิม', async () => {
    await renderPage(exam());
    expect(screen.getByRole('switch', { name: 'ใช้เฉพาะ Question Bank' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('Challenge')).toHaveLength(1);
    const payload = await saveAndGetPayload();
    expect(payload.bankOnly).toBe(true);
    expect(payload.questions.map((q: { id: string; isChallenge: boolean }) => [q.id, q.isChallenge])).toEqual([
      ['q1', false],
      ['q2', true],
    ]);
    // round 2: difficulty ส่งทุกข้อ — ค่าที่โหลดมาคงเดิม, ข้อที่ไม่มีค่า = medium
    expect(payload.questions.map((q: { difficulty: string }) => q.difficulty)).toEqual(['medium', 'hard']);
  });

  it('ชุดเก่าที่ไม่มี field → ชุดปกติ ส่ง bankOnly:false', async () => {
    const old = exam();
    delete (old as Record<string, unknown>).bankOnly;
    await renderPage(old);
    const payload = await saveAndGetPayload();
    expect(payload.bankOnly).toBe(false);
    expect(payload.questions.every((q: { isChallenge: boolean }) => q.isChallenge === false)).toBe(true);
  });
});
