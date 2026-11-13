import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import MembersTab from './MembersTab';
import {
  getProSubscriptions,
  grantProSubscription,
  revokeProSubscription,
  type ProAdminPlan,
  type ProAdminSubscription,
  type ProAdminVenue,
} from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import { DEFAULT_ENTITLEMENTS } from '@/lib/pro';

jest.mock('@/lib/api/pro', () => ({
  getProSubscriptions: jest.fn(),
  grantProSubscription: jest.fn(),
  revokeProSubscription: jest.fn(),
}));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// พิมพ์หลายช่องด้วย userEvent ช้าเมื่อรันทั้งชุดพร้อมกัน (แบบ test ฟอร์มแอดมินอื่น)
jest.setTimeout(30000);

const FUTURE = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const plan = (venueId: string, code: string, rank: number, periodDays = 30): ProAdminPlan => ({
  id: `${venueId}-${code}`,
  venueId,
  code,
  rank,
  name: code.toUpperCase(),
  tagline: null,
  priceSatang: rank * 10000,
  priceUnit: null,
  priceNote: null,
  periodDays,
  buttonText: 'x',
  badge: null,
  highlight: false,
  sortOrder: rank,
  isVisible: true,
  isPurchasable: rank > 0,
  entitlements: { ...DEFAULT_ENTITLEMENTS },
});

const venues: ProAdminVenue[] = [
  { id: 'v1', key: 'netsat', name: 'NETSAT', description: null, sortOrder: 0, isActive: true, comparison: { groups: [] }, plans: [plan('v1', 'free', 0), plan('v1', 'pro', 1), plan('v1', 'max', 2, 90)] },
  { id: 'v2', key: 'tgat', name: 'TGAT', description: null, sortOrder: 1, isActive: true, comparison: { groups: [] }, plans: [plan('v2', 'pro', 1)] },
];

const sub = (patch: Partial<ProAdminSubscription> = {}): ProAdminSubscription => ({
  id: 's1',
  user: { id: 'u1', email: 'a@x.com', firstName: 'สมชาย', lastName: 'ใจดี' },
  venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
  plan: { id: 'v1-pro', code: 'pro', name: 'PRO' },
  status: 'active',
  source: 'admin',
  currentPeriodStart: '2026-11-01T00:00:00.000Z',
  currentPeriodEnd: FUTURE,
  autoRenew: false,
  note: 'ทดลอง',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...patch,
});

