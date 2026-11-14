'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ค่าก่อน mount = 'light' (ตรงกับ HTML ฝั่ง server จึงไม่ hydration mismatch) แล้ว effect ด้านล่างอ่านค่าจริง
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
      applyTheme(stored);
    } else {
      // Check system preference
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = systemDark ? 'dark' : 'light';
      setTheme(initialTheme);
      applyTheme(initialTheme);
    }
  }, []);

  function applyTheme(t: Theme) {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  function toggleTheme() {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  }

  // ครอบ Provider ตั้งแต่ render แรกเสมอ — เดิมคืน children เปล่าก่อน mount แล้วค่อยครอบ Provider
  // ทำให้ทั้งแอปถูก unmount/mount ใหม่ 1 ครั้งทุก hard load (ref/state ในหน้ารีเซ็ต, effect ยิง API ซ้ำ)
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Fallback for server-side rendering or components outside ThemeProvider
    return {
      theme: 'light' as Theme,
      toggleTheme: () => {},
    };
  }
  return context;
}
