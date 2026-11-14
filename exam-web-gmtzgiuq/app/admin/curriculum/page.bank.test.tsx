import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCurriculumPage from './page';
import { getAdminCurriculumTree, updateSubject, updateTopic } from '@/lib/api/curriculum';
import { getProAdminConfig } from '@/lib/api/pro';
import { toast } from 'react-toastify';

jest.mock('@/lib/api/curriculum', () => ({
  getAdminCurriculumTree: jest.fn(),
  createSubject: jest.fn(),
  updateSubject: jest.fn(),
  deleteSubject: jest.fn(),
  createChapter: jest.fn(),
  createTopic: jest.fn(),
  updateTopic: jest.fn(),
  deleteTopic: jest.fn(),
}));
jest.mock('@/lib/api/pro', () => ({ getProAdminConfig: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const tree = (over: Record<string, unknown> = {}) => [
  {
    id: 's-bio',
    name: 'NETSAT BIO',
    description: null,
    color: '#22c55e',
    iconEmoji: null,
    orderIndex: 0,
    isActive: true,
    venueId: null,
    bankLabel: null,
    createdAt: '',
    chapters: [
      {
        id: 'ch',
        subjectId: 's-bio',
        name: '_default',
        description: null,
        orderIndex: 0,
        isActive: true,
        createdAt: '',
        topics: [
          {
            id: 't1',
            chapterId: 'ch',
            name: 'บทที่ 1 การศึกษาชีววิทยา',
            description: null,
            orderIndex: 0,
            isActive: true,
            gradeLabel: 'ม.4',
            term: 1,
            createdAt: '',
          },
          {
            id: 't2',
            chapterId: 'ch',
            name: 'บทที่ 2 พิเศษ',
            description: null,
            orderIndex: 1,
            isActive: true,
            gradeLabel: 'ปวช.1',
            term: null,
            createdAt: '',
          },
        ],
      },
    ],
    ...over,
  },
];

describe('AdminCurriculumPage — สนาม/ป้ายของวิชา + ชั้น/เทอมของบท (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAdminCurriculumTree as jest.Mock).mockResolvedValue(tree());
    (getProAdminConfig as jest.Mock).mockResolvedValue({
      page: {},
      venues: [
        { id: 'v-netsat', key: 'netsat', name: 'NETSAT', isActive: true },
        { id: 'v-tgat', key: 'tgat', name: 'TGAT', isActive: false },
      ],
    });
    (updateSubject as jest.Mock).mockResolvedValue({});
    (updateTopic as jest.Mock).mockResolvedValue({});
  });

  it('ผูกวิชากับสนาม + ชื่อบนการ์ด → updateSubject({ venueId, bankLabel })', async () => {
    const user = userEvent.setup();
    render(<AdminCurriculumPage />);
    await user.click(await screen.findByRole('button', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' }));
    const form = screen.getByRole('form', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' });
    const venue = within(form).getByLabelText('สนามสอบ');
    await waitFor(() => expect(within(venue).getByRole('option', { name: 'NETSAT' })).toBeInTheDocument());
    expect(within(venue).getByRole('option', { name: 'TGAT (ปิดอยู่)' })).toBeInTheDocument();
    await user.selectOptions(venue, 'v-netsat');
    await user.type(within(form).getByLabelText('ชื่อบนการ์ด'), '  ชีวะ ');
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateSubject).toHaveBeenCalledWith('s-bio', { venueId: 'v-netsat', bankLabel: 'ชีวะ' }));
    expect(toast.success).toHaveBeenCalled();
    expect(getAdminCurriculumTree).toHaveBeenCalledTimes(2);
  });

  it('แสดงป้ายสนาม/ชื่อบนการ์ดของวิชาที่ตั้งแล้ว และล้างค่าเป็น null ได้', async () => {
    (getAdminCurriculumTree as jest.Mock).mockResolvedValue(tree({ venueId: 'v-netsat', bankLabel: 'ชีวะ' }));
    const user = userEvent.setup();
    render(<AdminCurriculumPage />);
    expect(await screen.findByText('การ์ด: ชีวะ')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('NETSAT')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' }));
    const form = screen.getByRole('form', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' });
    await user.selectOptions(within(form).getByLabelText('สนามสอบ'), '');
    await user.clear(within(form).getByLabelText('ชื่อบนการ์ด'));
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateSubject).toHaveBeenCalledWith('s-bio', { venueId: null, bankLabel: null }));
  });

  it('บท: แสดงชั้น/เทอม, ตั้ง ม.5 เทอม 2 และ "อื่น ๆ" พิมพ์เอง → updateTopic({ gradeLabel, term })', async () => {
    const user = userEvent.setup();
    render(<AdminCurriculumPage />);
    await user.click(await screen.findByText('NETSAT BIO'));
    expect(screen.getByText('ม.4 · เทอม 1')).toBeInTheDocument();
    expect(screen.getByText('ปวช.1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ตั้งชั้นและเทอมของ บทที่ 1 การศึกษาชีววิทยา' }));
    let form = screen.getByRole('form', { name: 'ชั้นและเทอมของ บทที่ 1 การศึกษาชีววิทยา' });
    expect(within(form).getByLabelText('ชั้น')).toHaveValue('ม.4');
    expect(within(form).getByLabelText('เทอม')).toHaveValue('1');
    await user.selectOptions(within(form).getByLabelText('ชั้น'), 'ม.5');
    await user.selectOptions(within(form).getByLabelText('เทอม'), '2');
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateTopic).toHaveBeenCalledWith('t1', { gradeLabel: 'ม.5', term: 2 }));

    // ชั้นที่ไม่อยู่ในรายการ → "อื่น ๆ" พร้อมค่าเดิม ; เทอมไม่ระบุ = null
    await user.click(screen.getByRole('button', { name: 'ตั้งชั้นและเทอมของ บทที่ 2 พิเศษ' }));
    form = screen.getByRole('form', { name: 'ชั้นและเทอมของ บทที่ 2 พิเศษ' });
    const other = within(form).getByLabelText('ชื่อชั้น');
    expect(other).toHaveValue('ปวช.1');
    await user.clear(other);
    await user.type(other, 'ปวส.2');
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(updateTopic).toHaveBeenLastCalledWith('t2', { gradeLabel: 'ปวส.2', term: null }));
  });

  it('บันทึกไม่สำเร็จ → toast error ฟอร์มยังเปิดอยู่', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (updateSubject as jest.Mock).mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    render(<AdminCurriculumPage />);
    await user.click(await screen.findByRole('button', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' }));
    const form = screen.getByRole('form', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' });
    await user.click(within(form).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('บันทึกไม่สำเร็จ กรุณาลองใหม่'));
    expect(screen.getByRole('form', { name: 'ตั้งค่า Question Bank ของ NETSAT BIO' })).toBeInTheDocument();
  });
});
