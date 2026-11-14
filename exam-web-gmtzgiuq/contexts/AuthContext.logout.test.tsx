import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { EXAM_STORAGE_KEYS } from '@/lib/exam-utils';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [jest.fn()],
  useLazyQuery: () => [jest.fn().mockResolvedValue({ data: null })],
}));

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={logout}>
      ออกจากระบบ
    </button>
  );
}

describe('AuthContext logout — ล้าง session ฝึกที่ค้างในเครื่อง (task 20 round 2)', () => {
  it('ออกจากระบบแล้ว token/user และ exam_current_session/questions ถูกลบ', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'a@b.c', isEmailVerified: true }));
    localStorage.setItem(EXAM_STORAGE_KEYS.SESSION, JSON.stringify({ id: 's', examId: 'bank_x', venueKey: 'netsat' }));
    localStorage.setItem(EXAM_STORAGE_KEYS.QUESTIONS, JSON.stringify([{ id: 'q', question: 'โจทย์ Challenge' }]));

    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'ออกจากระบบ' }).click();
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem(EXAM_STORAGE_KEYS.SESSION)).toBeNull();
    expect(localStorage.getItem(EXAM_STORAGE_KEYS.QUESTIONS)).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
