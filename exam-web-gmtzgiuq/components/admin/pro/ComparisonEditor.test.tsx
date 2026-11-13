import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import ComparisonEditor from './ComparisonEditor';
import { updateProVenue, type ProAdminPlan, type ProAdminVenue } from '@/lib/api/pro';
import { DEFAULT_ENTITLEMENTS } from '@/lib/pro';

jest.mock('@/lib/api/pro', () => {
  const actual = jest.requireActual('@/lib/api/pro');
  return { ...actual, updateProVenue: jest.fn() };
});
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// พิมพ์หลายช่องด้วย userEvent ช้าเมื่อรันทั้งชุดพร้อมกัน (แบบ test ฟอร์มแอดมินอื่น)
jest.setTimeout(30000);

const plan = (code: string, name: string, patch: Partial<ProAdminPlan> = {}): ProAdminPlan => ({
  id: `p-${code}`,
  venueId: 'v1',
  code,
  rank: code === 'free' ? 0 : 1,
  name,
  tagline: null,
  priceSatang: 0,
  priceUnit: null,
  priceNote: null,
  periodDays: 30,
  buttonText: 'x',
  badge: null,
  highlight: false,
  sortOrder: 0,
  isVisible: true,
  isPurchasable: false,
  entitlements: { ...DEFAULT_ENTITLEMENTS },
  ...patch,
});

const venue = (): ProAdminVenue => ({
  id: 'v1',
  key: 'netsat',
  name: 'NETSAT',
  description: 'คำอธิบาย',
  sortOrder: 0,
  isActive: true,
  comparison: {
    groups: [
      {
        title: 'PREDICTED EXAM',
        rows: [
          { label: 'แถว A', cells: { free: { type: 'cross' }, pro: { type: 'check' } } },
          { label: 'แถว B', cells: {} },
        ],
      },
    ],
  },
  plans: [plan('free', 'Free'), plan('pro', 'PRO'), plan('max', 'MAX', { isVisible: false })],
});

const lastPayload = () => (updateProVenue as jest.Mock).mock.calls.at(-1)[1];

