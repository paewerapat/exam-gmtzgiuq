import { BadRequestException } from '@nestjs/common';
import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

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
}

/** Card fields of a raw row, with numbers as numbers (DECIMAL → number). */
export function toMockExamItem(row: MockExamRow): MockExamItem {
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
    accessType: row.accessType ?? ExamAccessType.FREE,
    price: toPrice(row.price),
    releaseDate: row.releaseDate,
  };
}

/** `GET /exams/mock/:id`: the card fields + description + detail blocks. */
export interface MockExamDetail extends MockExamItem {
  description: string | null;
  detailBlocks: ExamDetailBlock[];
}

export interface PaginatedMockExams {
  items: MockExamItem[];
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
