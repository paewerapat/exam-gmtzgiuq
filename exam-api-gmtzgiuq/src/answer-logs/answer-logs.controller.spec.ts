import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AnswerLogsController } from './answer-logs.controller';
import { AnswerLogsService } from './answer-logs.service';
import { CreateAnswerLogsDto } from './dto/answer-log.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate(body: unknown): Promise<CreateAnswerLogsDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: CreateAnswerLogsDto,
  }) as Promise<CreateAnswerLogsDto>;
}

const ID = '3b1d376b-0139-425d-81e7-70e92e4b5fb7';
const item = (extra: Record<string, unknown> = {}) => ({
  questionId: ID,
  selected: 'b',
  timeSpentSec: 12,
  mode: 'practice',
  ...extra,
});

describe('POST /answer-logs (task 16)', () => {
  it('AC10 needs a logged-in user (JwtAuthGuard → 401 without a token) and answers 200', () => {
    const handler = Object.getOwnPropertyDescriptor(
      AnswerLogsController.prototype,
      'create',
    )?.value as object;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('passes the logged-in user and the items to the service', async () => {
    const logPractice = jest.fn().mockResolvedValue({ saved: 1 });
    const controller = new AnswerLogsController({
      logPractice,
    } as unknown as AnswerLogsService);
    const user = { id: 'user-a' } as User;
    const body = await validate({ items: [item()] });

    await expect(controller.create(body, { user })).resolves.toEqual({
      saved: 1,
    });
    expect(logPractice).toHaveBeenCalledWith(user, body.items);
  });

  describe('body validation', () => {
    it('accepts 1–200 items and drops fields the server works out', async () => {
      const body = await validate({
        items: [
          item({ isCorrect: true, examId: ID, isFirstAttempt: true }),
          ...Array.from({ length: 199 }, () => item()),
        ],
      });
      expect(body.items).toHaveLength(200);
      expect(body.items[0]).toEqual(item());
    });

    it.each([
      ['mode exam', { items: [item({ mode: 'exam' })] }],
      ['mode preview', { items: [item({ mode: 'preview' })] }],
      ['no mode', { items: [item({ mode: undefined })] }],
      ['more than 200 items', { items: Array.from({ length: 201 }, item) }],
      ['no items', { items: [] }],
      ['items not an array', { items: item() }],
      ['no body items', {}],
      ['an item that is not an object', { items: ['b'] }],
      ['a non-uuid questionId', { items: [item({ questionId: 'q1' })] }],
      ['an empty selected', { items: [item({ selected: '' })] }],
      ['selected over 500', { items: [item({ selected: 'a'.repeat(501) })] }],
      ['a non-string selected', { items: [item({ selected: 3 })] }],
      ['a negative time', { items: [item({ timeSpentSec: -1 })] }],
      ['a fractional time', { items: [item({ timeSpentSec: 1.5 })] }],
      ['a time as text', { items: [item({ timeSpentSec: '5' })] }],
    ])('%s → 400', async (_, body) => {
      await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts selected of exactly 500 characters and time 0', async () => {
      await expect(
        validate({
          items: [item({ selected: 'a'.repeat(500), timeSpentSec: 0 })],
        }),
      ).resolves.toBeDefined();
    });
  });
});