describe('ComparisonEditor (task 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateProVenue as jest.Mock).mockImplementation(async (id: string, input: { comparison: unknown }) => ({
      ...venue(),
      comparison: input.comparison,
    }));
  });

  it('โหลดกลุ่ม/แถวเดิม ปุ่มบันทึกปิดจนกว่าจะแก้', () => {
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    expect(screen.getByLabelText('ชื่อกลุ่มที่ 1')).toHaveValue('PREDICTED EXAM');
    expect(screen.getAllByTestId('comparison-row')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'บันทึกตาราง' })[0]).toBeDisabled();
    // ช่องของแถว A: free = ไม่มี, pro = มี, max = ว่าง
    const cell = (plan: string) => screen.getByRole('group', { name: `ช่องของ ${plan} (กลุ่มที่ 1 แถวที่ 1)` });
    expect(within(cell('Free')).getByRole('radio', { name: 'ไม่มี' })).toBeChecked();
    expect(within(cell('PRO')).getByRole('radio', { name: 'มี' })).toBeChecked();
    expect(within(cell('MAX')).getByRole('radio', { name: 'ว่าง' })).toBeChecked();
  });

  it('เพิ่มกลุ่ม + เพิ่มแถว + ตั้งช่องเป็น ✓ / ข้อความ แล้วบันทึก → payload ถูกต้อง (ไม่มี id ภายใน)', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const onDirty = jest.fn();
    render(<ComparisonEditor venue={venue()} onSaved={onSaved} onDirtyChange={onDirty} />);

    await user.click(screen.getByRole('button', { name: 'เพิ่มกลุ่ม' }));
    await user.type(screen.getByLabelText('ชื่อกลุ่มที่ 2'), 'ANALYTICS');
    await user.click(screen.getByRole('button', { name: 'เพิ่มแถวในกลุ่มที่ 2' }));
    await user.type(screen.getByLabelText('ชื่อแถว (กลุ่มที่ 2 แถวที่ 1)'), 'รายงานรอบล่าสุด');

    const cellPro = screen.getByRole('group', { name: 'ช่องของ PRO (กลุ่มที่ 2 แถวที่ 1)' });
    await user.click(within(cellPro).getByRole('radio', { name: 'มี' }));
    const cellMax = screen.getByRole('group', { name: 'ช่องของ MAX (กลุ่มที่ 2 แถวที่ 1)' });
    await user.click(within(cellMax).getByRole('radio', { name: 'ข้อความ' }));
    await user.type(within(cellMax).getByLabelText('ข้อความในช่อง'), '6 ชุด');
    await user.type(within(cellMax).getByLabelText('ข้อความรอง'), 'ต่อ 1 วิชา');
    expect(onDirty).toHaveBeenLastCalledWith(true);

    await user.click(screen.getAllByRole('button', { name: 'บันทึกตาราง' })[0]);
    expect(updateProVenue).toHaveBeenCalledTimes(1);
    const [id, input] = (updateProVenue as jest.Mock).mock.calls[0];
    expect(id).toBe('v1');
    expect(input).toMatchObject({ key: 'netsat', name: 'NETSAT', description: 'คำอธิบาย', sortOrder: 0, isActive: true });
    expect(input.comparison).toEqual({
      groups: [
        {
          title: 'PREDICTED EXAM',
          rows: [
            { label: 'แถว A', cells: { free: { type: 'cross' }, pro: { type: 'check' } } },
            { label: 'แถว B', cells: {} },
          ],
        },
        {
          title: 'ANALYTICS',
          rows: [{ label: 'รายงานรอบล่าสุด', cells: { pro: { type: 'check' }, max: { type: 'text', text: '6 ชุด', subtext: 'ต่อ 1 วิชา' } } }],
        },
      ],
    });
    expect(onSaved).toHaveBeenCalledWith(input.comparison);
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('บันทึกตารางเปรียบเทียบของ NETSAT แล้ว');
  });

  it('เลื่อนแถวลง / ลบแถว / เปลี่ยนช่องเป็นว่าง', async () => {
    const user = userEvent.setup();
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'เลื่อนกลุ่มที่ 1 แถวที่ 1ลง' }));
    expect(screen.getByLabelText('ชื่อแถว (กลุ่มที่ 1 แถวที่ 1)')).toHaveValue('แถว B');
    expect(screen.getByLabelText('ชื่อแถว (กลุ่มที่ 1 แถวที่ 2)')).toHaveValue('แถว A');

    const cellFree = screen.getByRole('group', { name: 'ช่องของ Free (กลุ่มที่ 1 แถวที่ 2)' });
    await user.click(within(cellFree).getByRole('radio', { name: 'ว่าง' }));
    await user.click(screen.getByRole('button', { name: 'ลบกลุ่มที่ 1 แถวที่ 1' }));
    expect(screen.getAllByTestId('comparison-row')).toHaveLength(1);

    await user.click(screen.getAllByRole('button', { name: 'บันทึกตาราง' })[0]);
    expect(lastPayload().comparison).toEqual({
      groups: [{ title: 'PREDICTED EXAM', rows: [{ label: 'แถว A', cells: { pro: { type: 'check' } } }] }],
    });
  });

  it('เลื่อนกลุ่ม + ลบกลุ่มที่มีแถวต้องยืนยัน (ยกเลิก = คงไว้)', async () => {
    const user = userEvent.setup();
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'เพิ่มกลุ่ม' }));
    await user.type(screen.getByLabelText('ชื่อกลุ่มที่ 2'), 'NEW');
    await user.click(screen.getByRole('button', { name: 'เลื่อนกลุ่มที่ 2 ขึ้น' }));
    expect(screen.getByLabelText('ชื่อกลุ่มที่ 1')).toHaveValue('NEW');

    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: false });
    await user.click(screen.getByRole('button', { name: 'ลบกลุ่มที่ 2' }));
    expect(Swal.fire).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('comparison-group')).toHaveLength(2);

    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: true });
    await user.click(screen.getByRole('button', { name: 'ลบกลุ่มที่ 2' }));
    expect(screen.getAllByTestId('comparison-group')).toHaveLength(1);
    // กลุ่มว่างลบได้ทันทีไม่ต้องยืนยัน
    await user.click(screen.getByRole('button', { name: 'ลบกลุ่มที่ 1' }));
    expect(Swal.fire).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByTestId('comparison-group')).toHaveLength(0);
  });

  it('validate ก่อนบันทึก: แถวไม่มีชื่อ / ช่องข้อความว่าง → ข้อความไทย ไม่เรียก API', async () => {
    const user = userEvent.setup();
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    await user.clear(screen.getByLabelText('ชื่อแถว (กลุ่มที่ 1 แถวที่ 2)'));
    await user.click(screen.getAllByRole('button', { name: 'บันทึกตาราง' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('กลุ่มที่ 1 แถวที่ 2: กรุณากรอกชื่อแถว');
    expect(updateProVenue).not.toHaveBeenCalled();
  });

  it('error จาก API (400 ไทย) แสดงใต้ editor', async () => {
    const user = userEvent.setup();
    (updateProVenue as jest.Mock).mockRejectedValueOnce(new Error('ตารางเปรียบเทียบ กลุ่มที่ 1: ชื่อกลุ่มยาวได้ไม่เกิน 100 ตัวอักษร'));
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    await user.type(screen.getByLabelText('ชื่อกลุ่มที่ 1'), '!');
    await user.click(screen.getAllByRole('button', { name: 'บันทึกตาราง' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('ชื่อกลุ่มยาวได้ไม่เกิน 100 ตัวอักษร');
  });

  it('ดูตัวอย่าง: modal (portal) แสดงตารางแบบหน้าจริงตามที่แก้อยู่ เฉพาะแพ็กเกจที่แสดง, ข้อความเป็น text', async () => {
    const user = userEvent.setup();
    render(<ComparisonEditor venue={venue()} onSaved={jest.fn()} />);
    await user.type(screen.getByLabelText('ชื่อแถว (กลุ่มที่ 1 แถวที่ 2)'), '<img src=x onerror=alert(1)>');
    await user.click(screen.getAllByRole('button', { name: 'ดูตัวอย่าง' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'ตัวอย่างตารางเปรียบเทียบ NETSAT' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    const table = within(dialog).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Free', 'PRO']),
    );
    expect(within(table).queryByRole('columnheader', { name: 'MAX' })).not.toBeInTheDocument();
    expect(within(table).getByText('แถว B<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(table.querySelector('img')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
