'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  withCurrentQuestionTime,
  hasSessionProgress,
} from '@/lib/exam-utils';
import { getPublicExam } from '@/lib/api/exams';
import { toast } from 'react-toastify';
import {
  CAMPAIGN_ENDED_RESUME_TEXT,
  campaignClosedCode,
  isExamLockedError,
  isPredictedLockedError,
  predictedLockedVenueKey,
  type CampaignClosedCode,
} from '@/lib/api/apiError';
import CampaignClosedScreen from '@/components/exam/CampaignClosedScreen';
import { PredictedLockedScreen, PredictedPreviewBar } from '@/components/exam/PredictedNotices';
import {
  isStalePreviewProgress,
  normalizeExamPredicted,
  PREDICTED_PAGE_HREF,
  previewCounts,
  recallPredicted,
  rememberPredicted,
  type ExamPredictedInfo,
} from '@/lib/predicted';
import { withTimeout } from '@/lib/with-timeout';
import { UNLOCK_TEXT } from '@/lib/unlock-codes';
import ExamLockedScreen from '@/components/exam/ExamLockedScreen';
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
/** รอ PATCH complete ไม่เกินนี้ — เกินแล้วไปหน้าผลต่อเหมือนเดิม (ผลคิดในเครื่องแล้ว) */
const COMPLETE_TIMEOUT_MS = 15_000;

interface PageProps {
  params: Promise<{ examId: string }>;
}

