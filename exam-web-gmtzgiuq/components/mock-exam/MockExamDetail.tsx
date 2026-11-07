'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Clock,
  FileQuestion,
  Gauge,
  KeyRound,
  ListOrdered,
  Loader2,
  PlayCircle,
  RotateCcw,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import {
  formatMockContext,
  getMockPrimaryAction,
  getMockPriceLabel,
  LEVEL_LABELS,
  mockCategoryLabel,
} from '@/lib/mock-exam';
import MockExamBanner from './MockExamBanner';
import MockAccessBadge from './MockAccessBadge';
import DetailBlocksView from './DetailBlocksView';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const BACK_HREF = '/dashboard/mock-exams';

/** หน้ารายละเอียด Mock Exam (/dashboard/mock-exams/[id]) */
export default function MockExamDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [reloadKey, setReloadKey] = useState(0);
  // ผลของคำขอล่าสุด ผูกกับ key — key ไม่ตรง (กดลองใหม่) = กำลังโหลด
  const requestKey = `${id}|${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    state: Exclude<LoadState, 'loading'>;
    exam: MockExamDetailData | null;
  } | null>(null);
  const state: LoadState = result?.key === requestKey ? result.state : 'loading';
  const exam = state === 'ready' ? (result?.exam ?? null) : null;
  // attempt โหมด exam ที่ค้างของชุดนี้ (เฉพาะเมื่อ login และชุดฟรี) null = ยังไม่ได้เช็ก
  const [inProgress, setInProgress] = useState<{ key: string; has: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMockExam(id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, state: data ? 'ready' : 'notfound', exam: data });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load mock exam:', err);
        setResult({ key: requestKey, state: 'error', exam: null });
      });
    return () => controller.abort();
  }, [id, requestKey]);

  const isFree = exam?.accessType === 'free';
  const progressKey = userId && isFree ? `${userId}:${id}` : null;

  useEffect(() => {
    if (!progressKey) return;
    let cancelled = false;
    getMyInProgressAttempts()
      .then((attempts) => {
        if (cancelled) return;
        const has = attempts.some((a) => a.examId === id && a.mode === 'exam');
        setInProgress({ key: progressKey, has });
      })
      .catch(() => {
        // เช็กไม่ได้ → แสดง "เริ่มทำ" (หน้าทำข้อสอบจะเสนอทำต่อเองถ้ามี attempt ค้าง)
        if (!cancelled) setInProgress({ key: progressKey, has: false });
      });
    return () => {
      cancelled = true;
    };
  }, [progressKey, id]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-32" role="status" aria-label="กำลังโหลด">
        <Loader2 className="w-9 h-9 animate-spin text-indigo-500 dark:text-indigo-400" />
      </div>
    );
  }

  if (state === 'notfound' || state === 'error' || !exam) {
    const notFound = state !== 'error';
    return (
      <FadeIn>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-6 py-16 text-center max-w-xl mx-auto mt-8">
          {notFound ? (
            <FileQuestion className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          ) : (
            <AlertCircle className="w-14 h-14 text-red-300 dark:text-red-700 mx-auto mb-3" />
          )}
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {notFound ? 'ไม่พบชุดข้อสอบ' : 'โหลดข้อมูลชุดข้อสอบไม่สำเร็จ'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {notFound ? 'ชุดข้อสอบนี้อาจถูกลบหรือยังไม่เผยแพร่' : 'กรุณาลองใหม่อีกครั้ง'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {!notFound && (
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition"
              >
                <RotateCcw className="w-4 h-4" />
                ลองใหม่
              </button>
            )}
            <Link
              href={BACK_HREF}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปหน้า Mock Exam
            </Link>
          </div>
        </div>
      </FadeIn>
    );
  }

  const categoryLabel = mockCategoryLabel(exam);
  const context = formatMockContext(exam);
  const checkingProgress = !!progressKey && inProgress?.key !== progressKey;
  const action = getMockPrimaryAction(exam, {
    hasInProgress: !!progressKey && inProgress?.key === progressKey && inProgress.has,
  });
  const priceLabel = getMockPriceLabel(exam);

  const infoRows = [
    { icon: ListOrdered, label: 'จำนวนข้อ', value: `${exam.questionCount.toLocaleString('th-TH')} ข้อ` },
    {
      icon: Clock,
      label: 'เวลา',
      value: exam.durationMinutes ? `${exam.durationMinutes.toLocaleString('th-TH')} นาที` : 'ไม่จับเวลา',
    },
    { icon: Gauge, label: 'ระดับ', value: exam.level ? LEVEL_LABELS[exam.level] : 'ไม่ระบุ' },
    {
      icon: Tag,
      label: 'ราคา',
      value: priceLabel ?? (exam.accessType === 'code' ? 'ใช้โค้ด Campaign' : '-'),
    },
  ];

  return (
    <FadeIn>
      <nav aria-label="breadcrumb" className="text-sm text-gray-400 mb-4 flex items-center gap-1 min-w-0">
        <Link href={BACK_HREF} className="hover:text-indigo-600 dark:hover:text-indigo-400 flex-shrink-0">
          Mock Exam
        </Link>
        <span className="flex-shrink-0">/</span>
        <span className="text-gray-600 dark:text-gray-400 font-medium truncate">{exam.title}</span>
      </nav>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <MockExamBanner
          title={exam.title}
          category={exam.category}
          categoryLabel={categoryLabel}
          bannerImage={exam.bannerImage}
          className="rounded-xl"
        />

        <div className="flex flex-col min-w-0">
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{context}</span>
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug break-words">
            {exam.title}
          </h1>
          <div className="mt-2">
            <MockAccessBadge exam={exam} />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 px-3 py-2.5 min-w-0"
              >
                <dt className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 lg:mt-auto lg:pt-6">
            {action.kind === 'start' || action.kind === 'resume' ? (
              checkingProgress ? (
                <span
                  role="status"
                  className="flex sm:inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-full bg-rose-600/70 text-white text-sm font-semibold"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังตรวจสอบ...
                </span>
              ) : (
                <Link
                  href={action.href}
                  className="flex sm:inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm transition"
                >
                  <PlayCircle className="w-5 h-5" />
                  {action.label}
                </Link>
              )
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-describedby="mock-action-note"
                  className="flex sm:inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-semibold cursor-not-allowed"
                >
                  {action.kind === 'unlock' ? <KeyRound className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                  {action.label}
                </button>
                <p id="mock-action-note" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {action.note}
                </p>
              </>
            )}
            {action.kind === 'resume' && !checkingProgress && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">คุณมีการทำชุดนี้ค้างอยู่ กดเพื่อทำต่อ</p>
            )}
          </div>
        </div>
      </div>

      <section
        aria-labelledby="mock-detail-heading"
        className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6"
      >
        <h2 id="mock-detail-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          รายละเอียดชุดข้อสอบ
        </h2>
        {exam.detailBlocks.length > 0 ? (
          <DetailBlocksView blocks={exam.detailBlocks} title={exam.title} />
        ) : exam.description?.trim() ? (
          // description เดิมเป็นข้อความธรรมดา (ไม่ผ่าน HTML) แสดงตามการขึ้นบรรทัด
          <p className="whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 break-words">
            {exam.description}
          </p>
        ) : (
          <p className="text-sm text-gray-400">ยังไม่มีรายละเอียดสำหรับชุดนี้</p>
        )}
      </section>
    </FadeIn>
  );
}
