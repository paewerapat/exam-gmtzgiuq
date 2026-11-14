'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RotateCcw, BookOpen, CheckCircle, XCircle, MinusCircle, Lock, LogIn } from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { ExamContainer } from '@/components/exam';
import {
  loadExamSession,
  saveExamSession,
  clearExamSession,
  generateSessionId,
  calculateExamResult,
} from '@/lib/exam-utils';
import { createQbSession, QB_ERROR_LOGIN_REQUIRED } from '@/lib/api/question-bank';
import { ApiError } from '@/lib/api/apiError';
import { logPracticeAnswers } from '@/lib/api/answer-logs';
import {
  QB_MODE_CONFIG,
  QB_SESSION_LIMIT,
  parsePracticeParams,
  practiceSessionKey,
  upgradeHref,
  withoutLockedQuestions,
  type QbPracticeParams,
} from '@/lib/question-bank';
import { loginHref } from '@/lib/pro-payments';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

// ── ผลลัพธ์ ────────────────────────────────────────────────

interface BankResult {
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  examTitle: string;
  /** ข้อ Challenge ที่ล็อก (ไม่นับคะแนน) */
  lockedCount: number;
  /** ข้อที่ทำได้จริง (ไม่รวมข้อที่ล็อก) — 0 = ล็อกทุกข้อ แสดงผลแบบไม่มีคะแนน */
  playableCount: number;
}

interface LoadError {
  message: string;
  /** ตัวกรองต้อง login */
  loginRequired?: boolean;
}

// ── เนื้อหาหน้า ────────────────────────────────────────────

