'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  Target,
  MinusCircle,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getMyAttempt, type ExamAttempt } from '@/lib/api/attempts';
import { getPublicExam, type Exam } from '@/lib/api/exams';
import {
  categoryDisplayNames,
  categoryIcons,
  type QuestionCategory,
} from '@/lib/api/questions';
import { formatTimeReadable } from '@/lib/exam-utils';
import LatexText from '@/components/latex/LatexText';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-green-50 border-green-200';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

export default function AttemptDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unanswered'>('all');

  useEffect(() => {
    params.then((p) => setAttemptId(p.attemptId));
  }, [params]);

  useEffect(() => {
    if (!attemptId) return;

    async function loadData() {
      try {
        const attemptData = await getMyAttempt(attemptId!);
        setAttempt(attemptData);

        // Try to load exam questions for review
        if (attemptData.examId) {
          try {
            const examData = await getPublicExam(attemptData.examId);
            setExam(examData);
          } catch {
            // Exam might be deleted or unpublished - that's OK
          }
        }
      } catch (err) {
        console.error('Failed to load attempt:', err);
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
        <button
          onClick={() => router.push('/dashboard/history')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          กลับหน้าประวัติ
        </button>
      </div>
    );
  }

  const score = Number(attempt.score);
  const questions = exam?.questions || [];
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Build question status list
  const questionStatuses = attempt.questionIds.map((qId) => {
    const question = questionMap.get(qId);
    const userAnswer = attempt.answers[qId];
    const timeSpent = attempt.timePerQuestion?.[qId] || 0;

    if (!question) {
      return { qId, question: null, userAnswer, timeSpent, status: 'unknown' as const };
    }

    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (!userAnswer) {
      return { qId, question, userAnswer, timeSpent, correctChoice, status: 'unanswered' as const };
    }
    if (correctChoice && userAnswer === correctChoice.id) {
      return { qId, question, userAnswer, timeSpent, correctChoice, status: 'correct' as const };
    }
    return { qId, question, userAnswer, timeSpent, correctChoice, status: 'incorrect' as const };
  });

  const filteredStatuses = filter === 'all'
    ? questionStatuses
    : questionStatuses.filter((s) => s.status === filter);

  return (
    <FadeIn>
      {/* Back link */}
      <Link
        href="/dashboard/history"
        className="inline-flex items-center text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        กลับหน้าประวัติ
      </Link>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <LatexText text={attempt.examTitle} />
        </h1>
        <p className="text-gray-500 mt-1">
          {categoryIcons[attempt.category as QuestionCategory]}{' '}
          {categoryDisplayNames[attempt.category as QuestionCategory] || attempt.category}
          {' · '}
          {new Date(attempt.createdAt).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* Score summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className={`rounded-lg border p-4 ${getScoreBg(score)}`}>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className={`w-5 h-5 ${getScoreColor(score)}`} />
            <span className="text-sm text-gray-600">คะแนน</span>
          </div>
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-indigo-600" />
            <span className="text-sm text-gray-600">ผลลัพธ์</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            <span className="text-green-600">{attempt.correctAnswers}</span>
            {' / '}
            {attempt.totalQuestions}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-600">เวลารวม</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {formatTimeReadable(attempt.totalTime)}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <MinusCircle className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">ไม่ตอบ</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {attempt.unanswered} ข้อ
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      {questions.length > 0 && (
        <>
          <div className="flex gap-2 mb-4">
            {[
              { key: 'all', label: `ทั้งหมด (${questionStatuses.length})` },
              { key: 'correct', label: `ถูก (${questionStatuses.filter((s) => s.status === 'correct').length})` },
              { key: 'incorrect', label: `ผิด (${questionStatuses.filter((s) => s.status === 'incorrect').length})` },
              { key: 'unanswered', label: `ไม่ตอบ (${questionStatuses.filter((s) => s.status === 'unanswered').length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`px-3 py-1.5 text-sm rounded-full transition ${
                  filter === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Questions review */}
          <div className="space-y-4">
            {filteredStatuses.map((item, idx) => {
              if (!item.question) return null;
              const globalIndex = attempt.questionIds.indexOf(item.qId) + 1;

              return (
                <div
                  key={item.qId}
                  className={`bg-white rounded-lg border p-5 ${
                    item.status === 'correct'
                      ? 'border-green-200'
                      : item.status === 'incorrect'
                      ? 'border-red-200'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">
                        ข้อ {globalIndex}
                      </span>
                      {item.status === 'correct' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {item.status === 'incorrect' && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      {item.status === 'unanswered' && (
                        <MinusCircle className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.timeSpent}s
                    </span>
                  </div>

                  {/* Question text */}
                  <div className="text-gray-900 mb-3">
                    <LatexText text={item.question.question} />
                  </div>

                  {/* Question image */}
                  {item.question.questionImage && (
                    <div className="mb-3">
                      <img
                        src={item.question.questionImage}
                        alt="question"
                        className="max-w-md rounded-lg"
                      />
                    </div>
                  )}

                  {/* Choices */}
                  <div className="space-y-2">
                    {item.question.choices.map((choice, cIdx) => {
                      const letter = String.fromCharCode(65 + cIdx);
                      const isUserAnswer = item.userAnswer === choice.id;
                      const isCorrectChoice = choice.isCorrect;

                      let choiceClass = 'border-gray-200 bg-gray-50';
                      if (isCorrectChoice) {
                        choiceClass = 'border-green-300 bg-green-50';
                      } else if (isUserAnswer && !isCorrectChoice) {
                        choiceClass = 'border-red-300 bg-red-50';
                      }

                      return (
                        <div
                          key={choice.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${choiceClass}`}
                        >
                          <span
                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                              isCorrectChoice
                                ? 'bg-green-500 text-white'
                                : isUserAnswer
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="text-sm text-gray-800 pt-0.5">
                            <LatexText text={choice.text} />
                          </span>
                          {isUserAnswer && (
                            <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                              คำตอบของคุณ
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {item.question.explanation && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 mb-1">คำอธิบาย</p>
                      <div className="text-sm text-blue-800">
                        <LatexText text={item.question.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* No questions available message */}
      {questions.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">ไม่สามารถโหลดข้อมูลคำถามเพื่อทบทวนได้</p>
          <p className="text-gray-400 text-sm mt-1">ข้อสอบอาจถูกลบหรือไม่ได้เผยแพร่แล้ว</p>
        </div>
      )}
    </FadeIn>
  );
}
