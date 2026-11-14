import { fireEvent, render, screen, within } from '@testing-library/react';
import QuestionBankSubject from './QuestionBankSubject';
import { useAuth } from '@/contexts/AuthContext';
import { getQbSubject } from '@/lib/api/question-bank';
import { ApiError } from '@/lib/api/apiError';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api/question-bank', () => ({ getQbSubject: jest.fn() }));
jest.mock('@/components/animations/FadeIn', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const topic = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  total: 14,
  answered: 0,
  accuracy: null,
  counts: { easy: 8, medium: 4, hardChallenge: 2 },
  ...over,
});

const bankDetail = () => ({
  subject: { id: 'bio', label: 'ชีวะ', color: '#f59e0b' },
  venue: { id: 'v1', key: 'netsat', name: 'NETSAT' },
  mode: 'bank',
  totals: { all: 42, easy: 24, medium: 12, hardChallenge: 6 },
  groups: [
    {
      gradeLabel: 'ม.4',
      term: 1,
      topics: [
        topic('t1', 'บทที่ 1 การศึกษาชีววิทยา', { answered: 9, accuracy: 91 }),
        topic('t2', 'บทที่ 2 เคมีที่เป็นพื้นฐาน', { answered: 5, accuracy: 55 }),
      ],
    },
    { gradeLabel: 'ม.4', term: 2, topics: [topic('t3', 'บทที่ 3 เซลล์', { counts: { easy: 8, medium: 6, hardChallenge: 0 } })] },
  ],
  challengeUnlocked: true,
});

const challengeDetail = (unlocked: boolean) => ({
  ...bankDetail(),
  mode: 'challenge',
  totals: { all: 6, easy: 0, medium: 0, hardChallenge: 6 },
  groups: [
    {
      gradeLabel: 'ม.4',
      term: 1,
      topics: [
        topic('t1', 'บทที่ 1 การศึกษาชีววิทยา', { total: 2, answered: 1, accuracy: 100, counts: { hardChallenge: 2 } }),
        topic('t2', 'บทที่ 2 เคมีที่เป็นพื้นฐาน', { total: 4, answered: 1, accuracy: 0, counts: { hardChallenge: 4 } }),
      ],
    },
  ],
  challengeUnlocked: unlocked,
});

const selectionBar = () => screen.queryByRole('region', { name: 'บทที่เลือก' });

