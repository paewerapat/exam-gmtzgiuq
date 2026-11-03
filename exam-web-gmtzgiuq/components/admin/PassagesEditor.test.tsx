import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PassagesEditor from './PassagesEditor';
import { passageFormFromApi, toPassageInput, type PassageForm } from '@/lib/exam-passages';

jest.mock('@/components/upload/QuestionImagesEditor', () => ({ __esModule: true, default: () => null }));

/** ห่อด้วย state จริงแบบหน้า new/edit (onLineNumbersChange แก้ฟอร์ม) แล้วโชว์ payload ที่จะส่ง API */
function Harness({ initial }: { initial: PassageForm[] }) {
  const [passages, setPassages] = useState(initial);
  return (
    <>
      <PassagesEditor
        passages={passages}
        questions={[]}
        onAdd={() => {}}
        onRemove={() => {}}
        onFieldChange={() => {}}
        onLineNumbersChange={(id, value) =>
          setPassages((prev) => prev.map((p) => (p.id === id ? { ...p, lineNumbers: value } : p)))
        }
        onImagesChange={() => {}}
        onImageAdd={() => {}}
      />
      <output data-testid="payload">{JSON.stringify(passages.map(toPassageInput))}</output>
    </>
  );
}

const body = 'บรรทัดแรก\n\nบรรทัดสอง $x^2$';
const payload = () => JSON.parse(screen.getByTestId('payload').textContent!);

describe('PassagesEditor — แสดงเลขบรรทัด (task 09)', () => {
  it('บทอ่านใหม่ไม่ติ๊ก → ติ๊กแล้ว payload ส่ง lineNumbers: true และตัวอย่างการแสดงผลมีเลขบรรทัด', async () => {
    render(<Harness initial={[{ id: 'p1', title: '', body, images: [], lineNumbers: false }]} />);
    const checkbox = screen.getByRole('checkbox', { name: 'แสดงเลขบรรทัด' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(/นับเฉพาะบรรทัดที่มีข้อความ/);
    expect(payload()[0].lineNumbers).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'ดูตัวอย่างการแสดงผล' }));
    expect(screen.queryByTestId('passage-numbered')).not.toBeInTheDocument();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(payload()[0].lineNumbers).toBe(true);
    const preview = screen.getByTestId('passage-numbered');
    expect(Array.from(preview.querySelectorAll('[data-line-number]')).map((el) => el.textContent)).toEqual(['1', '2']);
  });

  it('เปิดแก้ข้อสอบที่เปิดเลขบรรทัดไว้ → checkbox ติ๊กอยู่ เอาติ๊กออก → ส่ง false', async () => {
    const form = passageFormFromApi({ id: 'p1', title: null, body, images: [], lineNumbers: true });
    render(<Harness initial={[form]} />);
    const checkbox = screen.getByRole('checkbox', { name: 'แสดงเลขบรรทัด' });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(payload()[0].lineNumbers).toBe(false);
  });
});
