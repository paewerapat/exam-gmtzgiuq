import { BadRequestException } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';

/** Allowed passage ids (client generated, unique within one exam). */
export const PASSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PASSAGES_PER_EXAM = 50;
export const MAX_PASSAGE_TITLE_LENGTH = 255;
export const MAX_PASSAGE_BODY_LENGTH = 100_000;

/**
 * Shared reading passage (text, dialogue, table, situation) used by several
 * questions of the same exam. Stored as JSON in `exams.passages`;
 * questions refer to it with `questions.passageId`.
 */
@ObjectType()
export class ExamPassage {
  @Field()
  id: string;

  @Field(() => String, { nullable: true })
  title: string | null;

  @Field(() => String, { nullable: true })
  body: string | null;

  @Field(() => [String])
  images: string[];
}

interface PassageInput {
  id: string;
  title?: string | null;
  body?: string | null;
  images?: string[] | null;
}

interface QuestionPassageRef {
  passageId?: string | null;
}

const nonEmptyStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v !== '')
    : [];

/**
 * Read `exams.passages` tolerantly: null/malformed JSON becomes [] and
 * entries without a string id are skipped.
 */
export function normalizeStoredPassages(value: unknown): ExamPassage[] {
  if (!Array.isArray(value)) return [];
  const passages: ExamPassage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || p.id === '') continue;
    passages.push({
      id: p.id,
      title: typeof p.title === 'string' && p.title !== '' ? p.title : null,
      body: typeof p.body === 'string' && p.body !== '' ? p.body : null,
      images: nonEmptyStrings(p.images),
    });
  }
  return passages;
}

/** Every image URL used by the passages (`passages[].images`). */
export function collectPassageImageUrls(passages: unknown): string[] {
  return normalizeStoredPassages(passages).flatMap((p) => p.images);
}

/**
 * Check the rules the DTO cannot express on its own and return the passages
 * to store. Throws 400 (Thai message) when:
 * - two passages share an id
 * - a passage has neither body nor images
 * - a question refers to a passage id that is not in `passages`
 */
export function preparePassages(
  passages: PassageInput[] | null | undefined,
  questions: QuestionPassageRef[],
): ExamPassage[] {
  const prepared: ExamPassage[] = [];
  const ids = new Set<string>();

  (passages ?? []).forEach((passage, index) => {
    const label = `บทอ่านที่ ${index + 1}`;
    if (ids.has(passage.id)) {
      throw new BadRequestException(
        `${label}: id "${passage.id}" ซ้ำกับบทอ่านอื่นในข้อสอบนี้`,
      );
    }
    ids.add(passage.id);

    const body =
      typeof passage.body === 'string' && passage.body.trim() !== ''
        ? passage.body
        : null;
    const images = nonEmptyStrings(passage.images);
    if (body === null && images.length === 0) {
      throw new BadRequestException(
        `${label}: ต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง`,
      );
    }

    prepared.push({
      id: passage.id,
      title:
        typeof passage.title === 'string' && passage.title.trim() !== ''
          ? passage.title
          : null,
      body,
      images,
    });
  });

  questions.forEach((question, index) => {
    const ref = question.passageId;
    if (ref && !ids.has(ref)) {
      throw new BadRequestException(
        `ข้อ ${index + 1}: ไม่พบบทอ่าน "${ref}" ในข้อสอบนี้`,
      );
    }
  });

  return prepared;
}
