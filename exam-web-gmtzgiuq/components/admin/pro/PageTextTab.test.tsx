import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import PageTextTab from './PageTextTab';
import { updateProPage, type ProPageSettings } from '@/lib/api/pro';

jest.mock('@/lib/api/pro', () => ({ updateProPage: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const page: ProPageSettings = {
  title: 'แพ็กเกจ LUMO',
  subtitle: 'เลือกแพ็กเกจ',
  venuePickerTitle: 'เลือกสนาม',
  footerNote: '',
  vatEnabled: false,
  paymentsOpen: false,
};

describe('/admin/pro แท็บหน้า Upgrade — VAT (task 18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('toggle VAT 7% + ข้อความว่ามีผลกับการชำระครั้งใหม่เท่านั้น → บันทึกส่ง vatEnabled', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    (updateProPage as jest.Mock).mockImplementation(async (input: ProPageSettings) => ({ ...input }));
    render(<PageTextTab page={page} onSaved={onSaved} />);

    const toggle = screen.getByRole('switch', { name: /คิด VAT 7% เพิ่มจากราคาแพ็กเกจ/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/มีผลกับการชำระครั้งใหม่เท่านั้น ไม่กระทบรอบต่ออายุอัตโนมัติที่ตั้งไว้แล้ว/);

    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProPage).toHaveBeenCalledWith({ ...page, vatEnabled: true }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ vatEnabled: true }));
    expect(toast.success).toHaveBeenCalled();
  });

  it('ค่าเริ่มต้นจาก API เปิดอยู่ → ปิดแล้วส่ง false', async () => {
    const user = userEvent.setup();
    (updateProPage as jest.Mock).mockImplementation(async (input: ProPageSettings) => ({ ...input }));
    render(<PageTextTab page={{ ...page, vatEnabled: true }} onSaved={jest.fn()} />);
    const toggle = screen.getByRole('switch', { name: /คิด VAT 7%/ });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProPage).toHaveBeenCalledWith(expect.objectContaining({ vatEnabled: false })));
  });
});

describe('/admin/pro แท็บหน้า Upgrade — สวิตช์เปิดรับชำระเงิน (task 23)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ค่าจาก API ปิดอยู่ + คำอธิบาย → เปิดแล้วบันทึกส่ง paymentsOpen: true ผ่าน PUT /pro/admin/page', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    (updateProPage as jest.Mock).mockImplementation(async (input: ProPageSettings) => ({ ...input }));
    render(<PageTextTab page={page} onSaved={onSaved} />);

    const toggle = screen.getByRole('switch', { name: /เปิดรับชำระเงิน/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(
      'ปิด = ผู้ใช้เห็น "เร็ว ๆ นี้" และกดชำระไม่ได้ (แอดมินยังทดสอบจ่ายได้) เปิดเมื่อใส่ live key ของ Opn แล้ว',
    );
    expect(screen.getByText('ปิดอยู่')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText('เปิดอยู่')).toBeInTheDocument();
    // สวิตช์ VAT ไม่ถูกแตะ
    expect(screen.getByRole('switch', { name: /คิด VAT 7%/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProPage).toHaveBeenCalledWith({ ...page, paymentsOpen: true }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ paymentsOpen: true }));
  });

  it('เปิดอยู่ → ปิดแล้วบันทึกส่ง paymentsOpen: false', async () => {
    const user = userEvent.setup();
    (updateProPage as jest.Mock).mockImplementation(async (input: ProPageSettings) => ({ ...input }));
    render(<PageTextTab page={{ ...page, paymentsOpen: true }} onSaved={jest.fn()} />);
    const toggle = screen.getByRole('switch', { name: /เปิดรับชำระเงิน/ });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateProPage).toHaveBeenCalledWith(expect.objectContaining({ paymentsOpen: false, vatEnabled: false })));
  });
});
