import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import NewExamPage from './page';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';
import { PASSAGE_ID_PATTERN } from '@/lib/exam-passages';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
// ImageUpload จำลอง: กดแล้วได้ URL ใหม่ (onUploaded แล้ว onChange เหมือนของจริง)
jest.mock('@/components/upload/ImageUpload', () => {
  let n = 0;
  return {
    __esModule: true,
    default: ({
      onChange,
      onUploaded,
      compact,
      showUrlInput,
      label = 'รูป',
    }: {
      onChange: (url: string) => void;
      onUploaded?: (url: string) => void;
      compact?: boolean;
      showUrlInput?: boolean;
      label?: string;
    }) => (
      <button
        type="button"
        onClick={() => {
          const url = `http://localhost:3001/uploads/p-${++n}.png`;
          onUploaded?.(url);
          onChange(url);
        }}
      >
        {compact ? `อัป${label}` : showUrlInput === false ? 'อัปรูป' : 'อัปแบนเนอร์'}
      </button>
    ),
  };
});
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const LONG_BODY = 'ย่อหน้าแรก\n\nย่อหน้าที่สอง\n| ปี | ค่า |\n|---|---|\n| 2566 | 10 |';

async function renderPage() {
  const user = userEvent.setup();
  render(<NewExamPage />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'TGAT' })).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1'), { target: { value: 'ชุดบทอ่าน' } });
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'tgat');
  return user;
}

const passageForms = () => screen.getAllByTestId('passage-form');

/** กรอกข้อที่กางอยู่ (ข้อล่าสุด) เป็นอัตนัย + เลือกบทอ่าน */
async function fillOpenQuestion(user: ReturnType<typeof userEvent.setup>, text: string, passage?: string) {
  await user.click(screen.getByRole('button', { name: 'อัตนัย' }));
  fireEvent.change(screen.getByPlaceholderText(/พิมพ์คำถาม/), { target: { value: text } });
  fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '1' } });
  if (passage) await user.selectOptions(screen.getByLabelText('ใช้บทอ่านไหน'), passage);
}

