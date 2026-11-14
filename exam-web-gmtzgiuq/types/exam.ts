import type { Question, QuestionCategory, QuestionDifficulty } from '@/lib/api/questions';

/**
 * ตั้งค่าเวลาในโหมดฝึก (task 21): นับขึ้น (ค่าเริ่มต้น) หรือนับถอยหลังตามนาทีที่ตั้งเอง
 * เก็บใน session เพื่อ resume ได้ — เวลาที่ใช้นับจากเวลาทำจริงของแต่ละข้อ (timePerQuestion) ไม่ใช่นาฬิกาเครื่อง
 */
export interface PracticeTimerSettings {
  mode: 'up' | 'down';
  /** นาทีที่ตั้ง (1–600) — จำไว้แม้กลับไปนับขึ้น */
  minutes: number;
  /** หมดเวลาแล้วส่งข้อสอบให้อัตโนมัติ */
  autoSubmit: boolean;
  /** เวลาทำรวม (วินาที) ตอนกด "ใช้เวลานี้" — นับถอยหลังเริ่มใหม่จากค่าที่ตั้ง ณ ตอนนั้น */
  startTotalSec: number;
  /** แจ้ง "หมดเวลาที่ตั้งไว้" แล้ว (ไม่ส่งอัตโนมัติ) — reload/resume แล้วไม่ toast ซ้ำ (task 21 R7) */
  expiredNotified?: boolean;
}

export interface ExamSession {
  id: string;
  examId: string;
  examTitle: string;
  category: QuestionCategory;
  difficulty?: QuestionDifficulty;
  questionIds: string[];
  currentIndex: number;
  answers: Record<string, string>; // questionId -> choiceId ("c") / ข้อตอบได้หลายตัว "b,c,d" / short answer ข้อความ
  checkedAnswers?: Record<string, boolean>; // questionId -> correct(true)/incorrect(false)
  markedForReview: string[];
  timePerQuestion: Record<string, number>; // questionId -> seconds
  startedAt: string;
  durationSeconds?: number | null; // optional total duration for the exam in seconds
  totalPausedMs?: number; // accumulated paused milliseconds for countdown adjustment
  pausedAt?: number | null; // client timestamp when currently paused
  /**
   * clock offset (server − client, ms) ที่ใช้คำนวณ totalPausedMs ตอนทำต่อจาก attempt บน server (task 21 M2)
   * ExamContainer sync เวลา server สำเร็จครั้งแรก → ปรับ totalPausedMs ตาม offset จริงแล้วล้างค่านี้ (REBASE_CLOCK)
   */
  clockOffsetBasisMs?: number | null;
  completedAt?: string;
  status: 'in_progress' | 'completed';
  /** Question Bank (task 20): key ของสนาม ใช้ทำลิงก์ Unlock ของข้อที่ล็อก (เก็บใน session แทน key แยกใน localStorage) */
  venueKey?: string;
  /** ตั้งค่าเวลาโหมดฝึก (task 21) — ไม่มี = นับขึ้นแบบเดิม */
  practiceTimer?: PracticeTimerSettings | null;
}

export interface ExamState {
  session: ExamSession;
  questions: Question[];
  currentTimer: number; // seconds for current question
  showHint: boolean;
  showExplanation: boolean;
  answerChecked: boolean;
  isCorrect: boolean | null;
  isPaused: boolean;
}

export type ExamAction =
  | { type: 'INIT_EXAM'; session: ExamSession; questions: Question[] }
  | { type: 'SELECT_ANSWER'; questionId: string; choiceId: string }
  | { type: 'TOGGLE_CHOICE'; questionId: string; choiceId: string }
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
  | { type: 'RESET_QUESTION_STATE' }
  | { type: 'PAUSE_TIMER'; now: number }
  | { type: 'RESUME_TIMER'; now: number }
  | { type: 'SET_PRACTICE_TIMER'; settings: Pick<PracticeTimerSettings, 'mode' | 'minutes' | 'autoSubmit'> }
  | { type: 'MARK_PRACTICE_TIMER_NOTIFIED' }
  | { type: 'REBASE_CLOCK'; offsetMs: number };

export interface ExamConfig {
  examId: string;
  examTitle: string;
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
