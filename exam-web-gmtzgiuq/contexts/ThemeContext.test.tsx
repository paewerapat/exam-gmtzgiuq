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
});
