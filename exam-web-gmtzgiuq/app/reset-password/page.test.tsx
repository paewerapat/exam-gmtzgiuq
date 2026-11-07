import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResetPasswordPage from './page';

const push = jest.fn();
let query = 'token=abc';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
const mutate = jest.fn();
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mutate] }));
jest.mock('@apollo/client', () => ({ gql: (s: TemplateStringsArray) => s.join('') }));

function submit(pw: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('รหัสผ่านใหม่'), { target: { value: pw } });
  fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query = 'token=abc';
  });

  it('รหัสผ่านไม่ตรงกัน → error ใต้ช่องยืนยัน (aria-describedby) ไม่เรียก mutation', () => {
    render(<ResetPasswordPage />);
    submit('secret1', 'secret2');
    const confirm = screen.getByLabelText('ยืนยันรหัสผ่านใหม่');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAccessibleDescription(/รหัสผ่านไม่ตรงกัน/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('ส่งสำเร็จยังเรียก mutation ด้วย token + รหัสใหม่เหมือนเดิม', async () => {
    mutate.mockResolvedValue({});
    render(<ResetPasswordPage />);
    submit('secret1', 'secret1');
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ variables: { input: { token: 'abc', newPassword: 'secret1' } } }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/ตั้งรหัสผ่านใหม่สำเร็จ/);
    expect(screen.getByLabelText('รหัสผ่านใหม่')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('server error แสดงเป็น role="alert" เป็นภาษาไทย ไม่โชว์ข้อความอังกฤษดิบ', async () => {
    const err = Object.assign(new Error('Invalid reset token'), {
      errors: [{ message: 'Invalid reset token', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
    });
    mutate.mockRejectedValue(err);
    render(<ResetPasswordPage />);
    submit('secret1', 'secret1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือถูกใช้ไปแล้ว');
    expect(alert).not.toHaveTextContent(/Invalid|token/i);
  });

  it('token หมดอายุ → ข้อความไทย', async () => {
    mutate.mockRejectedValue(new Error('Reset token has expired'));
    render(<ResetPasswordPage />);
    submit('secret1', 'secret1');
    expect(await screen.findByRole('alert')).toHaveTextContent('ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว');
  });

  it('ไม่มี token → หน้าลิงก์ไม่ถูกต้องเป็นภาษาไทย + ลิงก์ขอใหม่', () => {
    query = '';
    const { container } = render(<ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ขอลิงก์ใหม่' })).toHaveAttribute('href', '/forgot-password');
    expect(container.textContent).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('ฟอร์มปกติไม่มีข้อความ UI ภาษาอังกฤษ', () => {
    const { container } = render(<ResetPasswordPage />);
    expect(container.textContent).not.toMatch(/[A-Za-z]{3,}/);
  });
});
