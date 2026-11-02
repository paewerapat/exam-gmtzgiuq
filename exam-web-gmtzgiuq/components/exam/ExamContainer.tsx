'use client';

import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import Swal from 'sweetalert2';
import {
  Lightbulb,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  X,
  ListFilter,
  ListChecks,
} from 'lucide-react';
import { useExam } from '@/contexts/ExamContext';
import {
  getCorrectChoiceIds,
  isMultiAnswer,
  parseChoiceAnswer,
  formatChoiceLetters,
  saveExamSession,
  prettyMathAnswer,
} from '@/lib/exam-utils';
import { fetchClockOffset } from '@/lib/api/serverTime';
import ExamHeader from './ExamHeader';
import ChoiceButton from './ChoiceButton';
import QuestionImages from './QuestionImages';
import PassagePanel, { createPassageMemory } from './PassagePanel';
import { getQuestionImages } from '@/lib/question-images';
import { getQuestionPassage } from '@/lib/exam-passages';
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
    toggleChoice,
    nextQuestion,
    prevQuestion,
    jumpToQuestion,
    toggleMarkReview,
    checkAnswer,
    showHint,
    hideHint,
    completeExam,
    pauseTimer,
    resumeTimer,
  } = useExam();

  const [isNavOpen, setIsNavOpen] = useState(false);
  const [groupAnswered, setGroupAnswered] = useState(false);
  // ตำแหน่ง scroll / สถานะพับของบทอ่านแต่ละชุด (ต้องอยู่ก่อน early return — BUG-11)
  const [passageMemory] = useState(createPassageMemory);
  // บทอ่านร่วมของข้อนี้ (null = layout เดิมทุกอย่าง) — คำนวณก่อน early return เพราะ effect ด้านล่างใช้
  const passage = getQuestionPassage(currentQuestion);
  const hasPassage = passage !== null;
  // layout บทอ่าน (lg) สูง = จอ − ระยะจากบนสุดของหน้าถึงกล่องนี้ (Navbar ของ root layout อยู่ด้านบน)
  // วัดจริงแทนการเดาความสูง header แล้วทั้งสองคอลัมน์เลื่อนในตัวเอง หน้าไม่ต้องเลื่อน
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootTop, setRootTop] = useState(0);
  useLayoutEffect(() => {
    if (!hasPassage) return;
    const measure = () => {
      const el = rootRef.current;
      if (el) setRootTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hasPassage]);

  const { session, currentTimer, answerChecked, isCorrect, isPaused } = state;
  const { showHint: isHintVisible } = state;

  if (!currentQuestion || !currentQuestionId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
      </div>
    );
  }

  const totalQuestions = session.questionIds.length;
  const currentIndex = session.currentIndex;
  const userAnswer = session.answers[currentQuestionId];
  const isMarked = session.markedForReview.includes(currentQuestionId);
  const isShortAnswer = currentQuestion.type === 'short_answer';
  const isMulti = isMultiAnswer(currentQuestion);
  const selectedChoiceIds = isShortAnswer ? [] : parseChoiceAnswer(userAnswer);
  const correctChoiceIds = getCorrectChoiceIds(currentQuestion);
  const hasAnswered = isShortAnswer ? userAnswer?.trim().length > 0 : selectedChoiceIds.length > 0;
  const isFirst = currentIndex === 0;

  const handleFinish = async () => {
    const unanswered = session.questionIds.filter((id) => !session.answers[id]).length;

    const result = await Swal.fire({
      title: 'ส่งข้อสอบ?',
      html: unanswered > 0
        ? `<p class="text-gray-600 dark:text-gray-400">คุณยังมี <strong class="text-red-500">${unanswered} ข้อ</strong> ที่ยังไม่ได้ตอบ<br/>ต้องการส่งข้อสอบหรือไม่?</p>`
        : `<p class="text-gray-600 dark:text-gray-400">ตอบครบทุกข้อแล้ว พร้อมส่งข้อสอบหรือไม่?</p>`,
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

  // ปุ่มตรวจคำตอบ (practice)
  const checkButton = (
    <button
      type="button"
      onClick={checkAnswer}
      disabled={!hasAnswered || answerChecked}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all border-2 ${
        answerChecked
          ? 'bg-green-500 border-green-500 text-white opacity-50 cursor-not-allowed'
          : hasAnswered
          ? 'bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600'
          : 'bg-white dark:bg-gray-800 border-green-500 text-green-600 dark:text-green-400 cursor-not-allowed'
      }`}
    >
      ตรวจคำตอบ
    </button>
  );

  const handleNext = () => {
    if (isLastQuestion) {
      handleFinish();
    } else {
      nextQuestion();
    }
  };

  const { questionIds, answers, markedForReview } = session;

  // Remaining seconds for countdown (if session.durationSeconds provided)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  // serverNow - clientNow (ms), refreshed periodically to correct for client clock drift
  const [clockOffset, setClockOffset] = useState(0);

  // Periodically re-sync with the server clock so a wrong/drifting client clock
  // doesn't let the user run over (or get cut off early on) the exam duration
  useEffect(() => {
    if (!session?.durationSeconds) return;

    let cancelled = false;
    const sync = () => {
      fetchClockOffset()
        .then((offset) => {
          if (!cancelled) setClockOffset(offset);
        })
        .catch(() => {
          // keep using the last known offset on failure
        });
    };

    sync();
    const id = setInterval(sync, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session?.durationSeconds]);

  // Setup countdown when session has a duration
  useEffect(() => {
    if (!session || !session.startedAt || !session.durationSeconds) {
      setRemainingSeconds(null);
      return;
    }

    const startMs = new Date(session.startedAt).getTime();
    const endMs = startMs + (session.durationSeconds || 0) * 1000;

    function tick() {
      // When paused, freeze the display — don't advance or auto-submit
      if (isPaused) return;
      const serverApproxNow = Date.now() + clockOffset;
      const totalPausedMs = session.totalPausedMs ?? 0;
      const rem = Math.max(0, Math.ceil((endMs + totalPausedMs - serverApproxNow) / 1000));
      setRemainingSeconds(rem);
      if (rem <= 0) {
        // Time is up — submit/complete the exam
        onComplete();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, onComplete, clockOffset, isPaused]);

  return (
    <div
      ref={rootRef}
      style={passage ? ({ '--exam-top': `${rootTop}px` } as CSSProperties) : undefined}
      className={`min-h-screen bg-[#F5F6FA] dark:bg-gray-900 flex flex-col${
        // มีบทอ่าน (lg): สูงพอดีจอ ไม่เลื่อนทั้งหน้า — บทอ่านกับฝั่งโจทย์เลื่อนในคอลัมน์ของตัวเอง
        passage ? ' lg:h-[calc(100dvh-var(--exam-top,0px))] lg:min-h-0 lg:overflow-hidden' : ''
      }`}
    >
      {/* Sticky top header */}
      <ExamHeader
        timer={remainingSeconds ?? currentTimer}
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        backUrl={backUrl ?? (mode === 'exam' ? '/dashboard/exam' : '/dashboard/practice')}
        hasDuration={!!session.durationSeconds}
        isPaused={isPaused}
        onPause={pauseTimer}
        onResume={resumeTimer}
      />

      {/* Scrollable content */}
      {/* มีบทอ่าน (lg): กล่องนี้กินที่เหลือระหว่าง header กับแถบล่าง (pb = ความสูงแถบล่าง + ช่องว่าง) */}
      <div className={passage ? 'flex-1 pb-20 lg:min-h-0 lg:pb-[4.5rem]' : 'flex-1 overflow-auto pb-20'}>
        <div
          className={
            passage
              ? 'max-w-7xl w-full mx-auto px-4 pt-6 pb-6 lg:pb-0 lg:h-full lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-6'
              : 'max-w-5xl mx-auto px-4 py-6'
          }
        >
          {/* บทอ่าน: ซ้าย (lg) / เหนือโจทย์ (จอแคบ) — key ตาม id ให้ข้อในกลุ่มเดียวกันใช้กล่องเดิม ไม่ remount */}
          {passage && (
            <PassagePanel
              key={passage.id}
              passage={passage}
              memory={passageMemory}
              mode={mode}
              className="mb-4 lg:mb-0 min-w-0 lg:h-full"
            />
          )}

          {/* Main card */}
          <div
            className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden${
              passage ? ' min-w-0 lg:h-full lg:flex lg:flex-col' : ''
            }`}
          >

            {/* Card top: question number badge (left) + action icons (right) */}
            <div className={`flex items-center justify-between px-6 pt-5 pb-4${passage ? ' flex-shrink-0' : ''}`}>
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
                    className="p-3 rounded-xl transition hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Lightbulb
                      className={`w-6 h-6 transition-colors ${
                        isHintVisible ? 'text-yellow-400' : 'text-gray-400 dark:text-gray-500'
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
                  className="p-3 rounded-xl transition hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Bookmark
                    className={`w-6 h-6 transition-colors ${
                      isMarked ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'
                    }`}
                    fill={isMarked ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
            </div>

            {/* Two-column layout */}
            {/* มีบทอ่าน: ฝั่งขวาแคบลง → โจทย์กับตัวเลือกเรียงลงมา และ (lg) เลื่อนในตัวเองถ้ายาว
                ให้หัวการ์ดกับปุ่มก่อนหน้า/ถัดไปอยู่ในจอเสมอ — key ตามข้อ ให้เปลี่ยนข้อแล้วกลับไปบนสุด */}
            <div
              key={passage ? currentQuestionId : undefined}
              data-testid={passage ? 'question-scroll' : undefined}
              className={
                passage
                  ? 'relative flex flex-col min-h-[320px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto'
                  : 'flex flex-col lg:flex-row lg:divide-x divide-gray-100 min-h-[320px]'
              }
            >

              {/* ── LEFT: question text + hint + result ── */}
              <div className="flex-1 px-6 pb-6">
                {/* Question text */}
                <div className="prose prose-sm max-w-none text-gray-800 dark:text-gray-200 leading-relaxed">
                  <LatexRenderer content={currentQuestion.question} />
                </div>

                {/* Question images (ทุกรูปเรียงลงมา; key ตามข้อ ให้สถานะโหลดรูปไม่ได้รีเซ็ตเมื่อเปลี่ยนข้อ) */}
                <QuestionImages
                  key={currentQuestionId}
                  images={getQuestionImages(currentQuestion)}
                  className="mt-4"
                />


                {/* Hint box — practice mode only */}
                {mode === 'practice' && isHintVisible && currentQuestion.hint && (
                  <div className="mt-5 px-4 py-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lightbulb
                        className="w-4 h-4 text-yellow-400 flex-shrink-0"
                        fill="currentColor"
                      />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">คำใบ้</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      <LatexText text={currentQuestion.hint} />
                    </p>
                  </div>
                )}

                {/* Result box — practice mode only */}
                {mode === 'practice' && answerChecked && (
                  <div
                    className={`mt-5 p-4 rounded-2xl border ${
                      isCorrect
                        ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800/50'
                        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/50'
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
                          isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                        }`}
                      >
                        {isCorrect ? 'คำตอบถูกต้อง !' : 'คำตอบไม่ถูกต้อง !'}
                      </span>
                    </div>
                    {isMulti && !isCorrect && (
                      <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                        ต้องเลือกให้ครบทุกข้อที่ถูก — คำตอบที่ถูก:{' '}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {formatChoiceLetters(currentQuestion, correctChoiceIds)}
                        </span>
                      </p>
                    )}
                    {currentQuestion.explanation && (
                      <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm max-w-none">
                        <LatexRenderer content={currentQuestion.explanation} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── RIGHT: choices / short-answer input + check button ── */}
              <div
                className={
                  passage
                    ? 'flex-1 px-6 pb-6 pt-4 border-t border-gray-100 dark:border-gray-800'
                    : 'flex-1 px-6 pb-6 lg:pt-0 pt-4 border-t lg:border-t-0 border-gray-100 dark:border-gray-800'
                }
              >
                {isShortAnswer ? (
                  /* Short-answer text input */
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
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
                            ? 'border-green-400 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                          : 'border-gray-200 dark:border-gray-700 focus:border-indigo-400 bg-white dark:bg-gray-800'
                      }`}
                    />
                    {/* Show how the system reads the user's current input */}
                    {!answerChecked && userAnswer?.trim() && (
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                        ระบบอ่านเป็น:{' '}
                        <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                          {prettyMathAnswer(userAnswer)}
                        </code>
                      </p>
                    )}
                    {answerChecked && !isCorrect && currentQuestion.correctAnswer && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        คำตอบที่ถูกต้อง:{' '}
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{currentQuestion.correctAnswer}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  /* Multiple-choice buttons */
                  <div className="mb-5">
                    {isMulti && (
                      <div
                        id={`multi-hint-${currentQuestionId}`}
                        className={`inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-semibold ${
                          mode === 'exam'
                            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                            : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                        เลือกได้มากกว่า 1 ข้อ
                      </div>
                    )}
                    <div
                      className="space-y-2.5"
                      {...(isMulti
                        ? { role: 'group', 'aria-describedby': `multi-hint-${currentQuestionId}` }
                        : {})}
                    >
                      {(currentQuestion.choices ?? []).map((choice, index) => (
                        <ChoiceButton
                          key={choice.id}
                          index={index}
                          text={choice.text}
                          image={choice.image}
                          multi={isMulti}
                          isSelected={selectedChoiceIds.includes(choice.id)}
                          isCorrect={answerChecked ? correctChoiceIds.includes(choice.id) : null}
                          showResult={answerChecked}
                          disabled={answerChecked}
                          onClick={() =>
                            isMulti
                              ? toggleChoice(currentQuestionId, choice.id)
                              : selectAnswer(currentQuestionId, choice.id)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* ตรวจคำตอบ button — practice mode only (มีบทอ่าน: ย้ายไปแถวปุ่มก่อนหน้า/ถัดไป ให้อยู่ในจอเสมอ) */}
                {mode === 'practice' && !passage && checkButton}
              </div>
            </div>

            {/* Bottom prev / next */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800${
                passage ? ' flex-shrink-0' : ''
              }`}
            >
              <button
                type="button"
                onClick={prevQuestion}
                disabled={isFirst}
                className={`flex items-center gap-1.5 text-sm font-medium transition ${
                  isFirst
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                ข้อก่อนหน้า
              </button>
              {mode === 'practice' && passage && checkButton}
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition"
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
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
            style={{ maxHeight: '60vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">Question Bank</span>
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
                      ? 'bg-indigo-100 text-indigo-700 dark:text-indigo-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Group Answered
                </button>
                <button
                  type="button"
                  onClick={() => setIsNavOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 dark:text-gray-500 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1.5 border-b border-gray-50 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="w-5 h-5 rounded-md bg-green-100 border-2 border-green-400 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" strokeWidth={3} />
                </span>
                ถูกต้อง
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="w-5 h-5 rounded-md bg-red-100 border-2 border-red-400 flex items-center justify-center flex-shrink-0">
                  <X className="w-3 h-3 text-red-600 dark:text-red-400" strokeWidth={3} />
                </span>
                ผิด
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="w-5 h-5 rounded-md bg-orange-100 border-2 border-orange-400 flex items-center justify-center flex-shrink-0">
                  <Bookmark className="w-3 h-3 text-orange-500" fill="currentColor" />
                </span>
                ทำเครื่องหมาย
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="w-5 h-5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 flex-shrink-0" />
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
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                    {displayList.map(({ qId, idx }) => {
                      const isAnswered = !!answers[qId];
                      const isMk = markedForReview.includes(qId);
                      const isCurrent = idx === currentIndex;
                      const checkedResult = checkedAnswers[qId]; // true/false/undefined

                      let cls =
                        'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200'; // unanswered
                      if (isAnswered && checkedResult === undefined)
                        cls = 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100'; // answered, not yet checked
                      if (checkedResult === true)
                        cls = 'bg-green-100 text-green-700 dark:text-green-300 border-2 border-green-400 hover:bg-green-200'; // correct
                      if (checkedResult === false)
                        cls = 'bg-red-100 text-red-700 dark:text-red-300 border-2 border-red-400 hover:bg-red-200'; // incorrect
                      if (isMk)
                        cls = 'bg-orange-100 text-orange-600 dark:text-orange-400 border-2 border-orange-400 hover:bg-orange-200'; // marked
                      if (isCurrent)
                        cls = 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-900 font-bold shadow-sm'; // current

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
          className="flex items-center gap-2 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-full px-5 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 transition hover:shadow-xl"
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
    </div>
  );
}
