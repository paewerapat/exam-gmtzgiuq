import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
} from './pro-discounts.dto';
import { CheckoutDto, CheckoutQuoteQueryDto } from './pro-payments.dto';
import { CreateUnlockBatchDto } from '../../unlock-codes/dto/unlock-code.dto';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}

async function messagesOf(
  metatype: new () => unknown,
  value: unknown,
): Promise<string[]> {
  const err = await validate(metatype, value).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BadRequestException);
  return ((err as BadRequestException).getResponse() as { message: string[] })
    .message;
}

const UUID = '11111111-1111-4111-8111-111111111111';

describe('task 19 DTOs', () => {
  describe('CreateDiscountCodeDto', () => {
    const body = (extra: Record<string, unknown> = {}) => ({
      code: 'NewYear-20',
      discountType: 'percent',
      discountValue: 20,
      ...extra,
    });

    it('accepts the contract; nulls clear; unknown keys dropped (redeemedCount / createdById)', async () => {
      const dto = await validate(
        CreateDiscountCodeDto,
        body({
          description: 'ปีใหม่',
          venueId: UUID,
          planId: null,
          startsAt: '2026-12-25T00:00:00+07:00',
          endsAt: null,
          maxRedemptions: 100,
          perUserLimit: 2,
          isActive: false,
          redeemedCount: 99,
          createdById: UUID,
        }),
      );
      expect(dto).toEqual({
        code: 'NewYear-20',
        discountType: 'percent',
        discountValue: 20,
        description: 'ปีใหม่',
        venueId: UUID,
        planId: null,
        startsAt: '2026-12-25T00:00:00+07:00',
        endsAt: null,
        maxRedemptions: 100,
        perUserLimit: 2,
        isActive: false,
      });
    });

    it.each([
      ['code too short', { code: 'AB' }],
      ['code with a space', { code: 'NEW YEAR' }],
      ['code Thai', { code: 'ลดราคา' }],
      ['code too long', { code: 'A'.repeat(41) }],
      ['type', { discountType: 'free' }],
      ['value 0', { discountValue: 0 }],
      ['value not an integer', { discountValue: 1.5 }],
      ['venueId', { venueId: 'x' }],
      ['date without timezone', { startsAt: '2026-12-25T00:00:00' }],
      ['maxRedemptions 0', { maxRedemptions: 0 }],
      ['perUserLimit null', { perUserLimit: null }],
      ['isActive string', { isActive: 'yes' }],
    ])('rejects %s with Thai messages', async (_label, extra) => {
      const messages = await messagesOf(CreateDiscountCodeDto, body(extra));
      expect(messages.length).toBeGreaterThan(0);
      for (const m of messages) expect(m).toMatch(/[฀-๿]/);
    });

    it('code / type / value are required on create', async () => {
      await messagesOf(CreateDiscountCodeDto, {});
    });
  });

  it('UpdateDiscountCodeDto: everything optional; code / type / value not null', async () => {
    await expect(validate(UpdateDiscountCodeDto, {})).resolves.toEqual({});
    await expect(
      validate(UpdateDiscountCodeDto, { isActive: true, planId: null }),
    ).resolves.toEqual({ isActive: true, planId: null });
    await messagesOf(UpdateDiscountCodeDto, { code: null });
    await messagesOf(UpdateDiscountCodeDto, { discountValue: null });
  });

  it('CheckoutDto / quote query: discountCode / code optional text ≤ 100', async () => {
    await expect(
      validate(CheckoutDto, {
        planId: UUID,
        method: 'promptpay',
        discountCode: 'x',
        discountSatang: 100,
      }),
    ).resolves.toEqual({
      planId: UUID,
      method: 'promptpay',
      discountCode: 'x',
    });
    await messagesOf(CheckoutDto, {
      planId: UUID,
      method: 'promptpay',
      discountCode: 'A'.repeat(101),
    });
    await expect(
      validate(CheckoutQuoteQueryDto, { planId: UUID, code: 'NEWYEAR20' }),
    ).resolves.toEqual({ planId: UUID, code: 'NEWYEAR20' });
  });

  describe('CreateUnlockBatchDto kind / proPlanId', () => {
    const base = { name: 'PRO NETSAT', count: 5, accessDays: 7 };

    it('kind pro needs proPlanId and no exams', async () => {
      await expect(
        validate(CreateUnlockBatchDto, {
          ...base,
          kind: 'pro',
          proPlanId: UUID,
        }),
      ).resolves.toEqual({ ...base, kind: 'pro', proPlanId: UUID });
      expect(
        await messagesOf(CreateUnlockBatchDto, { ...base, kind: 'pro' }),
      ).toEqual(['กรุณาเลือกแพ็กเกจ Pro']);
    });

    it('kind exam (default) still needs exams; unknown kind → 400', async () => {
      await messagesOf(CreateUnlockBatchDto, base);
      await expect(
        validate(CreateUnlockBatchDto, { ...base, examIds: [UUID] }),
      ).resolves.toMatchObject({ examIds: [UUID] });
      expect(
        await messagesOf(CreateUnlockBatchDto, {
          ...base,
          kind: 'gift',
          examIds: [UUID],
        }),
      ).toEqual(['ประเภทแคมเปญต้องเป็น exam หรือ pro']);
    });
  });
});
