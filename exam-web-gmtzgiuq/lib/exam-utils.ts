// Exam Utility Functions
import type { Question } from '@/lib/api/questions';
import type { ExamSession, ExamResult } from '@/types/exam';

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `exam_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format seconds to mm:ss string
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to human readable string (e.g., "5 นาที 30 วินาที")
 */
export function formatTimeReadable(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ชั่วโมง`);
  if (mins > 0) parts.push(`${mins} นาที`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} วินาที`);

  return parts.join(' ');
}

/**
 * Get the correct choice ID for a question
 */
export function getCorrectChoiceId(question: Question): string | undefined {
  const correctChoice = question.choices.find((c) => c.isCorrect);
  return correctChoice?.id;
}

/**
 * Check if an answer is correct
 */
export function isAnswerCorrect(question: Question, choiceId: string): boolean {
  return getCorrectChoiceId(question) === choiceId;
}

/**
 * Calculate exam results from session and questions
 */
export function calculateExamResult(
  session: ExamSession,
  questions: Question[],
): ExamResult {
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let correctAnswers = 0;
  let incorrectAnswers = 0;
  const incorrectQuestionIds: string[] = [];

  for (const questionId of session.questionIds) {
    const question = questionMap.get(questionId);
    const userAnswer = session.answers[questionId];

    if (!question) continue;

    if (!userAnswer) {
      // Unanswered - count as incorrect
      incorrectQuestionIds.push(questionId);
    } else if (isAnswerCorrect(question, userAnswer)) {
      correctAnswers++;
    } else {
      incorrectAnswers++;
      incorrectQuestionIds.push(questionId);
    }
  }

  const totalQuestions = session.questionIds.length;
  const unanswered = totalQuestions - correctAnswers - incorrectAnswers;
  const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

  // Calculate total time
  const totalTime = Object.values(session.timePerQuestion).reduce(
    (sum, time) => sum + time,
    0,
  );

  return {
    totalQuestions,
    correctAnswers,
    incorrectAnswers,
    unanswered,
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    totalTime,
    markedForReview: session.markedForReview,
    incorrectQuestionIds,
  };
}

/**
 * Get question status for navigation display
 */
export type QuestionNavStatus = 'unanswered' | 'answered' | 'current' | 'marked';

export function getQuestionNavStatus(
  questionId: string,
  session: ExamSession,
  currentIndex: number,
): { status: QuestionNavStatus; isMarked: boolean } {
  const index = session.questionIds.indexOf(questionId);
  const isMarked = session.markedForReview.includes(questionId);
  const isAnswered = !!session.answers[questionId];
  const isCurrent = index === currentIndex;

  let status: QuestionNavStatus = 'unanswered';
  if (isCurrent) {
    status = 'current';
  } else if (isAnswered) {
    status = 'answered';
  }

  return { status, isMarked };
}

/**
 * Get progress percentage
 */
export function getProgress(session: ExamSession): number {
  const answered = Object.keys(session.answers).length;
  const total = session.questionIds.length;
  return total > 0 ? Math.round((answered / total) * 100) : 0;
}

/**
 * Get choice letter (A, B, C, D, ...)
 */
export function getChoiceLetter(index: number): string {
  return String.fromCharCode(65 + index); // A = 65
}

/**
 * LocalStorage keys for exam persistence
 */
export const EXAM_STORAGE_KEYS = {
  SESSION: 'exam_current_session',
  QUESTIONS: 'exam_current_questions',
} as const;

/**
 * Save exam session to localStorage
 */
export function saveExamSession(session: ExamSession, questions: Question[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(EXAM_STORAGE_KEYS.SESSION, JSON.stringify(session));
    localStorage.setItem(EXAM_STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  } catch (error) {
    console.error('Failed to save exam session:', error);
  }
}

/**
 * Load exam session from localStorage
 */
export function loadExamSession(): {
  session: ExamSession | null;
  questions: Question[] | null;
} {
  if (typeof window === 'undefined') {
    return { session: null, questions: null };
  }

  try {
    const sessionStr = localStorage.getItem(EXAM_STORAGE_KEYS.SESSION);
    const questionsStr = localStorage.getItem(EXAM_STORAGE_KEYS.QUESTIONS);

    if (!sessionStr || !questionsStr) {
      return { session: null, questions: null };
    }

    const session = JSON.parse(sessionStr) as ExamSession;
    const questions = JSON.parse(questionsStr) as Question[];

    // Validate session is still in progress
    if (session.status !== 'in_progress') {
      clearExamSession();
      return { session: null, questions: null };
    }

    return { session, questions };
  } catch (error) {
    console.error('Failed to load exam session:', error);
    clearExamSession();
    return { session: null, questions: null };
  }
}

/**
 * Clear exam session from localStorage
 */
export function clearExamSession(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(EXAM_STORAGE_KEYS.SESSION);
    localStorage.removeItem(EXAM_STORAGE_KEYS.QUESTIONS);
  } catch (error) {
    console.error('Failed to clear exam session:', error);
  }
}

/**
 * Check if there's an existing session for a category
 */
export function hasExistingSession(category?: string): boolean {
  const { session } = loadExamSession();
  if (!session) return false;
  if (!category) return true;
  return session.category === category && session.status === 'in_progress';
}
