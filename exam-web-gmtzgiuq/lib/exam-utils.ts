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
 * Get the correct choice ID for a multiple-choice question
 */
export function getCorrectChoiceId(question: Question): string | undefined {
  return question.choices?.find((c) => c.isCorrect)?.id;
}

/**
 * Normalize a math answer string so equivalent forms compare equal.
 * Handles LaTeX, Unicode symbols, and plain-text math.
 * e.g. \frac{\sqrt{3}}{3}  ===  sqrt(3)/3  ===  √3/3  ===  1/sqrt(3)  (after eval)
 */
export function normalizeMathAnswer(s: string): string {
  let t = s.trim();

  // Strip outer $ delimiters  ($...$  or  $$...$$)
  t = t.replace(/^\$\$?([\s\S]*?)\$\$?$/, '$1').trim();

  // LaTeX → plain text  (sqrt MUST come before frac — frac regex can't handle nested braces)
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
  t = t.replace(/\\sqrt\s+(\S+)/g, 'sqrt($1)');
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  t = t.replace(/\\left|\\right/g, '');
  t = t.replace(/\\\s*/g, '');           // remaining backslash commands
  t = t.replace(/\{|\}/g, '');           // stray braces

  // Unicode symbols → ascii  (√3 → sqrt(3), √(x) → sqrt(x))
  t = t.replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/√\(([^)]+)\)/g, 'sqrt($1)');
  t = t.replace(/√/g, 'sqrt');    // fallback

  // Ensure bare sqrt followed by digits gets parens: sqrt3 → sqrt(3)
  t = t.replace(/sqrt(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/×/g, '*');
  t = t.replace(/÷/g, '/');
  t = t.replace(/−/g, '-');             // Unicode minus
  t = t.replace(/[^\S ]+/g, '');        // non-space whitespace
  t = t.replace(/\s+/g, '');            // collapse spaces

  return t.toLowerCase();
}

/**
 * Try to evaluate a simple math expression string to a number.
 * Returns NaN if not parseable or unsafe.
 */
function evalMathExpr(expr: string): number {
  // Only allow safe characters
  if (!/^[0-9+\-*/().sqrteSQRTE\s]+$/.test(expr)) return NaN;
  try {
    // Replace sqrt(...) with Math.sqrt(...)
    const safe = expr.replace(/sqrt\(/gi, 'Math.sqrt(');
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${safe})`)();
    return typeof result === 'number' ? result : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Check if an answer is correct (handles both MC and short_answer)
 */
export function isAnswerCorrect(question: Question, userAnswer: string): boolean {
  if (question.type === 'short_answer') {
    if (!question.correctAnswer) return false;

    // 1. Numeric comparison (plain numbers)
    const ua = parseFloat(userAnswer.trim());
    const ca = parseFloat(question.correctAnswer.trim());
    if (!isNaN(ua) && !isNaN(ca)) return Math.abs(ua - ca) < 1e-9;

    // 2. Normalize both sides
    const normUser = normalizeMathAnswer(userAnswer);
    const normCorrect = normalizeMathAnswer(question.correctAnswer);

    // 3. String match after normalization
    if (normUser === normCorrect) return true;

    // 4. Numeric evaluation of normalized expressions
    const evalUser = evalMathExpr(normUser);
    const evalCorrect = evalMathExpr(normCorrect);
    if (!isNaN(evalUser) && !isNaN(evalCorrect)) {
      return Math.abs(evalUser - evalCorrect) < 1e-9;
    }

    return false;
  }
  return getCorrectChoiceId(question) === userAnswer;
}

/**
 * Convert a correctAnswer string to human-readable hint forms.
 * e.g. \frac{\sqrt{3}}{3}  →  ["sqrt(3)/3", "√3/3"]
 */
export function getAnswerHints(correctAnswer: string): string[] {
  const norm = normalizeMathAnswer(correctAnswer);
  const hints: string[] = [];

  // plain normalized form
  hints.push(norm);

  // Unicode √ variant
  const unicodeForm = norm.replace(/sqrt/gi, '√');
  if (unicodeForm !== norm) hints.push(unicodeForm);

  return [...new Set(hints)];
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
 * @param includeCompleted - if true, also returns completed sessions (for results page)
 */
export function loadExamSession(includeCompleted = false): {
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

    // If not including completed, only return in-progress sessions
    if (!includeCompleted && session.status !== 'in_progress') {
      return { session: null, questions: null };
    }

    return { session, questions };
  } catch (error) {
    console.error('Failed to load exam session:', error);
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
