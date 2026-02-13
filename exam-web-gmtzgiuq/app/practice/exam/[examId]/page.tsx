'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { ExamContainer } from '@/components/exam';
import {
  loadExamSession,
  saveExamSession,
  generateSessionId,
  calculateExamResult,
} from '@/lib/exam-utils';
import { getPublicExam } from '@/lib/api/exams';
import { submitAttempt } from '@/lib/api/attempts';
import type { ExamSession } from '@/types/exam';
import type { QuestionCategory } from '@/lib/api/questions';

interface PageProps {
  params: Promise<{ examId: string }>;
}

function ExamPageContent({ examId }: { examId: string }) {
  const router = useRouter();
  const { initExam, state, getResult } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrCreateSession() {
      // Try to load existing session first
      const { session: existingSession, questions: existingQuestions } = loadExamSession();

      if (existingSession && existingQuestions && existingSession.examId === examId) {
        if (existingSession.status === 'completed') {
          router.push(`/practice/exam/${examId}/results`);
          return;
        }
        initExam(existingSession, existingQuestions);
        setLoading(false);
        return;
      }

      // No existing session - fetch exam from API and create new session
      try {
        const exam = await getPublicExam(examId);

        if (!exam.questions || exam.questions.length === 0) {
          setError('ชุดข้อสอบนี้ยังไม่มีคำถาม');
          setLoading(false);
          return;
        }

        const questionIds = exam.questions.map((q) => q.id);

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
          startedAt: new Date().toISOString(),
          status: 'in_progress',
        };

        saveExamSession(session, exam.questions);
        initExam(session, exam.questions);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load exam:', err);
        setError('ไม่สามารถโหลดข้อสอบได้');
        setLoading(false);
      }
    }

    loadOrCreateSession();
  }, [examId, initExam, router]);

  const handleComplete = () => {
    // ExamContainer.handleFinish already called completeExam() + saveExamSession()
    // Submit attempt to backend (non-blocking)
    const { session: savedSession, questions: savedQuestions } = loadExamSession(true);
    if (savedSession && savedQuestions) {
      const result = calculateExamResult(savedSession, savedQuestions);
      submitAttempt({
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
      }).catch((err) => console.error('Failed to submit attempt:', err));
    }
    router.push(`/practice/exam/${examId}/results`);
  };

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
