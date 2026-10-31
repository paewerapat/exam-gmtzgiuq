import { render } from '@testing-library/react';
import LatexText from './LatexText';

// hint ในหน้าทำข้อสอบ (ExamContainer โหมด practice) ใช้ LatexText — ข้อความหลายบรรทัดต้องขึ้นบรรทัดใหม่
describe('LatexText — hint หลายบรรทัด', () => {
  it('คง \\n ไว้และใช้ white-space: pre-wrap จึงแสดงขึ้นบรรทัดใหม่', () => {
    const hint = '1. เลือกเฉพาะ $A$\n2. ไม่นับ $c$';
    const { container } = render(<LatexText text={hint} />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.whiteSpace).toBe('pre-wrap');
    expect(span.innerHTML).toContain('\n2. ไม่นับ ');
    expect(span.querySelectorAll('.katex')).toHaveLength(2);
  });
});
