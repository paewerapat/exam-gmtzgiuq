'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  Clock,
  FileQuestion,
  Gauge,
  KeyRound,
  ListOrdered,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { getMockExam, type MockExamDetail as MockExamDetailData } from '@/lib/api/exams';
import { getMyInProgressAttempts } from '@/lib/api/attempts';
import type { RedeemUnlockCodeResult } from '@/lib/api/unlockCodes';
import {
  canStartMock,
  formatMockContext,
  getMockPriceLabel,
  LEVEL_LABELS,
  type MockExamAccess,
} from '@/lib/mock-exam';
import { formatAccessUntil } from '@/lib/unlock-codes';
import DetailBlocksView from './DetailBlocksView';
import MockDetailHero from './MockDetailHero';
import MockAccessPanel from './MockAccessPanel';
import CodeInstructionsView from './CodeInstructionsView';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const BACK_HREF = '/dashboard/mock-exams';

/** แถว "การเข้าถึง" ในกล่องรายละเอียด */
function accessSummary(exam: MockExamDetailData, access: MockExamAccess): string {
  if (exam.accessType === 'free') return 'ทำได้ตลอด ไม่ต้องใช้โค้ด';
  if (access.status === 'unlocked') return formatAccessUntil(access.expiresAt);
  if (exam.accessType === 'code') return access.status === 'expired' ? 'สิทธิ์หมดอายุ · ใช้โค้ด Campaign' : 'ใช้โค้ด Campaign';
  return getMockPriceLabel(exam) ?? 'ต้องซื้อ';
}

/** หน้ารายละเอียด Mock Exam (/dashboard/mock-exams/[id]) — โครงดีไซน์ task 15 (ภาพ 5–7) */
export default function MockExamDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [reloadKey, setReloadKey] = useState(0);
  // ผลของคำขอล่าสุด ผูกกับ key — key ไม่ตรง (กดลองใหม่ / login-logout) = กำลังโหลด
  // access ขึ้นกับบัญชี จึงโหลดใหม่เมื่อผู้ใช้เปลี่ยน
  const requestKey = `${id}|${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    state: Exclude<LoadState, 'loading'>;
    exam: MockExamDetailData | null;
  } | null>(null);
  const state: LoadState = result?.key === requestKey ? result.state : 'loading';
  const exam = state === 'ready' ? (result?.exam ?? null) : null;

  // สิทธิ์หลังกรอกโค้ดสำเร็จในหน้านี้ (อัปเดตทันทีไม่ต้องโหลดใหม่)
  const [redeemed, setRedeemed] = useState<{ key: string; access: MockExamAccess } | null>(null);
  const access: MockExamAccess | null = exam
    ? redeemed?.key === requestKey
      ? redeemed.access
      : exam.access
    : null;

  // attempt โหมด exam ที่ค้างของชุดนี้ (เฉพาะเมื่อ login และเริ่มทำได้) null = ยังไม่ได้เช็ก
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

  const canStart = !!exam && canStartMock(exam, access);
  const progressKey = userId && canStart ? `${userId}:${id}` : null;

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

  if (state === 'notfound' || state === 'error' || !exam || !access) {
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

  const checkingProgress = !!progressKey && inProgress?.key !== progressKey;
  const hasInProgress = !!progressKey && inProgress?.key === progressKey && inProgress.has;
  const justUnlocked = redeemed?.key === requestKey;
  const instructions = exam.accessType === 'code' ? exam.codeInstructions : null;

  function handleRedeemed(res: RedeemUnlockCodeResult) {
    setRedeemed({ key: requestKey, access: { status: 'unlocked', expiresAt: res.expiresAt || null, via: 'code' } });
  }

  const infoRows = [
    { icon: ListOrdered, label: 'จำนวนข้อ', value: `${exam.questionCount.toLocaleString('th-TH')} ข้อ` },
    {
      icon: Clock,
      label: 'เวลา',
      value: exam.durationMinutes ? `${exam.durationMinutes.toLocaleString('th-TH')} นาที` : 'ไม่จับเวลา',
    },
    { icon: Gauge, label: 'ระดับ', value: exam.level ? LEVEL_LABELS[exam.level] : 'ไม่ระบุ' },
    { icon: KeyRound, label: 'การเข้าถึง', value: accessSummary(exam, access) },
  ];

  return (
    <FadeIn>
      <Link
        href={BACK_HREF}
        className="inline-flex items-center gap-1 mb-4 min-h-11 sm:min-h-0 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        กลับไป Mock Exam
      </Link>

      <MockDetailHero
        title={exam.title}
        context={formatMockContext(exam)}
        accessType={exam.accessType}
        price={exam.price}
        questionCount={exam.questionCount}
        durationMinutes={exam.durationMinutes}
        access={access}
      />

      {/* มือถือ: กล่องเริ่มทำ/กรอกโค้ดอยู่ใต้แถบหัวทันที / จอกว้าง: คอลัมน์ขวา */}
      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <aside aria-label="การเข้าถึงชุดข้อสอบ" className="min-w-0 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6">
          <MockAccessPanel
            exam={exam}
            access={access}
            isGuest={!userId}
            hasInProgress={hasInProgress}
            checkingProgress={checkingProgress}
            focusStart={justUnlocked}
            onRedeemed={handleRedeemed}
          />
        </aside>

        <div className="min-w-0 flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {instructions && <CodeInstructionsView instructions={instructions} />}

          <section
            aria-labelledby="mock-detail-heading"
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6"
          >
            <h2 id="mock-detail-heading" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              รายละเอียดข้อสอบ
            </h2>
            {exam.detailBlocks.length > 0 ? (
              <DetailBlocksView blocks={exam.detailBlocks} title={exam.title} />
            ) : exam.description?.trim() ? (
              // description เดิมเป็นข้อความธรรมดา (ไม่ผ่าน HTML) แสดงตามการขึ้นบรรทัด
              <p className="whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 break-words">
                {exam.description}
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">ยังไม่มีรายละเอียดสำหรับชุดนี้</p>
            )}

            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {infoRows.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-xl bg-indigo-50/60 dark:bg-gray-900/40 border border-indigo-100/60 dark:border-gray-700 px-4 py-3 min-w-0"
                >
                  <dt className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </FadeIn>
  );
}
