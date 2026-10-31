import { render } from '@testing-library/react';
import LatexRenderer from './LatexRenderer';
// สำเนาของ docs/dev-loop/fixtures/01-sample-exam.json (ไฟล์ตัวอย่างจากลูกค้า)
import sample from '@/lib/__fixtures__/exam-import-sample.json';

function renderHtml(content: string) {
  const { container } = render(<LatexRenderer content={content} />);
  return container.firstChild as HTMLElement;
}

describe('LatexRenderer — Markdown table', () => {
  it('แปลงตารางในโจทย์ข้อ 4 ของ fixture เป็น <table> และ render $x$ ในเซลล์', () => {
    const root = renderHtml(sample.questions[3].stem);
    const table = root.querySelector('table');
    expect(table).not.toBeNull();

    const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['ระดับคอเลสเตอรอล (มก./ดล.)', 'ความถี่สะสม']);

    const rows = table!.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelectorAll('td')[0].textContent).toBe('61–67');
    expect(rows[1].querySelectorAll('td')[1].querySelector('.katex')).not.toBeNull();

    // ข้อความก่อน/หลังตารางยังอยู่ และไม่มีเครื่องหมาย | หลงเหลือนอกตาราง
    expect(root.textContent).toContain('พบข้อมูลดังตาราง');
    expect(root.textContent).toContain('ถ้าค่าเฉลี่ยเลขคณิตเท่ากับ 74.5');
    expect(root.innerHTML).not.toContain('|---|');

    // ห่อด้วย overflow-x-auto และไม่มี newline ภายใน HTML ของตาราง (คอนเทนเนอร์เป็น pre-wrap)
    const wrapper = table!.parentElement!;
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.outerHTML).not.toContain('\n');
    expect(table!.querySelector('th')!.className).toContain('dark:');
  });

  it('รองรับ align จาก : และ \\| ในเซลล์เป็นตัว | ไม่แบ่งเซลล์', () => {
    const root = renderHtml('| ซ้าย | กลาง | ขวา |\n|:---|:---:|---:|\n| a \\| b | 2 | 3 |');
    const ths = root.querySelectorAll('th');
    expect(ths[0].className).toContain('text-left');
    expect(ths[1].className).toContain('text-center');
    expect(ths[2].className).toContain('text-right');
    const tds = root.querySelectorAll('td');
    expect(tds).toHaveLength(3);
    expect(tds[0].textContent).toBe('a | b');
    expect(tds[1].className).toContain('text-center');
  });

  it('แถวที่เซลล์ขาด/เกินถูกปรับให้เท่าจำนวนคอลัมน์หัวตาราง', () => {
    const root = renderHtml('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |');
    const rows = root.querySelectorAll('tbody tr');
    expect([...rows].map((r) => r.querySelectorAll('td').length)).toEqual([2, 2]);
  });

  it('ไม่ทำเป็นตารางเมื่อเส้นคั่นจำนวนคอลัมน์ไม่ตรงหัวตาราง', () => {
    const root = renderHtml('| a | b |\n|---|\n| 1 | 2 |');
    expect(root.querySelector('table')).toBeNull();
    expect(root.textContent).toContain('| a | b |');
  });
});

describe('LatexRenderer — เนื้อหาเดิมไม่เปลี่ยน', () => {
  it('$|x|$ และ a | b กลางประโยคไม่กลายเป็นตาราง', () => {
    const content = 'ถ้า $|x| < 3$ แล้ว a | b เป็นจริง\n| ไม่ใช่ตาราง |\nบรรทัดสุดท้าย';
    const root = renderHtml(content);
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('.katex')).not.toBeNull();
    expect(root.textContent).toContain('a | b เป็นจริง');
    expect(root.textContent).toContain('| ไม่ใช่ตาราง |');
  });

  it('เนื้อหาที่ไม่มีตาราง render เหมือนเดิม (LaTeX inline/block + newline)', () => {
    const content = 'บรรทัด 1\nสูตร $x^2$\n$$\\frac{a}{b}$$';
    const root = renderHtml(content);
    expect(root.style.whiteSpace).toBe('pre-wrap');
    expect(root.querySelectorAll('.katex').length).toBe(2);
    expect(root.querySelector('.katex-display')).not.toBeNull();
    expect(root.innerHTML.startsWith('บรรทัด 1\nสูตร ')).toBe(true);
  });
});
