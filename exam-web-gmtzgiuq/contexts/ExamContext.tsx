'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from 'react';
import type { Question } from '@/lib/api/questions';
import type { ExamSession, ExamState, ExamAction, ExamResult } from '@/types/exam';
import {
  saveExamSession,
  loadExamSession,
  clearExamSession,
  calculateExamResult,
  getCorrectChoiceId,
} from '@/lib/exam-utils';

// Initial state
const initialState: ExamState = {
  session: {
    id: '',
    category: 'general_knowledge',
    questionIds: [],
    currentIndex: 0,
    answers: {},
    markedForReview: [],
    timePerQuestion: {},
    startedAt: '',
    status: 'in_progress',
  },
  questions: [],
  currentTimer: 0,
  showHint: false,
  showExplanation: false,
  answerChecked: false,
  isCorrect: null,
};

// Reducer
function examReducer(state: ExamState, action: ExamAction): ExamState {
  switch (action.type) {
    case 'INIT_EXAM':
      return {
        ...initialState,
        session: action.session,
        questions: action.questions,
        currentTimer: action.session.timePerQuestion[action.session.questionIds[action.session.currentIndex]] || 0,
      };

    case 'SELECT_ANSWER': {
      const newAnswers = {
        ...state.session.answers,
        [action.questionId]: action.choiceId,
      };
      return {
        ...state,
        session: {
          ...state.session,
          answers: newAnswers,
        },
        // Reset check state when selecting new answer
        answerChecked: false,
        isCorrect: null,
        showExplanation: false,
      };
    }

    case 'NEXT_QUESTION': {
      const nextIndex = Math.min(
        state.session.currentIndex + 1,
        state.session.questionIds.length - 1,
      );
      const nextQuestionId = state.session.questionIds[nextIndex];
      return {
        ...state,
        session: {
          ...state.session,
          currentIndex: nextIndex,
          timePerQuestion: {
            ...state.session.timePerQuestion,
            [state.session.questionIds[state.session.currentIndex]]: state.currentTimer,
          },
        },
        currentTimer: state.session.timePerQuestion[nextQuestionId] || 0,
        showHint: false,
        showExplanation: false,
        answerChecked: false,
        isCorrect: null,
      };
    }

    case 'PREV_QUESTION': {
      const prevIndex = Math.max(state.session.currentIndex - 1, 0);
      const prevQuestionId = state.session.questionIds[prevIndex];
      return {
        ...state,
        session: {
          ...state.session,
          currentIndex: prevIndex,
          timePerQuestion: {
            ...state.session.timePerQuestion,
            [state.session.questionIds[state.session.currentIndex]]: state.currentTimer,
          },
        },
        currentTimer: state.session.timePerQuestion[prevQuestionId] || 0,
        showHint: false,
        showExplanation: false,
        answerChecked: false,
        isCorrect: null,
      };
    }

    case 'JUMP_TO_QUESTION': {
      const targetIndex = Math.max(
        0,
        Math.min(action.index, state.session.questionIds.length - 1),
      );
      const targetQuestionId = state.session.questionIds[targetIndex];
      return {
        ...state,
        session: {
          ...state.session,
          currentIndex: targetIndex,
          timePerQuestion: {
            ...state.session.timePerQuestion,
            [state.session.questionIds[state.session.currentIndex]]: state.currentTimer,
          },
        },
        currentTimer: state.session.timePerQuestion[targetQuestionId] || 0,
        showHint: false,
        showExplanation: false,
        answerChecked: false,
        isCorrect: null,
      };
    }

    case 'TOGGLE_MARK_REVIEW': {
      const isMarked = state.session.markedForReview.includes(action.questionId);
      const newMarked = isMarked
        ? state.session.markedForReview.filter((id) => id !== action.questionId)
        : [...state.session.markedForReview, action.questionId];
      return {
        ...state,
        session: {
          ...state.session,
          markedForReview: newMarked,
        },
      };
    }

    case 'CHECK_ANSWER': {
      const currentQuestionId = state.session.questionIds[state.session.currentIndex];
      const currentQuestion = state.questions.find((q) => q.id === currentQuestionId);
      const userAnswer = state.session.answers[currentQuestionId];

      if (!currentQuestion || !userAnswer) {
        return state;
      }

      const correctChoiceId = getCorrectChoiceId(currentQuestion);
      const isCorrect = userAnswer === correctChoiceId;

      return {
        ...state,
        answerChecked: true,
        isCorrect,
      };
    }

    case 'SHOW_HINT':
      return { ...state, showHint: true };

    case 'HIDE_HINT':
      return { ...state, showHint: false };

    case 'SHOW_EXPLANATION':
      return { ...state, showExplanation: true };

    case 'HIDE_EXPLANATION':
      return { ...state, showExplanation: false };

    case 'TICK_TIMER':
      return {
        ...state,
        currentTimer: state.currentTimer + 1,
      };

    case 'COMPLETE_EXAM':
      return {
        ...state,
        session: {
          ...state.session,
          status: 'completed',
          completedAt: new Date().toISOString(),
          timePerQuestion: {
            ...state.session.timePerQuestion,
            [state.session.questionIds[state.session.currentIndex]]: state.currentTimer,
          },
        },
      };

    case 'RESET_QUESTION_STATE':
      return {
        ...state,
        showHint: false,
        showExplanation: false,
        answerChecked: false,
        isCorrect: null,
      };

    default:
      return state;
  }
}

