import { ForbiddenException } from '@nestjs/common';
import { ExamAccessType } from '../exams/exam-mock';
import { UserRole } from '../users/user.entity';

/**
 * Who is asking: the logged-in user (`req.user`, role from the DB) or null
 * for a guest. Only `id` and `role` are read.
 */
export type AccessViewer = { id: string; role?: UserRole | string | null };

/** Access types of a Mock Exam that need a code or a purchase (task 15). */
export const LOCKED_ACCESS_TYPES: readonly ExamAccessType[] = [
  ExamAccessType.CODE,
  ExamAccessType.PURCHASE,
];

/** Fields of an exam that decide whether it is locked. */
export interface LockableExam {
  id: string;
  // boolean from an entity, 0/1 (or '0'/'1') from a raw row
  isMock?: boolean | number | string | null;
  accessType?: ExamAccessType | string | null;
}

/**
 * Locked = a Mock Exam whose accessType is code or purchase. Every other
 * exam (non-mock, free mock) can be taken by anyone, as before.
 */
export function isLockedExam(exam: Omit<LockableExam, 'id'>): boolean {
  const isMock = exam.isMock === true || Number(exam.isMock) === 1;
  return (
    isMock && LOCKED_ACCESS_TYPES.includes(exam.accessType as ExamAccessType)
  );
}

export function isAdminViewer(viewer: AccessViewer | null | undefined) {
  return viewer?.role === UserRole.ADMIN;
}

export const EXAM_LOCKED_ERROR_CODE = 'EXAM_LOCKED';
export const EXAM_LOCKED_MESSAGE = 'ชุดข้อสอบนี้ต้อง Unlock ก่อน';

/** 403 `{ statusCode, message, errorCode: 'EXAM_LOCKED' }`. */
export function examLockedException(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    message: EXAM_LOCKED_MESSAGE,
    errorCode: EXAM_LOCKED_ERROR_CODE,
  });
}
