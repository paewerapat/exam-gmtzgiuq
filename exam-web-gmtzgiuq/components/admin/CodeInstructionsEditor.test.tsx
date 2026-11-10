import { useEffect, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockExamSettings from './MockExamSettings';
import { createCodeStep, createMockExamForm, toMockExamInput, type MockExamForm } from '@/lib/mock-exam';

jest.mock('@/components/upload/ImageUpload', () => ({ __esModule: true, default: () => null }));

let latest: MockExamForm;
function Harness({ initial }: { initial?: Partial<MockExamForm> }) {
  const [form, setForm] = useState<MockExamForm>({ ...createMockExamForm(), isMock: true, ...initial });
  useEffect(() => {
    latest = form;
  }, [form]);
  return <MockExamSettings value={form} onChange={(update) => setForm(update)} onBlockImageChange={() => {}} />;
}

describe('ตัวแก้ "วิธีรับโค้ด" ในกล่อง Mock Exam (task 15)', () => {
  it('แสดงเฉพาะเมื่อสถานะการเข้าถึง = ต้องใช้โค้ด', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByTestId('code-instructions-editor')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /ต้องใช้โค้ด/ }));
    expect(screen.getByTestId('code-instructions-editor')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /ต้องซื้อ/ }));
    expect(screen.queryByTestId('code-instructions-editor')).not.toBeInTheDocument();
  });

  it('เพิ่มขั้นตอน กรอกหัวข้อ/คำอธิบาย/ปุ่ม/ลิงก์ + หมายเหตุ → ค่าที่ส่ง API + preview แบบหน้าจริง', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ accessType: 'code' }} />);
    const editor = screen.getByTestId('code-instructions-editor');
    await user.click(within(editor).getByRole('button', { name: 'เพิ่มขั้นตอน' }));
    await user.type(within(editor).getByLabelText(/หัวข้อ/), 'ติดตามเพจ');
    await user.type(within(editor).getByLabelText('คำอธิบาย'), 'กดติดตาม LUMO');
    await user.type(within(editor).getByLabelText('ข้อความปุ่ม'), 'ไปที่ IG');
    await user.type(within(editor).getByLabelText('ลิงก์'), 'https://instagram.com/lumo');
    await user.type(within(editor).getByLabelText(/หมายเหตุ/), 'ตั้งบัญชีเป็นสาธารณะ');

    expect(toMockExamInput(latest).codeInstructions).toEqual({
      steps: [{ title: 'ติดตามเพจ', description: 'กดติดตาม LUMO', linkLabel: 'ไปที่ IG', linkUrl: 'https://instagram.com/lumo' }],
      note: 'ตั้งบัญชีเป็นสาธารณะ',
    });

    await user.click(within(editor).getByRole('button', { name: 'ดูตัวอย่างการแสดงผล' }));
    const preview = within(editor).getByRole('region', { name: 'วิธีรับโค้ด' });
    expect(within(preview).getByText('ติดตามเพจ')).toBeInTheDocument();
    expect(within(preview).getByRole('link', { name: /ไปที่ IG/ })).toHaveAttribute('href', 'https://instagram.com/lumo');
    expect(within(preview).getByText('ตั้งบัญชีเป็นสาธารณะ')).toBeInTheDocument();
  });

  it('ลิงก์ไม่ใช่ http(s) → เตือนใต้ขั้นตอน; ขั้นที่เพิ่งเพิ่ม (ว่าง) ยังไม่เตือน', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ accessType: 'code' }} />);
    const editor = screen.getByTestId('code-instructions-editor');
    await user.click(within(editor).getByRole('button', { name: 'เพิ่มขั้นตอน' }));
    expect(within(editor).queryByText(/กรุณาใส่หัวข้อ/)).not.toBeInTheDocument();
    await user.type(within(editor).getByLabelText(/หัวข้อ/), 'a');
    await user.type(within(editor).getByLabelText('ลิงก์'), 'javascript:alert(1)');
    expect(within(editor).getByText('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')).toBeInTheDocument();
  });

  it('เลื่อน/ลบขั้นตอน และครบ 10 ขั้นแล้วเพิ่มไม่ได้', async () => {
    const user = userEvent.setup();
    const steps = Array.from({ length: 10 }, (_, i) => createCodeStep({ title: `ขั้น ${i + 1}` }));
    render(<Harness initial={{ accessType: 'code', codeSteps: steps }} />);
    const editor = screen.getByTestId('code-instructions-editor');
    expect(within(editor).getByText('ครบ 10 ขั้นตอนแล้ว')).toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: 'เพิ่มขั้นตอน' })).not.toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: 'เลื่อนขั้นที่ 2 ขึ้น' }));
    expect(latest.codeSteps.slice(0, 2).map((s) => s.title)).toEqual(['ขั้น 2', 'ขั้น 1']);
    await user.click(within(editor).getByRole('button', { name: 'ลบขั้นที่ 1' }));
    expect(latest.codeSteps).toHaveLength(9);
    expect(latest.codeSteps[0].title).toBe('ขั้น 1');
    expect(within(editor).getByRole('button', { name: 'เพิ่มขั้นตอน' })).toBeInTheDocument();
  });
});