describe('MembersTab (task 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProSubscriptions as jest.Mock).mockResolvedValue({
      items: [
        sub(),
        sub({ id: 's2', status: 'revoked', user: { id: 'u2', email: 'b@x.com', firstName: null, lastName: null } }),
        sub({ id: 's3', status: 'active', currentPeriodEnd: PAST, user: { id: 'u3', email: 'c@x.com', firstName: null, lastName: null } }),
      ],
      total: 3,
    });
  });

  it('ตาราง: ผู้สมัคร สนาม แพ็กเกจ ป้ายสถานะไทย (active เลยวัน = หมดอายุ) ที่มา หมายเหตุ / ปุ่มถอนสิทธิ์เฉพาะที่ใช้งานอยู่', async () => {
    render(<MembersTab venues={venues} />);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(within(rows[0]).getAllByText('a@x.com')[0]).not.toHaveClass('sr-only');
    expect(within(rows[0]).getByText('ใช้งานอยู่')).toBeInTheDocument();
    expect(within(rows[0]).getByText('แอดมินให้สิทธิ์')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ทดลอง')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: /ถอนสิทธิ์/ })).toBeInTheDocument();
    expect(within(rows[1]).getByText('ถอนสิทธิ์แล้ว')).toBeInTheDocument();
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[2]).getByText('หมดอายุ')).toBeInTheDocument();
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();
    for (const badge of [within(rows[0]).getByText('ใช้งานอยู่'), within(rows[2]).getByText('หมดอายุ')]) {
      expect(badge.className).toMatch(/\bdark:bg-/);
      expect(badge.className).toMatch(/\bdark:text-/);
    }
  });

  it('ตัวกรอง: สนาม → แพ็กเกจของสนามนั้น, สถานะ, ค้นหา (debounce) ส่งไป API', async () => {
    const user = userEvent.setup();
    render(<MembersTab venues={venues} />);
    await screen.findByRole('table');
    expect(getProSubscriptions).toHaveBeenLastCalledWith({ page: 1, limit: 20 }, expect.anything());

    await user.selectOptions(screen.getByLabelText('สนาม'), 'v1');
    const planSelect = screen.getByLabelText('แพ็กเกจ');
    expect(within(planSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['ทุกแพ็กเกจ', 'FREE', 'PRO', 'MAX']);
    await user.selectOptions(planSelect, 'v1-max');
    await user.selectOptions(screen.getByLabelText('สถานะ'), 'expired');
    await user.type(screen.getByLabelText('ค้นหา'), 'a@x');
    await waitFor(() =>
      expect(getProSubscriptions).toHaveBeenLastCalledWith(
        { page: 1, limit: 20, venueId: 'v1', planId: 'v1-max', status: 'expired', search: 'a@x' },
        expect.anything(),
      ),
    );
  });

  it('ให้สิทธิ์: เฉพาะแพ็กเกจไม่ฟรี, จำนวนวันตามแพ็กเกจ, validate, ส่ง API แล้วโหลดตารางใหม่', async () => {
    const user = userEvent.setup();
    (grantProSubscription as jest.Mock).mockResolvedValue(sub({ id: 's9', plan: { id: 'v1-max', code: 'max', name: 'MAX' } }));
    render(<MembersTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'ให้สิทธิ์' }));
    const dialog = screen.getByRole('dialog', { name: 'ให้สิทธิ์สมาชิก' });
    const planSelect = within(dialog).getByLabelText('สนามและแพ็กเกจ');
    expect(within(planSelect).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['v1-pro', 'v1-max', 'v2-pro']);

    await user.click(within(dialog).getByRole('button', { name: 'ให้สิทธิ์' }));
    expect(within(dialog).getByText('กรุณากรอกอีเมลให้ถูกต้อง')).toBeInTheDocument();
    expect(grantProSubscription).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('อีเมลผู้ใช้'), 'a@x.com');
    await user.selectOptions(planSelect, 'v1-max');
    expect(within(dialog).getByLabelText('จำนวนวัน')).toHaveValue(90);
    await user.type(within(dialog).getByLabelText('หมายเหตุ (ไม่บังคับ)'), 'ทดสอบ');
    await user.click(within(dialog).getByRole('button', { name: 'ให้สิทธิ์' }));

    expect(grantProSubscription).toHaveBeenCalledWith({ email: 'a@x.com', planId: 'v1-max', days: 90, note: 'ทดสอบ' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('ให้สิทธิ์ NETSAT · MAX แล้ว');
    await waitFor(() => expect(getProSubscriptions).toHaveBeenCalledTimes(2));
  });

  it('ให้สิทธิ์: API ตอบ 404 ไม่พบผู้ใช้ → ข้อความในฟอร์ม modal ยังเปิด', async () => {
    const user = userEvent.setup();
    (grantProSubscription as jest.Mock).mockRejectedValue(new ApiError('ไม่พบผู้ใช้ที่ใช้อีเมลนี้', 404, 'USER_NOT_FOUND'));
    render(<MembersTab venues={venues} />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'ให้สิทธิ์' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('อีเมลผู้ใช้'), 'nobody@x.com');
    await user.clear(within(dialog).getByLabelText('จำนวนวัน'));
    await user.type(within(dialog).getByLabelText('จำนวนวัน'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'ให้สิทธิ์' }));
    expect(within(dialog).getByText(/จำนวนวันต้องอยู่ระหว่าง 1–3,650/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('จำนวนวัน'));
    await user.type(within(dialog).getByLabelText('จำนวนวัน'), '7');
    await user.click(within(dialog).getByRole('button', { name: 'ให้สิทธิ์' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ไม่พบผู้ใช้ที่ใช้อีเมลนี้');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ถอนสิทธิ์: ยกเลิกในกล่องยืนยัน → ไม่เรียก API / ยืนยัน + หมายเหตุ → เรียก API แล้วโหลดใหม่', async () => {
    const user = userEvent.setup();
    (revokeProSubscription as jest.Mock).mockResolvedValue(sub({ status: 'revoked' }));
    render(<MembersTab venues={venues} />);
    const table = await screen.findByRole('table');
    const revokeBtn = within(table).getByRole('button', { name: /ถอนสิทธิ์/ });

    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: false });
    await user.click(revokeBtn);
    expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'ถอนสิทธิ์สมาชิก?', input: 'text' }));
    expect((Swal.fire as jest.Mock).mock.calls[0][0].text).toContain('a@x.com — NETSAT · PRO');
    expect(revokeProSubscription).not.toHaveBeenCalled();

    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: true, value: 'ขอคืนเงิน' });
    await user.click(revokeBtn);
    await waitFor(() => expect(revokeProSubscription).toHaveBeenCalledWith('s1', 'ขอคืนเงิน'));
    expect(toast.success).toHaveBeenCalledWith('ถอนสิทธิ์แล้ว');
    await waitFor(() => expect(getProSubscriptions).toHaveBeenCalledTimes(2));
  });

  it('ถอนสิทธิ์ไม่สำเร็จ → toast error ข้อความจาก API', async () => {
    const user = userEvent.setup();
    (revokeProSubscription as jest.Mock).mockRejectedValue(new ApiError('สิทธิ์นี้ถูกถอนไปแล้ว', 409));
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true, value: '' });
    render(<MembersTab venues={venues} />);
    await user.click(within(await screen.findByRole('table')).getByRole('button', { name: /ถอนสิทธิ์/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('สิทธิ์นี้ถูกถอนไปแล้ว'));
  });

  it('กรอบ scroll ของตารางเป็น containing block ของ sr-only (ไม่ดันหน้ากว้างเกินจอที่ 375px)', async () => {
    render(<MembersTab venues={venues} />);
    await screen.findByRole('table');
    const region = screen.getByTestId('members-scroll');
    expect(region.className).toMatch(/\boverflow-x-auto\b/);
    const positioned = (el: HTMLElement | null): boolean => {
      for (let e = el; e && e !== region.parentElement; e = e.parentElement) {
        if (/(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(e.className)) return true;
      }
      return false;
    };
    const srOnly = Array.from(region.querySelectorAll<HTMLElement>('.sr-only'));
    expect(srOnly.length).toBeGreaterThan(0);
    for (const el of srOnly) expect(positioned(el.parentElement)).toBe(true);
  });

  it('ผู้ใช้ถูกลบ (user: null) → "(ผู้ใช้ถูกลบ)" และถอนสิทธิ์ได้', async () => {
    const user = userEvent.setup();
    (getProSubscriptions as jest.Mock).mockResolvedValue({ items: [sub({ id: 's7', user: null })], total: 1 });
    (Swal.fire as jest.Mock).mockResolvedValueOnce({ isConfirmed: false });
    render(<MembersTab venues={venues} />);
    const row = within(await screen.findByRole('table')).getAllByRole('row')[1];
    expect(within(row).getByText('(ผู้ใช้ถูกลบ)', { selector: 'span:not(.sr-only)' })).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /ถอนสิทธิ์/ }));
    expect((Swal.fire as jest.Mock).mock.calls[0][0].text).toContain('(ผู้ใช้ถูกลบ) — NETSAT · PRO');
  });

  it('ไม่มีรายการ / โหลดไม่สำเร็จ → ลองใหม่', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getProSubscriptions as jest.Mock).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ items: [], total: 0 });
    render(<MembersTab venues={venues} />);
    await user.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByText('ยังไม่มีสมาชิก')).toBeInTheDocument();
  });
});
