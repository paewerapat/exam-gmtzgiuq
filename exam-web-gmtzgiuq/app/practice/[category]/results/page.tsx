'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Home, Loader2 } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { ResultsSummary, QuestionReview } from '@/components/exam';
import {
  categoryDisplayNames,
  type QuestionCategory,
  type Question,
} from '@/lib/api/questions';
import {
  loadExamSession,
  clearExamSession,
  calculateExamResult,
} from '@/lib/exam-utils';
import type { ExamSession, ExamResult } from '@/types/exam';

interface PageProps {
  params: Promise<{ category: string }>;
}

export default function ResultsPage({ params }: PageProps) {
  const router = useRouter();
  const [category, setCategory] = useState<QuestionCategory | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'marked'>('all');

  // Load params
  useEffect(() => {
    params.then((p) => {
      setCategory(p.category as QuestionCategory);
    });
  }, [params]);

  // Load session results
  useEffect(() => {
    if (!category) return;

    const { session: loadedSession, questions: loadedQuestions } = loadExamSession();

    if (!loadedSession || !loadedQuestions) {
      router.push('/dashboard/practice');
      return;
    }

    if (loadedSession.category !== category) {
      router.push('/dashboard/practice');
      return;
    }

    setSession(loadedSession);
    setQuestions(loadedQuestions);
    setResult(calculateExamResult(loadedSession, loadedQuestions));
    setLoading(false);
  }, [category, router]);

  const handleRetry = () => {
    clearExamSession();
    router.push('/dashboard/practice');
  };

  if (loading || !category || !session || !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const categoryName = categoryDisplayNames[category] || category;

  // Create question map for easy lookup
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Filter questions for review
  let reviewQuestionIds = session.questionIds;
  if (filter === 'incorrect') {
    reviewQuestionIds = result.incorrectQuestionIds;
  } else if (filter === 'marked') {
    reviewQuestionIds = session.markedForReview;
  }

  const displayedQuestionIds = showAll ? reviewQuestionIds : reviewQuestionIds.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <FadeIn>
          {/* Back link */}
          <Link
            href="/dashboard/practice"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้าเลือกหมวดหมู่</span>
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              ผลการทำข้อสอบ {categoryName}
            </h1>
            <p className="text-gray-600">
              ทำเสร็จเมื่อ{' '}
              {session.completedAt
                ? new Date(session.completedAt).toLocaleString('th-TH')
                : '-'}
            </p>
          </div>

          {/* Results summary */}
          <ResultsSummary result={result} className="mb-8" />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <button
              onClick={handleRetry}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <RefreshCw className="w-5 h-5" />
              <span>ทำข้อสอบใหม่</span>
            </button>
            <Link
              href="/dashboard/practice"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <Home className="w-5 h-5" />
              <span>กลับหน้าหลัก</span>
            </Link>
          </div>

          {/* Question review section */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-900">ทบทวนคำตอบ</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ทั้งหมด ({session.questionIds.length})
                </button>
                <button
                  onClick={() => setFilter('incorrect')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'incorrect'
                      ? 'bg-red-100 text-red-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ผิด ({result.incorrectQuestionIds.length})
                </button>
                {session.markedForReview.length > 0 && (
                  <button
                    onClick={() => setFilter('marked')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === 'marked'
                        ? 'bg-orange-100 text-orange-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    ทำเครื่องหมาย ({session.markedForReview.length})
                  </button>
                )}
              </div>
            </div>

            {reviewQuestionIds.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {filter === 'incorrect' && 'ยินดีด้วย! คุณตอบถูกทุกข้อ'}
                {filter === 'marked' && 'ไม่มีข้อที่ทำเครื่องหมายไว้'}
              </div>
            ) : (
              <div className="space-y-3">
                {displayedQuestionIds.map((qId, index) => {
                  const question = questionMap.get(qId);
                  if (!question) return null;

                  const originalIndex = session.questionIds.indexOf(qId);
                  return (
                    <QuestionReview
                      key={qId}
                      question={question}
                      userAnswer={session.answers[qId]}
                      questionNumber={originalIndex + 1}
                    />
                  );
                })}

                {reviewQuestionIds.length > 5 && !showAll && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="w-full py-3 text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    แสดงทั้งหมด ({reviewQuestionIds.length} ข้อ)
                  </button>
                )}
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