/** Store/load the backend attempt ID alongside the session */
function saveBackendAttemptId(examId: string, attemptId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${BACKEND_ATTEMPT_KEY}_${examId}`, attemptId);
  } catch (error) {
    // storage เต็มจากข้อมูลอื่น → ไม่จำ attempt id ในเครื่อง แต่หน้ายังทำข้อสอบต่อได้
    console.error('Failed to save attempt id:', error);
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-indigo-900/40">
          <PlayCircle className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">ทำข้อสอบค้างอยู่</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{examTitle}</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          คุณทำถึงข้อที่{' '}
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
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
            className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 dark:hover:bg-gray-700/50"
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
  // examId ที่โหลด/เริ่มไปแล้วใน instance นี้ — StrictMode (dev) รัน effect ซ้ำแต่ ref คงอยู่
  // กันไม่ให้ยิง GET in-progress / POST /attempts/start ซ้ำ
  const loadedExamIdRef = useRef<string | null>(null);
  // กำลังส่งข้อสอบ — กัน handleComplete ซ้ำ (กดส่งซ้ำ / นาฬิกาเดิมของ session เก่าเรียก onComplete ซ้ำ) ระหว่างรอ API (N2)
  const submittingRef = useRef(false);
  // แสดงสถานะ "กำลังส่งข้อสอบ…" ระหว่างรอ API (ไม่ให้ดูเหมือนค้าง)
  const [submitting, setSubmitting] = useState(false);
  // ชุด Mock ที่ล็อก (403 EXAM_LOCKED) → แจ้งแล้วพาไปหน้ารายละเอียด Mock (task 15)
  const [locked, setLocked] = useState(false);
  // ชุดแคมเปญนอกช่วงเวลา (403 CAMPAIGN_NOT_OPEN / CAMPAIGN_ENDED — task 21) → หยุด ไม่ให้ทำโดยไม่บันทึก
  const [campaignClosed, setCampaignClosed] = useState<CampaignClosedCode | null>(null);
  // เวลาสอบจริงของชุด = ค่าแนะนำในหน้าต่างตั้งค่าเวลา (task 21)
  const [recommendedMinutes, setRecommendedMinutes] = useState<number | null>(null);
  // ชุด Predicted (task 22): preview = API ส่งมาเฉพาะ N ข้อแรก / 403 PREDICTED_LOCKED = หน้าล็อกพร้อมปุ่ม Unlock
  const [predicted, setPredicted] = useState<ExamPredictedInfo | null>(null);
  const [predictedLocked, setPredictedLocked] = useState<{ venueKey: string | null } | null>(null);
  const detailHref = `/dashboard/mock-exams/${examId}`;

  /** เก็บข้อมูล predicted ของชุด (หน้าผลอ่านจาก storage) แล้วคืนค่าให้ผู้เรียกใช้ต่อ */
  function applyPredicted(exam: { predicted?: unknown }): ExamPredictedInfo | null {
    const info = normalizeExamPredicted(exam.predicted);
    setPredicted(info);
    rememberPredicted(examId, info);
    return info;
  }

  // ไม่ล้าง session ในเครื่อง (key กลางอาจเป็นของชุดอื่น — BUG-6 / คำตอบเดิมยังอยู่ถ้าได้สิทธิ์กลับมา)
  function handlePredictedLocked(err: unknown) {
    setResumeDialog(null);
    setPredictedLocked({ venueKey: predictedLockedVenueKey(err) });
    setLoading(false);
  }

  function handleLocked() {
    if (locked) return;
    setLocked(true);
    setLoading(false);
    setResumeDialog(null);
    toast.info(UNLOCK_TEXT.examLocked);
    router.replace(detailHref);
  }

  // autosave อ้างผ่าน ref: scheduleBackendSave ต้องคงที่ (ถ้าเปลี่ยนทุก render effect ด้านล่างจะล้าง timer ทุกครั้ง)
  const handlePredictedLockedRef = useRef(handlePredictedLocked);
  useEffect(() => {
    handlePredictedLockedRef.current = handlePredictedLocked;
  });

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
        }).catch((err) => {
          // สิทธิ์ของชุด Predicted หมดระหว่างทำ → หยุดและแสดงหน้าล็อก (คำตอบยังอยู่ในเครื่อง) / error อื่นเงียบเหมือนเดิม
          if (isPredictedLockedError(err)) {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            handlePredictedLockedRef.current(err);
          }
        });
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
    if (loadedExamIdRef.current === examId) return;
    loadedExamIdRef.current = examId;

    async function loadOrCreateSession() {
      // 1. Check localStorage first
      const stored = loadExamSession();
      let existingSession = stored.session;

      // 2. No localStorage session - check backend for in-progress (if logged in)
      let backendAttempt: ExamAttempt | null = null;
      if (isLoggedIn()) {
        try {
          backendAttempt = await getMyInProgressForExam(examId);
        } catch {/* ignore */}
      }

      // 3. Fetch the exam from API (always fresh to get latest questions/choices)
      try {
        const exam = await getPublicExam(examId);
        setRecommendedMinutes(exam.durationMinutes ? Number(exam.durationMinutes) : null);
        // สิทธิ์ที่จำไว้จากการโหลดครั้งก่อน (ตอนสร้าง session ในเครื่อง) — อ่านก่อน applyPredicted เขียนทับ
        const previousPredicted = recallPredicted(examId);
        const predictedInfo = applyPredicted(exam);
        // ชุด Predicted ที่สิทธิ์เปลี่ยน (เช่น Pro หมด → เหลือ Preview) session/attempt เดิมอาจมีข้อที่ API ไม่ส่งแล้ว
        // → ไม่ทำต่อจากของเดิม (ชุดปกติคงพฤติกรรมเดิม)
        const freshIds = new Set((exam.questions ?? []).map((q: { id: string }) => q.id));
        const fitsExam = (ids: string[] | undefined) => !predictedInfo || (!!ids && ids.every((id) => freshIds.has(id)));
        // ตอนนี้ทำได้เต็มแต่ attempt/session เดิมเป็นของ Preview (ได้ Pro ภายหลัง) → ไม่ทำต่อ เริ่มใหม่ทั้งชุด
        // (POST /attempts/start ทิ้ง attempt Preview ที่ค้างบน server ให้เอง)
        if (
          backendAttempt &&
          (!fitsExam(backendAttempt.questionIds) || isStalePreviewProgress(predictedInfo, backendAttempt))
        ) {
          backendAttempt = null;
        }
        if (
          existingSession &&
          existingSession.examId === examId &&
          isStalePreviewProgress(predictedInfo, {}, previousPredicted?.access === 'preview')
        ) {
          clearExamSession();
          clearBackendAttemptId(examId);
          existingSession = null;
        }

        // Resume in-progress session with fresh questions from API
        if (
          existingSession &&
          existingSession.examId === examId &&
          existingSession.status !== 'completed' &&
          fitsExam(existingSession.questionIds)
        ) {
          const storedId = loadBackendAttemptId(examId);
          saveExamSession(existingSession, exam.questions);
          await initFromSessionAndAttempt(existingSession, exam.questions, storedId);
          return;
        }
        if (existingSession?.status === 'completed') {
          router.push(`/practice/exam/${examId}/results`);
          return;
        }

        if (!exam.questions || exam.questions.length === 0) {
          setError('ชุดข้อสอบนี้ยังไม่มีคำถาม');
          setLoading(false);
          return;
        }

        // 4. attempt ค้างบน server ที่ตอบแล้ว/เลื่อนข้อแล้ว → ถามทำต่อ (เริ่มใหม่จะทิ้งคำตอบ)
        if (backendAttempt && hasSessionProgress(backendAttempt)) {
          setResumeDialog({
            backendAttempt,
            examTitle: exam.title,
            questionCount: exam.questions.length,
          });
          setLoading(false);
          return;
        }

        // 5. Start fresh (attempt ค้างที่ยังไม่ได้ตอบ server ใช้แถวเดิมต่อ)
        try {
          await startFreshExam(exam, backendAttempt);
        } catch (err) {
          // แคมเปญจบแล้วแต่มี attempt ค้าง (เริ่มใหม่ไม่ได้ แต่ API ให้ทำต่อ/ส่งได้ — AC5) → ทำ attempt เดิมต่อ
          if (backendAttempt && campaignClosedCode(err) === 'CAMPAIGN_ENDED') {
            await resumeFromBackendAttempt(backendAttempt, exam);
            return;
          }
          throw err;
        }
      } catch (err) {
        if (isPredictedLockedError(err)) {
          handlePredictedLocked(err);
          return;
        }
        if (isExamLockedError(err)) {
          handleLocked();
          return;
        }
        const closed = campaignClosedCode(err);
        if (closed) {
          setCampaignClosed(closed);
          setLoading(false);
          return;
        }
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
      // โหมดฝึกนับขึ้นเป็นค่าเริ่มต้น ตั้งนับถอยหลังเองได้ที่นาฬิกา (task 21) — ไม่จับเวลาตาม durationMinutes แล้ว
      durationSeconds: null,
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
      } catch (err) {
        // ไม่มีสิทธิ์ (403 EXAM_LOCKED) → ส่งต่อให้ผู้เรียกพาไปหน้ารายละเอียด / error อื่นทำต่อโดยไม่ติดตาม
        if (isExamLockedError(err)) throw err;
        // แคมเปญยังไม่เปิด/จบแล้ว (task 21) / ชุด Predicted ล็อก (task 22) → ทิ้ง session ที่เพิ่งสร้างแล้วส่งต่อให้ผู้เรียกแจ้งผู้ใช้
        if (campaignClosedCode(err) || isPredictedLockedError(err)) {
          clearExamSession();
          throw err;
        }
      }
    }

    await initFromSessionAndAttempt(session, exam.questions, attemptId);
  }

  /** สร้าง session จาก attempt ค้างบน server แล้วเข้าหน้าข้อสอบ (ทำ attempt เดิมต่อ) */
  async function resumeFromBackendAttempt(
    backendAttempt: ExamAttempt,
    exam: Pick<Awaited<ReturnType<typeof getPublicExam>>, 'questions'>,
  ) {
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
      durationSeconds: null,
      status: 'in_progress',
    };

    saveExamSession(session, exam.questions);
    await initFromSessionAndAttempt(session, exam.questions, backendAttempt.id);
  }

  async function handleResume() {
    if (!resumeDialog) return;
    const { backendAttempt } = resumeDialog;

    setLoading(true);
    setResumeDialog(null);

    try {
      const exam = await getPublicExam(examId);
      setRecommendedMinutes(exam.durationMinutes ? Number(exam.durationMinutes) : null);
      applyPredicted(exam);
      await resumeFromBackendAttempt(backendAttempt, exam);
    } catch (err) {
      if (isPredictedLockedError(err)) {
        handlePredictedLocked(err);
        return;
      }
      if (isExamLockedError(err)) {
        handleLocked();
        return;
      }
      // GET /exams/:id ตอบ 403 CAMPAIGN_NOT_OPEN ถ้าแอดมินเลื่อนแคมเปญไปอนาคตระหว่างนั้น (task 21 R1)
      const closed = campaignClosedCode(err);
      if (closed) {
        setCampaignClosed(closed);
        setLoading(false);
        return;
      }
      console.error('Failed to resume:', err);
      setError('ไม่สามารถโหลดข้อสอบได้');
      setLoading(false);
    }
  }

  async function handleStartFresh() {
    if (!resumeDialog) return;
    const { backendAttempt } = resumeDialog;
    setLoading(true);
    setResumeDialog(null);
    clearExamSession();
    clearBackendAttemptId(examId);
    attemptIdRef.current = null;

    try {
      const exam = await getPublicExam(examId);
      setRecommendedMinutes(exam.durationMinutes ? Number(exam.durationMinutes) : null);
      applyPredicted(exam);
      try {
        await startFreshExam(exam);
      } catch (err) {
        // แคมเปญจบแล้ว: เริ่มใหม่ไม่ได้ (403 ทุกครั้ง) แต่ attempt ค้างยังทำต่อ/ส่งได้ (AC5) → แจ้งแล้วทำต่อ (M3)
        if (campaignClosedCode(err) === 'CAMPAIGN_ENDED') {
          toast.info(CAMPAIGN_ENDED_RESUME_TEXT);
          await resumeFromBackendAttempt(backendAttempt, exam);
          return;
        }
        throw err;
      }
    } catch (err) {
      if (isPredictedLockedError(err)) {
        handlePredictedLocked(err);
        return;
      }
      if (isExamLockedError(err)) {
        handleLocked();
        return;
      }
      const closed = campaignClosedCode(err);
      if (closed) {
        setCampaignClosed(closed);
        setLoading(false);
        return;
      }
      console.error('Failed to load exam:', err);
      setError('ไม่สามารถโหลดข้อสอบได้');
      setLoading(false);
    }
  }

  // ── Complete ──────────────────────────────────────────────
  const handleComplete = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    const { session: storedSession, questions: savedQuestions } =
      loadExamSession(true);
    if (!storedSession || !savedQuestions) {
      router.push(`/practice/exam/${examId}/results`);
      return;
    }
    // ใส่เวลาของข้อที่เปิดอยู่ก่อนคิดผล/ส่ง complete (BUG-22) — เช่นหมดเวลาแล้วส่งเอง ซึ่งไม่ผ่าน completeExam()
    // ใช้เฉพาะเมื่อเป็น session เดียวกับที่อยู่ในหน้า (กันเอาเวลาไปใส่ session อื่นใน key กลาง)
    const savedSession =
      storedSession.id === state.session.id && storedSession.currentIndex === state.session.currentIndex
        ? withCurrentQuestionTime(storedSession, state.currentTimer)
        : storedSession;
    // หน้าผล (results) อ่านจาก storage → เก็บเวลาที่ใส่เพิ่มด้วย
    if (savedSession !== storedSession) saveExamSession(savedSession, savedQuestions);

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
    setSubmitting(true);
    if (storedAttemptId) {
      // Complete the existing in-progress attempt — รอผล (ไม่เกิน COMPLETE_TIMEOUT_MS) เพื่อจับกรณีสิทธิ์ของชุด Predicted หมดก่อนส่ง
      // ช้าเกิน/error อื่น → ไปหน้าผลต่อเหมือนเดิม
      try {
        await withTimeout(completeAttempt(storedAttemptId, payload), COMPLETE_TIMEOUT_MS);
        clearBackendAttemptId(examId);
      } catch (err) {
        if (isPredictedLockedError(err)) {
          // API ไม่บันทึกผล → คืน session เป็น "กำลังทำ" (attempt id เดิมยังเก็บไว้) แล้วแสดงหน้าล็อก ไม่ไปหน้าผล
          saveExamSession({ ...savedSession, status: 'in_progress', completedAt: undefined }, savedQuestions);
          submittingRef.current = false;
          setSubmitting(false);
          handlePredictedLocked(err);
          return;
        }
        console.error('Failed to complete attempt:', err);
        clearBackendAttemptId(examId);
      }
    } else {
      // Fallback: submit as new attempt — รอผลเพื่อจับกรณีแคมเปญนอกช่วงเวลา (task 21 R3)
      try {
        await submitAttempt(payload);
      } catch (err) {
        if (isPredictedLockedError(err)) {
          // API ไม่บันทึกผล → คืน session เป็น "กำลังทำ" แล้วแสดงหน้าล็อก (ไม่ไปหน้าผลเหมือนส่งสำเร็จ)
          saveExamSession({ ...savedSession, status: 'in_progress', completedAt: undefined }, savedQuestions);
          submittingRef.current = false;
          setSubmitting(false);
          handlePredictedLocked(err);
          return;
        }
        const closed = campaignClosedCode(err);
        if (closed) {
          // API ไม่บันทึกผล → คืน session เป็น "กำลังทำ" (คำตอบยังอยู่ในเครื่อง) แล้วแจ้ง แทนการไปหน้าผลเหมือนส่งสำเร็จ
          saveExamSession({ ...savedSession, status: 'in_progress', completedAt: undefined }, savedQuestions);
          toast.error('ส่งข้อสอบไม่สำเร็จ ผลนี้ยังไม่ได้บันทึก (คำตอบเก็บไว้ในเครื่องนี้)');
          setCampaignClosed(closed);
          submittingRef.current = false;
          setSubmitting(false);
          return;
        }
        console.error('Failed to submit attempt:', err);
      }
    }

    router.push(`/practice/exam/${examId}/results`);
  };

  // ── Render ────────────────────────────────────────────────
  if (campaignClosed) {
    return <CampaignClosedScreen code={campaignClosed} detailHref={detailHref} />;
  }

  if (predictedLocked) {
    return <PredictedLockedScreen venueKey={predictedLocked.venueKey} />;
  }

  if (locked) {
    return <ExamLockedScreen kind="load" detailHref={detailHref} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลดข้อสอบ...</p>
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
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

  const preview = predicted?.access === 'preview' ? previewCounts(predicted, state.questions.length) : null;
  return (
    <>
      <ExamContainer
        onComplete={handleComplete}
        timerSettings={{ recommendedMinutes }}
        backUrl={predicted ? PREDICTED_PAGE_HREF : undefined}
        notice={
          preview && predicted ? (
            <PredictedPreviewBar answerable={preview.answerable} total={preview.total} venueKey={predicted.venueKey} />
          ) : undefined
        }
      />
      {/* overlay ผ่าน portal (FadeIn/transform ทำ position: fixed เพี้ยน) */}
      {submitting &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            data-testid="submitting-overlay"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-800 px-6 py-4 shadow-lg">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <p className="font-medium text-gray-800 dark:text-gray-100">กำลังส่งข้อสอบ…</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default function ExamPage({ params }: PageProps) {
  const [examId, setExamId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setExamId(p.examId));
  }, [params]);

  if (!examId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <ExamProvider>
      <ExamPageContent examId={examId} />
    </ExamProvider>
  );
}
