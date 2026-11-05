import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockExamSettings from './MockExamSettings';
import { createMockExamForm, type MockExamForm } from '@/lib/mock-exam';

// ImageUpload จำลอง: ปุ่มเดียว กด = อัปโหลดสำเร็จ
jest.mock('@/components/upload/ImageUpload', () => {
  let n = 0;
  return {
    __esModule: true,
    default: ({
      onChange,
      onUploaded,
      label = 'รูป',
    }: {
      onChange: (url: string) => void;
      onUploaded?: (url: string) => void;
      label?: string;
    }) => (
      <button
        type="button"
        onClick={() => {
          const url = `/uploads/block-${++n}.png`;
          onUploaded?.(url);
          onChange(url);
        }}
      >
        อัป{label}
      </button>
    ),
  };
});

function Harness({ initial, onUploaded }: { initial?: Partial<MockExamForm>; onUploaded?: (url: string) => void }) {
  const [form, setForm] = useState<MockExamForm>({ ...createMockExamForm(), ...initial });
  return (
    <>
      <MockExamSettings
        value={form}
        onChange={(update) => setForm(update)}
        onBlockImageChange={(key, url) =>
          setForm((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.key === key ? { ...b, url } : b)) }))
        }
        onUploaded={onUploaded}
      />
      <pre data-testid="state">{JSON.stringify(form)}</pre>
    </>
  );
}

const state = (): MockExamForm => JSON.parse(screen.getByTestId('state').textContent || '{}');
const blockSummary = () => state().blocks.map((b) => (b.type === 'text' ? `T:${b.text}` : `I:${b.url}`));

describe('MockExamSettings (task 11)', () => {
  it('ติ๊ก "เป็นชุด Mock Exam" แล้วเห็นตัวเลือกการเข้าถึง ราคา อายุ ระดับ', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('เป็นชุด Mock Exam'));
    expect(screen.getByRole('radio', { name: /เปิดฟรี/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /ต้องใช้โค้ด/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /ต้องซื้อ/ }));
    fireEvent.change(screen.getByLabelText(/ราคา \(บาท ก่อน VAT\)/), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText(/อายุการเข้าถึงหลังซื้อ/), { target: { value: '30' } });
    await user.selectOptions(screen.getByLabelText('ระดับ'), 'medium');

    expect(state()).toMatchObject({ isMock: true, accessType: 'purchase', price: '150', accessDays: '30', level: 'medium' });
    expect(within(screen.getByLabelText('ระดับ')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'ไม่ระบุ',
      'ง่าย',
      'ปานกลาง',
      'ยาก',
    ]);
  });

  it('เพิ่ม ข้อความ-รูป-ข้อความ เลื่อนขึ้นลง และลบ block', async () => {
    const user = userEvent.setup();
    const onUploaded = jest.fn();
    render(<Harness initial={{ isMock: true }} onUploaded={onUploaded} />);

    await user.click(screen.getByRole('button', { name: '+ ข้อความ' }));
    await user.click(screen.getByRole('button', { name: '+ รูป' }));
    await user.click(screen.getByRole('button', { name: '+ ข้อความ' }));
    expect(screen.getAllByTestId('detail-block-form')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('ข้อความช่องที่ 1'), { target: { value: 'บน' } });
    fireEvent.change(screen.getByLabelText('ข้อความช่องที่ 3'), { target: { value: 'ล่าง' } });
    await user.click(screen.getByRole('button', { name: 'อัปรูปช่องที่ 2' }));
    expect(onUploaded).toHaveBeenCalledWith('/uploads/block-1.png');
    expect(blockSummary()).toEqual(['T:บน', 'I:/uploads/block-1.png', 'T:ล่าง']);

    expect(screen.getByRole('button', { name: 'เลื่อนช่องที่ 1 ขึ้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เลื่อนช่องที่ 3 ลง' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'เลื่อนช่องที่ 2 ขึ้น' }));
    expect(blockSummary()).toEqual(['I:/uploads/block-1.png', 'T:บน', 'T:ล่าง']);
    await user.click(screen.getByRole('button', { name: 'เลื่อนช่องที่ 2 ลง' }));
    expect(blockSummary()).toEqual(['I:/uploads/block-1.png', 'T:ล่าง', 'T:บน']);

    await user.click(screen.getByRole('button', { name: 'ลบช่องที่ 1' }));
    expect(blockSummary()).toEqual(['T:ล่าง', 'T:บน']);
  });

  it('ดูตัวอย่างการแสดงผลตามลำดับ (ข้าม block ว่าง)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ isMock: true }} />);
    const previewBtn = screen.getByRole('button', { name: 'ดูตัวอย่างการแสดงผล' });
    expect(previewBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '+ ข้อความ' }));
    await user.click(screen.getByRole('button', { name: '+ รูป' }));
    fireEvent.change(screen.getByLabelText('ข้อความช่องที่ 1'), { target: { value: 'สวัสดี' } });
    await user.click(screen.getByRole('button', { name: 'ดูตัวอย่างการแสดงผล' }));
    const preview = screen.getByTestId('detail-blocks');
    expect(preview).toHaveTextContent('สวัสดี');
    expect(within(preview).queryByRole('img')).not.toBeInTheDocument();
  });
});
