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
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('@/components/upload/ImageUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

jest.setTimeout(30000);

const campaignExam = {
  id: 'exam-1',
  title: 'NETSAT Campaign',
  description: '',
  category: 'tgat',
  status: 'published',
  durationMinutes: 90,
  subjectId: null,
  bannerImage: null,
  passages: [],
  releaseDate: '2026-01-10T17:30:42.000Z',
  createdAt: '2025-06-01T03:00:00.000Z',
  updatedAt: '2025-06-01T03:00:00.000Z',
  questions: [{ id: 'q1', question: 'โจทย์', type: 'short_answer', correctAnswer: '1', choices: [] }],
  isMock: true,
  accessType: 'code',
  price: null,
  accessDays: 30,
  level: null,
  detailBlocks: [],
  codeInstructions: null,
  campaignStartsAt: '2026-11-30T17:00:00.000Z',
  campaignEndsAt: '2026-12-31T16:59:00.000Z',
};

async function renderPage(exam: object) {
  (getAdminExam as jest.Mock).mockResolvedValue(exam);
  render(<EditExamPage params={Promise.resolve({ id: 'exam-1' })} />);
  await waitFor(() => expect(screen.getByDisplayValue('NETSAT Campaign')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
}

describe('EditExamPage — ช่วงแคมเปญ (task 21 AC9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateExam as jest.Mock).mockResolvedValue({});
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('โหลดช่วงเดิมเป็นเวลาไทย และบันทึกโดยไม่แก้ → วันเปิดเดิม, วันปิดนาทีเดิมนับถึงวินาทีที่ 59 (N3)', async () => {
    await renderPage(campaignExam);
    expect(screen.getByLabelText('วัน-เวลาเปิด')).toHaveValue('2026-12-01T00:00');
    expect(screen.getByLabelText('วัน-เวลาปิด')).toHaveValue('2026-12-31T23:59');
    await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    expect((updateExam as jest.Mock).mock.calls[0][1]).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
  });

  it('N3: วันปิดที่เก็บเป็น 23:59:59 → ช่องแสดง 23:59 และบันทึกโดยไม่แก้ส่งค่าเดิมทุกวินาที', async () => {
    await renderPage({ ...campaignExam, campaignEndsAt: '2026-12-31T16:59:59.000Z' });
    expect(screen.getByLabelText('วัน-เวลาปิด')).toHaveValue('2026-12-31T23:59');
    await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    expect((updateExam as jest.Mock).mock.calls[0][1]).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
  });

  it('ล้างวันปิด → ส่ง null (ไม่มีวันปิด)', async () => {
    await renderPage(campaignExam);
    fireEvent.change(screen.getByLabelText('วัน-เวลาปิด'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    expect((updateExam as jest.Mock).mock.calls[0][1]).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: null,
    });
  });

  it('ชุดไม่ใช่โค้ด → ไม่มีช่องช่วงแคมเปญ (ค่าเดิมยังถูกส่งกลับไม่หาย)', async () => {
    await renderPage({ ...campaignExam, accessType: 'free' });
    expect(screen.queryByLabelText('วัน-เวลาเปิด')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(updateExam).toHaveBeenCalled());
    expect((updateExam as jest.Mock).mock.calls[0][1]).toMatchObject({
      accessType: 'free',
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
    });
  });
});
