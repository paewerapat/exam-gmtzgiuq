import { UploadService } from '../upload/upload.service';

/** Maximum number of images on one question (questionImages). */
export const MAX_QUESTION_IMAGES = 6;

/**
 * Maximum length of an image URL. The first image is also stored in
 * `questions.questionImage`, which is varchar(255), so every image URL
 * (question or choice) uses the same limit.
 */
export const MAX_IMAGE_URL_LENGTH = 255;

interface QuestionImagesInput {
  questionImage?: string | null;
  questionImages?: string[] | null;
}

export interface ResolvedQuestionImages {
  questionImage: string | null;
  questionImages: string[] | null;
}

/**
 * Decide the images to store for a question.
 * - `questionImages` sent as an array is authoritative (may be empty).
 * - Otherwise the legacy single `questionImage` counts as `[questionImage]`.
 * `questionImage` always mirrors the first image so readers of the single
 * field keep working; an empty list is stored as null like old rows.
 */
export function resolveQuestionImages(
  input: QuestionImagesInput,
): ResolvedQuestionImages {
  const images = Array.isArray(input.questionImages)
    ? input.questionImages.filter(
        (url): url is string => typeof url === 'string' && url !== '',
      )
    : input.questionImage
      ? [input.questionImage]
      : [];

  return {
    questionImage: images[0] ?? null,
    questionImages: images.length > 0 ? images : null,
  };
}

/**
 * Copy choices to plain objects, keeping `image` only when it is a non-empty
 * string (an empty/null image is dropped instead of stored).
 */
export function normalizeChoices<
  T extends { id: string; text: string; isCorrect: boolean; image?: unknown },
>(
  choices: T[] | null | undefined,
): Array<{ id: string; text: string; isCorrect: boolean; image?: string }> {
  if (!Array.isArray(choices)) return [];
  return choices.map((choice) => {
    const { image, ...rest } = choice;
    return typeof image === 'string' && image !== ''
      ? { ...rest, image }
      : { ...rest };
  });
}

interface StoredQuestionImages {
  questionImage?: string | null;
  questionImages?: unknown;
  choices?: unknown;
}

/**
 * Every image URL a stored question refers to: `questionImage`,
 * `questionImages[]` and `choices[].image`. Reads JSON columns tolerantly
 * (old rows have no questionImages / choice images).
 */
export function collectQuestionImageUrls(
  question: StoredQuestionImages | null | undefined,
): string[] {
  if (!question) return [];
  const urls: string[] = [];
  const add = (url: unknown) => {
    if (typeof url === 'string' && url !== '') urls.push(url);
  };

  add(question.questionImage);
  if (Array.isArray(question.questionImages)) {
    question.questionImages.forEach(add);
  }
  if (Array.isArray(question.choices)) {
    for (const choice of question.choices) {
      if (choice && typeof choice === 'object') {
        add((choice as { image?: unknown }).image);
      }
    }
  }
  return urls;
}

/**
 * Anything that runs raw SQL with `?` placeholders: DataSource,
 * EntityManager or Repository.
 */
export interface RawQueryRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Counts the places that still refer to an upload (one LIKE pattern bound 9
 * times): every question/exam image (question images, choice images, banner,
 * passage images, Mock Exam description images), blog featured image and
 * content, and user avatars.
 * JSON columns are compared as text. `!` is the LIKE escape character.
 */
export const UPLOAD_REFERENCE_SQL = `SELECT
  EXISTS(SELECT 1 FROM questions WHERE questionImage LIKE ? ESCAPE '!'
    OR CAST(questionImages AS CHAR) LIKE ? ESCAPE '!'
    OR CAST(choices AS CHAR) LIKE ? ESCAPE '!')
  + EXISTS(SELECT 1 FROM exams WHERE bannerImage LIKE ? ESCAPE '!'
    OR CAST(passages AS CHAR) LIKE ? ESCAPE '!'
    OR CAST(detailBlocks AS CHAR) LIKE ? ESCAPE '!')
  + EXISTS(SELECT 1 FROM blogs WHERE featuredImage LIKE ? ESCAPE '!'
    OR content LIKE ? ESCAPE '!')
  + EXISTS(SELECT 1 FROM users WHERE avatar LIKE ? ESCAPE '!') AS refs`;

const UPLOAD_REFERENCE_PARAM_COUNT = 9;

/** Escape LIKE wildcards (`%`, `_`) and the escape character `!`. */
export function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}

/**
 * True if any row in the database still refers to the upload `filename`.
 * Throws when the query fails or returns something unexpected, so callers
 * can keep the file (fail-safe).
 */
export async function isUploadReferenced(
  db: RawQueryRunner,
  filename: string,
): Promise<boolean> {
  const pattern = `%${escapeLike(filename)}%`;
  const rows = await db.query(
    UPLOAD_REFERENCE_SQL,
    Array<string>(UPLOAD_REFERENCE_PARAM_COUNT).fill(pattern),
  );
  const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== 'object' || !('refs' in row)) {
    throw new Error('Unexpected result from the upload reference query');
  }
  const refs = (row as { refs: unknown }).refs;
  // Only an explicit zero means "unused"; any other value counts as used
  return !(refs === 0 || refs === '0' || refs === BigInt(0));
}

/**
 * Delete the image files in `oldUrls` that are no longer used anywhere.
 * - Skips files that a URL in `inUseUrls` refers to (compared by upload
 *   filename, so the same file on a different host still counts as in use).
 * - Then asks the database whether any question, exam, blog or user still
 *   refers to the file (another exam may use the same URL); only files with
 *   no reference are deleted. A failed check keeps the file.
 * Call after the change has been committed. Deletes each file once and never
 * throws: failures are only logged.
 */
export async function deleteUnusedImages(
  uploadService: UploadService,
  db: RawQueryRunner,
  oldUrls: string[],
  inUseUrls: string[],
): Promise<void> {
  const inUse = new Set<string>();
  for (const url of inUseUrls) {
    const filename = uploadService.extractFilename(url);
    if (filename) inUse.add(filename);
  }

  const handled = new Set<string>();
  for (const url of oldUrls) {
    const filename = uploadService.extractFilename(url);
    if (!filename || inUse.has(filename) || handled.has(filename)) continue;
    handled.add(filename);

    try {
      if (await isUploadReferenced(db, filename)) continue;
    } catch (err) {
      console.error(
        `Kept image ${filename}: could not check whether it is still used`,
        err,
      );
      continue;
    }

    try {
      uploadService.deleteByUrl(url);
    } catch (err) {
      console.error(`Failed to delete question image: ${filename}`, err);
    }
  }
}
