import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanFormModal from './PlanFormModal';
import { ApiError } from '@/lib/api/apiError';

// พิมพ์หลายช่องด้วย userEvent ช้าเมื่อรันทั้งชุดพร้อมกัน (แบบ test ฟอร์มแอดมินอื่น)
jest.setTimeout(30000);

describe('PlanFormModal (task 17)', () => {
  it('กล่อง "สิทธิ์ที่ใช้ได้จริง" แยกจากข้อความที่แสดง → payload มี entitlements, ราคาบาท → สตางค์, ทุกชุด = null', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlanFormModal venueName="NETSAT" plan={null} otherCodes={['free']} nextSortOrder={3} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มแพ็กเกจ (NETSAT)' });
    const display = within(dialog).getByRole('group', { name: 'ข้อความที่แสดงบนหน้า Upgrade' });
    const real = within(dialog).getByRole('group', { name: 'สิทธิ์ที่ใช้ได้จริง' });
    expect(within(display).queryByRole('checkbox', { name: /Challenge/ })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('รหัสแพ็กเกจ'), 'max');
    await user.clear(within(dialog).getByLabelText('ระดับ (rank)'));
    await user.type(within(dialog).getByLabelText('ระดับ (rank)'), '2');
    await user.type(within(dialog).getByLabelText('ราคา (บาท)'), '299.50');
    await user.type(within(display).getByLabelText('ชื่อแพ็กเกจ'), 'MAX');
    await user.type(within(display).getByLabelText('ข้อความปุ่ม'), 'สมัคร MAX');
    await user.type(within(display).getByLabelText('ป้าย'), 'แนะนำ');
    await user.click(within(real).getByRole('checkbox', { name: /ข้อ Challenge/ }));
    await user.click(within(real).getByRole('checkbox', { name: /ชุด Mock ที่ต้องซื้อ/ }));
    await user.click(within(real).getByRole('checkbox', { name: 'ทุกชุด' }));
    expect(within(real).getByLabelText('ชุด Predicted ต่อวิชา')).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'บันทึกแพ็กเกจ' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'max',
        rank: 2,
        priceSatang: 29950,
        name: 'MAX',
        buttonText: 'สมัคร MAX',
        badge: 'แนะนำ',
        tagline: null,
        sortOrder: 3,
        isPurchasable: true,
        entitlements: expect.objectContaining({ challenge: true, mockPurchase: true, beyond: false, predictedSets: null }),
      }),
    );
  });

  it('แพ็กเกจระดับ 0 ราคา > 0 → ข้อความไทย ไม่ส่ง / รหัสซ้ำ / error จาก API แสดงในฟอร์ม', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockRejectedValue(new Error('รหัสแพ็กเกจซ้ำในสนามนี้'));
    render(
      <PlanFormModal venueName="NETSAT" plan={null} otherCodes={['free']} nextSortOrder={0} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByLabelText('รหัสแพ็กเกจ'), 'free');
    await user.type(screen.getByLabelText('ชื่อแพ็กเกจ'), 'Free');
    await user.type(screen.getByLabelText('ข้อความปุ่ม'), 'เริ่มใช้งาน');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('รหัสแพ็กเกจนี้มีอยู่แล้วในสนามนี้');

    await user.clear(screen.getByLabelText('รหัสแพ็กเกจ'));
    await user.type(screen.getByLabelText('รหัสแพ็กเกจ'), 'basic');
    await user.clear(screen.getByLabelText('ระดับ (rank)'));
    await user.type(screen.getByLabelText('ระดับ (rank)'), '0');
    await user.type(screen.getByLabelText('ราคา (บาท)'), '10');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('แพ็กเกจระดับ 0 (ฟรี) ต้องมีราคา 0');
    expect(screen.getByRole('checkbox', { name: /เปิดให้ซื้อ/ })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('ราคา (บาท)'));
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rank: 0, priceSatang: 0, isPurchasable: false }));
    expect(await screen.findByRole('alert')).toHaveTextContent('รหัสแพ็กเกจซ้ำในสนามนี้');
  });

  it('ระดับ 0: ติ๊ก "ชุด Mock ที่ต้องซื้อ" ไม่ได้ (มีคำอธิบาย) / ติ๊กค้างจากเดิม → บล็อกตอนบันทึก', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlanFormModal venueName="NETSAT" plan={null} otherCodes={[]} nextSortOrder={0} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    const mock = screen.getByRole('checkbox', { name: /ชุด Mock ที่ต้องซื้อ/ });
    await user.click(mock);
    expect(mock).toBeChecked();
    await user.clear(screen.getByLabelText('ระดับ (rank)'));
    await user.type(screen.getByLabelText('ระดับ (rank)'), '0');
    // ติ๊กค้างอยู่ → ยังเอาออกได้ + มีคำอธิบาย
    expect(mock).toBeEnabled();
    expect(mock).toHaveAccessibleDescription(/ให้สิทธิ์ "ชุด Mock ที่ต้องซื้อ" ไม่ได้/);
    await user.type(screen.getByLabelText('รหัสแพ็กเกจ'), 'free');
    await user.type(screen.getByLabelText('ชื่อแพ็กเกจ'), 'Free');
    await user.type(screen.getByLabelText('ข้อความปุ่ม'), 'เริ่มใช้งาน');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('แพ็กเกจระดับ 0 (ฟรี) ให้สิทธิ์ "ชุด Mock ที่ต้องซื้อ" ไม่ได้');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(mock);
    expect(mock).not.toBeChecked();
    expect(mock).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rank: 0, entitlements: expect.objectContaining({ mockPurchase: false }) }));
  });

  it('สนามมีแพ็กเกจฟรีอยู่แล้ว → ห้ามเพิ่มระดับ 0 อีก / error code จาก API แสดงข้อความไทยที่ชัด', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('Failed to create plan', 409, 'FREE_PLAN_EXISTS'))
      .mockRejectedValueOnce(new ApiError('Failed to create plan', 400, 'FREE_PLAN_MOCK_PURCHASE'));
    const { unmount } = render(
      <PlanFormModal venueName="NETSAT" plan={null} otherCodes={[]} otherFreePlanExists nextSortOrder={0} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByLabelText('รหัสแพ็กเกจ'), 'free2');
    await user.type(screen.getByLabelText('ชื่อแพ็กเกจ'), 'Free 2');
    await user.type(screen.getByLabelText('ข้อความปุ่ม'), 'เริ่ม');
    await user.clear(screen.getByLabelText('ระดับ (rank)'));
    await user.type(screen.getByLabelText('ระดับ (rank)'), '0');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อยู่แล้ว');
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();

    // กรณี state ในหน้าไม่ทันสมัย: API ตอบ 409 / 400 → ข้อความไทยตาม errorCode (ไม่ใช่ข้อความอังกฤษ)
    render(<PlanFormModal venueName="NETSAT" plan={null} otherCodes={[]} nextSortOrder={0} onClose={jest.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('รหัสแพ็กเกจ'), 'free2');
    await user.type(screen.getByLabelText('ชื่อแพ็กเกจ'), 'Free 2');
    await user.type(screen.getByLabelText('ข้อความปุ่ม'), 'เริ่ม');
    await user.clear(screen.getByLabelText('ระดับ (rank)'));
    await user.type(screen.getByLabelText('ระดับ (rank)'), '0');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('สนามนี้มีแพ็กเกจระดับ 0 (ฟรี) อยู่แล้ว มีได้สนามละ 1 แพ็กเกจ');
    await user.click(screen.getByRole('button', { name: 'บันทึกแพ็กเกจ' }));
    expect(await screen.findByText(/ให้สิทธิ์ "ชุด Mock ที่ต้องซื้อ" ไม่ได้ ปิดสิทธิ์นี้/, { selector: '[role="alert"]' })).toBeInTheDocument();
  });
});
