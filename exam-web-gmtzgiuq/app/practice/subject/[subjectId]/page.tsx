'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, BookOpen } from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { ExamContainer } from '@/components/exam';
import {
  loadExamSession,
  saveExamSession,
  clearExamSession,
  generateSessionId,
} from '@/lib/exam-utils';
import { getQuestionsBySubject } from '@/lib/api/questions';
import { getPublicCurriculumTree } from '@/lib/api/curriculum';
import type { ExamSession } from '@/types/exam';
import type { Question } from '@/lib/api/questions';

function SubjectExamContent({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const { initExam, state } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [pendingSession, setPendingSession] = useState<ExamSession | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);

  const sessionKey = `subject_${subjectId}`;

  useEffect(() => {
    async function load() {
      try {
        const [questions, subjects] = await Promise.all([
          getQuestionsBySubject(subjectId),
          getPublicCurriculumTree().catch(() => []),
        ]);

        if (!questions || questions.length === 0) {
          setError('ยังไม่มีคำถามในวิชานี้');
          setLoading(false);
          return;
        }

        const subject = subjects.find((s) => s.id === subjectId);
        const subjectName = subject?.name ?? 'ฝึกทำข้อสอบ';

        const { session: existing } = loadExamSession();
        if (existing && existing.examId === sessionKey && existing.status === 'in_progress') {
          saveExamSession(existing, questions);
          setPendingSession(existing);
          setPendingQuestions(questions);
          setShowResume(true);
          setLoading(false);
          return;
        }

        clearExamSession();

        const newSession: ExamSession = {
          id: generateSessionId(),
          examId: sessionKey,
          examTitle: subjectName,
          category: (questions[0]?.category as any) ?? 'general_knowledge',
          questionIds: questions.map((q) => q.id),
          currentIndex: 0,
          answers: {},
          markedForReview: [],
          timePerQuestion: {},
          startedAt: new Date().toISOString(),
          status: 'in_progress',
        };

        saveExamSession(newSession, questions);
        initExam(newSession, questions);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('ไม่สามารถโหลดคำถามได้');
        setLoading(false);
      }
    }
    load();
  }, [subjectId]);

  function handleResume() {
    if (!pendingSession || pendingQuestions.length === 0) return;
    initExam(pendingSession, pendingQuestions);
    setShowResume(false);
  }

  async function handleStartFresh() {
    clearExamSession();
    setShowResume(false);
    setLoading(true);
    try {
      const [questions, subjects] = await Promise.all([
        getQuestionsBySubject(subjectId),
        getPublicCurriculumTree().catch(() => []),
      ]);
      const subject = subjects.find((s) => s.id === subjectId);
      const subjectName = subject?.name ?? 'ฝึกทำข้อสอบ';
      const newSession: ExamSession = {
        id: generateSessionId(),
        examId: sessionKey,
        examTitle: subjectName,
        category: (questions[0]?.category as any) ?? 'general_knowledge',
        questionIds: questions.map((q) => q.id),
        currentIndex: 0,
        answers: {},
        markedForReview: [],
        timePerQuestion: {},
        startedAt: new Date().toISOString(),
        status: 'in_progress',
      };
      saveExamSession(newSession, questions);
      initExam(newSession, questions);
    } catch {
      setError('ไม่สามารถโหลดคำถามได้');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && !showResume && state.session.status === 'completed' && state.session.examId === sessionKey) {
      clearExamSession();
      router.push('/dashboard/library');
    }
  }, [loading, showResume, state.session.status, state.session.examId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  if (showResume && pendingSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">ทำค้างอยู่</h2>
          <p className="text-gray-500 text-sm mb-1">{pendingSession.examTitle}</p>
          <p className="text-gray-500 text-sm mb-6">
            คุณทำถึงข้อที่{' '}
            <span className="font-semibold text-indigo-600">
              {pendingSession.currentIndex + 1}
            </span>{' '}
            จากทั้งหมด {pendingQuestions.length} ข้อ
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleResume}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition"
            >
              ทำต่อจากข้อที่ {pendingSession.currentIndex + 1}
            </button>
            <button
              onClick={handleStartFresh}
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

  return (
    <ExamContainer
      onComplete={() => {
        clearExamSession();
        router.push('/dashboard/library');
      }}
      mode="practice"
      backUrl="/dashboard/library"
    />
  );
}

export default function SubjectPracticePage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = use(params);
  return (
    <ExamProvider>
      <SubjectExamContent subjectId={subjectId} />
    </ExamProvider>
  );
}
