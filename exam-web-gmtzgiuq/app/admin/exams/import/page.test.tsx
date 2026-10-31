import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { toast } from 'react-toastify';
import ImportExamPage from './page';
import { useAuth } from '@/contexts/AuthContext';
import { createExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { uploadImage, deleteUploadedImage } from '@/lib/api/upload';
// สำเนาของ docs/dev-loop/fixtures/01-sample-exam.json (ไฟล์ตัวอย่างจากลูกค้า)
import sample from '@/lib/__fixtures__/exam-import-sample.json';

jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api/exams', () => ({ createExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ uploadImage: jest.fn(), deleteUploadedImage: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedCreateExam = createExam as jest.Mock;
const mockedUpload = uploadImage as jest.Mock;
const mockedDelete = deleteUploadedImage as jest.Mock;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function sampleZipFile(): File {
  const bytes = zipSync({
    'exam.json': strToU8(JSON.stringify(sample)),
    'images/q02-venn.png': PNG,
    'images/q10-rugby-sections.png': PNG,
  });
  return new File([bytes], 'exam.zip', { type: 'application/zip' });
}

function asAdmin() {
  mockedUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@x', role: 'ADMIN' }, loading: false });
}

async function selectFile(file: File) {
  const input = screen.getByTestId('import-file-input');
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('รายการข้อ');
}

describe('ImportExamPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'A-LEVEL MATH', slug: 'a-level-math', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
    let n = 0;
    mockedUpload.mockImplementation(async (file: File) => {
      n += 1;
      return { url: `http://api/uploads/${n}-${file.name}`, filename: `${n}-${file.name}` };
    });
    mockedDelete.mockResolvedValue(undefined);
  });

  it('ผู้ใช้ที่ไม่ใช่ admin ไม่เห็นฟอร์มนำเข้า', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u2', email: 'u@x', role: 'user' }, loading: false });
    render(<ImportExamPage />);
    expect(screen.getByText('เฉพาะผู้ดูแลระบบเท่านั้น')).toBeInTheDocument();
    expect(screen.queryByTestId('import-file-input')).not.toBeInTheDocument();
    expect(getCategories).not.toHaveBeenCalled();
  });

  it('แสดงตัวอย่าง 7 ข้อแล้วสร้างแบบร่างได้ (อัปรูป 2 รูป ตั้ง type ตามนามสกุล)', async () => {
    asAdmin();
    mockedCreateExam.mockResolvedValue({ id: 'exam-1', title: sample.exam.title });
    const user = userEvent.setup();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(1));

    await selectFile(sampleZipFile());

    expect(screen.getByText('90 นาที')).toBeInTheDocument();
    expect(screen.getByText('7 ข้อ')).toBeInTheDocument();
    expect(screen.getByText('2 รูป')).toBeInTheDocument();
    expect(screen.getByText('หมายเหตุ: ยังไม่มีเฉลยทางการยืนยัน (180 ตามรูป, ฉบับก่อนหน้าตอบ 120)')).toBeInTheDocument();
    expect((screen.getByLabelText(/หมวดหมู่/) as HTMLSelectElement).value).toBe('a-level-math');

    const button = await screen.findByRole('button', { name: 'สร้างแบบร่าง' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await screen.findByText('สร้างแบบร่างแล้ว');
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    const uploadedFile = mockedUpload.mock.calls[0][0] as File;
    expect(uploadedFile.name).toBe('q02-venn.png');
    expect(uploadedFile.type).toBe('image/png');

    expect(mockedCreateExam).toHaveBeenCalledTimes(1);
    const input = mockedCreateExam.mock.calls[0][0];
    expect(input.status).toBe('draft');
    expect(input.category).toBe('a-level-math');
    expect(input.questions).toHaveLength(7);
    expect(input.questions[0].questionImage).toBe('http://api/uploads/1-q02-venn.png');
    expect(input.questions[2].questionImage).toBe('http://api/uploads/2-q10-rugby-sections.png');

    expect(screen.getByRole('link', { name: /เปิดแบบร่าง/ })).toHaveAttribute('href', '/admin/exams/exam-1/edit');
    expect(toast.success).toHaveBeenCalledWith('สร้างแบบร่างแล้ว');
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('หมวดหมู่ไม่ตรงกับระบบ → ต้องเลือกก่อนจึงกดสร้างได้', async () => {
    asAdmin();
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c2', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    const user = userEvent.setup();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await selectFile(sampleZipFile());

    expect(await screen.findByText('ไม่พบหมวดหมู่ "A-LEVEL MATH" ในระบบ กรุณาเลือก')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'สร้างแบบร่าง' });
    expect(button).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/หมวดหมู่/), 'tgat');
    expect(button).toBeEnabled();
  });

  it('API สร้างไม่สำเร็จ → toast ไทย และลบรูปที่อัปไปแล้ว', async () => {
    asAdmin();
    mockedCreateExam.mockRejectedValue(new Error('Internal server error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    await selectFile(sampleZipFile());

    const button = await screen.findByRole('button', { name: 'สร้างแบบร่าง' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(2));
    expect(mockedDelete.mock.calls.map((c) => c[0])).toEqual(['1-q02-venn.png', '2-q10-rugby-sections.png']);
    expect(toast.error).toHaveBeenCalledWith('สร้างแบบร่างไม่สำเร็จ: Internal server error');
    expect(screen.queryByText('สร้างแบบร่างแล้ว')).not.toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
    consoleSpy.mockRestore();
  });

  it('ไฟล์ไม่มี exam.json → error ระดับไฟล์ ไม่มีปุ่มสร้าง', async () => {
    asAdmin();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    const bytes = zipSync({ 'images/a.png': PNG });
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File([bytes], 'bad.zip')] },
    });

    expect(await screen.findByText('นำเข้าไฟล์นี้ไม่ได้')).toBeInTheDocument();
    expect(screen.getByText(/ไม่พบไฟล์ exam.json/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /สร้างแบบร่าง/ })).not.toBeInTheDocument();
  });

  it('ข้อที่มี error → ปุ่มบอกจำนวนข้อที่มีปัญหา', async () => {
    asAdmin();
    render(<ImportExamPage />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    // .json เดี่ยว: ข้อ 1 และ 3 มีรูป → error รูปหาย
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File([JSON.stringify(sample)], 'exam.json', { type: 'application/json' })] },
    });
    expect(await screen.findByRole('button', { name: 'สร้างแบบร่าง (มีปัญหา 2 ข้อ)' })).toBeInTheDocument();
  });
});
