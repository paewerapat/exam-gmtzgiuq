import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeContext';

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>current: {theme}</button>
  );
}

function mockMatchMedia(prefersDark: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as any;
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    mockMatchMedia(false);
  });

  it('defaults to the system preference when nothing is stored', async () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('current: dark')).toBeInTheDocument());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores a previously saved theme from localStorage', async () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('current: dark')).toBeInTheDocument());
  });

  it('toggles the theme, updates the html class, and persists the choice', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('current: light')).toBeInTheDocument());

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('current: dark')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  // task 21 Q2: เดิมคืน children เปล่าก่อน mount แล้วค่อยครอบ Provider → ทั้งแอป remount 1 ครั้งทุก hard load
  it('ไม่ remount children หลังอ่านธีม (state/ref ของหน้าคงอยู่, effect ที่เรียก API ไม่ยิงซ้ำ)', async () => {
    mockMatchMedia(true);
    const mounts = jest.fn();
    const unmounts = jest.fn();
    function Page() {
      const [instance] = useState(() => Math.random());
      useEffect(() => {
        mounts(instance);
        return () => unmounts(instance);
      }, [instance]);
      return <ThemeConsumer />;
    }
    render(
      <ThemeProvider>
        <Page />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('current: dark')).toBeInTheDocument());
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
  });

  it('render แรก (ก่อนอ่าน localStorage) ได้ค่า light ตรงกับ HTML ฝั่ง server แล้วเปลี่ยนเป็นค่าที่เก็บไว้', async () => {
    localStorage.setItem('theme', 'dark');
    const seen: string[] = [];
    function Probe() {
      const { theme } = useTheme();
      seen.push(theme);
      return null;
    }
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen[0]).toBe('light');
    await waitFor(() => expect(seen[seen.length - 1]).toBe('dark'));
  });
});
