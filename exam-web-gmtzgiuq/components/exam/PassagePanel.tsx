'use client';

import { Fragment, memo, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { ExamPassage } from '@/lib/api/questions';
import { getPassageImages, passageShowsLineNumbers, splitPassageLines } from '@/lib/exam-passages';
import LatexRenderer from '@/components/latex/LatexRenderer';
import LatexText from '@/components/latex/LatexText';
import QuestionImages from './QuestionImages';

/** จำตำแหน่ง scroll / สถานะพับ ต่อ passage id ตลอดการทำข้อสอบหนึ่งครั้ง (กลับมากลุ่มเดิมได้ที่เดิม) */
export interface PassageMemory {
  scroll: Map<string, number>;
  collapsed: Map<string, boolean>;
}

export function createPassageMemory(): PassageMemory {
  return { scroll: new Map(), collapsed: new Map() };
}

/**
 * เนื้อความแบบมีเลขบรรทัด: กริด 2 คอลัมน์ (เลข | ข้อความ) เลขอยู่แนว baseline เดียวกับบรรทัดแรกของข้อความ
 * บรรทัดยาวตัดลงใต้ข้อความ (ย่อหน้าแขวน) เลขเป็น select-none คัดลอกบทอ่านแล้วไม่ติดเลข
 */
function NumberedPassageBody({ body }: { body: string }) {
  const lines = useMemo(() => splitPassageLines(body), [body]);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3" data-testid="passage-numbered">
      {lines.map((line, i) => {
        // <br /> ให้สูง 1 บรรทัดโดยไม่พึ่งหน่วย lh (iOS < 16.4) และคัดลอกแล้วยังได้บรรทัดว่างคั่นย่อหน้า
        if (line.kind === 'blank') {
          return (
            <div key={i} className="col-span-2" data-passage-blank="" aria-hidden="true">
              <br />
            </div>
          );
        }
        if (line.kind === 'block') {
          return (
            <div key={i} className="col-start-2 min-w-0">
              <LatexRenderer content={line.text} />
            </div>
          );
        }
        return (
          <Fragment key={i}>
            <span
              className="select-none text-right tabular-nums text-xs text-gray-500 dark:text-gray-400"
              data-line-number={line.no}
            >
              {line.no}
            </span>
            <LatexRenderer content={line.text} className="min-w-0" />
          </Fragment>
        );
      })}
    </div>
  );
}

/** เนื้อหาบทอ่าน: เนื้อความ (LaTeX + ตาราง รักษาการขึ้นบรรทัด; เปิดเลขบรรทัดได้) + รูปทุกรูป */
export function PassageContent({ passage, className = '' }: { passage: ExamPassage; className?: string }) {
  const images = getPassageImages(passage);
  const hasBody = !!passage.body?.trim();
  return (
    <div className={className}>
      {hasBody && (
        <div className="prose prose-sm max-w-none text-gray-800 dark:text-gray-200 leading-relaxed break-words">
          {passageShowsLineNumbers(passage) ? (
            <NumberedPassageBody body={passage.body!} />
          ) : (
            <LatexRenderer content={passage.body!} />
          )}
        </div>
      )}
      <QuestionImages images={images} className={hasBody ? 'mt-4' : ''} altLabel="รูปประกอบบทอ่าน" />
    </div>
  );
}

function PassageTitle({ passage }: { passage: ExamPassage }) {
  return passage.title?.trim() ? <LatexText text={passage.title} /> : null;
}

interface PassagePanelProps {
  passage: ExamPassage;
  /** ส่ง object เดิมทุกครั้ง (สร้างครั้งเดียวต่อการทำข้อสอบ) */
  memory?: PassageMemory;
  mode?: 'practice' | 'exam';
  className?: string;
}

/**
 * บทอ่านในหน้าทำข้อสอบ — หน้าแม่ใส่ `key={passage.id}` ให้ไปข้อในกลุ่มเดียวกันแล้วไม่ remount
 * - จอ lg: หน้าแม่ให้ความสูง (lg:h-full ในกริดที่สูงพอดีจอ) เนื้อหาเลื่อนในกล่องแยกจากฝั่งโจทย์
 * - จอแคบ: อยู่เหนือโจทย์ พับ/กางได้ เมื่อกางสูงไม่เกิน 55vh เลื่อนในตัว
 */
