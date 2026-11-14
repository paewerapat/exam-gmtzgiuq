import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQbSessionDto, QbModeQueryDto } from './question-bank.dto';
import {
  UpdateSubjectDto,
  UpdateTopicDto,
} from '../../curriculum/dto/curriculum.dto';
import { CreateExamQuestionInput } from '../../exams/dto/exam.dto';

const UUID = '11111111-1111-4111-8111-111111111111';

async function errors<T extends object>(cls: new () => T, body: object) {
  const result = await validate(plainToInstance(cls, body), {
    whitelist: true,
  });
  return result.map((e) => e.property);
}

describe('Question Bank DTOs (task 20)', () => {
  it('session: subjectId + mode required; filters validated', async () => {
    await expect(
      errors(CreateQbSessionDto, { subjectId: UUID, mode: 'bank' }),
    ).resolves.toEqual([]);
    await expect(errors(CreateQbSessionDto, {})).resolves.toEqual([
      'subjectId',
      'mode',
    ]);
    await expect(
      errors(CreateQbSessionDto, {
        subjectId: UUID,
        mode: 'beyond',
        topicIds: ['x'],
        difficulties: ['hard'],
        progress: 'skipped',
        limit: 201,
      }),
    ).resolves.toEqual([
      'mode',
      'topicIds',
      'difficulties',
      'progress',
      'limit',
    ]);
  });

  it('session: ≤ 100 topics, limit 1–200', async () => {
    await expect(
      errors(CreateQbSessionDto, {
        subjectId: UUID,
        mode: 'challenge',
        topicIds: Array.from({ length: 101 }, () => UUID),
      }),
    ).resolves.toEqual(['topicIds']);
    await expect(
      errors(CreateQbSessionDto, { subjectId: UUID, mode: 'bank', limit: 0 }),
    ).resolves.toEqual(['limit']);
    await expect(
      errors(CreateQbSessionDto, {
        subjectId: UUID,
        mode: 'bank',
        limit: 200,
        difficulties: ['easy', 'medium', 'hard_challenge'],
        progress: 'wrong',
      }),
    ).resolves.toEqual([]);
  });

  it('?mode= is bank or challenge (optional)', async () => {
    await expect(errors(QbModeQueryDto, {})).resolves.toEqual([]);
    await expect(errors(QbModeQueryDto, { mode: 'x' })).resolves.toEqual([
      'mode',
    ]);
  });

  it('AC10 subject: venueId uuid, bankLabel ≤ 60; "" → null', async () => {
    const dto = plainToInstance(UpdateSubjectDto, {
      venueId: '',
      bankLabel: '  ชีวะ ',
    });
    expect(dto).toMatchObject({ venueId: null, bankLabel: 'ชีวะ' });
    await expect(validate(dto)).resolves.toEqual([]);
    await expect(
      errors(UpdateSubjectDto, {
        venueId: 'netsat',
        bankLabel: 'x'.repeat(61),
      }),
    ).resolves.toEqual(['venueId', 'bankLabel']);
  });

  it('AC10 topic: gradeLabel ≤ 30, term 1/2/null', async () => {
    await expect(
      errors(UpdateTopicDto, { gradeLabel: 'ม.4', term: 2 }),
    ).resolves.toEqual([]);
    await expect(
      errors(UpdateTopicDto, { gradeLabel: null, term: null }),
    ).resolves.toEqual([]);
    await expect(
      errors(UpdateTopicDto, { gradeLabel: 'x'.repeat(31), term: 3 }),
    ).resolves.toEqual(['gradeLabel', 'term']);
  });

  it('whitelist keeps the old curriculum fields (name/color/isActive/orderIndex)', async () => {
    const dto = plainToInstance(UpdateSubjectDto, {
      name: 'วิชา',
      color: '#fff',
      isActive: false,
      orderIndex: 2,
    });
    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
    expect(dto).toMatchObject({
      name: 'วิชา',
      color: '#fff',
      isActive: false,
      orderIndex: 2,
    });
  });

  it('exam question: isChallenge must be a boolean', async () => {
    await expect(
      errors(CreateExamQuestionInput, { question: 'ข้อ', isChallenge: true }),
    ).resolves.toEqual([]);
    await expect(
      errors(CreateExamQuestionInput, { question: 'ข้อ', isChallenge: 'yes' }),
    ).resolves.toEqual(['isChallenge']);
  });
});
