import { BadRequestException } from '@nestjs/common';
import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
// Type only (erased at runtime): exam-campaign imports this file
import type { MockExamCampaign } from './exam-campaign';

/**
 * Mock Exam settings (task 11). Only `isMock` exams use `accessType`;
 * other exams can always be taken as before.
 */
export enum ExamAccessType {
  FREE = 'free',
  CODE = 'code',
  PURCHASE = 'purchase',
}

/** Level shown on Mock Exam pages: ง่าย / ปานกลาง / ยาก. */
export enum ExamLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

registerEnumType(ExamAccessType, { name: 'ExamAccessType' });
registerEnumType(ExamLevel, { name: 'ExamLevel' });

export const MAX_DETAIL_BLOCKS = 50;
export const MAX_DETAIL_TEXT_LENGTH = 20_000;
export const MAX_DETAIL_URL_LENGTH = 500;
export const MAX_EXAM_PRICE = 100_000;
export const MIN_ACCESS_DAYS = 1;
export const MAX_ACCESS_DAYS = 3650;

/** Image URL of a detail block: an upload path or http(s) only. */
export const DETAIL_IMAGE_URL_PATTERN = /^(\/uploads\/|https?:\/\/)/i;

export type ExamDetailBlockType = 'text' | 'image';
export const DETAIL_BLOCK_TYPES: ExamDetailBlockType[] = ['text', 'image'];

/**
 * One block of the exam description shown on the Mock Exam detail page, in
 * the order the admin arranged: `{ type: 'text', text }` or
 * `{ type: 'image', url }`. Stored as JSON in `exams.detailBlocks`.
 */
@ObjectType()
export class ExamDetailBlock {
  @Field(() => String)
  type: ExamDetailBlockType;

  @Field(() => String, { nullable: true })
  text?: string;

  @Field(() => String, { nullable: true })
  url?: string;
}

interface DetailBlockInput {
  type: string;
  text?: string | null;
  url?: string | null;
}

/**
 * Read `exams.detailBlocks` tolerantly: null/malformed JSON becomes [],
 * a JSON string (MariaDB returns json columns as text in raw queries) is
 * parsed, and blocks that are not a valid text/image block are skipped.
 */
export function normalizeStoredDetailBlocks(value: unknown): ExamDetailBlock[] {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  const blocks: ExamDetailBlock[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      blocks.push({ type: 'text', text: b.text });
    } else if (
      b.type === 'image' &&
      typeof b.url === 'string' &&
      DETAIL_IMAGE_URL_PATTERN.test(b.url)
    ) {
      blocks.push({ type: 'image', url: b.url });
    }
  }
  return blocks;
}

/**
 * The blocks to store from POST/PUT (already validated by the DTO): keep
 * only `text` on text blocks and `url` on image blocks, drop blank text
 * blocks. An empty list is stored as null.
 */
export function prepareDetailBlocks(
  blocks: DetailBlockInput[] | null | undefined,
): ExamDetailBlock[] | null {
  const prepared: ExamDetailBlock[] = [];
  for (const block of blocks ?? []) {
    if (block.type === 'text') {
      if (typeof block.text === 'string' && block.text.trim() !== '') {
        prepared.push({ type: 'text', text: block.text });
      }
    } else if (block.type === 'image' && typeof block.url === 'string') {
      prepared.push({ type: 'image', url: block.url });
    }
  }
  return prepared.length > 0 ? prepared : null;
}

/** Every image URL used by the detail blocks. */
export function collectDetailBlockImageUrls(blocks: unknown): string[] {
  return normalizeStoredDetailBlocks(blocks).flatMap((b) =>
    b.type === 'image' && b.url ? [b.url] : [],
  );
}