function PassagePanelInner({ passage, memory, mode = 'practice', className = '' }: PassagePanelProps) {
  const bodyId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(memory?.scroll.get(passage.id) ?? 0);
  const [collapsed, setCollapsed] = useState(() => memory?.collapsed.get(passage.id) ?? false);

  // mount / กางใหม่: คืนตำแหน่งที่อ่านค้างไว้ (ตอนพับ element ถูกซ่อน scrollTop หาย)
  useLayoutEffect(() => {
    if (!collapsed && scrollRef.current) scrollRef.current.scrollTop = lastScroll.current;
  }, [collapsed]);

  const toggle = () => {
    setCollapsed((prev) => {
      memory?.collapsed.set(passage.id, !prev);
      return !prev;
    });
  };

  const accent = mode === 'exam' ? 'text-rose-500 dark:text-rose-400' : 'text-indigo-500 dark:text-indigo-400';
  const hasTitle = !!passage.title?.trim();

  return (
    <section
      aria-label="บทอ่าน"
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden flex flex-col ${className}`}
    >
      {/* จอแคบ: ปุ่มพับ/กาง */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="lg:hidden w-full flex items-center gap-2 px-5 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
      >
        <BookOpen className={`w-4 h-4 flex-shrink-0 ${accent}`} />
        <span className="flex-1 min-w-0 truncate">
          บทอ่าน{hasTitle && ': '}
          <PassageTitle passage={passage} />
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {/* จอกว้าง: หัวข้อ (ไม่มีปุ่มพับ) */}
      <div className="hidden lg:flex items-center gap-2 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <BookOpen className={`w-5 h-5 flex-shrink-0 ${accent}`} />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-0 break-words">
          {hasTitle ? <PassageTitle passage={passage} /> : 'บทอ่าน'}
        </h2>
      </div>

      {/* relative: .katex-mathml ของ KaTeX เป็น position:absolute ถ้าไม่มี ancestor ที่ positioned
          มันจะหลุดกล่องเลื่อนไปยืดความสูงทั้งหน้า (หน้าเลื่อนได้เป็นพัน px) */}
      <div
        id={bodyId}
        ref={scrollRef}
        data-testid="passage-scroll"
        tabIndex={0}
        onScroll={(e) => {
          lastScroll.current = e.currentTarget.scrollTop;
          memory?.scroll.set(passage.id, e.currentTarget.scrollTop);
        }}
        className={`${collapsed ? 'hidden' : 'block'} lg:block relative overflow-y-auto max-h-[55vh] lg:max-h-none lg:flex-1 lg:min-h-0 px-5 lg:px-6 py-4 border-t border-gray-100 dark:border-gray-700 lg:border-t-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400`}
      >
        <PassageContent passage={passage} />
      </div>
    </section>
  );
}

function samePassage(a: ExamPassage, b: ExamPassage): boolean {
  if (a === b) return true;
  const ai = getPassageImages(a);
  const bi = getPassageImages(b);
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.body === b.body &&
    passageShowsLineNumbers(a) === passageShowsLineNumbers(b) &&
    ai.length === bi.length &&
    ai.every((src, i) => src === bi[i])
  );
}

/**
 * memo ตามค่าของบทอ่าน: ExamContainer render ใหม่ทุกวินาที (timer) และข้อในกลุ่มเดียวกันอาจถือ object บทอ่านคนละตัว
 * (หลังอ่านจาก localStorage) — เทียบค่าแทน reference ไม่ให้ render ซ้ำโดยไม่จำเป็น
 */
const PassagePanel = memo(
  PassagePanelInner,
  (prev, next) =>
    samePassage(prev.passage, next.passage) &&
    prev.memory === next.memory &&
    prev.mode === next.mode &&
    prev.className === next.className,
);

export default PassagePanel;

/** บทอ่านแบบพับได้ สำหรับหน้าทบทวน/ผลลัพธ์/ประวัติ (เริ่มต้นพับ) */
export function PassageDisclosure({ passage, className = '' }: { passage: ExamPassage; className?: string }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const hasTitle = !!passage.title?.trim();
  return (
    <div
      className={`rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-900/20 overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 transition"
      >
        <BookOpen className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0 break-words">
          บทอ่าน{hasTitle && ': '}
          <PassageTitle passage={passage} />
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={bodyId}
          className="max-h-[60vh] overflow-y-auto px-3 py-3 border-t border-indigo-100 dark:border-indigo-800/50 bg-white dark:bg-gray-800"
        >
          <PassageContent passage={passage} />
        </div>
      )}
    </div>
  );
}
