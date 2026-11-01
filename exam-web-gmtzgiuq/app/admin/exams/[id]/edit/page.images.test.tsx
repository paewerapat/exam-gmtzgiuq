import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import EditExamPage from './page';
import { getAdminExam, updateExam } from '@/lib/api/exams';
import { getCategories } from '@/lib/api/categories';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/api/exams', () => ({ getAdminExam: jest.fn(), updateExam: jest.fn() }));
jest.mock('@/lib/api/categories', () => ({ getCategories: jest.fn() }));
jest.mock('@/lib/api/curriculum', () => ({ getPublicCurriculumTree: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ deleteUploadedImageByUrl: jest.fn() }));
// อัปโหลดที่ยังไม่เสร็จ (ปุ่ม "อัปช้า...") — เรียก mockPending.shift()!() ให้อัปเสร็จทีหลัง
const mockPending: (() => void)[] = [];
// ImageUpload จำลอง: ปุ่ม "อัป..." = อัปโหลดสำเร็จได้ URL ใหม่ (onUploaded แล้ว onChange เหมือนของจริง),
// ปุ่ม "เอา...ออก" = กด X
jest.mock('@/components/upload/ImageUpload', () => {
  let n = 0;
  return {
    __esModule: true,
    default: ({
      value,
      onChange,
      onUploaded,
      compact,
      showUrlInput,
      disabled,
      label = 'รูป',
    }: {
      value: string;
      onChange: (url: string) => void;
      onUploaded?: (url: string) => void;
      compact?: boolean;
      showUrlInput?: boolean;
      disabled?: boolean;
      label?: string;
    }) => {
      // ช่องเพิ่มรูปโจทย์ (QuestionImagesEditor) ปิดช่อง URL / ImageUpload ของแบนเนอร์เปิดไว้
      const name = compact ? label : showUrlInput === false ? 'รูปโจทย์' : 'แบนเนอร์';
      const upload = () => {
        const url = `http://localhost:3001/uploads/new-${++n}.png`;
        onUploaded?.(url);
        onChange(url);
      };
      return (
        <div data-testid={compact ? 'choice-image-upload' : 'image-upload'}>
          <button type="button" onClick={upload} disabled={disabled}>
            {`อัป${name}`}
          </button>
          <button type="button" onClick={() => mockPending.push(upload)} disabled={disabled}>
            {`อัปช้า${name}`}
          </button>
          {value && (
            <button type="button" onClick={() => onChange('')}>
              {`เอา${name}ออก`}
            </button>
          )}
        </div>
      );
    },
  };
});
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const API = 'http://localhost:3001/uploads';
const saved = (name: string) => `${API}/${name}`;

// ข้อ 1: 3 รูป + ตัวเลือก A–E เป็นรูปล้วน / ข้อ 2: ข้อเก่ามีแค่ questionImage
const exam = {
  id: 'exam-img',
  title: 'ชุดมิติสัมพันธ์',
  description: '',
  category: 'tgat',
  status: 'draft',
  durationMinutes: null,
  subjectId: null,
  bannerImage: null,
  questions: [
    {
      id: 'q1',
      question: 'ข้อใดต่อจากรูป',
      type: 'multiple_choice',
      questionImage: saved('s1.png'),
      questionImages: [saved('s1.png'), saved('s2.png'), saved('s3.png')],
      choices: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        text: '',
        isCorrect: id === 'b',
        image: saved(`c-${id}.png`),
      })),
      explanation: 'เฉลย',
    },
    {
      id: 'q2',
      question: 'ข้อเก่ารูปเดียว',
      type: 'multiple_choice',
      questionImage: saved('old.png'),
      questionImages: null,
      choices: [
        { id: 'a', text: 'หนึ่ง', isCorrect: true },
        { id: 'b', text: 'สอง', isCorrect: false },
      ],
    },
  ],
};

const questionImgSrcs = () =>
  screen.getAllByRole('img', { name: /^รูปที่ \d$/ }).map((img) => img.getAttribute('src'));

