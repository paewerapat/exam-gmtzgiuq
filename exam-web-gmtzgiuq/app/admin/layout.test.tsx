import { render, screen, fireEvent } from '@testing-library/react';
import AdminLayout from './layout';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/admin/exams',
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));

function renderLayout() {
  return render(
    <AdminLayout>
      <p>เนื้อหาแอดมิน</p>
    </AdminLayout>,
  );
}

describe('AdminLayout — มือถือ (task 13)', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u', email: 'a@b.c', role: 'admin' }, loading: false });
  });

  it('จอ ≥ lg: sidebar เดิม (hidden lg:block) / main หดตามจอได้', () => {
    const { container } = renderLayout();
    expect(container.querySelector('.hidden.lg\\:block aside')).not.toBeNull();
    expect(container.querySelector('main')!.className).toMatch(/min-w-0/);
    expect(screen.getByText('เนื้อหาแอดมิน').parentElement!.className).toMatch(/lg:p-8/);
  });

  it('ปิดอยู่: drawer invisible (Tab/screen reader เข้าไม่ถึง) ปุ่มเมนูมี aria-expanded/aria-controls', () => {
    const { container } = renderLayout();
    const drawer = container.querySelector('#admin-mobile-drawer')!;
    const button = screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' });
    expect(drawer.className).toMatch(/-translate-x-full/);
    expect(drawer.className).toMatch(/\binvisible\b/);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'admin-mobile-drawer');
  });

  it('เปิด → focus เข้า drawer; Esc → ปิดและคืน focus ให้ปุ่มเมนู', () => {
    const { container } = renderLayout();
    const drawer = container.querySelector('#admin-mobile-drawer')!;
    const button = screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' });

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(drawer.className).toMatch(/translate-x-0 visible/);
    expect(drawer.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(drawer.className).toMatch(/-translate-x-full invisible/);
    expect(document.activeElement).toBe(button);
  });

  it('กดลิงก์ในเมนู → drawer ปิด', () => {
    const { container } = renderLayout();
    const drawer = container.querySelector('#admin-mobile-drawer')!;
    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' }));
    // ลิงก์ตัวสุดท้ายอยู่ใน drawer (ตัวแรกอยู่ใน sidebar จอใหญ่)
    const links = screen.getAllByRole('link', { name: 'ผู้ใช้งาน' });
    fireEvent.click(links[links.length - 1]);
    expect(drawer.className).toMatch(/-translate-x-full/);
  });
});
