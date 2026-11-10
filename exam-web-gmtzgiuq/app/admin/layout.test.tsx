import { render, screen, fireEvent, act } from '@testing-library/react';
import AdminLayout from './layout';
import { useAuth } from '@/contexts/AuthContext';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

describe('AdminLayout — focus trap ใน drawer (task 14 E)', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u', email: 'a@b.c', role: 'admin' }, loading: false });
  });

  function openDrawer() {
    const { container } = renderLayout();
    const drawer = container.querySelector<HTMLElement>('#admin-mobile-drawer')!;
    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' }));
    const focusables = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button'));
    return { drawer, first: focusables[0], last: focusables[focusables.length - 1] };
  }

  it('Tab ที่ตัวสุดท้าย → วนกลับตัวแรกของ drawer', () => {
    const { first, last } = openDrawer();
    expect(document.activeElement).toBe(first);
    last.focus();
    const event = fireEvent.keyDown(document, { key: 'Tab' });
    expect(event).toBe(false); // preventDefault → เบราว์เซอร์ไม่ย้าย focus ออกนอก drawer
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab ที่ตัวแรก → ไปตัวสุดท้ายของ drawer', () => {
    const { first, last } = openDrawer();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Tab ระหว่างกลาง drawer → ไม่ดักไว้ (ปล่อยเบราว์เซอร์ย้าย focus ตามปกติ)', () => {
    const { first } = openDrawer();
    first.focus();
    const event = fireEvent.keyDown(document, { key: 'Tab' });
    expect(event).toBe(true);
  });

  it('focus หลุดออกนอก drawer (เช่นคลิกพื้นหลัง) → Tab ดึงกลับเข้า drawer', () => {
    const { drawer, first } = openDrawer();
    (document.activeElement as HTMLElement).blur();
    expect(drawer.contains(document.activeElement)).toBe(false);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  describe('ขยายหน้าต่างจน ≥ lg ระหว่าง drawer เปิด (review task 14)', () => {
    let listeners: Array<(e: { matches: boolean }) => void>;
    let matches: boolean;
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      listeners = [];
      matches = false;
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
        removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners = listeners.filter((l) => l !== cb);
        },
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('matchMedia (min-width: 1024px) เปลี่ยนเป็น match → drawer ปิด และ Tab ไม่ถูกดักอีก', () => {
      const { drawer } = openDrawer();
      const button = screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' });
      expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
      expect(button).toHaveAttribute('aria-expanded', 'true');

      matches = true;
      act(() => listeners.forEach((l) => l({ matches: true })));

      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(drawer.className).toMatch(/-translate-x-full invisible/);
      expect(listeners).toHaveLength(0); // ถอด listener แล้ว
      expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    });

    it('ยังเป็นจอแคบ (change ที่ไม่ match) → drawer เปิดอยู่เหมือนเดิม', () => {
      openDrawer();
      act(() => listeners.forEach((l) => l({ matches: false })));
      expect(screen.getByRole('button', { name: 'เปิดเมนูจัดการระบบ' })).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('drawer ถูกซ่อนด้วย CSS (display: none ที่ ≥ lg) → Tab ไม่ถูกดัก', () => {
    const { drawer, last } = openDrawer();
    last.focus();
    drawer.style.display = 'none';
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('drawer ปิดอยู่ → Tab ไม่ถูกดัก', () => {
    renderLayout();
    const event = fireEvent.keyDown(document, { key: 'Tab' });
    expect(event).toBe(true);
  });
});

describe('AdminLayout — เช็ก role แอดมิน (task 14 C / SEC-8)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it('กำลังโหลด auth → แสดง "กำลังโหลด..." ไม่ render เนื้อหาแอดมิน ยังไม่ redirect', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, loading: true });
    renderLayout();
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument();
    expect(screen.queryByText('เนื้อหาแอดมิน')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('นักเรียน login แล้ว → ไป /dashboard ไม่เห็นเนื้อหา/เมนูแอดมินเลย', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 's', email: 's@b.c', role: 'user' }, loading: false });
    renderLayout();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByText('เนื้อหาแอดมิน')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ชุดข้อสอบ' })).not.toBeInTheDocument();
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument();
  });

  it('user ไม่มี role → ถือว่าไม่ใช่แอดมิน → /dashboard', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 's', email: 's@b.c' }, loading: false });
    renderLayout();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByText('เนื้อหาแอดมิน')).not.toBeInTheDocument();
  });

  it('ยังไม่ login → /login?redirect=<path ปัจจุบัน>', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, loading: false });
    renderLayout();
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fadmin%2Fexams');
    expect(screen.queryByText('เนื้อหาแอดมิน')).not.toBeInTheDocument();
  });

  it.each(['admin', 'ADMIN', 'Admin'])('role %p → เห็นเนื้อหาแอดมิน ไม่ redirect', (role) => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'a', email: 'a@b.c', role }, loading: false });
    renderLayout();
    expect(screen.getByText('เนื้อหาแอดมิน')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('แอดมินถูกลดสิทธิ์ระหว่างใช้งาน (currentUser refresh) → ซ่อนเนื้อหาแล้วไป /dashboard', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'a', email: 'a@b.c', role: 'admin' }, loading: false });
    const { rerender } = renderLayout();
    expect(screen.getByText('เนื้อหาแอดมิน')).toBeInTheDocument();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'a', email: 'a@b.c', role: 'user' }, loading: false });
    rerender(
      <AdminLayout>
        <p>เนื้อหาแอดมิน</p>
      </AdminLayout>,
    );
    expect(screen.queryByText('เนื้อหาแอดมิน')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
