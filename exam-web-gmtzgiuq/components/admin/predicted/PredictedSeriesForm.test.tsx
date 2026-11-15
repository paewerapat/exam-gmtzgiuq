import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import PredictedSeriesForm from './PredictedSeriesForm';
import {
  createPredictedSeries,
  searchPredictedExamOptions,
  updatePredictedSeries,
  type AdminPredictedSeries,
} from '@/lib/api/predicted';
import { ApiError } from '@/lib/api/apiError';
import type { ProAdminVenue } from '@/lib/api/pro';
import type { Subject } from '@/lib/api/curriculum';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/api/predicted', () => ({
  createPredictedSeries: jest.fn(),
  updatePredictedSeries: jest.fn(),
  searchPredictedExamOptions: jest.fn(),
}));

const venues = [
  { id: 'v1', key: 'netsat', name: 'NETSAT', isActive: true },
  { id: 'v2', key: 'alevel', name: 'A-Level', isActive: false },
] as unknown as ProAdminVenue[];

const subjects = [
  { id: 's-math', name: 'คณิตศาสตร์', venueId: 'v1' },
  { id: 's-phy', name: 'ฟิสิกส์', venueId: 'v1' },
  { id: 's-al', name: 'คณิต A-Level', venueId: 'v2' },
] as unknown as Subject[];

const series: AdminPredictedSeries = {
  id: 'sr1',
  title: 'NETSAT MATH JAN PREDICTED',
  description: null,
  color: '#5b4cf0',
  venueId: 'v1',
  venueKey: 'netsat',
  venueName: 'NETSAT',
  subjectId: 's-math',
  subjectName: 'คณิตศาสตร์',
  sortOrder: 1,
  isActive: true,
  setCount: 2,
  updatedAt: null,
  sets: [
    { examId: 'e1', setNo: 1, access: 'free', previewCount: 20, title: 'ชุด A', questionCount: 40, status: 'published' },
    { examId: 'e2', setNo: 2, access: 'pro', previewCount: null, title: 'ชุด B', questionCount: 40, status: 'published' },
  ],
};

function renderForm(props: Partial<React.ComponentProps<typeof PredictedSeriesForm>> = {}) {
  const onSaved = jest.fn();
  render(
    <PredictedSeriesForm
      series={null}
      venues={venues}
      subjects={subjects}
      onSaved={onSaved}
      onCancel={jest.fn()}
      {...props}
    />,
  );
  return { onSaved };
}

const rowTitles = () => screen.queryAllByTestId('series-set-row').map((r) => within(r).getByText(/^ชุด [A-Z]/).textContent);

