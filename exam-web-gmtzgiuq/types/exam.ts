import type { Question, QuestionCategory, QuestionDifficulty } from '@/lib/api/questions';

export interface ExamSession {
  id: string;
  category: QuestionCategory;
  difficulty?: QuestionDifficulty;
  questionIds: string[];
  currentIndex: number;
  answers: Record<string, string>; // questionId -> choiceId
  markedForReview: string[];
  timePerQuestion: Record<string, number>; // questionId -> seconds
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed';
}

export interface ExamState {
  session: ExamSession;
  questions: Question[];
  currentTimer: number; // seconds for current question
  showHint: boolean;
  showExplanation: boolean;
  answerChecked: boolean;
  isCorrect: boolean | null;
}

export type ExamAction =
  | { type: 'INIT_EXAM'; session: ExamSession; questions: Question[] }
  | { type: 'SELECT_ANSWER'; questionId: string; choiceId: string }
  | { type: 'NEXT_QUESTION' }
  | { type: 'PREV_QUESTION' }
  | { type: 'JUMP_TO_QUESTION'; index: number }
  | { type: 'TOGGLE_MARK_REVIEW'; questionId: string }
  | { type: 'CHECK_ANSWER' }
  | { type: 'SHOW_HINT' }
  | { type: 'HIDE_HINT' }
  | { type: 'SHOW_EXPLANATION' }
  | { type: 'HIDE_EXPLANATION' }
  | { type: 'TICK_TIMER' }
  | { type: 'COMPLETE_EXAM' }
  | { type: 'RESET_QUESTION_STATE' };

export interface ExamConfig {
  category: QuestionCategory;
  difficulty?: QuestionDifficulty;
  questionCount: number;
}

export interface ExamResult {
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number; // percentage
  totalTime: number; // seconds
  markedForReview: string[];
  incorrectQuestionIds: string[];
}
