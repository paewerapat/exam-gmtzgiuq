import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from './page';

const push = jest.fn();
let query = 'token=abc';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
const mutate = jest.fn();
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mutate] }));
jest.mock('@apollo/client', () => ({ gql: (s: TemplateStringsArray) => s.join('') }));

const ENGLISH = /[A-Za-z]{3,}/;

describe('VerifyEmailPage — ข้อความภาษาไทย (task 13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query = 'token=abc';
  });

  it('ระหว่างตรวจ: แสดง "กำลังยืนยันอีเมล" และเรียก mutation ด้วย token เดิม', () => {
    mutate.mockReturnValue(new Promise(() => {}));
    const { container } = render(<VerifyEmailPage />);
    expect(screen.getByRole('heading', { name: 'กำลังยืนยันอีเมล' })).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith({ variables: { token: 'abc' } });
    expect(container.textContent).not.toMatch(ENGLISH);
  });

  it('สำเร็จ: ข้อความไทย', async () => {
    mutate.mockResolvedValue({});
    const { container } = render(<VerifyEmailPage />);
    expect(await screen.findByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ!' })).toBeInTheDocument();
    expect(screen.getByText('กำลังพาไปหน้าเข้าสู่ระบบ...')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(ENGLISH);
  });

  it('token ผิด: error ของ API เป็นอังกฤษ → แสดงไทย ไม่โชว์ข้อความดิบ', async () => {
    mutate.mockRejectedValue(
      Object.assign(new Error('Invalid verification token'), {
        errors: [{ message: 'Invalid verification token', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
      }),
    );
    const { container } = render(<VerifyEmailPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ยืนยันอีเมลไม่สำเร็จ');
    expect(alert).toHaveTextContent('ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือถูกใช้ไปแล้ว');
    expect(screen.getByRole('link', { name: 'ไปหน้าเข้าสู่ระบบ' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'สมัครบัญชีใหม่' })).toHaveAttribute('href', '/register');
    expect(container.textContent).not.toMatch(ENGLISH);
  });

  it('StrictMode (dev) รัน effect ซ้ำ → เรียก verifyEmail ครั้งเดียว', async () => {
    mutate.mockResolvedValue({});
    render(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ!' })).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('ไม่มี token: ไม่เรียก API และแสดงข้อความไทย', async () => {
    query = '';
    const { container } = render(<VerifyEmailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่พบรหัสยืนยันในลิงก์');
    expect(mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(container.textContent).not.toMatch(ENGLISH));
  });
});
