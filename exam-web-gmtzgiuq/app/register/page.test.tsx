import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './page';
import { useAuth } from '@/contexts/AuthContext';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button type="button">Google</button>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const register = jest.fn();

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่าน'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'สมัครสมาชิก' }));
}

describe('RegisterPage — ฟอร์ม a11y', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: null, loading: false, register, loginWithGoogle: jest.fn() });
  });

  it('ช่องมี autocomplete ให้ password manager ใช้ได้', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('อีเมล')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('ยืนยันรหัสผ่าน')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('ชื่อ')).toHaveAttribute('autocomplete', 'given-name');
    expect(screen.getByLabelText('นามสกุล')).toHaveAttribute('autocomplete', 'family-name');
  });

  it('รหัสผ่านไม่ตรงกัน → error ใต้ช่องยืนยัน ไม่เรียก register', () => {
    render(<RegisterPage />);
    fill('secret1', 'secret2');
    const confirm = screen.getByLabelText('ยืนยันรหัสผ่าน');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAccessibleDescription(/รหัสผ่านไม่ตรงกัน/);
    expect(register).not.toHaveBeenCalled();
  });

  it('รหัสผ่านสั้น → error ใต้ช่องรหัสผ่าน', () => {
    render(<RegisterPage />);
    fill('abc', 'abc');
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveAccessibleDescription(/อย่างน้อย 6 ตัวอักษร/);
    expect(register).not.toHaveBeenCalled();
  });

  it('server error แสดงเป็น role="alert"', async () => {
    register.mockRejectedValue(new Error('อีเมลนี้ถูกใช้แล้ว'));
    render(<RegisterPage />);
    fill('secret1', 'secret1');
    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลนี้ถูกใช้แล้ว');
    await waitFor(() => expect(register).toHaveBeenCalledWith('a@b.c', 'secret1', undefined, undefined));
  });

  it('BUG-16: API ตอบ "Bad Request Exception" → ข้อความไทย ไม่โชว์ข้อความดิบ', async () => {
    register.mockRejectedValue(
      Object.assign(new Error('Bad Request Exception'), {
        errors: [
          {
            message: 'Bad Request Exception',
            extensions: { code: 'BAD_REQUEST', originalError: { message: ['email must be an email'] } },
          },
        ],
      }),
    );
    render(<RegisterPage />);
    fill('secret1', 'secret1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('รูปแบบอีเมลไม่ถูกต้อง');
    expect(alert).not.toHaveTextContent(/Bad Request/);
  });

  it('อีเมลซ้ำ (ข้อความอังกฤษ) → บอกให้เข้าสู่ระบบหรือใช้อีเมลอื่น', async () => {
    register.mockRejectedValue(new Error('Email already exists'));
    render(<RegisterPage />);
    fill('secret1', 'secret1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่นสมัคร');
    expect(alert).not.toHaveTextContent(/already/i);
  });
});
