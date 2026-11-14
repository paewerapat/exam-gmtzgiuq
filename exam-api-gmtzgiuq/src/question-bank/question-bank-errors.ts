import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Errors of the Question Bank (task 20): `{ statusCode, message (Thai),
 * errorCode }` like EXAM_LOCKED / the Pro errors.
 */
export const QB_VENUE_NOT_FOUND = 'QB_VENUE_NOT_FOUND';
export const QB_SUBJECT_NOT_FOUND = 'QB_SUBJECT_NOT_FOUND';
export const QB_LOGIN_REQUIRED = 'QB_LOGIN_REQUIRED';
export const CHALLENGE_NOT_IN_BANK_ONLY = 'CHALLENGE_NOT_IN_BANK_ONLY';

export function qbVenueNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    message: 'ไม่พบสนามสอบนี้ใน Question Bank',
    errorCode: QB_VENUE_NOT_FOUND,
  });
}

export function qbSubjectNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    message: 'ไม่พบวิชานี้ใน Question Bank',
    errorCode: QB_SUBJECT_NOT_FOUND,
  });
}

export function qbLoginRequired(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    message: 'กรุณาเข้าสู่ระบบเพื่อกรองข้อที่ทำแล้ว/ยังไม่ทำ/ตอบผิด',
    errorCode: QB_LOGIN_REQUIRED,
  });
}

/**
 * 400 when a question is marked Challenge in an exam that is not
 * "ใช้เฉพาะ Question Bank". `index` = 0-based position of the first one,
 * or null when the questions already stored are meant.
 */
export function challengeNotInBankOnly(
  index: number | null,
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    message:
      index === null
        ? 'ชุดนี้มีข้อ Challenge อยู่ ต้องเปิด "ใช้เฉพาะ Question Bank" ไว้ หรือเอาป้าย Challenge ออกก่อน'
        : `ข้อที่ ${index + 1} เป็นข้อ Challenge ได้เฉพาะในชุดที่ติ๊ก "ใช้เฉพาะ Question Bank"`,
    errorCode: CHALLENGE_NOT_IN_BANK_ONLY,
  });
}
