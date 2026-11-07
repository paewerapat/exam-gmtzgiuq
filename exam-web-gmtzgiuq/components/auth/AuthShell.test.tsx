import { render, screen, fireEvent } from '@testing-library/react';
import { AuthShell, GoogleButtonSlot, PasswordInput, authPageClass, authInputClass } from './AuthShell';
import { ThemeProvider } from '@/contexts/ThemeContext';

describe('AuthShell — dark mode', () => {
  it('พื้นหลังหน้ามีคู่สีมืด ไม่ใช้ gradient สว่างใน dark mode', () => {
    expect(authPageClass).toContain('from-indigo-50');
    expect(authPageClass).toMatch(/dark:from-gray-950/);
    expect(authPageClass).toMatch(/dark:via-gray-900/);
    expect(authPageClass).toMatch(/dark:to-indigo-950/);
  });

  it('การ์ดใช้ bg-white คู่ dark:bg-gray-800 พร้อมขอบใน dark', () => {
    const { container } = render(
      <AuthShell>
        <p>เนื้อหา</p>
      </AuthShell>,
    );
    const card = screen.getByText('เนื้อหา').parentElement!;
    expect(card).toHaveClass('bg-white', 'dark:bg-gray-800', 'dark:border-gray-700');
    expect(container.firstChild).toHaveClass('min-h-screen');
  });

  it('input มีพื้น/ตัวอักษร/ขอบโหมดมืด สูงอย่างน้อย 44px และ focus ring 2px', () => {
    const cls = authInputClass();
    expect(cls).toContain('dark:bg-gray-900');
    expect(cls).toContain('dark:text-gray-100');
    expect(cls).toContain('dark:border-gray-600');
    expect(cls).toContain('min-h-11');
    expect(cls).toContain('focus:ring-2!');
    expect(authInputClass({ invalid: true })).toContain('dark:border-red-400');
  });

  it('ช่อง invalid ใช้ focus ring สีแดงแทน indigo ทั้งสองโหมด', () => {
    const invalid = authInputClass({ invalid: true }).split(' ');
    expect(invalid).toEqual(expect.arrayContaining(['focus:ring-2!', 'focus:ring-red-500', 'dark:focus:ring-red-400']));
    expect(invalid).not.toContain('focus:ring-indigo-500');
    expect(invalid).not.toContain('dark:focus:ring-indigo-400');

    const normal = authInputClass().split(' ');
    expect(normal).toEqual(expect.arrayContaining(['focus:ring-indigo-500', 'dark:focus:ring-indigo-400']));
    expect(normal).not.toContain('focus:ring-red-500');
  });

  it('PasswordInput ที่มี error ได้ class focus ring สีแดง', () => {
    render(
      <>
        <label htmlFor="pw2">รหัสผ่าน</label>
        <PasswordInput id="pw2" value="" onChange={() => {}} autoComplete="new-password" error="สั้นเกินไป" />
      </>,
    );
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveClass('focus:ring-red-500', 'dark:focus:ring-red-400', 'border-red-500');
  });
});

describe('GoogleButtonSlot — theme ของปุ่ม Google', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  const renderSlot = () =>
    render(<GoogleButtonSlot>{(width, theme) => <span>{`ปุ่ม ${theme}`}</span>}</GoogleButtonSlot>);

  it('light mode ใช้ outline (ค่าเดิม)', () => {
    renderSlot();
    expect(screen.getByText('ปุ่ม outline')).toBeInTheDocument();
  });

  it('dark mode ใช้ filled_black', async () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <GoogleButtonSlot>{(width, theme) => <span>{`ปุ่ม ${theme}`}</span>}</GoogleButtonSlot>
      </ThemeProvider>,
    );
    expect(await screen.findByText('ปุ่ม filled_black')).toBeInTheDocument();
  });
});

describe('PasswordInput', () => {
  function Harness({ error }: { error?: string }) {
    return (
      <>
        <label htmlFor="pw">รหัสผ่าน</label>
        <PasswordInput id="pw" value="secret" onChange={() => {}} autoComplete="current-password" error={error} />
      </>
    );
  }

  it('ปุ่มแสดง/ซ่อนรหัสผ่านสลับ type และ aria-label', () => {
    render(<Harness />);
    const input = screen.getByLabelText('รหัสผ่าน');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));
    expect(input).toHaveAttribute('type', 'text');
    const hideBtn = screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' });
    expect(hideBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(hideBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('error แสดงใต้ช่องและผูก aria-describedby + aria-invalid', () => {
    render(<Harness error="รหัสผ่านสั้นเกินไป" />);
    const input = screen.getByLabelText('รหัสผ่าน');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('รหัสผ่านสั้นเกินไป');
  });
});