describe('QuestionBankSubject — หน้า 2 (task 20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    (getQbSubject as jest.Mock).mockResolvedValue(bankDetail());
  });

  it('หัวข้อ "<สนาม> <วิชา>", ลิงก์กลับพร้อมสนาม, จัดกลุ่มชั้น/เทอม, ความคืบหน้าและความแม่นยำ', async () => {
    render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'NETSAT ชีวะ' })).toBeInTheDocument();
    expect(getQbSubject).toHaveBeenCalledWith('bio', 'bank', expect.anything());
    expect(screen.getByRole('link', { name: /กลับไป Question Bank/ })).toHaveAttribute(
      'href',
      '/dashboard/question-bank?venue=netsat',
    );
    const term1 = screen.getByRole('region', { name: 'ม.4 เทอม 1' });
    const term2 = screen.getByRole('region', { name: 'ม.4 เทอม 2' });
    expect(within(term1).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(term2).getByRole('checkbox', { name: /บทที่ 3 เซลล์/ })).toBeInTheDocument();
    expect(within(term1).getByText('9/14')).toBeInTheDocument();
    expect(within(term1).getByText('91%')).toBeInTheDocument();
    expect(within(term2).getByText('ยังไม่มีข้อมูลความแม่นยำ')).toBeInTheDocument();
    expect(screen.getByText(/เริ่มฝึกทั้ง 3 บทของชีวะ · รวม 42 ข้อ/)).toBeInTheDocument();
    expect(selectionBar()).not.toBeInTheDocument();
  });

  it('ตัวกรองความยากติ๊กหลายอันพร้อมจำนวน → จำนวนข้อในบท/ฝึกทุกบท/แถบล่างเปลี่ยนตาม', async () => {
    render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'ระดับความยาก (ทั้งหมด)' }));
    const menu = screen.getByRole('group', { name: 'ระดับความยาก' });
    expect(within(menu).getByText('24 ข้อ')).toBeInTheDocument();
    expect(within(menu).getByText('6 ข้อ')).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('checkbox', { name: /Medium/ }));
    fireEvent.click(within(menu).getByRole('checkbox', { name: /Hard & Challenge/ }));
    expect(screen.getByRole('button', { name: 'ระดับความยาก (2)' })).toBeInTheDocument();
    // t1 = 4+2, t2 = 4+2, t3 = 6+0
    expect(screen.getByText(/ทั้ง 3 บทของชีวะ · รวม 18 ข้อ/)).toBeInTheDocument();
    expect(screen.getAllByText('6 ข้อ').length).toBeGreaterThanOrEqual(3);

    fireEvent.click(screen.getByRole('checkbox', { name: /บทที่ 1 การศึกษาชีววิทยา/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /บทที่ 3 เซลล์/ }));
    const bar = selectionBar()!;
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('เลือกแล้ว 2 บท');
    expect(bar).toHaveTextContent('รวม 12 ข้อ');
    expect(bar).toHaveTextContent('เลือกได้หลายบท');

    // เหลือเฉพาะ Hard & Challenge → บทที่ 3 มี 0 ข้อ (ยังเอาออกได้เพราะเลือกไว้แล้ว)
    fireEvent.click(within(menu).getByRole('checkbox', { name: /Medium/ }));
    expect(bar).toHaveTextContent('รวม 2 ข้อ');
    expect(screen.getByRole('checkbox', { name: /บทที่ 3 เซลล์/ })).toBeEnabled();

    fireEvent.click(within(bar).getByRole('button', { name: 'เริ่มฝึก (2 บท)' }));
    expect(mockPush).toHaveBeenCalledWith('/practice/bank?subject=bio&mode=bank&topics=t1%2Ct3&diff=hard_challenge');
  });

  it('แถบเลือก: render ผ่าน portal ที่ body, ล้างที่เลือกแล้วแถบหาย', async () => {
    const { container } = render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('checkbox', { name: /บทที่ 2 เคมี/ }));
    const bar = selectionBar()!;
    expect(container.contains(bar)).toBe(false);
    expect(document.body.contains(bar)).toBe(true);
    fireEvent.click(within(bar).getByRole('button', { name: 'ล้างที่เลือก' }));
    expect(selectionBar()).not.toBeInTheDocument();
  });

  it('ฝึกทุกบท + ตัวกรองทำแล้ว → topicIds ว่าง และส่ง progress ; ข้อความเป็น "รวมไม่เกิน"', async () => {
    render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'ทำแล้ว: ทั้งหมด' }));
    fireEvent.click(screen.getByRole('radio', { name: 'ตอบผิด' }));
    expect(screen.getByText(/รวมไม่เกิน 42 ข้อ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มฝึก' }));
    expect(mockPush).toHaveBeenCalledWith('/practice/bank?subject=bio&mode=bank&progress=wrong');
  });

  it('ลำดับ "ความแม่นยำต่ำก่อน" เรียงบทในกลุ่มใหม่', async () => {
    render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    const term1 = screen.getByRole('region', { name: 'ม.4 เทอม 1' });
    const names = () => within(term1).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent);
    expect(names()[0]).toMatch(/บทที่ 1/);
    fireEvent.click(screen.getByRole('button', { name: 'ลำดับ: ปกติ' }));
    fireEvent.click(screen.getByRole('radio', { name: 'ความแม่นยำต่ำก่อน' }));
    expect(names()[0]).toMatch(/บทที่ 2/);
    expect(screen.getByRole('button', { name: 'ลำดับ: ความแม่นยำต่ำก่อน' })).toBeInTheDocument();
  });

  it('guest: ตัวกรองทำแล้วต้อง login (ตัวเลือกอื่นกดไม่ได้ + ลิงก์เข้าสู่ระบบ)', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    render(<QuestionBankSubject mode="bank" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'ทำแล้ว: ทั้งหมด' }));
    expect(screen.getByRole('radio', { name: 'ทั้งหมด' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'ยังไม่ทำ' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'ตอบผิด' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /เข้าสู่ระบบเพื่อกรองตามประวัติการทำ/ })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/dashboard/question-bank/bio')}`,
    );
  });

  it('Challenge: ไม่มีตัวกรองความยาก, มีป้าย/สถิติของวิชา, ล็อก → Upgrade พร้อมสนาม', async () => {
    (getQbSubject as jest.Mock).mockResolvedValue(challengeDetail(false));
    render(<QuestionBankSubject mode="challenge" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1, name: 'NETSAT ชีวะ' });
    expect(getQbSubject).toHaveBeenCalledWith('bio', 'challenge', expect.anything());
    expect(screen.queryByRole('button', { name: /ระดับความยาก/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Challenge Questions').length).toBeGreaterThan(0);
    expect(screen.getByText('ข้อ Challenge ทั้งหมดของวิชานี้')).toBeInTheDocument();
    expect(screen.getByText('6 ข้อ')).toBeInTheDocument();
    // ความแม่นยำรวม (100*1 + 0*1) / 2
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    // round 2: ไม่มีสิทธิ์ → ปุ่มเริ่มฝึกเป็นลิงก์ Upgrade พร้อมคำอธิบาย
    expect(screen.queryByRole('button', { name: 'เริ่มฝึก' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade เพื่อเริ่มฝึก' })).toHaveAttribute('href', '/upgrade?venue=netsat');
    expect(screen.getByText('ข้อ Challenge เฉพาะสมาชิก Pro — Upgrade เพื่อเริ่มฝึก')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /กลับไป Challenge Questions/ })).toHaveAttribute(
      'href',
      '/dashboard/challenge?venue=netsat',
    );
    expect(screen.getByText(/เริ่มฝึกข้อ Challenge ทั้ง 2 บทของชีวะ · รวม 6 ข้อ/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /บทที่ 2 เคมี/ }));
    expect(selectionBar()).toHaveTextContent('รวม 4 ข้อ');
    expect(screen.queryByRole('button', { name: 'เริ่มฝึก (1 บท)' })).not.toBeInTheDocument();
    expect(within(selectionBar()!).getByRole('link', { name: 'Upgrade เพื่อฝึก (1 บท)' })).toHaveAttribute(
      'href',
      '/upgrade?venue=netsat',
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/ปลดล็อก/);
  });

  it('Challenge ที่มีสิทธิ์แล้ว: ปุ่มเริ่มฝึกพาไปหน้าฝึกตามปกติ', async () => {
    (getQbSubject as jest.Mock).mockResolvedValue(challengeDetail(true));
    render(<QuestionBankSubject mode="challenge" subjectId="bio" />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('เฉพาะ Pro')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /บทที่ 2 เคมี/ }));
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มฝึก (1 บท)' }));
    expect(mockPush).toHaveBeenCalledWith('/practice/bank?subject=bio&mode=challenge&topics=t2');
  });

  it('วิชาที่ยังไม่มีข้อ Challenge (totals.all = 0) → "ยังไม่มีข้อ Challenge ในวิชานี้" ไม่มีกล่องฝึกทุกบท', async () => {
    const empty = challengeDetail(true);
    empty.totals = { all: 0, easy: 0, medium: 0, hardChallenge: 0 };
    empty.groups = [
      { gradeLabel: 'ม.4', term: 1, topics: [topic('t1', 'บทที่ 1', { total: 0, counts: { hardChallenge: 0 } })] },
    ];
    (getQbSubject as jest.Mock).mockResolvedValue(empty);
    render(<QuestionBankSubject mode="challenge" subjectId="bio" />);
    expect(await screen.findByText('ยังไม่มีข้อ Challenge ในวิชานี้')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่มีบทในวิชานี้')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ฝึกทุกบท' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('ไม่พบวิชา (404) → ข้อความ + ลิงก์กลับ', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (getQbSubject as jest.Mock).mockRejectedValue(new ApiError('ไม่พบวิชา', 404, 'QB_SUBJECT_NOT_FOUND'));
    render(<QuestionBankSubject mode="bank" subjectId="nope" />);
    expect(await screen.findByText('ไม่พบวิชานี้')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ลองใหม่' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไป Question Bank' })).toHaveAttribute('href', '/dashboard/question-bank');
  });
});
