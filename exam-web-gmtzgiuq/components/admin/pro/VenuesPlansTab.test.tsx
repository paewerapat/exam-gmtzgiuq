import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import VenuesPlansTab from './VenuesPlansTab';
import { updateProPlan, updateProVenue, type ProAdminPlan, type ProAdminVenue } from '@/lib/api/pro';
import { ApiError } from '@/lib/api/apiError';
import { DEFAULT_ENTITLEMENTS } from '@/lib/pro';

jest.mock('@/lib/api/pro', () => ({
  createProPlan: jest.fn(),
  createProVenue: jest.fn(),
  deleteProPlan: jest.fn(),
  deleteProVenue: jest.fn(),
  updateProPlan: jest.fn(),
  updateProVenue: jest.fn(),
}));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const plan = (code: string, sortOrder: number): ProAdminPlan => ({
  id: `p-${code}`,
  venueId: 'v1',
  code,
  rank: sortOrder,
  name: code.toUpperCase(),
  tagline: null,
  priceSatang: sortOrder * 10000,
  priceUnit: null,
  priceNote: null,
  periodDays: 30,
  buttonText: 'x',
  badge: null,
  highlight: false,
  sortOrder,
  isVisible: true,
  isPurchasable: sortOrder > 0,
  entitlements: { ...DEFAULT_ENTITLEMENTS },
});

const venue = (id: string, key: string, sortOrder: number, plans: ProAdminPlan[] = []): ProAdminVenue => ({
  id,
  key,
  name: key.toUpperCase(),
  description: null,
  sortOrder,
  isActive: true,
  comparison: { groups: [] },
  plans,
});

const venues = [venue('v1', 'netsat', 0, [plan('free', 0), plan('pro', 1), plan('max', 2)]), venue('v2', 'tgat', 1)];

function setup() {
  const onChange = jest.fn();
  const onReload = jest.fn();
  render(<VenuesPlansTab venues={venues} selectedVenueId="v1" onSelectVenue={jest.fn()} onChange={onChange} onReload={onReload} />);
  return { onChange, onReload };
}

describe('VenuesPlansTab — เรียงลำดับ (task 17 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateProVenue as jest.Mock).mockResolvedValue({});
    (updateProPlan as jest.Mock).mockResolvedValue({});
  });

  it('เลื่อนสนาม: ส่งเฉพาะ { sortOrder } ของรายการที่เปลี่ยน แล้วอัปเดต state', async () => {
    const user = userEvent.setup();
    const { onChange, onReload } = setup();
    await user.click(screen.getByRole('button', { name: 'เลื่อนสนาม TGAT ขึ้น' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect((updateProVenue as jest.Mock).mock.calls).toEqual([
      ['v2', { sortOrder: 0 }],
      ['v1', { sortOrder: 1 }],
    ]);
    expect(onChange.mock.calls[0][0](venues).map((v: ProAdminVenue) => [v.key, v.sortOrder])).toEqual([
      ['tgat', 0],
      ['netsat', 1],
    ]);
    expect(onReload).not.toHaveBeenCalled();
  });

  it('เลื่อนแพ็กเกจ: ส่งเฉพาะ { sortOrder } / มี request พัง → toast + โหลด config ใหม่ ไม่แก้ state เอง', async () => {
    const user = userEvent.setup();
    (updateProPlan as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError('ไม่พบแพ็กเกจนี้', 404, 'PLAN_NOT_FOUND'));
    const { onChange, onReload } = setup();
    await user.click(screen.getByRole('button', { name: 'เลื่อน MAX ขึ้น' }));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect((updateProPlan as jest.Mock).mock.calls).toEqual([
      ['p-max', { sortOrder: 1 }],
      ['p-pro', { sortOrder: 2 }],
    ]);
    expect(toast.error).toHaveBeenCalledWith('ไม่พบแพ็กเกจนี้');
    expect(onChange).not.toHaveBeenCalled();
  });
});
