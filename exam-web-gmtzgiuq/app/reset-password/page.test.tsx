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
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: pw } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query = 'token=abc';
  });

  it('รหัสผ่านไม่ตรงกัน → error ใต้ช่องยืนยัน (aria-describedby) ไม่เรียก mutation', () => {
    render(<ResetPasswordPage />);
    submit('secret1', 'secret2');
    const confirm = screen.getByLabelText('Confirm New Password');
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
    expect(await screen.findByRole('status')).toHaveTextContent(/Password reset successful/);
    expect(screen.getByLabelText('New Password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('server error แสดงเป็น role="alert"', async () => {
    mutate.mockRejectedValue(new Error('Token expired'));
    render(<ResetPasswordPage />);
    submit('secret1', 'secret1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Token expired');
  });
});
