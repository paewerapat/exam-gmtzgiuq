// ประเภทแคมเปญ (task 19) ในหน้ารายการ /admin/unlock-codes และหน้ารายละเอียด /admin/unlock-codes/[id]
import { act, render, screen, within } from '@testing-library/react';
import AdminUnlockCodesPage from '@/app/admin/unlock-codes/page';
import UnlockBatchDetail from './UnlockBatchDetail';
import { getUnlockBatch, getUnlockBatchCodes, getUnlockBatches, type UnlockBatch } from '@/lib/api/unlockCodes';

jest.mock('@/lib/api/unlockCodes', () => ({
  getUnlockBatches: jest.fn(),
  getUnlockBatch: jest.fn(),
  getUnlockBatchCodes: jest.fn(),
  updateUnlockBatch: jest.fn(),
  updateUnlockCode: jest.fn(),
  downloadUnlockBatchCsv: jest.fn(),
}));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const examBatch: UnlockBatch = {
  id: 'b1',
  name: 'NETSAT Campaign',
  kind: 'exam',
  proPlan: null,
  allMock: true,
  exams: [],
  codeCount: 100,
  usedCount: 3,
  accessDays: 30,
  codeExpiresAt: null,
  isActive: true,
  createdAt: '2026-11-10T03:00:00.000Z',
};

const proBatch: UnlockBatch = {
  ...examBatch,
  id: 'b2',
  name: 'PRO NETSAT 7 วัน',
  kind: 'pro',
  proPlan: { id: 'p1', name: 'PRO', venue: { key: 'netsat', name: 'NETSAT' } },
  allMock: false,
  codeCount: 5,
  usedCount: 1,
  accessDays: 7,
};

describe('แคมเปญแบบให้แพ็กเกจ Pro — รายการและรายละเอียด (task 19)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('รายการ: คอลัมน์ "ประเภท / สิ่งที่ได้" แสดงป้ายประเภท + ชุด หรือ สนาม · แพ็กเกจ', async () => {
    (getUnlockBatches as jest.Mock).mockResolvedValue({ items: [examBatch, proBatch], total: 2, page: 1, limit: 20, totalPages: 1 });
    render(<AdminUnlockCodesPage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'ประเภท / สิ่งที่ได้' })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Unlock ชุดข้อสอบ')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ทุกชุด Mock Exam')).toBeInTheDocument();
    expect(within(rows[1]).getByText('ให้แพ็กเกจ Pro')).toBeInTheDocument();
    expect(within(rows[1]).getByText('NETSAT · PRO')).toBeInTheDocument();
    expect(within(rows[1]).getByText('7 วัน')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('รายละเอียด: ป้ายประเภท + "แพ็กเกจที่ได้" + จำนวนวันของแพ็กเกจ', async () => {
    (getUnlockBatch as jest.Mock).mockResolvedValue(proBatch);
    (getUnlockBatchCodes as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
    await act(async () => {
      render(<UnlockBatchDetail id="b2" />);
    });
    expect(await screen.findByRole('heading', { level: 1, name: /PRO NETSAT 7 วัน/ })).toBeInTheDocument();
    expect(screen.getByText('ให้แพ็กเกจ Pro')).toBeInTheDocument();
    expect(screen.getByText('แพ็กเกจที่ได้')).toBeInTheDocument();
    expect(screen.getByText('NETSAT · PRO')).toBeInTheDocument();
    expect(screen.getByText('จำนวนวันของแพ็กเกจ')).toBeInTheDocument();
    expect(screen.getByText('7 วัน')).toBeInTheDocument();
    expect(screen.queryByText('ชุดที่ Unlock')).not.toBeInTheDocument();
    // CSV ใช้ได้เหมือนเดิม
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด CSV' })).toBeInTheDocument();
  });

  it('รายละเอียดแคมเปญเดิม (exam) ยังแสดง "ชุดที่ Unlock"', async () => {
    (getUnlockBatch as jest.Mock).mockResolvedValue(examBatch);
    (getUnlockBatchCodes as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
    await act(async () => {
      render(<UnlockBatchDetail id="b1" />);
    });
    expect(await screen.findByText('ชุดที่ Unlock')).toBeInTheDocument();
    expect(screen.getByText('Unlock ชุดข้อสอบ')).toBeInTheDocument();
  });
});
