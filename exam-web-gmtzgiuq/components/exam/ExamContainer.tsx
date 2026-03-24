'use client';

import { useState } from 'react';
import Swal from 'sweetalert2';
import {
  Lightbulb,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  X,
  Play,
  ListFilter,
} from 'lucide-react';
import { useExam } from '@/contexts/ExamContext';
import { getCorrectChoiceId, saveExamSession, prettyMathAnswer } from '@/lib/exam-utils';
import ExamHeader from './ExamHeader';
import ChoiceButton from './ChoiceButton';
import LatexRenderer from '@/components/latex/LatexRenderer';
import LatexText from '@/components/latex/LatexText';

interface ExamContainerProps {
  onComplete: () => void | Promise<void>;
  mode?: 'practice' | 'exam';
  backUrl?: string;
}

export default function ExamContainer({ onComplete, mode = 'practice', backUrl }: ExamContainerProps) {
  const {
    state,
    currentQuestion,
    currentQuestionId,
    isLastQuestion,
    answeredCount,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    jumpToQuestion,
    toggleMarkReview,
    checkAnswer,
    pauseTimer,
    resumeTimer,
    showHint,
    hideHint,
    completeExam,
  } = useExam();

  const [isNavOpen, setIsNavOpen] = useState(false);
  const [groupAnswered, setGroupAnswered] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { session, currentTimer, isPaused, answerChecked, isCorrect } = state;
  const { showHint: isHintVisible } = state;

  if (!currentQuestion || !currentQuestionId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">กำลังโหลด...</div>
      </div>
    );
  }

  const totalQuestions = session.questionIds.length;
  const currentIndex = session.currentIndex;
  const userAnswer = session.answers[currentQuestionId];
  const isMarked = session.markedForReview.includes(currentQuestionId);
  const isShortAnswer = currentQuestion.type === 'short_answer';
  const hasAnswered = isShortAnswer ? userAnswer?.trim().length > 0 : !!userAnswer;
  const correctChoiceId = getCorrectChoiceId(currentQuestion);
  const isFirst = currentIndex === 0;

  const handleFinish = async () => {
    const unanswered = session.questionIds.filter((id) => !session.answers[id]).length;

    const result = await Swal.fire({
      title: 'ส่งข้อสอบ?',
      html: unanswered > 0
        ? `<p class="text-gray-600">คุณยังมี <strong class="text-red-500">${unanswered} ข้อ</strong> ที่ยังไม่ได้ตอบ<br/>ต้องการส่งข้อสอบหรือไม่?</p>`
        : `<p class="text-gray-600">ตอบครบทุกข้อแล้ว พร้อมส่งข้อสอบหรือไม่?</p>`,
      icon: unanswered > 0 ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'ส่งข้อสอบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      const { session: finalSession, questions } = completeExam();
      saveExamSession(finalSession, questions);
      await onComplete();
    }
  };

  const handleNext = () => {
    if (isLastQuestion) {
      handleFinish();
    } else {
      nextQuestion();
    }
  };

  const { questionIds, answers, markedForReview } = session;

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col">
      {/* Sticky top header */}
      <ExamHeader
        timer={currentTimer}
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        onPause={mode === 'practice' ? pauseTimer : undefined}
        backUrl={backUrl ?? (mode === 'exam' ? '/dashboard/exam' : '/dashboard/practice')}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto pb-20">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Main card */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

            {/* Card top: question number badge (left) + action icons (right) */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div className="w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                {currentIndex + 1}
              </div>
              <div className="flex items-center gap-1">
                {/* Lightbulb: only in practice mode */}
                {mode === 'practice' && currentQuestion.hint && (
                  <button
                    type="button"
                    onClick={isHintVisible ? hideHint : showHint}
                    title="คำใบ้"
                    className="p-2 rounded-xl transition hover:bg-gray-100"
                  >
                    <Lightbulb
                      className={`w-5 h-5 transition-colors ${
                        isHintVisible ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                      fill={isHintVisible ? 'currentColor' : 'none'}
                    />
                  </button>
                )}
                {/* Bookmark */}
                <button
                  type="button"
                  onClick={() => toggleMarkReview(currentQuestionId)}
                  title="ทำเครื่องหมาย"
                  className="p-2 rounded-xl transition hover:bg-gray-100"
                >
                  <Bookmark
                    className={`w-5 h-5 transition-colors ${
                      isMarked ? 'text-orange-500' : 'text-gray-300'
                    }`}
                    fill={isMarked ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-col lg:flex-row lg:divide-x divide-gray-100 min-h-[320px]">

              {/* ── LEFT: question text + hint + result ── */}
              <div className="flex-1 px-6 pb-6">
                {/* Question text */}
                <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
                  <LatexRenderer content={currentQuestion.question} />
                </div>

                {/* Question image */}
                {currentQuestion.questionImage && !imageError && (
                  <div className="mt-4">
                    <img
                      src={currentQuestion.questionImage}
                      alt="Question image"
                      className="max-w-full h-auto rounded-xl border border-gray-200"
                      onError={() => setImageError(true)}
                    />
                  </div>
                )}

                {/* Hint box — practice mode only */}
                {mode === 'practice' && isHintVisible && currentQuestion.hint && (
                  <div className="mt-5 px-4 py-4 bg-amber-50 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lightbulb
                        className="w-4 h-4 text-yellow-400 flex-shrink-0"
                        fill="currentColor"
                      />
                      <span className="text-sm font-semibold text-gray-800">คำใบ้</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      <LatexText text={currentQuestion.hint} />
                    </p>
                  </div>
                )}

                {/* Result box — practice mode only */}
                {mode === 'practice' && answerChecked && (
                  <div
                    className={`mt-5 p-4 rounded-2xl border ${
                      isCorrect
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCorrect ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      >
                        {isCorrect ? (
                          <Check className="w-4 h-4 text-white" strokeWidth={3} />
                        ) : (
                          <X className="w-4 h-4 text-white" strokeWidth={3} />
                        )}
                      </div>
                      <span
                        className={`font-bold text-base ${
                          isCorrect ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {isCorrect ? 'คำตอบถูกต้อง !' : 'คำตอบไม่ถูกต้อง !'}
                      </span>
                    </div>
                    {currentQuestion.explanation && (
                      <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none">
                        <LatexRenderer content={currentQuestion.explanation} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── RIGHT: choices / short-answer input + check button ── */}
              <div className="flex-1 px-6 pb-6 lg:pt-0 pt-4 border-t lg:border-t-0 border-gray-100">
                {isShortAnswer ? (
                  /* Short-answer text input */
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      พิมพ์คำตอบ
                    </label>
                    <input
                      type="text"
                      value={userAnswer ?? ''}
                      onChange={(e) => selectAnswer(currentQuestionId, e.target.value)}
                      disabled={answerChecked}
                      placeholder="พิมพ์คำตอบที่นี่..."
                      className={`w-full px-4 py-3 border-2 rounded-xl text-base font-medium focus:outline-none transition ${
                        answerChecked
                          ? isCorrect
                            ? 'border-green-400 bg-green-50 text-green-800'
                            : 'border-red-400 bg-red-50 text-red-800'
                          : 'border-gray-200 focus:border-indigo-400 bg-white'
                      }`}
                    />
                    {/* Show how the system reads the user's current input */}
                    {!answerChecked && userAnswer?.trim() && (
                      <p className="mt-1.5 text-xs text-gray-400">
                        ระบบอ่านเป็น:{' '}
                        <code className="font-mono bg-gray-100 px-1 rounded">
                          {prettyMathAnswer(userAnswer)}
                        </code>
                      </p>
                    )}
                    {answerChecked && !isCorrect && currentQuestion.correctAnswer && (
                      <p className="mt-2 text-sm text-gray-500">
                        คำตอบที่ถูกต้อง:{' '}
                        <span className="font-semibold text-gray-800">{currentQuestion.correctAnswer}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  /* Multiple-choice buttons */
                  <div className="space-y-2.5 mb-5">
                    {(currentQuestion.choices ?? []).map((choice, index) => (
                      <ChoiceButton
                        key={choice.id}
                        index={index}
                        text={choice.text}
                        isSelected={userAnswer === choice.id}
                        isCorrect={answerChecked ? choice.id === correctChoiceId : null}
                        showResult={answerChecked}
                        disabled={answerChecked}
                        onClick={() => selectAnswer(currentQuestionId, choice.id)}
                      />
                    ))}
                  </div>
                )}

                {/* ตรวจคำตอบ button — practice mode only */}
                {mode === 'practice' && (
                  <button
                    type="button"
                    onClick={checkAnswer}
                    disabled={!hasAnswered || answerChecked}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all border-2 ${
                      answerChecked
                        ? 'bg-green-500 border-green-500 text-white opacity-50 cursor-not-allowed'
                        : hasAnswered
                        ? 'bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600'
                        : 'bg-white border-green-500 text-green-600 cursor-not-allowed'
                    }`}
                  >
                    ตรวจคำตอบ
                  </button>
                )}
              </div>
            </div>

            {/* Bottom prev / next */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={prevQuestion}
                disabled={isFirst}
                className={`flex items-center gap-1.5 text-sm font-medium transition ${
                  isFirst
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                ข้อก่อนหน้า
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition"
              >
                {isLastQuestion ? 'ส่งข้อสอบ' : 'ข้อถัดไป'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Question Bank panel — floating card above bottom bar */}
      {isNavOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center pb-[64px] px-3"
          onClick={() => setIsNavOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
            style={{ maxHeight: '60vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="font-bold text-gray-800 text-sm">Question Bank</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newVal = !groupAnswered;
                    setGroupAnswered(newVal);
                    if (newVal) {
                      // Jump to first unanswered
                      const firstUnanswered = questionIds.findIndex((id) => !answers[id]);
                      if (firstUnanswered !== -1) jumpToQuestion(firstUnanswered);
                    }
                  }}
                  title="Group answered questions at the start and jump to first unanswered"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    groupAnswered
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Group Answered
                </button>
                <button
                  type="button"
                  onClick={() => setIsNavOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1.5 border-b border-gray-50 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-md bg-green-100 border-2 border-green-400 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
                </span>
                ถูกต้อง
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-md bg-red-100 border-2 border-red-400 flex items-center justify-center flex-shrink-0">
                  <X className="w-3 h-3 text-red-600" strokeWidth={3} />
                </span>
                ผิด
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-md bg-orange-100 border-2 border-orange-400 flex items-center justify-center flex-shrink-0">
                  <Bookmark className="w-3 h-3 text-orange-500" fill="currentColor" />
                </span>
                ทำเครื่องหมาย
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-md bg-gray-100 border border-gray-300 flex-shrink-0" />
                ยังไม่ตอบ
              </span>
            </div>

            {/* Grid */}
            <div className="overflow-y-auto flex-1 px-3 py-3">
              {(() => {
                const checkedAnswers = session.checkedAnswers ?? {};
                // Build list: optionally group answered first
                const indexed = questionIds.map((qId, idx) => ({ qId, idx }));
                const displayList = groupAnswered
                  ? [
                      ...indexed.filter(({ qId }) => !!answers[qId]),
                      ...indexed.filter(({ qId }) => !answers[qId]),
                    ]
                  : indexed;

                return (
                  <div className="grid grid-cols-6 gap-1.5">
                    {displayList.map(({ qId, idx }) => {
                      const isAnswered = !!answers[qId];
                      const isMk = markedForReview.includes(qId);
                      const isCurrent = idx === currentIndex;
                      const checkedResult = checkedAnswers[qId]; // true/false/undefined

                      let cls =
                        'bg-gray-100 text-gray-500 hover:bg-gray-200'; // unanswered
                      if (isAnswered && checkedResult === undefined)
                        cls = 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'; // answered, not yet checked
                      if (checkedResult === true)
                        cls = 'bg-green-100 text-green-700 border-2 border-green-400 hover:bg-green-200'; // correct
                      if (checkedResult === false)
                        cls = 'bg-red-100 text-red-700 border-2 border-red-400 hover:bg-red-200'; // incorrect
                      if (isMk)
                        cls = 'bg-orange-100 text-orange-600 border-2 border-orange-400 hover:bg-orange-200'; // marked
                      if (isCurrent)
                        cls = 'bg-white text-gray-900 border-2 border-gray-900 font-bold shadow-sm'; // current

                      return (
                        <button
                          key={qId}
                          type="button"
                          onClick={() => {
                            jumpToQuestion(idx);
                            setIsNavOpen(false);
                          }}
                          className={`aspect-square flex items-center justify-center rounded-xl text-xs transition ${cls}`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-4 py-3 flex items-center justify-between">
        {/* Spacer to balance submit button */}
        <div className="w-24" />
        {/* Centered pill trigger */}
        <button
          type="button"
          onClick={() => setIsNavOpen(!isNavOpen)}
          className="flex items-center gap-2 bg-white shadow-lg border border-gray-200 rounded-full px-5 py-2 text-sm font-semibold text-gray-700 transition hover:shadow-xl"
        >
          <span>{currentIndex + 1} of {totalQuestions}</span>
          <ChevronUp
            className={`w-4 h-4 transition-transform ${isNavOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {/* Submit */}
        <button
          type="button"
          onClick={handleFinish}
          className="w-24 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-full transition shadow-md"
        >
          ส่งข้อสอบ
        </button>
      </div>

      {/* Pause overlay — practice mode only */}
      {mode === 'practice' && isPaused && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">ข้อสอบหยุดชั่วคราว</h2>
            <p className="text-gray-500 text-sm mb-6">กดปุ่มด้านล่างเพื่อกลับมาทำต่อ</p>
            <button
              onClick={resumeTimer}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              กลับมาทำต่อ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