function BankPracticeContent({ params }: { params: QbPracticeParams }) {
  const router = useRouter();
  const { initExam, state } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [pendingSession, setPendingSession] = useState<ExamSession | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<BankResult | null>(null);
  const [venueKey, setVenueKey] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{ total: number; count: number } | null>(null);
  // กันเรียก POST /question-bank/sessions ซ้ำ (StrictMode / effect รันซ้ำ) — ทุกครั้งสุ่มชุดใหม่
  const startedRef = useRef<string | null>(null);

  const sessionKey = practiceSessionKey(params);
  const config = QB_MODE_CONFIG[params.mode];
  const backUrl = `${config.basePath}/${params.subjectId}`;

  async function startNew() {
    setLoading(true);
    setError(null);
    try {
      const res = await createQbSession({
        subjectId: params.subjectId,
        mode: params.mode,
        topicIds: params.topicIds,
        difficulties: params.difficulties,
        progress: params.progress,
        limit: QB_SESSION_LIMIT,
      });
      setVenueKey(res.venueKey);
      if (res.questions.length === 0) {
        setError({ message: 'ไม่มีข้อที่ตรงกับตัวเลือกนี้ ลองเปลี่ยนบทหรือตัวกรอง' });
        return;
      }
      setSessionInfo({ total: res.total, count: res.questions.length });
      clearExamSession();
      // ชื่อสนามจาก API (API เก่าไม่มี → ใช้ key)
      const title = [res.venueName || res.venueKey.toUpperCase(), res.subjectLabel].filter(Boolean).join(' ');
      const newSession: ExamSession = {
        id: generateSessionId(),
        examId: sessionKey,
        examTitle: `${title || config.title}${params.mode === 'challenge' ? ' · Challenge' : ''}`,
        category: res.questions.find((q) => !q.locked)?.category ?? 'general_knowledge',
        questionIds: res.questions.map((q) => q.id),
        currentIndex: 0,
        answers: {},
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        status: 'in_progress',
        // ใช้ทำลิงก์ Unlock ตอน resume — เก็บใน session (ล้างพร้อม session ไม่ค้างเป็น key แยก)
        venueKey: res.venueKey,
      };
      saveExamSession(newSession, res.questions);
      initExam(newSession, res.questions);
    } catch (err) {
      console.error('Failed to start question bank session:', err);
      if (err instanceof ApiError && (err.errorCode === QB_ERROR_LOGIN_REQUIRED || err.status === 401)) {
        setError({ message: 'ตัวกรองนี้ต้องเข้าสู่ระบบก่อน', loginRequired: true });
      } else if (err instanceof ApiError && err.status === 404) {
        setError({ message: err.message || 'ไม่พบวิชานี้' });
      } else {
        setError({ message: 'ไม่สามารถโหลดข้อได้ กรุณาลองใหม่' });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedRef.current === sessionKey) return;
    startedRef.current = sessionKey;
    // ตัวกรองเดียวกันที่ทำค้างไว้ → ถามว่าจะทำต่อไหม (ใช้ชุดข้อที่เก็บไว้ เพราะเรียกใหม่จะสุ่มได้ชุดใหม่)
    const { session: existing, questions: saved } = loadExamSession();
    if (existing && saved && existing.examId === sessionKey && existing.status === 'in_progress') {
      setVenueKey(existing.venueKey ?? '');
      setPendingSession(existing);
      setPendingQuestions(saved);
      setShowResume(true);
      setLoading(false);
      return;
    }
    void startNew();
    // startNew อ่าน params ล่าสุดผ่าน closure — เริ่มใหม่เฉพาะเมื่อ key ของตัวกรองเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  function handleResume() {
    if (!pendingSession || pendingQuestions.length === 0) return;
    initExam(pendingSession, pendingQuestions);
    setShowResume(false);
  }

  function handleStartFresh() {
    clearExamSession();
    setShowResume(false);
    setResult(null);
    void startNew();
  }

  // จบการฝึก → คิดผล (ไม่รวมข้อที่ล็อก) + บันทึก answer log
  useEffect(() => {
    if (!loading && !showResume && state.session.status === 'completed' && state.session.examId === sessionKey) {
      const { session: savedSession, questions: savedQuestions } = loadExamSession(true);
      if (savedSession && savedQuestions) {
        const playable = withoutLockedQuestions(savedSession, savedQuestions);
        const r = calculateExamResult(playable.session, playable.questions);
        setResult({
          ...r,
          examTitle: savedSession.examTitle,
          lockedCount: playable.lockedCount,
          playableCount: playable.questions.length,
        });
        if (savedSession.examId === sessionKey) void logPracticeAnswers(playable.session);
      }
      clearExamSession();
    }
  }, [loading, showResume, state.session.status, state.session.examId, sessionKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center" role="status" aria-label="กำลังโหลด">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 mb-5">{error.message}</p>
          <div className="flex flex-col gap-3">
            {error.loginRequired && (
              <Link
                href={loginHref(`${backUrl}`)}
                className="w-full py-3 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                เข้าสู่ระบบ
              </Link>
            )}
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
            >
              กลับไปเลือกบท
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showResume && pendingSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">ทำค้างอยู่</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{pendingSession.examTitle}</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            คุณทำถึงข้อที่{' '}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{pendingSession.currentIndex + 1}</span>{' '}
            จากทั้งหมด {pendingQuestions.length} ข้อ
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleResume}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition"
            >
              ทำต่อจากข้อที่ {pendingSession.currentIndex + 1}
            </button>
            <button
              type="button"
              onClick={handleStartFresh}
              className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              เริ่มชุดใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (result && result.playableCount === 0) {
    // ล็อกทุกข้อ (ยังไม่มี Pro) — ไม่มีอะไรให้คิดคะแนน แสดงข้อความกลาง ๆ ไม่ใช่คะแนน 0 สีแดง
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 bg-indigo-100 dark:bg-indigo-900/40">
            <Lock className="w-10 h-10 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">ผลการฝึก</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">{result.examTitle}</p>
          <p className="text-gray-700 dark:text-gray-300 mb-2">ชุดนี้มีแต่ข้อ Challenge สำหรับสมาชิก Pro จึงยังไม่มีคะแนน</p>
          <p className="mb-6 flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <Lock className="w-4 h-4" aria-hidden="true" />
            ข้อ Challenge ที่ล็อก {result.lockedCount} ข้อ ไม่นับคะแนน
          </p>
          <div className="flex flex-col gap-3">
            {venueKey && (
              <Link
                href={upgradeHref(venueKey)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-semibold transition"
              >
                Unlock ข้อ Challenge
              </Link>
            )}
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
            >
              กลับไปเลือกบท
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    const passed = result.score >= 60;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
              passed ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'
            }`}
          >
            <BookOpen
              className={`w-10 h-10 ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              aria-hidden="true"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">ผลการฝึก</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">{result.examTitle}</p>
          <div
            className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 mb-6 ${
              passed ? 'border-green-500 dark:border-green-400' : 'border-red-400 dark:border-red-500'
            }`}
          >
            <div>
              <p
                className={`text-3xl font-bold leading-none ${
                  passed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`}
              >
                {Math.round(result.score)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">คะแนน</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-3">
              <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400 mx-auto mb-1" aria-hidden="true" />
              <p className="text-xl font-bold text-green-700 dark:text-green-300">{result.correctAnswers}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ถูก</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-3">
              <XCircle className="w-5 h-5 text-red-400 dark:text-red-400 mx-auto mb-1" aria-hidden="true" />
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{result.incorrectAnswers}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ผิด</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
              <MinusCircle className="w-5 h-5 text-gray-400 dark:text-gray-500 mx-auto mb-1" aria-hidden="true" />
              <p className="text-xl font-bold text-gray-600 dark:text-gray-400">{result.unanswered}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ไม่ตอบ</p>
            </div>
          </div>
          {result.lockedCount > 0 && (
            <p className="mb-6 flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <Lock className="w-4 h-4" aria-hidden="true" />
              ข้อ Challenge ที่ล็อก {result.lockedCount} ข้อ ไม่นับคะแนน
            </p>
          )}
          <div className="flex flex-col gap-3 mt-4">
            <button
              type="button"
              onClick={handleStartFresh}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ฝึกชุดใหม่
            </button>
            {result.lockedCount > 0 && venueKey && (
              <Link
                href={upgradeHref(venueKey)}
                className="w-full py-3 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
              >
                Unlock ข้อ Challenge
              </Link>
            )}
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
            >
              กลับไปเลือกบท
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {sessionInfo && sessionInfo.total > sessionInfo.count && (
        <p className="sr-only" role="status">
          สุ่มมา {sessionInfo.count} ข้อ จากทั้งหมด {sessionInfo.total} ข้อที่ตรงกับตัวเลือก
        </p>
      )}
      <ExamContainer
        onComplete={() => {
          /* handled by useEffect */
        }}
        mode="practice"
        backUrl={backUrl}
        lockedUpgradeHref={upgradeHref(venueKey)}
      />
    </>
  );
}

function BankPracticeFromUrl() {
  const searchParams = useSearchParams();
  const params = parsePracticeParams(searchParams ?? new URLSearchParams());
  if (!params) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 mb-5">ลิงก์ฝึกไม่ถูกต้อง กรุณาเลือกบทใหม่</p>
          <Link
            href="/dashboard/question-bank"
            className="inline-flex px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
          >
            ไปที่ Question Bank
          </Link>
        </div>
      </div>
    );
  }
  return (
    <ExamProvider>
      <BankPracticeContent key={practiceSessionKey(params)} params={params} />
    </ExamProvider>
  );
}

/** ฝึกจาก Question Bank / Challenge Questions (task 20) — `/practice/bank?subject=&mode=&topics=&diff=&progress=` */
export default function BankPracticePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        </div>
      }
    >
      <BankPracticeFromUrl />
    </Suspense>
  );
}