async function open(data: unknown = exam, questionLabel = 'ข้อที่ 1') {
  (getAdminExam as jest.Mock).mockResolvedValue(data);
  render(<EditExamPage params={Promise.resolve({ id: 'exam-img' })} />);
  await waitFor(() => expect(screen.getByDisplayValue('ชุดมิติสัมพันธ์')).toBeInTheDocument());
  await userEvent.click(screen.getByText(questionLabel));
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
  await waitFor(() => expect(updateExam).toHaveBeenCalled());
  return (updateExam as jest.Mock).mock.calls[0][1];
}

describe('EditExamPage — หลายรูปต่อข้อ + รูปในตัวเลือก (task 07 AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending.length = 0;
    (updateExam as jest.Mock).mockResolvedValue({});
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('เปิดแก้ไขเห็นรูปครบเรียงถูก → ลบรูปที่ 2 + สลับลำดับ → บันทึกส่งลำดับใหม่ ไม่ลบไฟล์เอง', async () => {
    await open();
    expect(questionImgSrcs()).toEqual([saved('s1.png'), saved('s2.png'), saved('s3.png')]);
    expect(screen.getByText('3/6 รูป · แสดงตามลำดับนี้')).toBeInTheDocument();
    // ตัวเลือก A–E มีรูปทุกตัว (ปุ่มเอาออกของแต่ละตัว)
    ['A', 'B', 'C', 'D', 'E'].forEach((l) =>
      expect(screen.getByRole('button', { name: `เอารูปตัวเลือก ${l}ออก` })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 2' }));
    expect(questionImgSrcs()).toEqual([saved('s1.png'), saved('s3.png')]);
    expect(screen.getByRole('button', { name: 'เลื่อนรูปที่ 1 ขึ้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เลื่อนรูปที่ 2 ลง' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'เลื่อนรูปที่ 2 ขึ้น' }));
    expect(questionImgSrcs()).toEqual([saved('s3.png'), saved('s1.png')]);

    const payload = await save();
    const [q1, q2] = payload.questions;
    expect(q1.questionImages).toEqual([saved('s3.png'), saved('s1.png')]);
    expect(q1.questionImage).toBe(saved('s3.png'));
    expect(q1.choices).toEqual(
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: '', isCorrect: id === 'b', image: saved(`c-${id}.png`) })),
    );
    // ข้อเก่ารูปเดียวไม่หาย และส่ง questionImages เสมอ
    expect(q2.questionImages).toEqual([saved('old.png')]);
    expect(q2.questionImage).toBe(saved('old.png'));
    expect(q2.choices).toEqual([
      { id: 'a', text: 'หนึ่ง', isCorrect: true },
      { id: 'b', text: 'สอง', isCorrect: false },
    ]);
    // รูปที่บันทึกแล้วต้องรอ API ลบหลังบันทึก (กดยกเลิกแล้วรูปต้องไม่หาย)
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('ข้อเก่าที่มีแค่ questionImage → เห็นเป็นรูปที่ 1 ลบออกแล้วบันทึกส่ง []', async () => {
    await open(exam, 'ข้อที่ 2');
    expect(questionImgSrcs()).toEqual([saved('old.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 1' }));
    const payload = await save();
    expect(payload.questions[1].questionImages).toEqual([]);
    expect(payload.questions[1].questionImage).toBeUndefined();
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('อัปรูปใหม่แล้วเอาออกก่อนบันทึก → ลบไฟล์ใหม่ทันที (รูปเดิมไม่ลบ)', async () => {
    await open(exam, 'ข้อที่ 2');
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    const srcs = questionImgSrcs();
    expect(srcs).toHaveLength(2);
    const newUrl = srcs[1]!;
    expect(newUrl).toMatch(/\/uploads\/new-\d+\.png$/);

    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 2' }));
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    expect(deleteUploadedImageByUrl).toHaveBeenCalledWith(newUrl);

    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 1' }));
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
  });

  it('รูปตัวเลือก: เปลี่ยนรูปที่อัปใหม่ → ลบตัวใหม่ตัวเก่า, เอารูปเดิมออก → ไม่ลบไฟล์', async () => {
    await open(exam, 'ข้อที่ 2');
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปตัวเลือก B' }));
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปตัวเลือก B' })); // เปลี่ยนรูป
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    const replaced = (deleteUploadedImageByUrl as jest.Mock).mock.calls[0][0];
    expect(replaced).toMatch(/\/uploads\/new-\d+\.png$/);

    const payload = await save();
    const b = payload.questions[1].choices[1];
    expect(b.text).toBe('สอง');
    expect(b.image).toMatch(/\/uploads\/new-\d+\.png$/);
    expect(b.image).not.toBe(replaced);
  });

  it('ตัวเลือกรูปล้วนที่เอารูปออก → ไม่มีทั้งข้อความและรูป บันทึกไม่ได้', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'เอารูปตัวเลือก Cออก' }));
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    expect(toast.error).toHaveBeenCalledWith('ข้อที่ 1: ตัวเลือก C ต้องมีข้อความหรือรูป');
    expect(updateExam).not.toHaveBeenCalled();
  });

  it('ใส่รูปครบ 6 รูปแล้ว → ไม่มีช่องเพิ่มรูป', async () => {
    const six = Array.from({ length: 6 }, (_, i) => saved(`six-${i}.png`));
    await open({ ...exam, questions: [{ ...exam.questions[0], questionImages: six }, exam.questions[1]] });
    expect(questionImgSrcs()).toEqual(six);
    expect(screen.getByText('ครบ 6 รูปแล้ว ลบรูปเดิมก่อนถ้าต้องการเพิ่ม')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อัปรูปโจทย์' })).not.toBeInTheDocument();
  });
});