describe('PredictedSeriesForm (task 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (searchPredictedExamOptions as jest.Mock).mockResolvedValue([
      { id: 'e9', title: 'ชุด C', questionCount: 25, status: 'published', subjectName: 'เคมี', categoryName: null },
    ]);
  });

  it('สร้าง: validate ก่อนส่ง (ชื่อ/สนาม) แล้ว POST ด้วย payload ตามสัญญา (setNo ตามลำดับ, previewCount null)', async () => {
    const user = userEvent.setup();
    (createPredictedSeries as jest.Mock).mockResolvedValue({ id: 'new' });
    const { onSaved } = renderForm();

    await user.click(screen.getByRole('button', { name: 'สร้างซีรีส์' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกชื่อซีรีส์');
    expect(createPredictedSeries).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('ชื่อซีรีส์'), 'NETSAT CHEM JAN');
    await user.click(screen.getByRole('button', { name: 'สร้างซีรีส์' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณาเลือกสนามสอบ');

    await user.selectOptions(screen.getByLabelText('สนามสอบ'), 'v1');
    // วิชาแสดงเฉพาะของสนามที่เลือก
    const subjectSelect = screen.getByLabelText('วิชา');
    expect(within(subjectSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'ไม่ระบุวิชา',
      'คณิตศาสตร์',
      'ฟิสิกส์',
    ]);
    await user.selectOptions(subjectSelect, 's-phy');

    await user.click(await screen.findByRole('button', { name: 'เพิ่ม ชุด C' }));
    expect(rowTitles()).toEqual(['ชุด C']);
    // เพิ่มแล้วไม่อยู่ในผลค้นหาอีก
    expect(screen.queryByRole('button', { name: 'เพิ่ม ชุด C' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'สร้างซีรีส์' }));
    await waitFor(() => expect(createPredictedSeries).toHaveBeenCalled());
    expect(createPredictedSeries).toHaveBeenCalledWith({
      title: 'NETSAT CHEM JAN',
      description: null,
      venueId: 'v1',
      subjectId: 's-phy',
      color: null,
      sortOrder: 0,
      isActive: true,
      sets: [{ examId: 'e9', setNo: 1, access: 'pro', previewCount: null }],
    });
    expect(onSaved).toHaveBeenCalledWith({ id: 'new' });
    expect(toast.success).toHaveBeenCalledWith('สร้างซีรีส์แล้ว');
  });

  it('แก้: เรียงด้วยปุ่มขึ้น/ลง (setNo ใหม่), เปลี่ยนสิทธิ์ฟรี/Pro, Preview แสดงจำนวนข้อทั้งหมด, ลบออก', async () => {
    const user = userEvent.setup();
    (updatePredictedSeries as jest.Mock).mockResolvedValue(series);
    renderForm({ series });
    expect(rowTitles()).toEqual(['ชุด A', 'ชุด B']);
    expect(screen.getByLabelText('ชื่อซีรีส์')).toHaveValue('NETSAT MATH JAN PREDICTED');
    expect(screen.getByLabelText('วิชา')).toHaveValue('s-math');

    const [rowA] = screen.getAllByTestId('series-set-row');
    expect(within(rowA).getByText('จาก 40 ข้อ')).toBeInTheDocument();
    expect(within(rowA).getByLabelText('Preview (ข้อ)')).toHaveValue('20');
    expect(screen.getByRole('button', { name: 'เลื่อนชุดที่ 1ขึ้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เลื่อนชุดที่ 2ลง' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'เลื่อนชุดที่ 2ขึ้น' }));
    expect(rowTitles()).toEqual(['ชุด B', 'ชุด A']);
    await user.click(screen.getByRole('button', { name: 'ชุดที่ 1 ฟรี' }));
    expect(screen.getByRole('button', { name: 'ชุดที่ 1 ฟรี' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'บันทึกซีรีส์' }));
    await waitFor(() => expect(updatePredictedSeries).toHaveBeenCalled());
    expect((updatePredictedSeries as jest.Mock).mock.calls[0][0]).toBe('sr1');
    expect((updatePredictedSeries as jest.Mock).mock.calls[0][1].sets).toEqual([
      { examId: 'e2', setNo: 1, access: 'free', previewCount: null },
      { examId: 'e1', setNo: 2, access: 'free', previewCount: 20 },
    ]);

    await user.click(screen.getByRole('button', { name: 'เอาชุดที่ 1ออกจากซีรีส์' }));
    expect(rowTitles()).toEqual(['ชุด A']);
  });

  it('Preview ≥ จำนวนข้อ → error ในแถว + ไม่ส่ง', async () => {
    const user = userEvent.setup();
    renderForm({ series });
    const [rowA] = screen.getAllByTestId('series-set-row');
    const input = within(rowA).getByLabelText('Preview (ข้อ)');
    await user.clear(input);
    await user.type(input, '40');
    expect(within(rowA).getByText('Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'บันทึกซีรีส์' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ชุดที่ 1: Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด');
    expect(updatePredictedSeries).not.toHaveBeenCalled();
  });

  it('API ตอบ 409/400 → แสดงข้อความไทยจาก API ในฟอร์ม + toast', async () => {
    const user = userEvent.setup();
    (updatePredictedSeries as jest.Mock).mockRejectedValue(new ApiError('ชุด "ชุด B" อยู่ในซีรีส์อื่นแล้ว', 409));
    renderForm({ series });
    await user.click(screen.getByRole('button', { name: 'บันทึกซีรีส์' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ชุด "ชุด B" อยู่ในซีรีส์อื่นแล้ว');
    expect(toast.error).toHaveBeenCalledWith('ชุด "ชุด B" อยู่ในซีรีส์อื่นแล้ว');
  });

  it('ค้นหาชุด: debounce แล้วเรียก API ด้วยคำค้น / ค้นไม่สำเร็จ → ข้อความ', async () => {
    const user = userEvent.setup();
    renderForm({ series });
    await screen.findByRole('button', { name: 'เพิ่ม ชุด C' });
    expect(searchPredictedExamOptions).toHaveBeenCalledWith('', expect.anything());
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (searchPredictedExamOptions as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await user.type(screen.getByLabelText('เพิ่มชุดจากชุดข้อสอบ'), 'เคมี');
    expect(await screen.findByText('ค้นหาชุดข้อสอบไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง')).toBeInTheDocument();
    expect(searchPredictedExamOptions).toHaveBeenLastCalledWith('เคมี', expect.anything());
  });

  it('ปุ่มลบซีรีส์มีเฉพาะตอนแก้ (ส่ง onDelete) และไม่มีคำว่า "ปลดล็อก"', async () => {
    const onDelete = jest.fn();
    const user = userEvent.setup();
    renderForm({ series, onDelete });
    await user.click(screen.getByRole('button', { name: 'ลบซีรีส์' }));
    expect(onDelete).toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
    await screen.findByRole('button', { name: 'เพิ่ม ชุด C' });
  });
});
