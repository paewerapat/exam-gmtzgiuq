import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from './page';

const mutate = jest.fn();
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mutate] }));
jest.mock('@apollo/client', () => ({ gql: (s: TemplateStringsArray) => s.join('') }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function solveCaptcha() {
  const q = screen.getByText(/=\s*\?/).textContent || '';
  const m = q.match(/(\d+)\s*([-+×x*])\s*(\d+)/);
  if (!m) throw new Error('captcha not found: ' + q);
  const a = Number(m[1]);
  const b = Number(m[3]);
  const ans = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b;
  fireEvent.change(screen.getByRole('spinbutton', { name: /ยืนยันว่าคุณไม่ใช่บอท/ }), {
    target: { value: String(ans) },
  });
}

describe('ForgotPasswordPage (task 12 a11y/dark)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ช่องอีเมลมี label ที่มองเห็น + type/autocomplete=email และพื้นหลังมี dark class', () => {
    const { container } = render(<ForgotPasswordPage />);
    const email = screen.getByLabelText('อีเมล');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(container.firstElementChild?.className).toMatch(/dark:from-gray-950/);
    expect(container.querySelector('.bg-white')?.className).toMatch(/dark:bg-gray-800/);
  });

  it('ปุ่มส่ง disabled จนกว่าตอบ captcha ถูก แล้วเรียก mutation ด้วยอีเมลเดิม', async () => {
    mutate.mockResolvedValue({});
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.co' } });
    const btn = screen.getByRole('button', { name: 'ส่งลิงก์รีเซ็ตรหัสผ่าน' });
    expect(btn).toBeDisabled();
    solveCaptcha();
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ variables: { email: 'a@b.co' } }));
    expect(await screen.findByText(/หากบัญชีนี้มีอยู่ในระบบ/)).toBeInTheDocument();
  });

  it('API error → แสดงกล่อง role="alert" ในฟอร์ม', async () => {
    mutate.mockRejectedValue(new Error('boom'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.co' } });
    solveCaptcha();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์รีเซ็ตรหัสผ่าน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|ผิดพลาด/);
  });
});