describe('EditExamPage — ลบไฟล์เฉพาะที่อัปในหน้านี้ (task 07 รอบ 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending.length = 0;
    (updateExam as jest.Mock).mockResolvedValue({});
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  it('วาง URL /uploads/ ของข้อสอบอื่น → เพิ่ม → ลบออก ⇒ ไม่ส่ง DELETE', async () => {
    await open(exam, 'ข้อที่ 2');
    const other = saved('other-exam-file.png');
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.jpg'), { target: { value: other } });
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่ม' }));
    expect(questionImgSrcs()).toEqual([saved('old.png'), other]);
    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 2' }));
    expect(questionImgSrcs()).toEqual([saved('old.png')]);
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('อัปรูปโจทย์เสร็จตอนรายการครบ 6 แล้ว → toast แจ้ง + ลบไฟล์ที่เพิ่งอัป', async () => {
    const five = Array.from({ length: 5 }, (_, i) => saved(`five-${i}.png`));
    await open({ ...exam, questions: [{ ...exam.questions[0], questionImages: five }, exam.questions[1]] });
    await userEvent.click(screen.getByRole('button', { name: 'อัปช้ารูปโจทย์' }));
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    expect(questionImgSrcs()).toHaveLength(6);

    act(() => mockPending.shift()!());
    expect(questionImgSrcs()).toHaveLength(6);
    expect(toast.error).toHaveBeenCalledWith('ข้อนี้มีรูปครบ 6 รูปแล้ว รูปที่อัปล่าสุดไม่ได้ถูกเพิ่ม');
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    const late = (deleteUploadedImageByUrl as jest.Mock).mock.calls[0][0];
    expect(late).toMatch(/\/uploads\/new-\d+\.png$/);
    expect(questionImgSrcs()).not.toContain(late);
  });

  it('ลบตัวเลือกระหว่างอัปรูปตัวเลือก → ลบไฟล์ที่เพิ่งอัป ไม่ไปใส่ตัวเลือกอื่น', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'อัปช้ารูปตัวเลือก E' }));
    const removeE = screen
      .getByRole('checkbox', { name: 'ตัวเลือก E เป็นคำตอบที่ถูก' })
      .closest('div')!
      .querySelector('button')!;
    await userEvent.click(removeE);
    // รูปเดิมของ E บันทึกแล้ว → ไม่ลบเอง
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();

    act(() => mockPending.shift()!());
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    const late = (deleteUploadedImageByUrl as jest.Mock).mock.calls[0][0];
    const payload = await save();
    expect(payload.questions[0].choices.map((c: { id: string }) => c.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(payload.questions[0].choices.map((c: { image?: string }) => c.image)).not.toContain(late);
  });

  it('ระหว่างบันทึก ปุ่มเพิ่ม/ลบ/เลื่อนรูปโจทย์และรูปตัวเลือกถูกปิด', async () => {
    let finish: (v: unknown) => void = () => {};
    (updateExam as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await open();
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    expect(screen.getByRole('button', { name: 'ลบรูปที่ 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เลื่อนรูปที่ 2 ขึ้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'อัปรูปโจทย์' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'อัปรูปตัวเลือก A' })).toBeDisabled();
    await act(async () => finish({}));
  });

  it('บันทึกสำเร็จ → รูปที่อัปรอบนี้แต่ไม่อยู่ในข้อสอบ (ข้อเปลี่ยนเป็นอัตนัย) ถูกลบ รูปที่ใช้อยู่ไม่ลบ', async () => {
    await open(exam, 'ข้อที่ 2');
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปตัวเลือก A' }));
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    const kept = questionImgSrcs()[1]!;
    await userEvent.click(screen.getByRole('button', { name: 'อัตนัย' }));
    fireEvent.change(screen.getByPlaceholderText('พิมพ์คำตอบที่ถูกต้อง'), { target: { value: '42' } });
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();

    const payload = await save();
    expect(payload.questions[1].choices).toEqual([]);
    expect(payload.questions[1].questionImages).toEqual([saved('old.png'), kept]);
    await waitFor(() => expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1));
    const removed = (deleteUploadedImageByUrl as jest.Mock).mock.calls[0][0];
    expect(removed).toMatch(/\/uploads\/new-\d+\.png$/);
    expect(removed).not.toBe(kept);
  });
});

describe('EditExamPage — ไม่ลบไฟล์ที่อยู่ใน payload ระหว่าง/หลังบันทึก (task 07 รอบ 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending.length = 0;
    (updateExam as jest.Mock).mockResolvedValue({});
    (deleteUploadedImageByUrl as jest.Mock).mockResolvedValue(true);
    (getCategories as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'TGAT', slug: 'tgat', orderIndex: 0, createdAt: '', updatedAt: '' },
    ]);
    (getPublicCurriculumTree as jest.Mock).mockResolvedValue([]);
  });

  const questionTrash = (label: string) =>
    screen.getByText(label).parentElement!.parentElement!.querySelector('button')!;
  const choiceTrash = (letter: string) =>
    screen.getByRole('checkbox', { name: `ตัวเลือก ${letter} เป็นคำตอบที่ถูก` }).closest('div')!.querySelector('button')!;

  it('ระหว่างรอบันทึก: ปุ่มลบข้อ/ลบตัวเลือก/เพิ่มตัวเลือก/เปลี่ยนชนิดข้อถูกปิด กดแล้วไม่มี DELETE', async () => {
    let finish: (v: unknown) => void = () => {};
    (updateExam as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปตัวเลือก E' })); // E มีรูปอัปรอบนี้
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));

    expect(choiceTrash('E')).toBeDisabled();
    expect(questionTrash('ข้อที่ 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: /เพิ่มตัวเลือก/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'อัตนัย' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ปรนัย' })).toBeDisabled();
    await userEvent.click(choiceTrash('E'));
    await userEvent.click(questionTrash('ข้อที่ 1'));
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
    await act(async () => finish({}));
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('หลังบันทึกสำเร็จ (ยังไม่เปลี่ยนหน้า) ลบตัวเลือก/ข้อที่มีรูปอัปรอบนี้ → ไม่ลบไฟล์ที่เพิ่งบันทึก', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปตัวเลือก E' }));
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    const payload = await save();
    expect(payload.questions[0].questionImages).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole('button', { name: /บันทึกการแก้ไข/ })).toBeEnabled());

    await userEvent.click(choiceTrash('E'));
    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 4' }));
    await userEvent.click(questionTrash('ข้อที่ 1'));
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();
  });

  it('บันทึกล้ม → รูปที่อัปรอบนี้กลับมาลบได้ตามเดิม', async () => {
    (updateExam as jest.Mock).mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'อัปรูปโจทย์' }));
    const uploaded = questionImgSrcs()[3]!;
    await userEvent.click(screen.getByRole('button', { name: /บันทึกการแก้ไข/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('ไม่สามารถอัพเดทชุดข้อสอบได้')));
    await waitFor(() => expect(screen.getByRole('button', { name: /บันทึกการแก้ไข/ })).toBeEnabled());
    expect(deleteUploadedImageByUrl).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปที่ 4' }));
    expect(deleteUploadedImageByUrl).toHaveBeenCalledTimes(1);
    expect(deleteUploadedImageByUrl).toHaveBeenCalledWith(uploaded);
  });
});