describe('NewExamPage — บทอ่านร่วม (task 08 AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExam as jest.Mock).mockResolvedValue({ id: 'new' });
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('ไม่มีบทอ่าน → ไม่มีช่อง "ใช้บทอ่านไหน" และส่ง passages [] + passageId null', async () => {
    const user = await renderPage();
    expect(screen.getByRole('heading', { name: 'บทอ่านร่วม (0)' })).toBeInTheDocument();
    expect(screen.queryByLabelText('ใช้บทอ่านไหน')).not.toBeInTheDocument();
    await fillOpenQuestion(user, 'ข้อเดี่ยว');
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const input = (createExam as jest.Mock).mock.calls[0][0];
    expect(input.passages).toEqual([]);
    expect(input.questions[0].passageId).toBeNull();
  });

  it('สร้างบทอ่าน 2 ชุด (ข้อความยาว+ตาราง / รูป) ผูกกับข้อ 2 และ 3 ข้อ 1 ไม่มีบทอ่าน → payload ถูก', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'เพิ่มบทอ่านร่วม' }));
    await user.click(screen.getByRole('button', { name: 'เพิ่มบทอ่านร่วม' }));
    expect(passageForms()).toHaveLength(2);

    const [formA, formB] = passageForms();
    fireEvent.change(within(formA).getByLabelText(/ชื่อบทอ่าน/), { target: { value: 'บทความเรื่องน้ำ' } });
    fireEvent.change(within(formA).getByLabelText('เนื้อหาบทอ่าน'), { target: { value: LONG_BODY } });
    // ตัวอย่างการแสดงผล LaTeX/ตาราง
    await user.click(within(formA).getByRole('button', { name: 'ดูตัวอย่างการแสดงผล' }));
    expect(within(formA).getByRole('table')).toBeInTheDocument();
    await user.click(within(formB).getByRole('button', { name: 'อัปรูป' }));
    expect(within(formB).getByRole('img', { name: 'รูปที่ 1' })).toBeInTheDocument();

    await fillOpenQuestion(user, 'ข้อ 1 ไม่มีบทอ่าน');
    // select แสดง title หรือ "บทอ่านที่ n"
    expect(screen.getByRole('option', { name: 'บทความเรื่องน้ำ' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'บทอ่านที่ 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /เพิ่มข้อใหม่/ }));
    await fillOpenQuestion(user, 'ข้อ 2 ใช้บทความ', 'บทความเรื่องน้ำ');
    await user.click(screen.getByRole('button', { name: /เพิ่มข้อใหม่/ }));
    await fillOpenQuestion(user, 'ข้อ 3 ใช้รูป', 'บทอ่านที่ 2');

    // บอกว่าบทอ่านไหนใช้กับข้อใด
    expect(within(formA).getAllByText('ใช้กับข้อ 2').length).toBeGreaterThan(0);
    expect(within(formB).getAllByText('ใช้กับข้อ 3').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const input = (createExam as jest.Mock).mock.calls[0][0];
    expect(input.passages).toHaveLength(2);
    const [pa, pb] = input.passages;
    expect(pa.id).toMatch(PASSAGE_ID_PATTERN);
    expect(pb.id).toMatch(PASSAGE_ID_PATTERN);
    expect(pa.id).not.toBe(pb.id);
    expect(pa).toEqual({ id: pa.id, title: 'บทความเรื่องน้ำ', body: LONG_BODY, images: [] });
    expect(pb).toEqual({ id: pb.id, title: null, body: null, images: [expect.stringMatching(/\/uploads\/p-\d+\.png$/)] });
    expect(input.questions.map((q: { passageId: string | null }) => q.passageId)).toEqual([null, pa.id, pb.id]);
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  }, 30000);

  it('ลบบทอ่านที่ข้อใช้อยู่ → ยืนยันก่อน ข้อนั้นเป็น "ไม่ใช้บทอ่าน" พร้อมแจ้ง และลบไฟล์รูปที่เพิ่งอัป', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'เพิ่มบทอ่านร่วม' }));
    const [form] = passageForms();
    fireEvent.change(within(form).getByLabelText('เนื้อหาบทอ่าน'), { target: { value: 'เนื้อหา' } });
    await user.click(within(form).getByRole('button', { name: 'อัปรูป' }));
    const url = within(form).getByRole('img', { name: 'รูปที่ 1' }).getAttribute('src');
    await fillOpenQuestion(user, 'ข้อ 1', 'บทอ่านที่ 1');

    await user.click(screen.getByRole('button', { name: 'ลบบทอ่านที่ 1' }));
    expect(Swal.fire).toHaveBeenCalled();
    expect(screen.queryAllByTestId('passage-form')).toHaveLength(0);
    expect(screen.queryByLabelText('ใช้บทอ่านไหน')).not.toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('ลบ "บทอ่านที่ 1" แล้ว ข้อ 1 เปลี่ยนเป็นไม่ใช้บทอ่าน');
    expect(deleteUploadedImageByUrl).toHaveBeenCalledWith(url);

    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    await waitFor(() => expect(createExam).toHaveBeenCalled());
    const input = (createExam as jest.Mock).mock.calls[0][0];
    expect(input.passages).toEqual([]);
    expect(input.questions[0].passageId).toBeNull();
  });

  it('ยกเลิกการยืนยัน → บทอ่านยังอยู่', async () => {
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: false });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'เพิ่มบทอ่านร่วม' }));
    fireEvent.change(within(passageForms()[0]).getByLabelText('เนื้อหาบทอ่าน'), { target: { value: 'x' } });
    await user.click(screen.getByRole('button', { name: 'ลบบทอ่านที่ 1' }));
    expect(passageForms()).toHaveLength(1);
  });

  it('บทอ่านไม่มีทั้งเนื้อหาและรูป → ไม่บันทึก แจ้ง error ไทย', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'เพิ่มบทอ่านร่วม' }));
    fireEvent.change(within(passageForms()[0]).getByLabelText(/ชื่อบทอ่าน/), { target: { value: 'มีแต่ชื่อ' } });
    await fillOpenQuestion(user, 'ข้อ 1');
    await user.click(screen.getByRole('button', { name: /บันทึกชุดข้อสอบ/ }));
    expect(toast.error).toHaveBeenCalledWith('บทอ่านที่ 1: ต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง');
    expect(createExam).not.toHaveBeenCalled();
  });
});
