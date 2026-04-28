'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, MinusCircle,
  Clock, Trophy, Target, BookOpen,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getMyAttempt, type ExamAttempt } from '@/lib/api/attempts';
import { getPublicExam, type Exam } from '@/lib/api/exams';
import { categoryDisplayNames, type QuestionCategory } from '@/lib/api/questions';
import { formatTimeReadable } from '@/lib/exam-utils';
import LatexText from '@/components/latex/LatexText';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

function getScoreColor(score: number) {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-500';
}

function getScoreBorderColor(score: number) {
  if (score >= 70) return 'border-green-400';
  if (score >= 50) return 'border-yellow-400';
  return 'border-red-400';
}

// ── Tab 1: Question result table ─────────────────────────────

type FilterType = 'all' | 'correct' | 'incorrect' | 'unanswered';

function QuestionReview({ attempt, exam }: { attempt: ExamAttempt; exam: Exam | null }) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!exam || !exam.questions?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
        <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500">ไม่สามารถโหลดข้อมูลคำถามได้</p>
        <p className="text-gray-400 text-sm mt-1">ข้อสอบอาจถูกลบหรือไม่ได้เผยแพร่แล้ว</p>
      </div>
    );
  }

  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));

  const questionStatuses = attempt.questionIds.map((qId) => {
    const question = questionMap.get(qId);
    const userAnswer = attempt.answers[qId];
    const timeSpent = attempt.timePerQuestion?.[qId] || 0;
    if (!question) return { qId, question: null, userAnswer, timeSpent, status: 'unknown' as const };
    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (!userAnswer) return { qId, question, userAnswer, timeSpent, correctChoice, status: 'unanswered' as const };
    if (correctChoice && userAnswer === correctChoice.id) return { qId, question, userAnswer, timeSpent, correctChoice, status: 'correct' as const };
    return { qId, question, userAnswer, timeSpent, correctChoice, status: 'incorrect' as const };
  });

  const counts = {
    correct: questionStatuses.filter((s) => s.status === 'correct').length,
    incorrect: questionStatuses.filter((s) => s.status === 'incorrect').length,
    unanswered: questionStatuses.filter((s) => s.status === 'unanswered').length,
  };

  const filtered = filter === 'all' ? questionStatuses : questionStatuses.filter((s) => s.status === filter);

  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: questionStatuses.length },
    { key: 'correct', label: 'ถูก', count: counts.correct },
    { key: 'incorrect', label: 'ผิด', count: counts.incorrect },
    { key: 'unanswered', label: 'ไม่ตอบ', count: counts.unanswered },
  ];

  function toggleExpand(qId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === t.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-center px-4 py-3 text-gray-500 font-medium w-14">ข้อที่</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">คำถาม</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Section</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">เฉลย</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">คำตอบผู้สอบ</th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((item) => {
                if (!item.question) return null;
                const globalIdx = attempt.questionIds.indexOf(item.qId) + 1;
                const userAnswerChoice = item.question.choices.find((c) => c.id === item.userAnswer);
                const correctChoice = item.correctChoice;
                const isExpanded = expandedIds.has(item.qId);
                const hasExplanation = !!item.question.explanation;

                const statusIcon =
                  item.status === 'correct' ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" /> :
                  item.status === 'incorrect' ? <XCircle className="w-4 h-4 text-red-400 mx-auto" /> :
                  <MinusCircle className="w-4 h-4 text-gray-300 mx-auto" />;

                const userAnswerColor =
                  item.status === 'correct' ? 'text-green-600 font-semibold' :
                  item.status === 'incorrect' ? 'text-red-500 font-semibold' :
                  'text-gray-400';

                return (
                  <>
                    <tr key={item.qId} className={isExpanded ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-gray-500">{globalIdx}</span>
                          {statusIcon}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs">
                        <p className="line-clamp-2 text-xs leading-relaxed">
                          <LatexText text={item.question.question} />
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {item.question.chapter ? (
                          <span className="inline-block text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                            {item.question.chapter}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-green-600 font-medium text-xs">
                        {correctChoice ? <LatexText text={correctChoice.text} /> : '-'}
                      </td>
                      <td className={`px-4 py-3 text-xs ${userAnswerColor}`}>
                        {userAnswerChoice ? <LatexText text={userAnswerChoice.text} /> : <span className="text-gray-300">ไม่ตอบ</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasExplanation && (
                          <button
                            onClick={() => toggleExpand(item.qId)}
                            className={`text-xs font-medium px-3 py-1 rounded-lg transition ${
                              isExpanded
                                ? 'bg-indigo-600 text-white'
                                : 'border border-indigo-300 text-indigo-600 hover:bg-indigo-50'
                            }`}
                          >
                            {isExpanded ? 'ปิด' : 'View'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${item.qId}-exp`} className="bg-indigo-50/40">
                        <td />
                        <td colSpan={5} className="px-4 pb-4 pt-1">
                          {item.question.questionImage && (
                            <img src={item.question.questionImage} alt="" className="max-w-xs rounded-lg mb-3" />
                          )}
                          <div className={`rounded-xl border p-3 text-sm ${
                            item.status === 'correct' ? 'bg-green-50 border-green-200' :
                            item.status === 'incorrect' ? 'bg-red-50 border-red-200' :
                            'bg-gray-50 border-gray-200'
                          }`}>
                            <p className={`text-xs font-bold mb-1.5 ${
                              item.status === 'correct' ? 'text-green-700' :
                              item.status === 'incorrect' ? 'text-red-600' : 'text-gray-600'
                            }`}>คำอธิบาย</p>
                            <div className="text-gray-700 leading-relaxed">
                              <LatexText text={item.question.explanation!} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Score by chapter ───────────────────────────────────

interface ChapterStats {
  name: string;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
}

function buildChapterStats(attempt: ExamAttempt, exam: Exam): ChapterStats[] {
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const chapterMap = new Map<string, ChapterStats>();

  attempt.questionIds.forEach((qId) => {
    const question = questionMap.get(qId);
    if (!question) return;
    const chapterKey = question.chapter || '(ไม่ระบุบท)';
    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, { name: chapterKey, total: 0, correct: 0, incorrect: 0, skipped: 0 });
    }
    const stat = chapterMap.get(chapterKey)!;
    stat.total++;
    const userAnswer = attempt.answers[qId];
    if (!userAnswer) { stat.skipped++; return; }
    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (correctChoice && userAnswer === correctChoice.id) stat.correct++;
    else stat.incorrect++;
  });

  return [...chapterMap.values()];
}

export function ScoreByChapterTable({ attempt, exam }: { attempt: ExamAttempt; exam: Exam | null }) {
  if (!exam || !exam.questions?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
        <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    );
  }

  const chapters = buildChapterStats(attempt, exam);
  const totalCorrect = chapters.reduce((s, c) => s + c.correct, 0);
  const totalIncorrect = chapters.reduce((s, c) => s + c.incorrect, 0);
  const totalSkipped = chapters.reduce((s, c) => s + c.skipped, 0);
  const totalAll = chapters.reduce((s, c) => s + c.total, 0);
  const totalPct = totalAll > 0 ? Math.round((totalCorrect / totalAll) * 100) : 0;

  const hasChapterData = chapters.some((c) => c.name !== '(ไม่ระบุบท)');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {!hasChapterData && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">ข้อสอบนี้ยังไม่มีการแท็กบท — แสดงภาพรวมทั้งชุด</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
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

function ScoreByChapter({ attempt, exam }: { attempt: ExamAttempt; exam: Exam | null }) {
  return <ScoreByChapterTable attempt={attempt} exam={exam} />;
}

// ── Page ──────────────────────────────────────────────────────

export default function AttemptDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'review' | 'chapter'>('review');

  useEffect(() => {
    params.then((p) => setAttemptId(p.attemptId));
  }, [params]);

  useEffect(() => {
    if (!attemptId) return;
    async function loadData() {
      try {
        const attemptData = await getMyAttempt(attemptId!);
        setAttempt(attemptData);
        if (attemptData.examId) {
          try {
            const examData = await getPublicExam(attemptData.examId);
            setExam(examData);
          } catch { /* exam might be deleted */ }
        }
      } catch {
        setError('ไม่พบข้อมูลการสอบ');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-4">{error || 'เกิดข้อผิดพลาด'}</p>
        <button onClick={() => router.push('/dashboard/history')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          กลับหน้าประวัติ
        </button>
      </div>
    );
  }

  const score = Math.round(Number(attempt.score));
  const catName = categoryDisplayNames[attempt.category as QuestionCategory] || attempt.category;

  return (
    <FadeIn>
      {/* Back */}
      <Link href="/dashboard/history" className="inline-flex items-center text-gray-400 hover:text-gray-600 text-sm mb-4 gap-1">
        <ArrowLeft className="w-4 h-4" /> กลับไปที่หน้าประวัติการสอบ
      </Link>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{attempt.examTitle}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full uppercase">
            {catName}
          </span>
          <span className="text-sm text-gray-400">
            {new Date(attempt.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Score */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}%</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Trophy className={`w-4 h-4 ${getScoreColor(score)}`} />
            <p className="text-xs text-gray-500">คะแนน (%)</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">สัดส่วนคำตอบที่ถูกต้อง</p>
        </div>

        {/* Correct/Total */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-3xl font-bold text-gray-900">{attempt.correctAnswers}/{attempt.totalQuestions}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Target className="w-4 h-4 text-indigo-500" />
            <p className="text-xs text-gray-500">คะแนนที่ทำได้</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">จำนวนข้อตอบถูกทั้งหมด</p>
        </div>

        {/* Time */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-3xl font-bold text-gray-900">{formatTimeReadable(attempt.totalTime)}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-gray-500">ระยะเวลา</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">ระยะเวลาที่ใช้จนเสร็จสิ้น</p>
        </div>

        {/* Unanswered */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-3xl font-bold text-gray-900">{attempt.unanswered}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <MinusCircle className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-500">ข้อที่ได้ตอบ</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">จำนวนคำถามที่ว่างไว้</p>
        </div>
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
          เฉลยข้อสอบ
        </button>
        <button
          onClick={() => setActiveTab('chapter')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition border ${
            activeTab === 'chapter'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          สัดส่วนคะแนนตามบท
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'review'
        ? <QuestionReview attempt={attempt} exam={exam} />
        : <ScoreByChapter attempt={attempt} exam={exam} />
      }
    </FadeIn>
  );
}
