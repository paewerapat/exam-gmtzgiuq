'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  PlayCircle,
  RotateCcw,
  GraduationCap,
  CheckCircle,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import ExamContainer from '@/components/exam/ExamContainer';
import {
  loadExamSession,
  saveExamSession,
  clearExamSession,
  generateSessionId,
  calculateExamResult,
} from '@/lib/exam-utils';
import { getPublicExam } from '@/lib/api/exams';
import {
  submitAttempt,
  startInProgressAttempt,
  updateAttemptProgress,
  completeAttempt,
  getMyInProgressForExam,
  type ExamAttempt,
} from '@/lib/api/attempts';
import type { ExamSession } from '@/types/exam';
import type { QuestionCategory } from '@/lib/api/questions';

const BACKEND_ATTEMPT_KEY = 'real_exam_backend_attempt_id';

interface PageProps {
  params: Promise<{ examId: string }>;
}

function saveBackendAttemptId(examId: string, attemptId: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${BACKEND_ATTEMPT_KEY}_${examId}`, attemptId);
  }
}
function loadBackendAttemptId(examId: string): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(`${BACKEND_ATTEMPT_KEY}_${examId}`);
  }
  return null;
}
function clearBackendAttemptId(examId: string) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${BACKEND_ATTEMPT_KEY}_${examId}`);
  }
}

function isLoggedIn(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('token');
}

// localStorage key for real exam sessions (separate from practice)
const REAL_EXAM_SESSION_KEY = 'real_exam_session';

