import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateProPlanDto,
  CreateProVenueDto,
  GrantProSubscriptionDto,
  RevokeProSubscriptionDto,
  UpdateProPageDto,
  UpdateProPlanDto,
  UpdateProVenueDto,
} from './pro.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from '../../categories/dto/category.dto';
import {
  normalizeStoredComparison,
  prepareComparison,
} from '../pro-comparison';
import {
  NO_ENTITLEMENTS,
  normalizeStoredEntitlements,
  prepareEntitlements,
} from '../pro-entitlements';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}

/** The Thai messages of a rejected body. */
async function messagesOf(
  metatype: new () => unknown,
  value: unknown,
): Promise<string[]> {
  const err = await validate(metatype, value).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BadRequestException);
  const body = (err as BadRequestException).getResponse() as {
    message: string[];
  };
  return body.message;
}

const UUID = '11111111-1111-4111-8111-111111111111';

const row = (extra: Record<string, unknown> = {}) => ({
  label: 'ข้อ Challenge',
  cells: { free: { type: 'cross' }, pro: { type: 'check' } },
  ...extra,
});
const table = (rows: unknown[], groups = 1) => ({
  groups: Array.from({ length: groups }, () => ({ title: 'กลุ่ม', rows })),
});

describe('Pro DTOs (task 17)', () => {
  describe('comparison (PUT /pro/admin/venues/:id)', () => {
    it('accepts the limits exactly; keeps the object for the service; null clears', async () => {
      const ok = table(
        Array.from({ length: 50 }, () =>
          row({
            label: 'ก'.repeat(150),
            sublabel: 'ข'.repeat(200),
            cells: {
              pro: {
                type: 'text',
                text: 'ค'.repeat(50),
                subtext: 'ง'.repeat(100),
              },
            },
          }),
        ),
        20,
      );
      const result = await validate(UpdateProVenueDto, { comparison: ok });
      expect(result.comparison).toEqual(ok);

      const cleared = await validate(UpdateProVenueDto, { comparison: null });
      expect(cleared.comparison).toBeNull();
    });

    it.each([
      ['21 groups', table([row()], 21), 'ไม่เกิน 20 กลุ่ม'],
      [
        '51 rows',
        table(Array.from({ length: 51 }, () => row())),
        'ไม่เกิน 50 แถว',
      ],
      [
        'label 151',
        table([row({ label: 'ก'.repeat(151) })]),
        'ชื่อแถวยาวได้ไม่เกิน 150',
      ],
      ['blank label', table([row({ label: '  ' })]), 'กรุณาใส่ชื่อแถว'],
      [
        'sublabel 201',
        table([row({ sublabel: 'ก'.repeat(201) })]),
        'ไม่เกิน 200',
      ],
      [
        'cell text 51',
        table([
          row({ cells: { pro: { type: 'text', text: 'ก'.repeat(51) } } }),
        ]),
        'ข้อความยาวได้ไม่เกิน 50',
      ],
      [
        'cell subtext 101',
        table([
          row({ cells: { pro: { type: 'text', subtext: 'ก'.repeat(101) } } }),
        ]),
        'ข้อความรองยาวได้ไม่เกิน 100',
      ],
      [
        'unknown cell type',
        table([row({ cells: { pro: { type: 'html' } } })]),
        'type ต้องเป็น check, cross หรือ text',
      ],
      [
        'bad plan code',
        table([row({ cells: { 'PRO MAX': { type: 'check' } } })]),
        'รหัสแพ็กเกจของช่อง',
      ],
      ['groups not an array', { groups: {} }, 'groups เป็น array'],
      ['a string', 'x', 'groups เป็น array'],
      [
        'title 101',
        { groups: [{ title: 'ก'.repeat(101), rows: [] }] },
        'ชื่อกลุ่มยาวได้ไม่เกิน 100',
      ],
    ])('rejects %s with a Thai message', async (_name, comparison, part) => {
      const messages = await messagesOf(UpdateProVenueDto, { comparison });
      expect(messages.join(' | ')).toContain(part);
    });

    it('the message says where (group/row number)', async () => {
      const messages = await messagesOf(UpdateProVenueDto, {
        comparison: {
          groups: [
            { title: 'a', rows: [row()] },
            { title: 'b', rows: [row(), row({ label: '' })] },
          ],
        },
      });
      expect(messages).toEqual([
        'ตารางเปรียบเทียบ กลุ่มที่ 2: แถวที่ 2: กรุณาใส่ชื่อแถว',
      ]);
    });

    it('stored form: trimmed, unknown keys dropped, <script> kept as text', () => {
      expect(
        prepareComparison({
          groups: [
            {
              title: ' G ',
              x: 1,
              rows: [
                {
                  label: ' <script>alert(1)</script> ',
                  sublabel: ' ',
                  cells: {
                    pro: { type: 'check', text: '', extra: 1 },
                    max: { type: 'text', text: ' 6 ชุด ', subtext: 'ต่อวิชา' },
                  },
                },
              ],
            },
          ],
        }),
      ).toEqual({
        groups: [
          {
            title: 'G',
            rows: [
              {
                label: '<script>alert(1)</script>',
                cells: {
                  pro: { type: 'check' },
                  max: { type: 'text', text: '6 ชุด', subtext: 'ต่อวิชา' },
                },
              },
            ],
          },
        ],
      });
      expect(prepareComparison(null)).toBeNull();
    });

    it('stored data is read tolerantly (JSON text, junk)', () => {
      expect(normalizeStoredComparison('{bad')).toBeNull();
      expect(normalizeStoredComparison(null)).toBeNull();
      expect(
        normalizeStoredComparison(
          JSON.stringify({
            groups: [
              {
                title: 'T',
                rows: [
                  { label: '', cells: {} },
                  { label: 'ok', cells: { pro: { type: 'nope' }, a: 'x' } },
                ],
              },
              'junk',
            ],
          }),
        ),
      ).toEqual({
        groups: [{ title: 'T', rows: [{ label: 'ok', cells: {} }] }],
      });
    });
  });

  describe('plans', () => {
    const plan = (extra: Record<string, unknown> = {}) => ({
      venueId: UUID,
      code: 'pro',
      rank: 1,
      name: 'PRO',
      buttonText: 'สมัคร PRO',
      priceSatang: 19900,
      entitlements: {
        challenge: true,
        beyond: false,
        predictedSets: 2,
        solutions: true,
        analytics: true,
        mockPurchase: true,
      },
      ...extra,
    });

    it('accepts a full plan; null predictedSets; unknown entitlement keys kept', async () => {
      const result = await validate(
        CreateProPlanDto,
        plan({
          entitlements: { predictedSets: null, hardSets: 2, note: 'x' },
          tagline: null,
          junk: 'dropped',
        }),
      );
      expect(result).not.toHaveProperty('junk');
      expect(result.entitlements).toEqual({
        predictedSets: null,
        hardSets: 2,
        note: 'x',
      });
      expect(prepareEntitlements(result.entitlements)).toEqual({
        ...NO_ENTITLEMENTS,
        predictedSets: null,
        hardSets: 2,
        note: 'x',
      });
    });

    it.each([
      ['entitlements missing', { entitlements: undefined }, 'entitlements'],
      ['entitlements an array', { entitlements: [] }, 'ต้องเป็น object'],
      [
        'flag not boolean',
        { entitlements: { mockPurchase: 'yes' } },
        'mockPurchase (ชุด Mock ที่ต้องซื้อ) ต้องเป็น true หรือ false',
      ],
      [
        'predictedSets negative',
        { entitlements: { predictedSets: -1 } },
        'predictedSets',
      ],
      [
        'predictedSets decimal',
        { entitlements: { predictedSets: 1.5 } },
        'predictedSets',
      ],
      [
        'extra key with an object value',
        { entitlements: { extra: { a: 1 } } },
        'สิทธิ์ extra ต้องเป็น',
      ],
      [
        'bad extra key name',
        { entitlements: { __proto__x: true } },
        'ชื่อสิทธิ์',
      ],
      ['code upper case', { code: 'PRO' }, 'ตัวพิมพ์เล็ก'],
      ['name 51', { name: 'ก'.repeat(51) }, 'ชื่อแพ็กเกจยาวได้ไม่เกิน 50'],
      ['blank name', { name: '   ' }, 'กรุณาใส่ชื่อแพ็กเกจ'],
      ['tagline 151', { tagline: 'ก'.repeat(151) }, 'คำโปรยยาวได้ไม่เกิน 150'],
      ['badge 31', { badge: 'ก'.repeat(31) }, 'ป้ายยาวได้ไม่เกิน 30'],
      ['priceSatang decimal', { priceSatang: 199.5 }, 'ราคา (สตางค์)'],
      ['priceSatang negative', { priceSatang: -1 }, 'ราคา (สตางค์)'],
      ['periodDays 0', { periodDays: 0 }, 'ระยะเวลาต่อรอบ'],
      ['venueId not uuid', { venueId: 'netsat' }, 'รหัสสนามไม่ถูกต้อง'],
      ['highlight string', { highlight: 'true' }, 'การ์ดเด่น'],
    ])('create rejects %s (Thai)', async (_name, extra, part) => {
      const messages = await messagesOf(CreateProPlanDto, plan(extra));
      expect(messages.join(' | ')).toContain(part);
    });

    it('update: fields optional, null not allowed for required ones, venueId stripped', async () => {
      const result = await validate(UpdateProPlanDto, {
        priceSatang: 24900,
        badge: null,
        venueId: UUID,
      });
      expect(result).toEqual({ priceSatang: 24900, badge: null });
      expect(
        (await messagesOf(UpdateProPlanDto, { name: null })).join(),
      ).toContain('ชื่อแพ็กเกจ');
      expect(
        (await messagesOf(UpdateProPlanDto, { entitlements: null })).join(),
      ).toContain('entitlements');
    });

    it('stored entitlements are read tolerantly', () => {
      expect(normalizeStoredEntitlements('{"mockPurchase":true}')).toEqual({
        ...NO_ENTITLEMENTS,
        mockPurchase: true,
      });
      expect(
        normalizeStoredEntitlements({ challenge: 'yes', predictedSets: 'all' }),
      ).toEqual(NO_ENTITLEMENTS);
      expect(normalizeStoredEntitlements('{bad')).toEqual(NO_ENTITLEMENTS);
      expect(normalizeStoredEntitlements(null)).toEqual(NO_ENTITLEMENTS);
    });
  });

  describe('venues and page', () => {
    it('venue key: lower-case code; name required; description ≤ 500', async () => {
      await expect(
        validate(CreateProVenueDto, { key: 'netsat', name: 'NETSAT' }),
      ).resolves.toMatchObject({ key: 'netsat' });
      expect(
        (
          await messagesOf(CreateProVenueDto, { key: 'NET SAT', name: 'x' })
        ).join(),
      ).toContain('รหัสสนาม');
      expect(
        (await messagesOf(CreateProVenueDto, { key: 'a', name: '' })).join(),
      ).toContain('กรุณาใส่ชื่อสนาม');
      expect(
        (
          await messagesOf(CreateProVenueDto, {
            key: 'a',
            name: 'x',
            description: 'ก'.repeat(501),
          })
        ).join(),
      ).toContain('ไม่เกิน 500');
    });

    it('page: title not blank when sent; other texts nullable', async () => {
      await expect(
        validate(UpdateProPageDto, { subtitle: null, footerNote: 'x' }),
      ).resolves.toEqual({ subtitle: null, footerNote: 'x' });
      expect(
        (await messagesOf(UpdateProPageDto, { title: ' ' })).join(),
      ).toContain('กรุณาใส่หัวข้อหน้า');
      expect(
        (await messagesOf(UpdateProPageDto, { title: 'ก'.repeat(151) })).join(),
      ).toContain('ไม่เกิน 150');
    });
  });

  describe('subscriptions', () => {
    it('grant: email, plan uuid, days 1–3650, note ≤ 255', async () => {
      const base: Record<string, unknown> = {
        email: 'a@example.com',
        planId: UUID,
        days: 30,
      };
      await expect(
        validate(GrantProSubscriptionDto, base),
      ).resolves.toMatchObject({ days: 30 });
      for (const [extra, part] of [
        [{ days: 0 }, 'จำนวนวัน'],
        [{ days: 3651 }, 'จำนวนวัน'],
        [{ days: 1.5 }, 'จำนวนวัน'],
        [{ email: 'nope' }, 'รูปแบบอีเมล'],
        [{ planId: 'pro' }, 'รหัสแพ็กเกจ'],
        [{ note: 'ก'.repeat(256) }, 'หมายเหตุ'],
      ] as const) {
        const messages = await messagesOf(GrantProSubscriptionDto, {
          ...base,
          ...extra,
        });
        expect(messages.join()).toContain(part);
      }
    });

    it('revoke: note optional', async () => {
      await expect(validate(RevokeProSubscriptionDto, {})).resolves.toEqual({});
    });
  });

  describe('categories venueId (task 17)', () => {
    it('uuid or null; not sent = unchanged', async () => {
      await expect(
        validate(UpdateCategoryDto, { venueId: UUID }),
      ).resolves.toEqual({ venueId: UUID });
      await expect(
        validate(UpdateCategoryDto, { venueId: null }),
      ).resolves.toEqual({ venueId: null });
      await expect(
        validate(UpdateCategoryDto, { name: 'NETSAT MATH', junk: 1 }),
      ).resolves.toEqual({ name: 'NETSAT MATH' });
      expect(
        (await messagesOf(UpdateCategoryDto, { venueId: 'netsat' })).join(),
      ).toContain('รหัสสนามไม่ถูกต้อง');
      expect(
        (await messagesOf(UpdateCategoryDto, { name: null })).join(),
      ).toContain('ชื่อหมวดหมู่');
      await expect(
        validate(CreateCategoryDto, { name: 'A', slug: 'a', orderIndex: 2 }),
      ).resolves.toEqual({ name: 'A', slug: 'a', orderIndex: 2 });
    });
  });
});
