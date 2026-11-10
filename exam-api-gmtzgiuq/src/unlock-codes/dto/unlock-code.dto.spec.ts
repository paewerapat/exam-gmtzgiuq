import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateExamInput, UpdateExamInput } from '../../exams/dto/exam.dto';
import {
  normalizeStoredCodeInstructions,
  prepareCodeInstructions,
} from '../../exams/exam-mock';
import {
  CreateUnlockBatchDto,
  RedeemCodeDto,
  UpdateUnlockBatchDto,
  UpdateUnlockCodeDto,
} from './unlock-code.dto';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}

async function rejects(metatype: new () => unknown, value: unknown) {
  await expect(validate(metatype, value)).rejects.toBeInstanceOf(
    BadRequestException,
  );
}

const UUID = '11111111-1111-4111-8111-111111111111';

describe('exams codeInstructions (task 15)', () => {
  const exam = (codeInstructions: unknown) => ({
    title: 'Mock',
    category: 'tgat',
    questions: [],
    codeInstructions,
  });
  const step = (extra: Record<string, unknown> = {}) => ({
    title: 'ติดตาม LUMO',
    ...extra,
  });

  it('accepts steps with description/link and a note; drops unknown keys', async () => {
    const value = {
      steps: [
        step({
          description: 'กดติดตามเพจ',
          linkLabel: 'ไปที่เพจ',
          linkUrl: 'https://facebook.com/lumo',
          extra: 'x',
        }),
        step({ title: 'รับโค้ดทาง inbox', linkUrl: '' }),
      ],
      note: 'โค้ดมีจำนวนจำกัด',
      junk: true,
    };
    const result = await validate(CreateExamInput, exam(value));
    expect(result.codeInstructions).toEqual({
      steps: [
        {
          title: 'ติดตาม LUMO',
          description: 'กดติดตามเพจ',
          linkLabel: 'ไปที่เพจ',
          linkUrl: 'https://facebook.com/lumo',
        },
        { title: 'รับโค้ดทาง inbox', linkUrl: '' },
      ],
      note: 'โค้ดมีจำนวนจำกัด',
    });

    // PUT may clear it with null
    const cleared = await validate(UpdateExamInput, { codeInstructions: null });
    expect(cleared.codeInstructions).toBeNull();
  });

  it.each([
    ['more than 10 steps', { steps: Array.from({ length: 11 }, () => step()) }],
    ['a step without a title', { steps: [{ description: 'x' }] }],
    ['a blank title', { steps: [step({ title: '   ' })] }],
    ['a title over 100', { steps: [step({ title: 'ก'.repeat(101) })] }],
    [
      'a description over 300',
      { steps: [step({ description: 'ก'.repeat(301) })] },
    ],
    ['a link label over 40', { steps: [step({ linkLabel: 'ก'.repeat(41) })] }],
    [
      'a link over 500',
      { steps: [step({ linkUrl: `https://x.co/${'a'.repeat(490)}` })] },
    ],
    [
      'a javascript: link',
      { steps: [step({ linkUrl: 'javascript:alert(1)' })] },
    ],
    ['a data: link', { steps: [step({ linkUrl: 'data:text/html,hi' })] }],
    ['a relative link', { steps: [step({ linkUrl: '/admin' })] }],
    ['an ftp link', { steps: [step({ linkUrl: 'ftp://x.co/file' })] }],
    ['a non-string link', { steps: [step({ linkUrl: 42 })] }],
    ['a note over 300', { steps: [], note: 'ก'.repeat(301) }],
    ['steps not a list', { steps: 'x' }],
    ['not an object', 'ขั้นตอน'],
  ])('rejects %s', async (_label, value) => {
    await rejects(CreateExamInput, exam(value));
    await rejects(UpdateExamInput, { codeInstructions: value });
  });

  it('prepareCodeInstructions trims, drops blank optional fields; nothing left → null', () => {
    expect(
      prepareCodeInstructions({
        steps: [
          {
            title: '  ขั้น 1 ',
            description: ' ',
            linkLabel: '',
            linkUrl: '  https://lumo-test.com/x ',
          },
        ],
        note: '  ',
      }),
    ).toEqual({
      steps: [{ title: 'ขั้น 1', linkUrl: 'https://lumo-test.com/x' }],
    });
    expect(prepareCodeInstructions({ steps: [], note: '' })).toBeNull();
    expect(prepareCodeInstructions(null)).toBeNull();
    expect(prepareCodeInstructions({ note: 'แค่หมายเหตุ' })).toEqual({
      steps: [],
      note: 'แค่หมายเหตุ',
    });
  });

  it('normalizeStoredCodeInstructions reads tolerantly (MariaDB string, junk, bad links)', () => {
    expect(normalizeStoredCodeInstructions(null)).toBeNull();
    expect(normalizeStoredCodeInstructions('not json')).toBeNull();
    expect(normalizeStoredCodeInstructions('[1,2]')).toBeNull();
    expect(
      normalizeStoredCodeInstructions(
        JSON.stringify({
          steps: [
            { title: 'ok', linkUrl: 'javascript:alert(1)' },
            { description: 'no title' },
            'junk',
            { title: 'two', linkUrl: 'http://a.co' },
          ],
          note: 5,
        }),
      ),
    ).toEqual({
      steps: [{ title: 'ok' }, { title: 'two', linkUrl: 'http://a.co' }],
    });
  });
});

