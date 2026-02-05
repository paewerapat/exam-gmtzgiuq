'use client';

import { useExam } from '@/contexts/ExamContext';
import { getCorrectChoiceId } from '@/lib/exam-utils';
import ExamHeader from './ExamHeader';
import QuestionCard from './QuestionCard';
import ChoiceButton from './ChoiceButton';
import QuestionNavigation from './QuestionNavigation';
import HintPanel from './HintPanel';
import ExplanationPanel from './ExplanationPanel';
import MarkForReviewButton from './MarkForReviewButton';
import CheckAnswerButton from './CheckAnswerButton';

interface ExamContainerProps {
  onComplete: () => void;
}

export default function ExamContainer({ onComplete }: ExamContainerProps) {
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
    showHint,
    hideHint,
    showExplanation,
    hideExplanation,
    completeExam,
  } = useExam();

  const { session, currentTimer, answerChecked, isCorrect } = state;
  const { showHint: isHintVisible, showExplanation: isExplanationVisible } = state;

  if (!currentQuestion || !currentQuestionId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">กำลังโหลด...</div>
      </div>
    );
  }

  const userAnswer = session.answers[currentQuestionId];
  const isMarked = session.markedForReview.includes(currentQuestionId);
  const hasAnswered = !!userAnswer;
  const correctChoiceId = getCorrectChoiceId(currentQuestion);

  const handleFinish = () => {
    if (confirm('คุณต้องการส่งข้อสอบหรือไม่?')) {
      completeExam();
      onComplete();
    }
  };

  const handleNext = () => {
    if (isLastQuestion) {
      handleFinish();
    } else {
      nextQuestion();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <ExamHeader
        category={session.category}
        timer={currentTimer}
        currentIndex={session.currentIndex}
        totalQuestions={session.questionIds.length}
        answeredCount={answeredCount}
        onFinish={handleFinish}
        backUrl="/dashboard/practice"
      />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Question and choices */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
              {/* Mark for review button */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">
                  ข้อ {session.currentIndex + 1} จาก {session.questionIds.length}
                </span>
                <MarkForReviewButton
                  isMarked={isMarked}
                  onClick={() => toggleMarkReview(currentQuestionId)}
                />
              </div>

              {/* Question */}
              <QuestionCard
                question={currentQuestion}
                questionNumber={session.currentIndex + 1}
                className="mb-6"
              />

              {/* Hint panel */}
              {currentQuestion.hint && (
                <HintPanel
                  hint={currentQuestion.hint}
                  isVisible={isHintVisible}
                  onShow={showHint}
                  onHide={hideHint}
                  className="mb-4"
                />
              )}

              {/* Choices */}
              <div className="space-y-3 mb-6">
                {currentQuestion.choices.map((choice, index) => (
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

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <CheckAnswerButton
                  onClick={checkAnswer}
                  disabled={!hasAnswered}
                  isChecked={answerChecked}
                  isCorrect={isCorrect}
                />

                {answerChecked && currentQuestion.explanation && (
                  <ExplanationPanel
                    explanation={currentQuestion.explanation}
                    isVisible={isExplanationVisible}
                    onShow={showExplanation}
                    onHide={hideExplanation}
                  />
                )}
              </div>

              {/* Explanation panel (full width when visible) */}
              {isExplanationVisible && currentQuestion.explanation && (
                <ExplanationPanel
                  explanation={currentQuestion.explanation}
                  isVisible={true}
                  onShow={showExplanation}
                  onHide={hideExplanation}
                  className="mt-4"
                />
              )}
            </div>
          </div>

          {/* Right side - Navigation */}
          <div className="lg:w-72">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-4">
              <QuestionNavigation
                session={session}
                onJumpTo={jumpToQuestion}
                onPrev={prevQuestion}
                onNext={handleNext}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