// "วิธีรับโค้ด" on the detail page of a code Mock Exam (task 15)
export const MAX_CODE_STEPS = 10;
export const MAX_CODE_STEP_TITLE_LENGTH = 100;
export const MAX_CODE_STEP_DESCRIPTION_LENGTH = 300;
export const MAX_CODE_STEP_LINK_LABEL_LENGTH = 40;
export const MAX_CODE_STEP_LINK_URL_LENGTH = 500;
export const MAX_CODE_NOTE_LENGTH = 300;
/** Link of a code step: http(s) only (no javascript:, data:, relative). */
export const CODE_STEP_LINK_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** One step of "วิธีรับโค้ด": title + optional description and link. */
@ObjectType()
export class ExamCodeInstructionStep {
  @Field(() => String)
  title: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  linkLabel?: string;

  @Field(() => String, { nullable: true })
  linkUrl?: string;
}

/** `exams.codeInstructions`: steps in order + an optional note. */
@ObjectType()
export class ExamCodeInstructions {
  @Field(() => [ExamCodeInstructionStep])
  steps: ExamCodeInstructionStep[];

  @Field(() => String, { nullable: true })
  note?: string;
}

interface CodeInstructionsInput {
  steps?:
    | {
        title?: string | null;
        description?: string | null;
        linkLabel?: string | null;
        linkUrl?: string | null;
      }[]
    | null;
  note?: string | null;
}

/** Trimmed non-empty string within `max` characters, else undefined. */
function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text !== '' && text.length <= max ? text : undefined;
}

/**
 * Shared by the read and write paths: keep steps with a title, only the
 * known fields, http(s) links only; no steps and no note → null.
 */
function buildCodeInstructions(
  value: CodeInstructionsInput | null | undefined,
): ExamCodeInstructions | null {
  if (!value || typeof value !== 'object') return null;
  const steps: ExamCodeInstructionStep[] = [];
  const list: unknown[] = Array.isArray(value.steps) ? value.steps : [];
  for (const item of list.slice(0, MAX_CODE_STEPS)) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const title = cleanText(s.title, MAX_CODE_STEP_TITLE_LENGTH);
    if (!title) continue;
    const step: ExamCodeInstructionStep = { title };
    const description = cleanText(
      s.description,
      MAX_CODE_STEP_DESCRIPTION_LENGTH,
    );
    if (description) step.description = description;
    const linkLabel = cleanText(s.linkLabel, MAX_CODE_STEP_LINK_LABEL_LENGTH);
    if (linkLabel) step.linkLabel = linkLabel;
    const linkUrl = cleanText(s.linkUrl, MAX_CODE_STEP_LINK_URL_LENGTH);
    if (linkUrl && CODE_STEP_LINK_URL_PATTERN.test(linkUrl)) {
      step.linkUrl = linkUrl;
    }
    steps.push(step);
  }
  const note = cleanText(value.note, MAX_CODE_NOTE_LENGTH);
  if (steps.length === 0 && !note) return null;
  return note ? { steps, note } : { steps };
}

/**
 * Read `exams.codeInstructions` tolerantly (null/malformed → null, a JSON
 * string from MariaDB raw queries is parsed, invalid steps are skipped).
 */
export function normalizeStoredCodeInstructions(
  value: unknown,
): ExamCodeInstructions | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return buildCodeInstructions(data as CodeInstructionsInput);
}

/**
 * The value to store from POST/PUT (already validated by the DTO): trimmed,
 * blank optional fields dropped; nothing left → null.
 */
export function prepareCodeInstructions(
  value: CodeInstructionsInput | null | undefined,
): ExamCodeInstructions | null {
  return buildCodeInstructions(value);
}

/**
 * Cross-field rule of POST/PUT, checked on the values the exam will have
 * after saving (PUT: not sent = current value): an exam that must be
 * purchased needs a price above 0.
 */
export function assertMockAccess(
  accessType: ExamAccessType | null | undefined,
  price: number | null | undefined,
): void {
  if (
    accessType === ExamAccessType.PURCHASE &&
    !(typeof price === 'number' && price > 0)
  ) {
    throw new BadRequestException(
      'ชุดข้อสอบที่ต้องซื้อต้องระบุราคามากกว่า 0 บาท',
    );
  }
}

/**
 * TypeORM transformer for `exams.price` (decimal): mysql2 returns DECIMAL
 * as a string, the API exposes it as a number (or null).
 */