describe('unlock code DTOs (task 15)', () => {
  describe('RedeemCodeDto', () => {
    it('lets any code/examId through to the service (contract error shape there); strips extra keys', async () => {
      await expect(
        validate(RedeemCodeDto, { code: ' ab-cd ', examId: UUID, x: 1 }),
      ).resolves.toEqual({ code: ' ab-cd ', examId: UUID });
      // no ValidationPipe 400 (message array) for these any more
      await expect(
        validate(RedeemCodeDto, { code: 123, examId: 'nope' }),
      ).resolves.toEqual({ code: 123, examId: 'nope' });
      await expect(validate(RedeemCodeDto, {})).resolves.toEqual({});
    });
  });

  describe('CreateUnlockBatchDto', () => {
    const batch = (extra: Record<string, unknown> = {}) => ({
      name: 'แคมเปญ',
      examIds: [UUID],
      allMock: false,
      count: 5000,
      accessDays: 30,
      ...extra,
    });

    it('accepts the contract (with and without codeExpiresAt; allMock without examIds)', async () => {
      await expect(validate(CreateUnlockBatchDto, batch())).resolves.toEqual(
        batch(),
      );
      await expect(
        validate(
          CreateUnlockBatchDto,
          batch({ codeExpiresAt: '2026-12-31T23:59:59+07:00' }),
        ),
      ).resolves.toMatchObject({ codeExpiresAt: '2026-12-31T23:59:59+07:00' });
      await expect(
        validate(
          CreateUnlockBatchDto,
          batch({ allMock: true, examIds: undefined }),
        ),
      ).resolves.toMatchObject({ allMock: true });
    });

    it.each([
      ['no name', { name: undefined }],
      ['a blank name', { name: '   ' }],
      ['a name over 150', { name: 'ก'.repeat(151) }],
      ['no examIds without allMock', { examIds: undefined }],
      ['a bad exam id', { examIds: ['x'] }],
      ['count 0', { count: 0 }],
      ['count 5001', { count: 5001 }],
      ['count as a string', { count: '10' }],
      ['count 1.5', { count: 1.5 }],
      ['accessDays 0', { accessDays: 0 }],
      ['accessDays 3651', { accessDays: 3651 }],
      ['an expiry without timezone', { codeExpiresAt: '2026-12-31T23:59:59' }],
      ['an expiry that is not a date', { codeExpiresAt: 'พรุ่งนี้' }],
      ['allMock not boolean', { allMock: 'yes' }],
    ])('rejects %s', async (_label, extra) => {
      await rejects(CreateUnlockBatchDto, batch(extra));
    });
  });

  describe('UpdateUnlockBatchDto / UpdateUnlockCodeDto', () => {
    it('partial update; codeExpiresAt null = remove; accessDays/examIds are dropped', async () => {
      await expect(
        validate(UpdateUnlockBatchDto, {
          codeExpiresAt: null,
          accessDays: 99,
          examIds: [UUID],
        }),
      ).resolves.toEqual({ codeExpiresAt: null });
      await expect(
        validate(UpdateUnlockBatchDto, { name: 'ใหม่', isActive: false }),
      ).resolves.toEqual({ name: 'ใหม่', isActive: false });
      await rejects(UpdateUnlockBatchDto, { isActive: 'no' });
      await rejects(UpdateUnlockBatchDto, { name: '' });
      await rejects(UpdateUnlockBatchDto, { codeExpiresAt: '2026-01-01' });
    });

    it('code on/off needs a boolean', async () => {
      await expect(
        validate(UpdateUnlockCodeDto, { isActive: false }),
      ).resolves.toEqual({ isActive: false });
      await rejects(UpdateUnlockCodeDto, {});
      await rejects(UpdateUnlockCodeDto, { isActive: 'false' });
    });
  });
});
