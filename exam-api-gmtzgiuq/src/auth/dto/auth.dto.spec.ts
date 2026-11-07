import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterInput } from './auth.dto';

// Same options as the global pipe in main.ts (also applied to GraphQL args)
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate(value: unknown): Promise<RegisterInput> {
  return pipe.transform(value, {
    type: 'body',
    metatype: RegisterInput,
  }) as Promise<RegisterInput>;
}

const base = { email: 'new@example.com', password: 'secret1' };

describe('RegisterInput validation (BUG-16)', () => {
  it('accepts a registration without first/last name', async () => {
    const result = await validate(base);

    expect(result).toBeInstanceOf(RegisterInput);
    expect(result.firstName).toBeUndefined();
    expect(result.lastName).toBeUndefined();
  });

  it('accepts null names (GraphQL nullable fields)', async () => {
    await expect(
      validate({ ...base, firstName: null, lastName: null }),
    ).resolves.toBeInstanceOf(RegisterInput);
  });

  it('keeps names when they are given', async () => {
    const result = await validate({
      ...base,
      firstName: 'สมชาย',
      lastName: 'ใจดี',
    });

    expect(result.firstName).toBe('สมชาย');
    expect(result.lastName).toBe('ใจดี');
  });

  it('accepts names of exactly 100 characters (column length)', async () => {
    await expect(
      validate({ ...base, firstName: 'ก'.repeat(100), lastName: 'x' }),
    ).resolves.toBeInstanceOf(RegisterInput);
  });

  it.each([
    ['a first name over 100 characters', { firstName: 'ก'.repeat(101) }],
    ['a last name over 100 characters', { lastName: 'x'.repeat(101) }],
    ['a non-string first name', { firstName: 123 }],
    ['a non-string last name', { lastName: ['a'] }],
  ])('rejects %s', async (_label, extra) => {
    await expect(validate({ ...base, ...extra })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    ['an invalid email', { email: 'not-an-email' }],
    ['a short password', { password: '123' }],
  ])('still rejects %s', async (_label, extra) => {
    await expect(validate({ ...base, ...extra })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
