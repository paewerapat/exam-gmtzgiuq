import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExamAccessType } from './exam-mock';

/**
 * Campaign window of a code Mock Exam (task 21,
 * sql/20261117-01-campaign-window.sql). `exams.campaignStartsAt` /
 * `campaignEndsAt` are stored like `releaseDate` (datetime through mysql2,
 * written and read in the API process's timezone, so a Date round-trips to
 * the same instant). No value = no limit on that side; neither = always open.
 *
 * Status (computed by the API): `upcoming` while now < startsAt, `ended`
 * once now > endsAt, `open` otherwise. Only `accessType = code` Mock Exams
 * are campaigns; the window of any other exam is stored but has no effect.
 */
export type CampaignStatus = 'upcoming' | 'open' | 'ended';

/** `campaign` of every item of `GET /exams/mock*` (null when not a campaign). */
export interface MockExamCampaign {
  status: CampaignStatus;
  // ISO 8601 (UTC) or null
  startsAt: string | null;
  endsAt: string | null;
  // open with an end: Thai calendar days from today to the end day
  // (0 = ends today); otherwise null
  daysLeft: number | null;
  // upcoming: Thai calendar days from today to the opening day
  // (0 = opens later today); otherwise null
  daysUntilOpen: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Bangkok is UTC+7 all year (no daylight saving). */
const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Day number of the Thai calendar date of `date` (days since 1970-01-01). */
export function thaiDayNumber(date: Date): number {
  return Math.floor((date.getTime() + THAI_OFFSET_MS) / DAY_MS);
}

/**
 * Calendar days in Thai time from the day of `from` to the day of `to`:
 * 23:59 → 00:01 the next day is 1, 00:01 → 23:59 the same day is 0.
 */
export function thaiDaysBetween(from: Date, to: Date): number {
  return thaiDayNumber(to) - thaiDayNumber(from);
}

/** A datetime value of an entity or raw row as a Date (invalid → null). */
export function toCampaignDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getCampaignStatus(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): CampaignStatus {
  if (startsAt && now.getTime() < startsAt.getTime()) return 'upcoming';
  if (endsAt && now.getTime() > endsAt.getTime()) return 'ended';
  return 'open';
}

/** Fields of an exam that decide its campaign. */
export interface CampaignFields {
  accessType?: ExamAccessType | string | null;
  campaignStartsAt?: Date | string | null;
  campaignEndsAt?: Date | string | null;
}

/**
 * `campaign` of a Mock Exam card: null unless accessType = code (callers
 * pass Mock Exams only).
 */
export function buildCampaign(
  exam: CampaignFields,
  now: Date,
): MockExamCampaign | null {
  if (exam.accessType !== ExamAccessType.CODE) return null;
  const startsAt = toCampaignDate(exam.campaignStartsAt);
  const endsAt = toCampaignDate(exam.campaignEndsAt);
  const status = getCampaignStatus(startsAt, endsAt, now);
  return {
    status,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    daysLeft:
      status === 'open' && endsAt
        ? Math.max(0, thaiDaysBetween(now, endsAt))
        : null,
    daysUntilOpen:
      status === 'upcoming' && startsAt
        ? Math.max(0, thaiDaysBetween(now, startsAt))
        : null,
  };
}

/** true/1/'1' (entity or raw row). */
function isTrue(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

/** An exam whose campaign window is enforced (code Mock Exam, not bankOnly). */
export interface CampaignExam extends CampaignFields {
  isMock?: boolean | number | string | null;
  bankOnly?: boolean | number | string | null;
}

/**
 * Status of the campaign of an exam whose window is enforced, or null when
 * the exam is not a campaign (not a Mock Exam, not accessType code, or
 * "ใช้เฉพาะ Question Bank", which is never taken as a Mock Exam).
 */
export function enforcedCampaignStatus(
  exam: CampaignExam,
  now: Date,
): CampaignStatus | null {
  if (!isTrue(exam.isMock) || isTrue(exam.bankOnly)) return null;
  if (exam.accessType !== ExamAccessType.CODE) return null;
  return getCampaignStatus(
    toCampaignDate(exam.campaignStartsAt),
    toCampaignDate(exam.campaignEndsAt),
    now,
  );
}

export const CAMPAIGN_NOT_OPEN = 'CAMPAIGN_NOT_OPEN';
export const CAMPAIGN_ENDED = 'CAMPAIGN_ENDED';

/**
 * 403 of POST /attempts/start and the legacy POST /attempts for a campaign
 * outside its window: `{ statusCode, message (Thai), errorCode }`.
 */
export function campaignClosedForAttempt(
  status: 'upcoming' | 'ended',
): ForbiddenException {
  return new ForbiddenException(
    status === 'upcoming'
      ? {
          statusCode: 403,
          message: 'แคมเปญนี้ยังไม่เปิด เริ่มทำข้อสอบได้เมื่อถึงวันเปิดแคมเปญ',
          errorCode: CAMPAIGN_NOT_OPEN,
        }
      : {
          statusCode: 403,
          message: 'แคมเปญนี้จบแล้ว เริ่มทำข้อสอบชุดนี้ใหม่ไม่ได้',
          errorCode: CAMPAIGN_ENDED,
        },
  );
}

/**
 * `campaignStartsAt` / `campaignEndsAt` of POST/PUT (already ISO 8601 with
 * a timezone, see the DTO) as a Date in whole seconds (the datetime column
 * has no fraction; MySQL would round), or null when null/not sent.
 */
export function parseCampaignDate(
  value: string | null | undefined,
  label: string,
): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  const year = date.getFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999) {
    throw new BadRequestException(`${label}ไม่ถูกต้อง`);
  }
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * Cross-field rule of POST/PUT on the values the exam will have after
 * saving (PUT: not sent = current value): the end must be after the start.
 */
export function assertCampaignWindow(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new BadRequestException('วันปิดแคมเปญต้องอยู่หลังวันเปิดแคมเปญ');
  }
}
