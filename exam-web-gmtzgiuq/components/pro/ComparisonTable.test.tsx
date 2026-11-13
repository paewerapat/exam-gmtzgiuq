import { render, screen } from '@testing-library/react';
import ComparisonTable from './ComparisonTable';
import type { Comparison } from '@/lib/api/pro';

// QA task 17 (AC11): ข้อความ cell เป็น text เสมอ และตารางต้องไม่ดันหน้ากว้างเกินจอ
const plans = [
  { code: 'free', name: 'Free', highlight: false },
  { code: 'pro', name: 'PRO', highlight: false },
  { code: 'max', name: 'MAX', highlight: true },
];

const comparison: Comparison = {
  groups: [
    {
      title: '<script>alert("g")</script>',
      rows: [
        {
          label: '<img src=x onerror=alert(1)>',
          sublabel: 'sub',
          cells: {
            free: { type: 'check' },
            pro: { type: 'cross' },
            max: { type: 'text', text: '<script>alert(2)</script>', subtext: '<b>x</b>' },
            ghost: { type: 'check' },
          },
        },
      ],
    },
  ],
} as Comparison;

describe('ComparisonTable (QA task 17)', () => {
  it('renders HTML-looking text as plain text, never as elements', () => {
    const { container } = render(<ComparisonTable comparison={comparison} plans={plans} venueName="NETSAT" />);
    expect(screen.getByText('<script>alert("g")</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(2)</script>')).toBeInTheDocument();
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('ignores cells of plan codes that are not columns', () => {
    const { container } = render(<ComparisonTable comparison={comparison} plans={plans} venueName="NETSAT" />);
    expect(container.querySelectorAll('[data-cell-type="check"]')).toHaveLength(1);
  });

  // sr-only (position:absolute) ใน cell ต้องมี containing block อยู่ในกรอบ scroll ของตาราง
  // ไม่งั้นจะหลุดออกจาก overflow-x-auto แล้วทำให้ทั้งหน้ากว้างเกินจอที่ 375px (พบใน QA: หน้า /upgrade กว้าง 494px)
  it('scroll region is the containing block of sr-only cell labels (no page-level horizontal scroll)', () => {
    render(<ComparisonTable comparison={comparison} plans={plans} venueName="NETSAT" />);
    const region = screen.getByRole('region', { name: 'ตารางเปรียบเทียบแพ็กเกจ NETSAT' });
    expect(region.className).toMatch(/\boverflow-x-auto\b/);
    const positioned = (el: HTMLElement | null): boolean => {
      for (let e = el; e && e !== region.parentElement; e = e.parentElement) {
        if (/(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(e.className)) return true;
      }
      return false;
    };
    // ป้าย sr-only ของช่อง ✓ ต้องมี ancestor ที่ positioned อยู่ภายใน (หรือคือ) กรอบ scroll
    const srOnly = screen.getByText('มี');
    expect(positioned(srOnly.parentElement)).toBe(true);
  });
});
