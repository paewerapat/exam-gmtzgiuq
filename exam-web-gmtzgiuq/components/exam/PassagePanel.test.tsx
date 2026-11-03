import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExamContainer from './ExamContainer';
import PassagePanel, { PassageContent, PassageDisclosure, createPassageMemory } from './PassagePanel';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import type { ExamPassage, Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

jest.mock('sweetalert2', () => ({ __esModule: true, default: { fire: jest.fn() } }));
jest.mock('@/lib/api/serverTime', () => ({ fetchClockOffset: jest.fn().mockResolvedValue(0) }));

// jsdom ไม่มี layout: scrollTop ของ element ตั้งค่าแล้วอ่านกลับได้ แต่ไม่ยิง scroll event เอง
const LONG_BODY = Array.from({ length: 30 }, (_, i) => `ย่อหน้าที่ ${i + 1} ของบทอ่าน`).join('\n\n');
const passageA: ExamPassage = { id: 'reading-a', title: 'ใช้บทความต่อไปนี้ตอบข้อ 2–4', body: LONG_BODY, images: [] };
const passageB: ExamPassage = { id: 'reading-b', title: null, body: null, images: ['/uploads/chart.png'] };

function q(id: string, passage: ExamPassage | null): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    choices: ['a', 'b'].map((c, i) => ({ id: c, text: `ตัวเลือก ${id}-${i + 1}`, isCorrect: c === 'a' })),
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
    passageId: passage?.id ?? null,
    // ข้อในกลุ่มเดียวกันถือคนละ object (เหมือนหลังอ่านจาก localStorage) — ต้องยังไม่ remount
    passage: passage ? { ...passage, images: [...passage.images] } : null,
  };
}

// ข้อ 1, 5 ไม่มีบทอ่าน / ข้อ 2–4 บทอ่าน A / ข้อ 6–7 บทอ่าน B (ตาม AC5)
const questions = [
  q('q1', null),
  q('q2', passageA),
  q('q3', passageA),
  q('q4', passageA),
  q('q5', null),
  q('q6', passageB),
  q('q7', passageB),
];

function makeSession(): ExamSession {
  return {
    id: 'session-1',
    examId: 'exam-1',
    examTitle: 'ชุดบทอ่าน',
    category: 'general_knowledge',
    questionIds: questions.map((x) => x.id),
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'in_progress',
  };
}

function Harness({ mode }: { mode: 'practice' | 'exam' }) {
  const { initExam, state } = useExam();
  useEffect(() => {
    initExam(makeSession(), questions);
  }, [initExam]);
  return state.session.id ? <ExamContainer onComplete={jest.fn()} mode={mode} /> : null;
}

function setup(mode: 'practice' | 'exam' = 'practice') {
  render(
    <ExamProvider>
      <Harness mode={mode} />
    </ExamProvider>,
  );
  return userEvent.setup();
}

const panel = () => screen.queryByRole('region', { name: 'บทอ่าน' });
const scroller = () => screen.getByTestId('passage-scroll');
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /ข้อถัดไป/ }));
const prev = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /ข้อก่อนหน้า/ }));

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
  fireEvent.scroll(el);
}

