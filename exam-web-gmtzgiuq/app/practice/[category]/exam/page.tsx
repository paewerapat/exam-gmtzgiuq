'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ExamProvider, useExam } from '@/contexts/ExamContext';
import { ExamContainer } from '@/components/exam';
import { loadExamSession, saveExamSession } from '@/lib/exam-utils';
import type { QuestionCategory } from '@/lib/api/questions';

interface PageProps {
  params: Promise<{ category: string }>;
}

function ExamPageContent({ category }: { category: QuestionCategory }) {
  const router = useRouter();
  const { initExam, state, getResult, clearSession } = useExam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session on mount
  useEffect(() => {
    const { session, questions } = loadExamSession();

    if (!session || !questions) {
      setError('ไม่พบข้อมูลการทำข้อสอบ');
      setLoading(false);
      return;
    }

    if (session.category !== category) {
      setError('หมวดหมู่ไม่ตรงกัน');
      setLoading(false);
      return;
    }

    if (session.status === 'completed') {
      router.push(`/practice/${category}/results`);
      return;
    }

    initExam(session, questions);
    setLoading(false);
  }, [category, initExam, router]);

  const handleComplete = () => {
    const result = getResult();
    // Save final results
    const { session, questions } = loadExamSession();
    if (session && questions) {
      const completedSession = {
        ...session,
        ...state.session,
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
      };
      saveExamSession(completedSession, questions);
    }
    router.push(`/practice/${category}/results`);
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
  const [category, setCategory] = useState<QuestionCategory | null>(null);

  useEffect(() => {
    params.then((p) => {
      setCategory(p.category as QuestionCategory);
    });
  }, [params]);

  if (!category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <ExamProvider>
      <ExamPageContent category={category} />
    </ExamProvider>
  );
}