// Context type
interface ExamContextType {
  state: ExamState;
  dispatch: React.Dispatch<ExamAction>;
  // Helper methods
  currentQuestion: Question | null;
  currentQuestionId: string | null;
  isLastQuestion: boolean;
  isFirstQuestion: boolean;
  progress: number;
  answeredCount: number;
  getResult: () => ExamResult;
  // Actions
  initExam: (session: ExamSession, questions: Question[]) => void;
  selectAnswer: (questionId: string, choiceId: string) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  jumpToQuestion: (index: number) => void;
  toggleMarkReview: (questionId: string) => void;
  checkAnswer: () => void;
  showHint: () => void;
  hideHint: () => void;
  showExplanation: () => void;
  hideExplanation: () => void;
  completeExam: () => void;
  clearSession: () => void;
}

const ExamContext = createContext<ExamContextType | undefined>(undefined);

// Provider
export function ExamProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(examReducer, initialState);

  // Auto-save session to localStorage
  useEffect(() => {
    if (state.session.id && state.session.status === 'in_progress') {
      const timeoutId = setTimeout(() => {
        saveExamSession(state.session, state.questions);
      }, 500); // Debounce 500ms
      return () => clearTimeout(timeoutId);
    }
  }, [state.session, state.questions]);

  // Timer tick
  useEffect(() => {
    if (state.session.status !== 'in_progress' || !state.session.id) {
      return;
    }

    const interval = setInterval(() => {
      dispatch({ type: 'TICK_TIMER' });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.session.status, state.session.id]);

  // Helper values
  const currentQuestionId = state.session.questionIds[state.session.currentIndex] || null;
  const currentQuestion = currentQuestionId
    ? state.questions.find((q) => q.id === currentQuestionId) || null
    : null;
  const isLastQuestion = state.session.currentIndex === state.session.questionIds.length - 1;
  const isFirstQuestion = state.session.currentIndex === 0;
  const answeredCount = Object.keys(state.session.answers).length;
  const progress =
    state.session.questionIds.length > 0
      ? Math.round((answeredCount / state.session.questionIds.length) * 100)
      : 0;

  // Actions
  const initExam = useCallback((session: ExamSession, questions: Question[]) => {
    dispatch({ type: 'INIT_EXAM', session, questions });
  }, []);

  const selectAnswer = useCallback((questionId: string, choiceId: string) => {
    dispatch({ type: 'SELECT_ANSWER', questionId, choiceId });
  }, []);

  const nextQuestion = useCallback(() => {
    dispatch({ type: 'NEXT_QUESTION' });
  }, []);

  const prevQuestion = useCallback(() => {
    dispatch({ type: 'PREV_QUESTION' });
  }, []);

  const jumpToQuestion = useCallback((index: number) => {
    dispatch({ type: 'JUMP_TO_QUESTION', index });
  }, []);

  const toggleMarkReview = useCallback((questionId: string) => {
    dispatch({ type: 'TOGGLE_MARK_REVIEW', questionId });
  }, []);

  const checkAnswer = useCallback(() => {
    dispatch({ type: 'CHECK_ANSWER' });
  }, []);

  const showHintAction = useCallback(() => {
    dispatch({ type: 'SHOW_HINT' });
  }, []);

  const hideHintAction = useCallback(() => {
    dispatch({ type: 'HIDE_HINT' });
  }, []);

  const showExplanationAction = useCallback(() => {
    dispatch({ type: 'SHOW_EXPLANATION' });
  }, []);

  const hideExplanationAction = useCallback(() => {
    dispatch({ type: 'HIDE_EXPLANATION' });
  }, []);

  const completeExam = useCallback(() => {
    dispatch({ type: 'COMPLETE_EXAM' });
  }, []);

  const clearSession = useCallback(() => {
    clearExamSession();
  }, []);

  const getResult = useCallback(() => {
    return calculateExamResult(state.session, state.questions);
  }, [state.session, state.questions]);

  const value: ExamContextType = {
    state,
    dispatch,
    currentQuestion,
    currentQuestionId,
    isLastQuestion,
    isFirstQuestion,
    progress,
    answeredCount,
    getResult,
    initExam,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    jumpToQuestion,
    toggleMarkReview,
    checkAnswer,
    showHint: showHintAction,
    hideHint: hideHintAction,
    showExplanation: showExplanationAction,
    hideExplanation: hideExplanationAction,
    completeExam,
    clearSession,
  };

  return <ExamContext.Provider value={value}>{children}</ExamContext.Provider>;
}

// Hook
export function useExam() {
  const context = useContext(ExamContext);
  if (context === undefined) {
    throw new Error('useExam must be used within an ExamProvider');
  }
  return context;
}

// Hook to load existing session
export function useLoadExamSession() {
  const { initExam } = useExam();

  const loadSession = useCallback(() => {
    const { session, questions } = loadExamSession();
    if (session && questions) {
      initExam(session, questions);
      return true;
    }
    return false;
  }, [initExam]);

  return loadSession;
}