export const priceTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: unknown): number | null => toPrice(value),
};

export function toPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

/** One card of `GET /exams/mock` (no questions or answers). */
export interface MockExamItem {
  id: string;
  title: string;
  category: string;
  categoryName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  bannerImage: string | null;
  questionCount: number;
  durationMinutes: number | null;
  level: ExamLevel | null;
  accessType: ExamAccessType;
  price: number | null;
  releaseDate: Date;
  // Key of the active Pro venue of the exam's category (task 17): the web
  // links a locked purchase exam to /upgrade?venue=<key>; null = none
  venueKey: string | null;
  // Subject shown on the card (task 21): subjects.bankLabel, else its name;
  // null without a subject
  subjectLabel: string | null;
  // Banner colour (task 21): the subject's colour, else by accessType
  // (MOCK_ACCESS_COLORS); always a #hex
  color: string;
}

/** Raw row of the Mock Exam card query (ExamsService.mockExamQuery). */
export interface MockExamRow {
  id: string;
  title: string;
  category: string;
  categoryName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  bannerImage: string | null;
  questionCount: number | string | null;
  durationMinutes: number | string | null;
  level: ExamLevel | null;
  accessType: ExamAccessType | null;
  price: number | string | null;
  releaseDate: Date;
  venueKey?: string | null;
  // task 21
  subjectBankLabel?: string | null;
  subjectColor?: string | null;
  campaignStartsAt?: Date | string | null;
  campaignEndsAt?: Date | string | null;
}

/** Banner colour of a Mock Exam without a subject colour (task 21). */
export const MOCK_ACCESS_COLORS: Record<ExamAccessType, string> = {
  [ExamAccessType.FREE]: '#10b981',
  [ExamAccessType.CODE]: '#f59e0b',
  [ExamAccessType.PURCHASE]: '#6366f1',
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `color` of a card: the subject colour when it is a #hex (it ends up in a
 * style attribute), else the colour of the access type.
 */
export function mockExamColor(
  subjectColor: string | null | undefined,
  accessType: ExamAccessType,
): string {
  const color = typeof subjectColor === 'string' ? subjectColor.trim() : '';
  if (HEX_COLOR_PATTERN.test(color)) return color;
  return MOCK_ACCESS_COLORS[accessType] ?? MOCK_ACCESS_COLORS.free;
}

/** Card fields of a raw row, with numbers as numbers (DECIMAL → number). */
export function toMockExamItem(row: MockExamRow): MockExamItem {
  const accessType = row.accessType ?? ExamAccessType.FREE;
  const subjectLabel =
    (row.subjectBankLabel ?? '').trim() || (row.subjectName ?? '').trim();
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categoryName: row.categoryName ?? null,
    subjectId: row.subjectId ?? null,
    subjectName: row.subjectName ?? null,
    bannerImage: row.bannerImage ?? null,
    questionCount: Number(row.questionCount ?? 0),
    durationMinutes:
      row.durationMinutes === null || row.durationMinutes === undefined
        ? null
        : Number(row.durationMinutes),
    level: row.level ?? null,
    accessType,
    price: toPrice(row.price),
    releaseDate: row.releaseDate,
    venueKey: row.venueKey ?? null,
    subjectLabel: row.subjectId && subjectLabel ? subjectLabel : null,
    color: mockExamColor(row.subjectColor, accessType),
  };
}

/**
 * Access of the viewer to a Mock Exam (task 15), on every item of
 * `GET /exams/mock*`: `free` = accessType free; `locked` = never had access
 * (guests too); `unlocked` = has access that has not expired (expiresAt null
 * = no end); `expired` = had access, all of it ended (expiresAt = last end).
 */
export type MockExamAccessStatus = 'free' | 'locked' | 'unlocked' | 'expired';

/**
 * Where the access in effect comes from (task 17): `pro` = a Pro plan of
 * the exam's venue (mockPurchase); `code` / `purchase` / `admin` = a grant
 * in exam_access with that source (`admin` also for an admin viewer, who can
 * take every exam). The source whose end won: unlocked → the active right
 * with the latest end (no end beats any date; a grant beats Pro on a tie);
 * expired → the grant that ended last; free / locked → null.
 */
