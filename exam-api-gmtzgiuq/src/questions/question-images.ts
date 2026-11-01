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
 * Delete the image files in `oldUrls` that no URL in `inUseUrls` refers to.
 * Compares by upload filename (not full URL) so the same file served from a
 * different host still counts as in use, and deletes each file once.
 * Never throws: a failed delete is only logged.
 */
export function deleteUnusedImages(
  uploadService: UploadService,
  oldUrls: string[],
  inUseUrls: string[],
): void {
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
      uploadService.deleteByUrl(url);
    } catch (err) {
      console.error(`Failed to delete question image: ${filename}`, err);
    }
  }
}
