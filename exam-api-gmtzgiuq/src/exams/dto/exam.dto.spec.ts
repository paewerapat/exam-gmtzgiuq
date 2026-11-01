import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateExamInput, UpdateExamInput } from './exam.dto';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}

function examWith(question: Record<string, unknown>) {
  return {
    title: 'ชุดที่ 1',
    category: 'physics',
    questions: [{ question: 'ข้อ 1', ...question }],
  };
}

const choice = (extra: Record<string, unknown> = {}) => ({
  id: 'a',
  text: '',
  isCorrect: true,
  ...extra,
});

describe('CreateExamInput / UpdateExamInput validation (task 07)', () => {
  it('accepts up to 6 question images and choice images, and keeps them', async () => {
    const images = [1, 2, 3, 4, 5, 6].map((n) => `/uploads/${n}.png`);
    const result = await validate(
      CreateExamInput,
      examWith({
        questionImages: images,
        choices: [choice({ image: '/uploads/a.png' }), choice({ id: 'b' })],
      }),
    );

    expect(result.questions[0].questionImages).toEqual(images);
    expect(result.questions[0].choices?.[0].image).toBe('/uploads/a.png');
  });

  it('accepts the legacy questionImage alone and a null choice image', async () => {
    const result = await validate(
      CreateExamInput,
      examWith({
        questionImage: 'https://cdn.example/old.png',
        choices: [choice({ image: null, text: 'A' })],
      }),
    );

    expect(result.questions[0].questionImage).toBe(
      'https://cdn.example/old.png',
    );
  });

  it.each([
    ['more than 6 images', [1, 2, 3, 4, 5, 6, 7].map((n) => `/u/${n}.png`)],
    ['a non-string image', ['/u/1.png', 42]],
    ['an empty image', ['']],
    ['an image URL over 255 chars', [`/uploads/${'x'.repeat(250)}.png`]],
    ['a non-array value', '/uploads/1.png'],
  ])('rejects questionImages with %s (400)', async (_label, questionImages) => {
    await expect(
      validate(CreateExamInput, examWith({ questionImages })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a choice image that is not a string or is too long (400)', async () => {
    await expect(
      validate(CreateExamInput, examWith({ choices: [choice({ image: 1 })] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(
        CreateExamInput,
        examWith({ choices: [choice({ image: 'x'.repeat(256) })] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the same rules to PUT (UpdateExamInput)', async () => {
    await expect(
      validate(UpdateExamInput, {
        questions: [
          {
            question: 'ข้อ 1',
            questionImages: [1, 2, 3, 4, 5, 6, 7].map((n) => `/u/${n}.png`),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the Thai message for too many images', async () => {
    const error = await validate(
      CreateExamInput,
      examWith({
        questionImages: [1, 2, 3, 4, 5, 6, 7].map((n) => `/u/${n}.png`),
      }),
    ).catch((err: BadRequestException) => err);

    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('ใส่รูปโจทย์ได้ไม่เกิน 6 รูปต่อข้อ');
  });
});
