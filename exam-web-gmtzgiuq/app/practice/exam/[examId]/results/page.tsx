'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, BarChart2, Loader2, CheckCircle, XCircle, MinusCircle, BookOpen } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { ResultsSummary, QuestionReview } from '@/components/exam';
import type { Question } from '@/lib/api/questions';
import {
  loadExamSession,
  clearExamSession,
  calculateExamResult,
} from '@/lib/exam-utils';
import type { ExamSession, ExamResult } from '@/types/exam';
import LatexText from '@/components/latex/LatexText';

interface PageProps {
  params: Promise<{ examId: string }>;
}

// ── Chapter score table ───────────────────────────────────────

function ChapterScoreSection({ session, questions }: { session: ExamSession; questions: Question[] }) {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const chapterMap = new Map<string, { total: number; correct: number; incorrect: number; skipped: number }>();

  session.questionIds.forEach((qId) => {
    const question = questionMap.get(qId);
    if (!question) return;
    const key = question.chapter || '(ไม่ระบุบท)';
    if (!chapterMap.has(key)) chapterMap.set(key, { total: 0, correct: 0, incorrect: 0, skipped: 0 });
    const stat = chapterMap.get(key)!;
    stat.total++;
    const userAnswer = session.answers[qId];
    if (!userAnswer) { stat.skipped++; return; }
    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (correctChoice && userAnswer === correctChoice.id) stat.correct++;
    else stat.incorrect++;
  });

  const chapters = [...chapterMap.entries()].map(([name, s]) => ({ name, ...s }));
  const totalCorrect = chapters.reduce((s, c) => s + c.correct, 0);
  const totalIncorrect = chapters.reduce((s, c) => s + c.incorrect, 0);
  const totalSkipped = chapters.reduce((s, c) => s + c.skipped, 0);
  const totalAll = chapters.reduce((s, c) => s + c.total, 0);
  const totalPct = totalAll > 0 ? Math.round((totalCorrect / totalAll) * 100) : 0;
  const hasChapterData = chapters.some((c) => c.name !== '(ไม่ระบุบท)');

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {!hasChapterData && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">ข้อสอบนี้ยังไม่มีการแท็กบท — แสดงภาพรวมทั้งชุด</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">ชื่อบท / Section</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">คะแนน %</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">ถูก</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">ผิด</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">ข้าม</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">ทั้งหมด</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((ch) => {
              const pct = ch.total > 0 ? Math.round((ch.correct / ch.total) * 100) : 0;
              const pctColor = pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500';
              return (
                <tr key={ch.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-800">{ch.name}</td>
                  <td className={`px-4 py-3 text-center font-bold ${pctColor}`}>{pct}%</td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">{ch.correct}</td>
                  <td className="px-4 py-3 text-center text-red-500 font-medium">{ch.incorrect}</td>
                  <td className="px-4 py-3 text-center text-gray-400">{ch.skipped}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{ch.total}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-indigo-600">
              <td className="px-5 py-3 font-bold text-white">รวมทั้งหมด</td>
              <td className="px-4 py-3 text-center font-bold text-white">{totalPct}%</td>
              <td className="px-4 py-3 text-center font-bold text-white">{totalCorrect}</td>
              <td className="px-4 py-3 text-center font-bold text-white">{totalIncorrect}</td>
              <td className="px-4 py-3 text-center font-bold text-white">{totalSkipped}</td>
              <td className="px-4 py-3 text-center font-bold text-white">{totalAll}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function ExamResultsPage({ params }: PageProps) {
  const router = useRouter();
  const [examId, setExamId] = useState<string | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'review' | 'chapter'>('review');
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'marked'>('all');

  useEffect(() => {
    params.then((p) => setExamId(p.examId));
  }, [params]);

  useEffect(() => {
    if (!examId) return;
    const { session: loadedSession, questions: loadedQuestions } = loadExamSession(true);
    if (!loadedSession || !loadedQuestions) { router.push('/dashboard/practice'); return; }
    if (loadedSession.examId !== examId) { router.push('/dashboard/practice'); return; }
    setSession(loadedSession);
    setQuestions(loadedQuestions);
    setResult(calculateExamResult(loadedSession, loadedQuestions));
    setLoading(false);
  }, [examId, router]);

  const handleRetry = () => {
    clearExamSession();
    router.push(examId ? `/practice/exam/${examId}` : '/dashboard/practice');
  };

  if (loading || !examId || !session || !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const examTitle = session.examTitle || 'ข้อสอบ';
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let reviewQuestionIds = session.questionIds;
  if (filter === 'incorrect') reviewQuestionIds = result.incorrectQuestionIds;
  else if (filter === 'marked') reviewQuestionIds = session.markedForReview;
  const displayedQuestionIds = showAll ? reviewQuestionIds : reviewQuestionIds.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <FadeIn>
          {/* Back link */}
          <Link href="/dashboard/practice" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้าเลือกข้อสอบ</span>
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              ผลการทำข้อสอบ: <LatexText text={examTitle} />
            </h1>
            <p className="text-gray-600">
              ทำเสร็จเมื่อ{' '}
              {session.completedAt ? new Date(session.completedAt).toLocaleString('th-TH') : '-'}
            </p>
          </div>

          {/* Results summary */}
          <ResultsSummary result={result} className="mb-6" />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button
              onClick={handleRetry}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <RefreshCw className="w-5 h-5" />
              <span>ทำข้อสอบใหม่</span>
            </button>
            <button
              onClick={() => setActiveTab('chapter')}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors font-medium"
            >
              <BarChart2 className="w-5 h-5" />
              <span>ดูคะแนนแยกบท</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setActiveTab('review')}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition border ${
                activeTab === 'review'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              ทบทวนคำตอบ
            </button>
            <button
              onClick={() => setActiveTab('chapter')}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition border ${
                activeTab === 'chapter'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              คะแนนแยกบท
            </button>
          </div>

          {/* Tab: Chapter score */}
          {activeTab === 'chapter' && (
            <ChapterScoreSection session={session} questions={questions} />
          )}

          {/* Tab: Question review */}
          {activeTab === 'review' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-lg font-semibold text-gray-900">ทบทวนคำตอบ</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    ทั้งหมด ({session.questionIds.length})
                  </button>
                  <button
                    onClick={() => setFilter('incorrect')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === 'incorrect' ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    ผิด ({result.incorrectQuestionIds.length})
                  </button>
                  {session.markedForReview.length > 0 && (
                    <button
                      onClick={() => setFilter('marked')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        filter === 'marked' ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
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
                  {displayedQuestionIds.map((qId) => {
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
          )}
        </FadeIn>
      </div>
    </div>
  );
}
