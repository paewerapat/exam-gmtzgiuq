'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlayCircle, RotateCcw } from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { ExamContainer } from '@/components/exam';
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

const BACKEND_ATTEMPT_KEY = 'exam_backend_attempt_id';

interface PageProps {
  params: Promise<{ examId: string }>;
}

/** Store/load the backend attempt ID alongside the session */
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

/** Check if user is logged in (has token) */
function isLoggedIn(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('token');
}

// ── Resume dialog ───────────────────────────────────────────

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
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <PlayCircle className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">ทำข้อสอบค้างอยู่</h2>
        <p className="text-gray-500 text-sm mb-1">{examTitle}</p>
        <p className="text-gray-500 text-sm mb-6">
          คุณทำถึงข้อที่{' '}
          <span className="font-semibold text-indigo-600">
            {resumeIndex + 1}
          </span>{' '}
          จากทั้งหมด {questionCount} ข้อ
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onResume}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" />
            ทำต่อจากข้อที่ {resumeIndex + 1}
          </button>
          <button
            onClick={onStartFresh}
            className="w-full py-3 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            เริ่มทำใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main exam content ───────────────────────────────────────

function ExamPageContent({ examId }: { examId: string }) {
  const router = useRouter();
  const { initExam, state, getResult } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumeDialog, setResumeDialog] = useState<{
    backendAttempt: ExamAttempt;
    examTitle: string;
    questionCount: number;
  } | null>(null);

  // Refs to hold mutable values without re-renders
  const attemptIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-save to backend ──────────────────────────────────
  const scheduleBackendSave = useCallback(
    (session: ExamSession) => {
      if (!attemptIdRef.current) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        updateAttemptProgress(attemptIdRef.current!, {
          currentIndex: session.currentIndex,
          answers: session.answers,
          timePerQuestion: session.timePerQuestion,
        }).catch(() => {/* silent fail */});
      }, 2000);
    },
    [],
  );

  useEffect(() => {
    if (state.session.status === 'in_progress' && state.session.id) {
      scheduleBackendSave(state.session);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state.session, scheduleBackendSave]);

  // ── Init helper ───────────────────────────────────────────
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

  // ── Load / Resume ─────────────────────────────────────────
  useEffect(() => {
    async function loadOrCreateSession() {
      // 1. Check localStorage first
      const { session: existingSession, questions: existingQuestions } =
        loadExamSession();

      if (
        existingSession &&
        existingQuestions &&
        existingSession.examId === examId
      ) {
        if (existingSession.status === 'completed') {
          router.push(`/practice/exam/${examId}/results`);
          return;
        }
        // Resume from localStorage - re-use stored backend attempt ID
        const storedId = loadBackendAttemptId(examId);
        await initFromSessionAndAttempt(
          existingSession,
          existingQuestions,
          storedId,
        );
        return;
      }

      // 2. No localStorage session - check backend for in-progress (if logged in)
      let backendAttempt: ExamAttempt | null = null;
      if (isLoggedIn()) {
        try {
          backendAttempt = await getMyInProgressForExam(examId);
        } catch {/* ignore */}
      }

      // 3. Fetch the exam from API
      try {
        const exam = await getPublicExam(examId);

        if (!exam.questions || exam.questions.length === 0) {
          setError('ชุดข้อสอบนี้ยังไม่มีคำถาม');
          setLoading(false);
          return;
        }

        // 4. If backend has in-progress, show resume dialog
        if (backendAttempt && backendAttempt.currentIndex > 0) {
          setResumeDialog({
            backendAttempt,
            examTitle: exam.title,
            questionCount: exam.questions.length,
          });
          setLoading(false);
          return;
        }

        // 5. Start fresh
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

    saveExamSession(session, exam.questions);

    // Start backend tracking (if logged in)
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
        });
        attemptId = attempt.id;
      } catch {/* ignore - continue without backend tracking */}
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

      // Restore session from backend state
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

      saveExamSession(session, exam.questions);
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
    clearExamSession();
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

  // ── Complete ──────────────────────────────────────────────
  const handleComplete = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    const { session: savedSession, questions: savedQuestions } =
      loadExamSession(true);
    if (!savedSession || !savedQuestions) {
      router.push(`/practice/exam/${examId}/results`);
      return;
    }

    const result = calculateExamResult(savedSession, savedQuestions);
    const payload = {
      examId: savedSession.examId,
      examTitle: savedSession.examTitle,
      category: savedSession.category,
      totalQuestions: result.totalQuestions,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      unanswered: result.unanswered,
      score: result.score,
      totalTime: result.totalTime,
      timePerQuestion: savedSession.timePerQuestion,
      answers: savedSession.answers,
      questionIds: savedSession.questionIds,
      startedAt: savedSession.startedAt,
      completedAt: savedSession.completedAt,
    };

    const storedAttemptId = attemptIdRef.current;
    if (storedAttemptId) {
      // Complete the existing in-progress attempt
      completeAttempt(storedAttemptId, payload).catch((err) =>
        console.error('Failed to complete attempt:', err),
      );
      clearBackendAttemptId(examId);
    } else {
      // Fallback: submit as new attempt
      submitAttempt(payload).catch((err) =>
        console.error('Failed to submit attempt:', err),
      );
    }

    router.push(`/practice/exam/${examId}/results`);
  };

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
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
            onClick={() => router.push('/dashboard/practice')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            กลับหน้าฝึกทำข้อสอบ
          </button>
        </div>
      </div>
    );
  }

  return <ExamContainer onComplete={handleComplete} />;
}

export default function ExamPage({ params }: PageProps) {
  const [examId, setExamId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setExamId(p.examId));
  }, [params]);

  if (!examId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <ExamProvider>
      <ExamPageContent examId={examId} />
    </ExamProvider>
  );
}