function saveRealExamSession(examId: string, session: ExamSession, questions: any[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      `${REAL_EXAM_SESSION_KEY}_${examId}`,
      JSON.stringify({ session, questions }),
    );
  }
}
function loadRealExamSession(examId: string): { session: ExamSession | null; questions: any[] } {
  if (typeof window === 'undefined') return { session: null, questions: [] };
  try {
    const raw = localStorage.getItem(`${REAL_EXAM_SESSION_KEY}_${examId}`);
    if (!raw) return { session: null, questions: [] };
    return JSON.parse(raw);
  } catch {
    return { session: null, questions: [] };
  }
}
function clearRealExamSession(examId: string) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${REAL_EXAM_SESSION_KEY}_${examId}`);
  }
}

// ── Resume dialog ─────────────────────────────────────────────
function ResumeDialog({
  examTitle,
  questionCount,
  resumeIndex,
  onResume,
  onStartFresh,
}: {
  examTitle: string;
  questionCount: number;
  resumeIndex: number;
  onResume: () => void;
  onStartFresh: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-8 h-8 text-rose-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          ข้อสอบจริงที่ค้างอยู่
        </h2>
        <p className="text-gray-500 text-sm mb-1">{examTitle}</p>
        <p className="text-gray-500 text-sm mb-6">
          คุณทำถึงข้อที่{' '}
          <span className="font-semibold text-rose-600">{resumeIndex + 1}</span>{' '}
          จากทั้งหมด {questionCount} ข้อ
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onResume}
            className="w-full py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" />
            ทำต่อจากข้อที่ {resumeIndex + 1}
          </button>
          <button
            onClick={onStartFresh}
            className="w-full py-3 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            เริ่มสอบใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Result screen ─────────────────────────────────────────────
function ResultScreen({
  examId,
  examTitle,
  result,
}: {
  examId: string;
  examTitle: string;
  result: {
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unanswered: number;
    score: number;
  };
}) {
  const passed = result.score >= 60;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
            passed ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          <GraduationCap
            className={`w-10 h-10 ${passed ? 'text-green-600' : 'text-red-600'}`}
          />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-1">ผลการสอบ</h2>
        <p className="text-gray-500 text-sm mb-5">{examTitle}</p>

        {/* Score circle */}
        <div
          className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 mb-6 ${
            passed ? 'border-green-500' : 'border-red-400'
          }`}
        >
          <div>
            <p
              className={`text-3xl font-bold leading-none ${
                passed ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {Math.round(result.score)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">คะแนน</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-green-50 rounded-xl p-3">
            <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-green-700">
              {result.correctAnswers}
            </p>
            <p className="text-xs text-gray-500">ถูก</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-red-600">
              {result.incorrectAnswers}
            </p>
            <p className="text-xs text-gray-500">ผิด</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <MinusCircle className="w-5 h-5 text-gray-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-600">
              {result.unanswered}
            </p>
            <p className="text-xs text-gray-500">ไม่ตอบ</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href={`/exam/${examId}`}
            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            สอบใหม่อีกครั้ง
          </Link>
          <Link
            href="/dashboard/exam"
            className="w-full py-3 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
          >
            กลับหน้าข้อสอบจริง
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main exam content ─────────────────────────────────────────
function RealExamPageContent({ examId }: { examId: string }) {
  const router = useRouter();
  const { initExam, state } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumeDialog, setResumeDialog] = useState<{
    backendAttempt: ExamAttempt;
    examTitle: string;
    questionCount: number;
  } | null>(null);
  const [result, setResult] = useState<{
    examTitle: string;
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unanswered: number;
    score: number;
  } | null>(null);

  const attemptIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save to backend
  const scheduleBackendSave = useCallback((session: ExamSession) => {
    if (!attemptIdRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      updateAttemptProgress(attemptIdRef.current!, {
        currentIndex: session.currentIndex,
        answers: session.answers,
        timePerQuestion: session.timePerQuestion,
      }).catch(() => {});
    }, 2000);
  }, []);

  useEffect(() => {
    if (state.session.status === 'in_progress' && state.session.id) {
      scheduleBackendSave(state.session);
      saveRealExamSession(examId, state.session, state.questions);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state.session, state.questions, scheduleBackendSave, examId]);

  async function initFromSessionAndAttempt(
    session: ExamSession,
    questions: any[],
    attemptId: string | null,
  ) {
    if (attemptId) {
      attemptIdRef.current = attemptId;
      saveBackendAttemptId(examId, attemptId);
    }
    initExam(session, questions);
    setLoading(false);
  }

  useEffect(() => {
    async function loadOrCreateSession() {
      // 1. Check real-exam localStorage
      const { session: existingSession, questions: existingQuestions } =
        loadRealExamSession(examId);

      if (existingSession && existingQuestions && existingSession.examId === examId) {
        if (existingSession.status === 'completed') {
          clearRealExamSession(examId);
        } else {
          const storedId = loadBackendAttemptId(examId);
          await initFromSessionAndAttempt(existingSession, existingQuestions, storedId);
          return;
        }
      }

      // 2. Check backend for in-progress (mode=exam)
      let backendAttempt: ExamAttempt | null = null;
      if (isLoggedIn()) {
        try {
          const attempt = await getMyInProgressForExam(examId);
          if (attempt && attempt.mode === 'exam') {
            backendAttempt = attempt;
          }
        } catch { /* ignore */ }
      }

      // 3. Fetch exam
      try {
        const exam = await getPublicExam(examId);

        if (!exam.questions || exam.questions.length === 0) {
          setError('ชุดข้อสอบนี้ยังไม่มีคำถาม');
          setLoading(false);
          return;
        }

        // 4. Show resume dialog if in-progress exists
        if (backendAttempt && backendAttempt.currentIndex > 0) {
          setResumeDialog({
            backendAttempt,
            examTitle: exam.title,
            questionCount: exam.questions.length,
          });
          setLoading(false);
          return;
        }

        await startFreshExam(exam, backendAttempt);
      } catch (err) {
        console.error('Failed to load exam:', err);
        setError('ไม่สามารถโหลดข้อสอบได้');
        setLoading(false);
      }
    }

    loadOrCreateSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function startFreshExam(exam: any, existingBackendAttempt?: ExamAttempt | null) {
    const questionIds = exam.questions.map((q: any) => q.id);
    const startedAt = new Date().toISOString();

    const session: ExamSession = {
      id: generateSessionId(),
      examId: exam.id,
      examTitle: exam.title,
      category: exam.category as QuestionCategory,
      questionIds,
      currentIndex: 0,
      answers: {},
      markedForReview: [],
      timePerQuestion: {},
      startedAt,
      status: 'in_progress',
    };

    saveRealExamSession(examId, session, exam.questions);

    let attemptId: string | null = null;
    if (isLoggedIn()) {
      try {
        const attempt = await startInProgressAttempt({
          examId: exam.id,
          examTitle: exam.title,
          category: exam.category as QuestionCategory,
          totalQuestions: exam.questions.length,
          questionIds,
          startedAt,
          mode: 'exam',
        });
        attemptId = attempt.id;
      } catch { /* silent */ }
    }

    await initFromSessionAndAttempt(session, exam.questions, attemptId);
  }

  async function handleResume() {
    if (!resumeDialog) return;
    const { backendAttempt } = resumeDialog;

    setLoading(true);
    setResumeDialog(null);

    try {
      const exam = await getPublicExam(examId);
      const session: ExamSession = {
        id: generateSessionId(),
        examId,
        examTitle: backendAttempt.examTitle,
        category: backendAttempt.category as QuestionCategory,
        questionIds: backendAttempt.questionIds,
        currentIndex: backendAttempt.currentIndex,
        answers: backendAttempt.answers || {},
        markedForReview: [],
        timePerQuestion: backendAttempt.timePerQuestion || {},
        startedAt: backendAttempt.startedAt,
        status: 'in_progress',
      };

      saveRealExamSession(examId, session, exam.questions);
      await initFromSessionAndAttempt(session, exam.questions, backendAttempt.id);
    } catch (err) {
      console.error('Failed to resume:', err);
      setError('ไม่สามารถโหลดข้อสอบได้');
      setLoading(false);
    }
  }

  async function handleStartFresh() {
    if (!resumeDialog) return;
    setLoading(true);
    setResumeDialog(null);
    clearRealExamSession(examId);
    clearBackendAttemptId(examId);
    attemptIdRef.current = null;

    try {
      const exam = await getPublicExam(examId);
      await startFreshExam(exam);
    } catch (err) {
      console.error('Failed to load exam:', err);
      setError('ไม่สามารถโหลดข้อสอบได้');
      setLoading(false);
    }
  }

  // ── Complete ─────────────────────────────────────────────────
  const handleComplete = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    const { session: savedSession, questions: savedQuestions } =
      loadRealExamSession(examId);

    if (!savedSession || !savedQuestions) return;

    const examResult = calculateExamResult(savedSession, savedQuestions);
    const payload = {
      examId: savedSession.examId,
      examTitle: savedSession.examTitle,
      category: savedSession.category,
      totalQuestions: examResult.totalQuestions,
      correctAnswers: examResult.correctAnswers,
      incorrectAnswers: examResult.incorrectAnswers,
      unanswered: examResult.unanswered,
      score: examResult.score,
      totalTime: examResult.totalTime,
      timePerQuestion: savedSession.timePerQuestion,
      answers: savedSession.answers,
      questionIds: savedSession.questionIds,
      startedAt: savedSession.startedAt,
      completedAt: new Date().toISOString(),
      mode: 'exam' as const,
    };

    // Clear local session first
    clearRealExamSession(examId);
    const storedAttemptId = attemptIdRef.current;
    clearBackendAttemptId(examId);

    // Await the API so status is 'completed' before user navigates back
    try {
      if (storedAttemptId) {
        await completeAttempt(storedAttemptId, payload);
      } else {
        await submitAttempt(payload);
      }
    } catch (err) {
      console.error('Failed to submit attempt:', err);
      // Still show result even if submit fails
    }

    setResult({
      examTitle: savedSession.examTitle,
      ...examResult,
    });
  };

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-rose-600 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อสอบ...</p>
        </div>
      </div>
    );
  }

  if (resumeDialog) {
    return (
      <ResumeDialog
        examTitle={resumeDialog.examTitle}
        questionCount={resumeDialog.questionCount}
        resumeIndex={resumeDialog.backendAttempt.currentIndex}
        onResume={handleResume}
        onStartFresh={handleStartFresh}
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/dashboard/exam')}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
          >
            กลับหน้าข้อสอบจริง
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <ResultScreen
        examId={examId}
        examTitle={result.examTitle}
        result={result}
      />
    );
  }

  return <ExamContainer onComplete={handleComplete} mode="exam" />;
}

// ── Root export ───────────────────────────────────────────────
export default function RealExamPage({ params }: PageProps) {
  const [examId, setExamId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setExamId(p.examId));
  }, [params]);

  if (!examId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
      </div>
    );
  }

  return (
    <ExamProvider>
      <RealExamPageContent examId={examId} />
    </ExamProvider>
  );
}