describe('ExamContainer + PassagePanel (task 08 AC5/AC6)', () => {
  beforeEach(() => localStorage.clear());

  it('ข้อไม่มีบทอ่าน = layout เดิม (ไม่มีกล่องบทอ่าน, max-w-5xl, สองคอลัมน์ที่ lg)', async () => {
    setup();
    await screen.findByText('โจทย์ q1');
    expect(panel()).not.toBeInTheDocument();
    const card = screen.getByText('โจทย์ q1').closest('.bg-white')!;
    expect(card.parentElement).toHaveClass('max-w-5xl');
    expect(card.querySelector('.lg\\:flex-row')).not.toBeNull();
  });

  it('ไปข้อในกลุ่มเดียวกัน: บทอ่านไม่ remount ตำแหน่ง scroll คงเดิม → ข้อ 5 layout เดิม → ข้อ 6 บทอ่านชุดที่ 2', async () => {
    const user = setup();
    await screen.findByText('โจทย์ q1');
    await next(user);

    // ข้อ 2: บทอ่านฝั่งซ้าย + โจทย์ฝั่งขวา (lg: กริดสูงพอดีจอ ทั้งสองคอลัมน์เลื่อนในตัวเอง หน้าไม่เลื่อน)
    const region = panel()!;
    expect(region).toHaveClass('lg:h-full');
    const root = region.closest('.min-h-screen') as HTMLElement;
    expect(root).toHaveClass('lg:overflow-hidden', 'lg:h-[calc(100dvh-var(--exam-top,0px))]');
    expect(root.style.getPropertyValue('--exam-top')).toBe('0px');
    expect(screen.getByTestId('question-scroll')).toHaveClass('lg:overflow-y-auto');
    expect(within(region).getAllByText('ใช้บทความต่อไปนี้ตอบข้อ 2–4').length).toBeGreaterThan(0);
    expect(within(region).getByText(/ย่อหน้าที่ 30 ของบทอ่าน/)).toBeInTheDocument();
    expect(region.parentElement).toHaveClass('lg:grid-cols-2');
    expect(screen.getByText('โจทย์ q2')).toBeInTheDocument();

    const el = scroller();
    scrollTo(el, 240);

    const questionScroll = screen.getByTestId('question-scroll');
    await next(user); // ข้อ 3 กลุ่มเดียวกัน
    expect(screen.getByText('โจทย์ q3')).toBeInTheDocument();
    // ฝั่งโจทย์เริ่มบนสุดทุกข้อ (กล่องเลื่อนสร้างใหม่ตามข้อ) แต่บทอ่านใช้กล่องเดิม
    expect(screen.getByTestId('question-scroll')).not.toBe(questionScroll);
    expect(scroller()).toBe(el); // DOM เดิม = ไม่ remount
    expect(scroller().scrollTop).toBe(240);

    await next(user); // ข้อ 4
    expect(scroller()).toBe(el);

    await next(user); // ข้อ 5 ไม่มีบทอ่าน
    expect(screen.getByText('โจทย์ q5')).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();

    await next(user); // ข้อ 6 บทอ่านชุดที่ 2 (มีแต่รูป ไม่มีชื่อ)
    const regionB = panel()!;
    expect(within(regionB).getByRole('img', { name: 'รูปประกอบบทอ่าน' })).toHaveAttribute('src', '/uploads/chart.png');
    expect(within(regionB).queryByText(/ย่อหน้าที่/)).not.toBeInTheDocument();
    expect(scroller()).not.toBe(el);
  });

  it('กลับมากลุ่มเดิมทีหลัง → ได้ตำแหน่ง scroll เดิม (จำต่อ passage id)', async () => {
    const user = setup();
    await screen.findByText('โจทย์ q1');
    await next(user); // ข้อ 2
    scrollTo(scroller(), 180);
    await next(user);
    await next(user);
    await next(user); // ข้อ 5
    expect(panel()).not.toBeInTheDocument();
    await prev(user); // ข้อ 4 → mount ใหม่
    expect(screen.getByText('โจทย์ q4')).toBeInTheDocument();
    expect(scroller().scrollTop).toBe(180);
  });

  it('จอแคบ: ปุ่ม "บทอ่าน: <ชื่อ>" พับ/กางได้ สถานะพับคงอยู่ในกลุ่มเดียวกัน กลุ่มใหม่เริ่มกาง', async () => {
    const user = setup('exam');
    await screen.findByText('โจทย์ q1');
    await next(user);

    const toggle = screen.getByRole('button', { name: 'บทอ่าน: ใช้บทความต่อไปนี้ตอบข้อ 2–4' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(scroller()).not.toHaveClass('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // พับ = ซ่อนเฉพาะจอแคบ (lg ยังแสดงเสมอ)
    expect(scroller()).toHaveClass('hidden', 'lg:block');

    await next(user); // ข้อ 3 ยังพับ
    expect(screen.getByRole('button', { name: /^บทอ่าน:/ })).toHaveAttribute('aria-expanded', 'false');

    await next(user);
    await next(user); // ข้อ 5
    await next(user); // ข้อ 6 กลุ่มใหม่ → กาง (ไม่มีชื่อ → "บทอ่าน")
    expect(screen.getByRole('button', { name: 'บทอ่าน' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('practice + บทอ่าน: ปุ่มตรวจคำตอบอยู่แถวเดียวกับก่อนหน้า/ถัดไป (นอกกล่องเลื่อน) / ข้อไม่มีบทอ่านอยู่ใต้ตัวเลือกเหมือนเดิม', async () => {
    const user = setup('practice');
    await screen.findByText('โจทย์ q1');
    const navRow = () => screen.getByRole('button', { name: /ข้อถัดไป/ }).parentElement!;
    expect(within(navRow()).queryByRole('button', { name: 'ตรวจคำตอบ' })).not.toBeInTheDocument();
    await next(user);
    expect(within(navRow()).getByRole('button', { name: 'ตรวจคำตอบ' })).toBeInTheDocument();
    expect(within(screen.getByTestId('question-scroll')).queryByRole('button', { name: 'ตรวจคำตอบ' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /ตัวเลือก q2-1/ }));
    await user.click(screen.getByRole('button', { name: 'ตรวจคำตอบ' }));
    expect(screen.getByText('คำตอบถูกต้อง !')).toBeInTheDocument();
  });

  it('โหมดข้อสอบจริงใช้สี rose / practice ใช้ indigo', async () => {
    const user = setup('exam');
    await screen.findByText('โจทย์ q1');
    await next(user);
    expect(panel()!.querySelector('svg.text-rose-500')).not.toBeNull();
  });
});

describe('PassagePanel แยก', () => {
  it('render ซ้ำด้วย object ใหม่ค่าเดิม → DOM เนื้อหาเดิม (ไม่สร้างใหม่)', () => {
    const memory = createPassageMemory();
    const { rerender } = render(<PassagePanel passage={{ ...passageA }} memory={memory} />);
    const body = screen.getByText(/ย่อหน้าที่ 1 ของบทอ่าน/);
    rerender(<PassagePanel passage={{ ...passageA }} memory={memory} />);
    expect(screen.getByText(/ย่อหน้าที่ 1 ของบทอ่าน/)).toBe(body);
  });

  it('เนื้อหาบทอ่านรักษาการขึ้นบรรทัด (pre-wrap) และรองรับ LaTeX', () => {
    const { container } = render(
      <PassagePanel passage={{ id: 'm', title: null, body: 'บรรทัดแรก\nสูตร $x^2$', images: [] }} />,
    );
    const latex = container.querySelector('[style*="pre-wrap"]')!;
    expect(latex.textContent).toContain('บรรทัดแรก\nสูตร');
    expect(container.querySelector('.katex')).not.toBeNull();
  });
});

describe('PassageContent เลขบรรทัด (task 09)', () => {
  // AC3: 14 บรรทัด มีบรรทัดว่างคั่นย่อหน้า 1 ครั้ง + สูตร $x^2$ ในบรรทัดหนึ่ง
  const text = Array.from({ length: 13 }, (_, i) => (i === 2 ? 'สูตร $x^2$ ในบรรทัดนี้' : `ข้อความบรรทัด ${i + 1}`));
  const body = [...text.slice(0, 6), '', ...text.slice(6)].join('\n');
  const numbered: ExamPassage = { id: 'n', title: null, body, images: [], lineNumbers: true };
  const lineNumbersOf = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[data-line-number]')).map((el) => el.textContent);

  it('เปิดเลขบรรทัด → เลข 1–13 ตรงบรรทัดที่มีข้อความ (บรรทัดว่างไม่มีเลข) สูตรยังเป็นสูตร เลขเลือก/คัดลอกไม่ได้', () => {
    const { container } = render(<PassageContent passage={numbered} />);
    expect(lineNumbersOf(container)).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1)));
    const no7 = container.querySelector('[data-line-number="7"]')!;
    expect(no7.nextElementSibling?.textContent).toBe('ข้อความบรรทัด 7');
    expect(no7).toHaveClass('select-none');
    expect(container.querySelector('[data-line-number="3"]')!.nextElementSibling?.querySelector('.katex')).not.toBeNull();
  });

  it('บรรทัดว่างคั่นย่อหน้า = div มี <br /> (สูง 1 บรรทัด + คัดลอกได้บรรทัดว่าง) ไม่มีเลข; บรรทัดว่างท้าย body ไม่ถูกแสดง', () => {
    const { container } = render(<PassageContent passage={{ ...numbered, body: `${body}\n\n` }} />);
    const blanks = container.querySelectorAll('[data-passage-blank]');
    expect(blanks).toHaveLength(1);
    expect(blanks[0].querySelector('br')).not.toBeNull();
    expect(blanks[0].textContent).toBe('');
    expect(blanks[0].querySelector('[data-line-number]')).toBeNull();
    // อยู่ระหว่างบรรทัด 6 กับ 7
    expect(blanks[0].previousElementSibling?.textContent).toBe('ข้อความบรรทัด 6');
    expect(blanks[0].nextElementSibling).toHaveAttribute('data-line-number', '7');
    expect(screen.getByTestId('passage-numbered').lastElementChild?.textContent).toBe('ข้อความบรรทัด 13');
    expect(lineNumbersOf(container)).toHaveLength(13);
  });

  it('ไม่เปิด / ข้อมูลเก่าไม่มี key → render แบบเดิม (ไม่มีเลข)', () => {
    for (const p of [{ ...numbered, lineNumbers: false }, { id: 'old', title: null, body, images: [] }]) {
      const { container, unmount } = render(<PassageContent passage={p} />);
      expect(screen.queryByTestId('passage-numbered')).not.toBeInTheDocument();
      expect(lineNumbersOf(container)).toEqual([]);
      expect(container.querySelector('[style*="pre-wrap"]')!.textContent).toContain('ข้อความบรรทัด 1\nข้อความบรรทัด 2');
      unmount();
    }
  });

  it('ตาราง Markdown ยังแสดงเป็นตารางและไม่นับเลข', () => {
    const p: ExamPassage = {
      id: 't',
      title: null,
      body: 'ก่อนตาราง\n| ปี | ค่า |\n|---|---|\n| 2566 | 10 |\nหลังตาราง',
      images: [],
      lineNumbers: true,
    };
    const { container } = render(<PassageContent passage={p} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(lineNumbersOf(container)).toEqual(['1', '2']);
    expect(container.querySelector('[data-line-number="2"]')!.nextElementSibling?.textContent).toBe('หลังตาราง');
  });

  it('PassageDisclosure (หน้าทบทวน/ประวัติ) แสดงเลขบรรทัดด้วย', async () => {
    render(<PassageDisclosure passage={numbered} />);
    await userEvent.click(screen.getByRole('button', { name: 'บทอ่าน' }));
    expect(screen.getByTestId('passage-numbered')).toBeInTheDocument();
  });

  it('PassagePanel: เปลี่ยน lineNumbers อย่างเดียว → render ใหม่ (memo เทียบ lineNumbers)', () => {
    const { rerender } = render(<PassagePanel passage={{ ...numbered, lineNumbers: false }} />);
    expect(screen.queryByTestId('passage-numbered')).not.toBeInTheDocument();
    rerender(<PassagePanel passage={numbered} />);
    expect(screen.getByTestId('passage-numbered')).toBeInTheDocument();
  });
});

describe('PassageDisclosure (หน้าทบทวน)', () => {
  it('เริ่มต้นพับ กดแล้วเห็นเนื้อหา', async () => {
    render(<PassageDisclosure passage={passageA} />);
    const button = screen.getByRole('button', { name: 'บทอ่าน: ใช้บทความต่อไปนี้ตอบข้อ 2–4' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ย่อหน้าที่ 1 ของบทอ่าน/)).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/ย่อหน้าที่ 1 ของบทอ่าน/)).toBeInTheDocument();
  });
});
