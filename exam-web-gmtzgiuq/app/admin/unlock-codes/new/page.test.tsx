import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import NewUnlockBatchPage from './page';
import { getLockableMockExams } from '@/lib/api/exams';
import { createUnlockBatch } from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/exams', () => ({ getLockableMockExams: jest.fn() }));
jest.mock('@/lib/api/unlockCodes', () => ({ createUnlockBatch: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const options = [
  { id: 'e1', title: 'NETSAT Math 1', accessType: 'code', price: null, status: 'published' },
  { id: 'e2', title: 'NETSAT Math 2', accessType: 'code', price: null, status: 'draft' },
  { id: 'e3', title: 'A-Level Pro', accessType: 'purchase', price: 150, status: 'published' },
];

describe('/admin/unlock-codes/new (task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getLockableMockExams as jest.Mock).mockResolvedValue(options);
    (createUnlockBatch as jest.Mock).mockResolvedValue({ id: 'b9', name: 'แคมเปญใหม่', codeCount: 5000 });
  });

  it('รายการชุดให้เลือก = Mock ที่ไม่ฟรี (ป้าย Campaign / ราคา / แบบร่าง) + ค้นหาชื่อชุด', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    expect(await screen.findByRole('checkbox', { name: /NETSAT Math 1/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /NETSAT Math 2.*แบบร่าง.*Campaign/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /A-Level Pro.*150 บาท/ })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาชุดข้อสอบ' }), 'a-level');
    expect(screen.queryByRole('checkbox', { name: /NETSAT/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /A-Level Pro/ })).toBeInTheDocument();
    expect(getLockableMockExams).toHaveBeenCalledTimes(1);
  });

  it('กดสร้างโดยไม่กรอก → error ใต้ช่อง + focus ช่องแรกที่ผิด ไม่เรียก API', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    await screen.findByRole('checkbox', { name: /NETSAT Math 1/ });
    const count = screen.getByLabelText(/จำนวนโค้ด/);
    await user.clear(count);
    await user.type(count, '6000');
    await user.click(screen.getByRole('button', { name: /สร้าง/ }));

    const name = screen.getByLabelText(/ชื่อแคมเปญ/);
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('กรุณาตั้งชื่อแคมเปญ')).toBeInTheDocument();
    expect(screen.getByText('กรุณาเลือกชุดข้อสอบอย่างน้อย 1 ชุด')).toBeInTheDocument();
    expect(screen.getByText('จำนวนโค้ดต้องเป็นจำนวนเต็ม 1–5,000')).toBeInTheDocument();
    expect(count.getAttribute('aria-describedby')).toContain('batch-count-error');
    expect(createUnlockBatch).not.toHaveBeenCalled();

    // แก้ช่องแล้ว error ของช่องนั้นหาย
    await user.type(name, 'x');
    expect(screen.queryByText('กรุณาตั้งชื่อแคมเปญ')).not.toBeInTheDocument();
  });

  it('เลือกหลายชุด + วันหมดอายุ (เวลาไทย) → POST ตามสัญญา แล้วไปหน้ารายละเอียด', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    await user.type(screen.getByLabelText(/ชื่อแคมเปญ/), ' แคมเปญใหม่ ');
    await user.click(await screen.findByRole('checkbox', { name: /NETSAT Math 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /A-Level Pro/ }));
    expect(screen.getByText('เลือกแล้ว 2 ชุด')).toBeInTheDocument();
    const count = screen.getByLabelText(/จำนวนโค้ด/);
    await user.clear(count);
    await user.type(count, '5000');
    const days = screen.getByLabelText(/อายุการเข้าถึง/);
    await user.clear(days);
    await user.type(days, '45');
    fireEvent.change(screen.getByLabelText(/วันหมดอายุของโค้ด/), { target: { value: '2099-12-31T23:59' } });
    await user.click(screen.getByRole('button', { name: 'สร้าง 5,000 โค้ด' }));

    await waitFor(() =>
      expect(createUnlockBatch).toHaveBeenCalledWith({
        name: 'แคมเปญใหม่',
        allMock: false,
        examIds: ['e1', 'e3'],
        count: 5000,
        accessDays: 45,
        // 23:59 เวลาไทย = 16:59 UTC
        codeExpiresAt: '2099-12-31T16:59:00.000Z',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/unlock-codes/b9');
    expect(toast.success).toHaveBeenCalled();
  });

  it('ทุกชุด Mock → ไม่ต้องเลือกชุด ไม่ส่ง examIds', async () => {
    const user = userEvent.setup();
    render(<NewUnlockBatchPage />);
    await user.type(screen.getByLabelText(/ชื่อแคมเปญ/), 'ทุกชุด');
    await user.click(screen.getByRole('radio', { name: /ทุกชุด Mock Exam/ }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'สร้าง 100 โค้ด' }));
    await waitFor(() =>
      expect(createUnlockBatch).toHaveBeenCalledWith({
        name: 'ทุกชุด',
        allMock: true,
        examIds: undefined,
        count: 100,
        accessDays: 30,
        codeExpiresAt: undefined,
      }),
    );
  });

  it('API error → toast พร้อมข้อความ ปุ่มกดใหม่ได้', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    (createUnlockBatch as jest.Mock).mockRejectedValue(new ApiError('examIds ต้องเป็น Mock ที่ไม่ฟรี', 400, null));
    render(<NewUnlockBatchPage />);
    await user.type(screen.getByLabelText(/ชื่อแคมเปญ/), 'x');
    await user.click(screen.getByRole('radio', { name: /ทุกชุด Mock Exam/ }));
    await user.click(screen.getByRole('button', { name: /สร้าง/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('สร้างแคมเปญไม่สำเร็จ: examIds ต้องเป็น Mock ที่ไม่ฟรี'),
    );
    expect(screen.getByRole('button', { name: /สร้าง 100 โค้ด/ })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(within(document.body).queryByText('กำลังสร้างโค้ด...')).not.toBeInTheDocument();
  });
});
