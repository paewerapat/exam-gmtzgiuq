import fs from 'fs';
import path from 'path';

/**
 * task 13 (A): commit 154ce33 ทำให้ข้อความไทยในหน้า /blogs กลายเป็น mojibake
 * (UTF-8 ถูกอ่านเป็น cp874 เช่น "เธเธฒเธ—เธต" แทน "นาที", "โ’" แทน "→") กันไม่ให้กลับมาอีก
 */
// ไบต์ที่ 3 ของอักษรไทยใน UTF-8 (0x80–0xBF) เมื่ออ่านเป็น cp874 = C1 control / €…‘’“”•–— / NBSP / ก–ฟ
// คำไทยปกติอย่าง "เธอ" หรือ "เนื้อ" ไม่ตรง pattern นี้
const MOJIBAKE = /[\u0080-\u009f]|เ[ธน][ ก-ฟ–-…€]|โ€|โ’/;

const FILES = [
  'page.tsx',
  'recent/page.tsx',
  'notes/page.tsx',
  'essays/page.tsx',
  '[slug]/BlogDetailClient.tsx',
];

describe('/blogs source — ไม่มี mojibake', () => {
  it.each(FILES)('%s', (file) => {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(src.charCodeAt(0)).not.toBe(0xfeff); // BOM ที่ติดมากับ 154ce33
    const bad = src.split('\n').filter((line) => MOJIBAKE.test(line));
    expect(bad).toEqual([]);
  });

  it('ข้อความไทยหลักกลับมาถูกต้อง และแบรนด์เป็น LUMO', () => {
    const index = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
    expect(index).toContain('อ่านเพิ่มเติม →');
    expect(index).toContain('ดูทั้งหมด');
    expect(index).toContain('} นาที');
    expect(index).toContain('บทความและแหล่งความรู้');
    expect(index).toContain('LUMO');
    expect(index).not.toContain('ExamPrep');
  });
});
