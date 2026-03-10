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

// ── Tab 1: Question review ────────────────────────────────────

type FilterType = 'all' | 'correct' | 'incorrect' | 'unanswered';

function QuestionReview({ attempt, exam }: { attempt: ExamAttempt; exam: Exam | null }) {
  const [filter, setFilter] = useState<FilterType>('all');

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

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
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

      {/* Question cards */}
      <div className="space-y-4">
        {filtered.map((item) => {
          if (!item.question) return null;
          const globalIdx = attempt.questionIds.indexOf(item.qId) + 1;
          const userAnswerChoice = item.question.choices.find((c) => c.id === item.userAnswer);
          const correctChoice = item.correctChoice;

          const cardBorder =
            item.status === 'correct' ? 'border-green-200 bg-green-50/30' :
            item.status === 'incorrect' ? 'border-red-200 bg-red-50/20' :
            'border-gray-200 bg-white';

          const expBg =
            item.status === 'correct' ? 'bg-green-50 border-green-200' :
            item.status === 'incorrect' ? 'bg-red-50 border-red-200' :
            'bg-gray-50 border-gray-200';

          return (
            <div key={item.qId} className={`rounded-2xl border p-5 ${cardBorder}`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {item.status === 'correct' && <CheckCircle className="w-5 h-5 text-green-500" />}
                  {item.status === 'incorrect' && <XCircle className="w-5 h-5 text-red-400" />}
                  {item.status === 'unanswered' && <MinusCircle className="w-5 h-5 text-gray-400" />}
                  <span className="text-sm font-semibold text-gray-700">ข้อ {globalIdx}</span>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{item.timeSpent}s
                </span>
              </div>

              {/* Question */}
              <div className="text-gray-900 mb-3 text-sm leading-relaxed">
                <LatexText text={item.question.question} />
              </div>
              {item.question.questionImage && (
                <img src={item.question.questionImage} alt="question" className="max-w-xs rounded-lg mb-3" />
              )}

              {/* Answers */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-28 flex-shrink-0">คำตอบของคุณ:</span>
                  <span className={item.status === 'correct' ? 'text-green-600 font-semibold' : item.status === 'incorrect' ? 'text-red-500 font-semibold' : 'text-gray-400'}>
                    {userAnswerChoice ? <LatexText text={userAnswerChoice.text} /> : '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-28 flex-shrink-0">คำตอบที่ถูกต้อง:</span>
                  <span className="text-green-600 font-semibold">
                    {correctChoice ? <LatexText text={correctChoice.text} /> : '-'}
                  </span>
                </div>
              </div>

              {/* Explanation */}
              {item.question.explanation && (
                <div className={`rounded-xl border p-3 ${expBg}`}>
                  <p className={`text-xs font-bold mb-1 ${item.status === 'correct' ? 'text-green-700' : item.status === 'incorrect' ? 'text-red-600' : 'text-gray-600'}`}>
                    คำอธิบาย
                  </p>
                  <div className="text-sm text-gray-700 leading-relaxed">
                    <LatexText text={item.question.explanation} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 2: Score by chapter ───────────────────────────────────

function ScoreByChapter({ attempt, exam }: { attempt: ExamAttempt; exam: Exam | null }) {
  if (!exam || !exam.questions?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
        <p className="text-gray-500">ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    );
  }

  // Compute overall stats (only data we have)
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  let correct = 0, incorrect = 0, skipped = 0;

  attempt.questionIds.forEach((qId) => {
    const question = questionMap.get(qId);
    const userAnswer = attempt.answers[qId];
    if (!question) return;
    if (!userAnswer) { skipped++; return; }
    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (correctChoice && userAnswer === correctChoice.id) correct++;
    else incorrect++;
  });

  const total = attempt.questionIds.length;
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-5 py-3 text-gray-500 font-medium">ชื่อบท</th>
            <th className="text-center px-4 py-3 text-gray-500 font-medium">คะแนน %</th>
            <th className="text-center px-4 py-3 text-gray-500 font-medium">ข้อที่ทำได้</th>
            <th className="text-center px-4 py-3 text-gray-500 font-medium">ข้อที่ผิด</th>
            <th className="text-center px-4 py-3 text-gray-500 font-medium">ข้อที่ข้าม</th>
          </tr>
        </thead>
        <tbody>
          {/* Overall row */}
          <tr className="bg-indigo-50 border-b border-indigo-100">
            <td className="px-5 py-3 font-bold text-indigo-700">{attempt.examTitle}</td>
            <td className="px-4 py-3 text-center font-bold text-indigo-700">{scorePct}%</td>
            <td className="px-4 py-3 text-center font-bold text-indigo-700">{correct}</td>
            <td className="px-4 py-3 text-center font-bold text-indigo-700">{incorrect}</td>
            <td className="px-4 py-3 text-center font-bold text-indigo-700">{skipped}</td>
          </tr>

          {/* Placeholder — per-question chapter info not available */}
          <tr>
            <td colSpan={5} className="px-5 py-8 text-center">
              <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">ยังไม่มีข้อมูลสัดส่วนตามบท</p>
              <p className="text-xs text-gray-300 mt-1">สามารถเปิดใช้งานได้เมื่อข้อสอบมีการแท็กบท/หัวข้อ</p>
            </td>
          </tr>

          {/* Total row */}
          <tr className="bg-indigo-600">
            <td className="px-5 py-3 font-bold text-white">รวมทั้งหมด</td>
            <td className="px-4 py-3 text-center font-bold text-white">{scorePct}%</td>
            <td className="px-4 py-3 text-center font-bold text-white">{correct}</td>
            <td className="px-4 py-3 text-center font-bold text-white">{incorrect}</td>
            <td className="px-4 py-3 text-center font-bold text-white">{skipped}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
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