export type MockExamAccessVia = 'pro' | 'code' | 'purchase' | 'admin';

export interface MockExamAccess {
  status: MockExamAccessStatus;
  expiresAt: string | null;
  via: MockExamAccessVia | null;
}

/**
 * The logged-in viewer's latest attempt of a Mock Exam (task 21), by
 * attempt date (createdAt), abandoned attempts left out; null for guests and
 * when there is none. in_progress: `answered` = answers given so far;
 * completed: `scorePercent` = the score of that attempt (0–100).
 */
export interface MockExamProgress {
  status: 'in_progress' | 'completed';
  // 'practice' | 'exam': which page resumes it / shows its result
  mode: string;
  answered: number;
  total: number;
  scorePercent: number | null;
  attemptId: string;
}

export interface MockExamListItem extends MockExamItem {
  access: MockExamAccess;
  // task 21: null unless accessType = code
  campaign: MockExamCampaign | null;
  myProgress: MockExamProgress | null;
}

/**
 * One row of "เนื้อหาที่ออก" (task 21): questions of the exam per topic.
 * topicId null = questions without a (known) topic, named "อื่น ๆ".
 */
export interface MockExamTopicCount {
  topicId: string | null;
  name: string;
  count: number;
}

export const OTHER_TOPIC_NAME = 'อื่น ๆ';

/** `GET /exams/mock/:id`: the card fields + description + detail blocks. */
export interface MockExamDetail extends MockExamListItem {
  description: string | null;
  detailBlocks: ExamDetailBlock[];
  codeInstructions: ExamCodeInstructions | null;
  topicBreakdown: MockExamTopicCount[];
}

/** `?sort=` of GET /exams/mock (task 21); anything else = newest. */
export type MockExamSort = 'recommended' | 'newest' | 'name';
export const MOCK_EXAM_SORTS: readonly MockExamSort[] = [
  'recommended',
  'newest',
  'name',
];

export function parseMockExamSort(value: unknown): MockExamSort {
  return MOCK_EXAM_SORTS.includes(value as MockExamSort)
    ? (value as MockExamSort)
    : 'newest';
}

/** Raw row of the attempts read for `myProgress`. */
export interface MockProgressRow {
  id: string;
  examId: string;
  status: string;
  mode: string | null;
  answers: unknown;
  questionIds: unknown;
  totalQuestions: number | string | null;
  score: number | string | null;
}

/** JSON column of a raw row (MariaDB returns json as text) → value. */
function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * `myProgress` of one attempt row (rows passed newest first per exam by the
 * caller). Answers count when not null/empty, like the attempt page.
 */
export function toMockExamProgress(row: MockProgressRow): MockExamProgress {
  const answers = parseJsonColumn(row.answers);
  const answered =
    answers && typeof answers === 'object' && !Array.isArray(answers)
      ? Object.values(answers as Record<string, unknown>).filter(
          (v) => v !== null && v !== undefined && v !== '',
        ).length
      : 0;
  const questionIds = parseJsonColumn(row.questionIds);
  const totalQuestions = Number(row.totalQuestions);
  const total =
    Number.isFinite(totalQuestions) && totalQuestions > 0
      ? totalQuestions
      : Array.isArray(questionIds)
        ? questionIds.length
        : 0;
  const completed = row.status === 'completed';
  const score = Number(row.score);
  return {
    status: completed ? 'completed' : 'in_progress',
    mode: row.mode || 'practice',
    answered: total > 0 ? Math.min(answered, total) : answered,
    total,
    scorePercent: completed && Number.isFinite(score) ? score : null,
    attemptId: row.id,
  };
}

export interface PaginatedMockExams {
  items: MockExamListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** One option of the "เลือกสนามสอบ" dropdown (`GET /exams/mock/categories`). */
export interface MockExamCategory {
  name: string;
  slug: string;
  count: number;
}
