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

  describe('passages + passageId (task 08)', () => {
    const passage = (extra: Record<string, unknown> = {}) => ({
      id: 'reading-1',
      title: 'บทอ่าน',
      body: 'เนื้อหา',
      images: ['/uploads/1.png'],
      ...extra,
    });

    function withPassages(passages: unknown, passageId: unknown = 'reading-1') {
      return { ...examWith({ passageId }), passages };
    }

    async function messageOf(metatype: new () => unknown, value: unknown) {
      const error = await validate(metatype, value).catch(
        (err: BadRequestException) => err,
      );
      expect(error).toBeInstanceOf(BadRequestException);
      return JSON.stringify((error as BadRequestException).getResponse());
    }

    it('accepts valid passages and keeps passageId', async () => {
      const passages = [
        passage(),
        passage({ id: 'p_2-B', title: null, body: 'x'.repeat(100_000) }),
        passage({ id: 'img', body: null, images: undefined }),
      ];
      const result = await validate(
        CreateExamInput,
        withPassages(passages, 'p_2-B'),
      );

      expect(result.passages).toHaveLength(3);
      expect(result.passages?.[1].body).toHaveLength(100_000);
      expect(result.questions[0].passageId).toBe('p_2-B');
    });

    it('accepts a null passageId and 50 passages', async () => {
      const passages = Array.from({ length: 50 }, (_, i) =>
        passage({ id: `p${i}` }),
      );
      const result = await validate(
        CreateExamInput,
        withPassages(passages, null),
      );
      expect(result.passages).toHaveLength(50);
    });

    it.each([
      ['an id with a space', [passage({ id: 'reading 1' })], 'id บทอ่าน'],
      ['an id with a slash', [passage({ id: '../x' })], 'id บทอ่าน'],
      ['an id over 64 chars', [passage({ id: 'a'.repeat(65) })], 'id บทอ่าน'],
      ['an empty id', [passage({ id: '' })], 'id บทอ่าน'],
      [
        'a title over 255 chars',
        [passage({ title: 't'.repeat(256) })],
        'ชื่อบทอ่าน',
      ],
      [
        'a body over 100,000 chars',
        [passage({ body: 'b'.repeat(100_001) })],
        'เนื้อหาบทอ่านยาวได้ไม่เกิน 100,000',
      ],
      [
        'more than 6 images',
        [passage({ images: [1, 2, 3, 4, 5, 6, 7].map((n) => `/u/${n}.png`) })],
        'ใส่รูปบทอ่านได้ไม่เกิน 6 รูปต่อบทอ่าน',
      ],
      [
        'an empty image',
        [passage({ images: [''] })],
        'URL รูปบทอ่านต้องไม่ว่าง',
      ],
      [
        'an image URL over 255 chars',
        [passage({ images: [`/uploads/${'x'.repeat(250)}.png`] })],
        'URL รูปบทอ่านยาวได้ไม่เกิน 255',
      ],
      ['a non-string image', [passage({ images: [5] })], 'URL รูปบทอ่าน'],
      [
        'more than 50 passages',
        Array.from({ length: 51 }, (_, i) => passage({ id: `p${i}` })),
        'ใส่บทอ่านร่วมได้ไม่เกิน 50 ชุดต่อข้อสอบ',
      ],
      ['a non-array value', 'reading-1', 'บทอ่านร่วมต้องเป็นรายการ'],
    ])('rejects passages with %s (400)', async (_label, passages, message) => {
      expect(
        await messageOf(CreateExamInput, withPassages(passages)),
      ).toContain(message);
    });

    it('rejects a passageId that is not a valid id (400)', async () => {
      expect(
        await messageOf(CreateExamInput, withPassages([passage()], 'bad id!')),
      ).toContain('id บทอ่าน');
    });

    it('applies the same rules to PUT (UpdateExamInput)', async () => {
      expect(
        await messageOf(UpdateExamInput, {
          passages: [passage({ id: 'bad id' })],
        }),
      ).toContain('id บทอ่าน');
      const ok = await validate(UpdateExamInput, { passages: [passage()] });
      expect(ok.passages?.[0].id).toBe('reading-1');
    });

    describe('lineNumbers (task 09)', () => {
      it('keeps true / false / null and allows it to be omitted', async () => {
        const result = await validate(
          CreateExamInput,
          withPassages([
            passage({ lineNumbers: true }),
            passage({ id: 'p2', lineNumbers: false }),
            passage({ id: 'p3', lineNumbers: null }),
            passage({ id: 'p4' }),
          ]),
        );

        expect(result.passages?.map((p) => p.lineNumbers)).toEqual([
          true,
          false,
          null,
          undefined,
        ]);
      });

      it.each([
        ['a string', 'yes'],
        ['the string "true"', 'true'],
        ['a number', 1],
        ['an object', {}],
      ])('rejects lineNumbers as %s (400)', async (_label, lineNumbers) => {
        expect(
          await messageOf(
            CreateExamInput,
            withPassages([passage({ lineNumbers })]),
          ),
        ).toContain('การแสดงเลขบรรทัดต้องเป็น true หรือ false');
      });

      it('applies the same rule to PUT (UpdateExamInput)', async () => {
        expect(
          await messageOf(UpdateExamInput, {
            passages: [passage({ lineNumbers: 'yes' })],
          }),
        ).toContain('การแสดงเลขบรรทัดต้องเป็น true หรือ false');
        const ok = await validate(UpdateExamInput, {
          passages: [passage({ lineNumbers: true })],
        });
        expect(ok.passages?.[0].lineNumbers).toBe(true);
      });
    });
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

  describe('releaseDate (task 10)', () => {
    const exam = (extra: Record<string, unknown>) => ({
      ...examWith({}),
      ...extra,
    });

    it.each([
      '2026-11-05T03:00:00.000Z',
      '2026-11-05T10:00:00+07:00',
      '2026-11-05T10:00Z',
      '2026-11-05T03:30:00-03:30',
    ])('accepts %s and keeps it as sent', async (releaseDate) => {
      const created = await validate(CreateExamInput, exam({ releaseDate }));
      const updated = await validate(UpdateExamInput, { releaseDate });

      expect(created.releaseDate).toBe(releaseDate);
      expect(updated.releaseDate).toBe(releaseDate);
    });

    it('is optional on POST and PUT (not sent / null)', async () => {
      const created = await validate(CreateExamInput, exam({}));
      const updated = await validate(UpdateExamInput, { title: 'x' });
      const nulled = await validate(UpdateExamInput, { releaseDate: null });

      expect(created.releaseDate).toBeUndefined();
      expect(updated.releaseDate).toBeUndefined();
      expect(nulled.releaseDate).toBeNull();
    });

    it.each([
      ['not a date', 'พรุ่งนี้'],
      ['an impossible date', '2026-02-30T10:00:00Z'],
      ['no timezone (minutes)', '2026-11-05T10:00'],
      ['no timezone (seconds)', '2026-11-05T10:00:00.000'],
      ['a date only', '2026-11-05'],
      ['an offset without colon', '2026-11-05T10:00:00+0700'],
      ['an empty string', ''],
      ['a number', 1762311600000],
      ['an object', { $date: '2026-11-05' }],
    ])(
      'rejects %s with 400 and the Thai message',
      async (_label, releaseDate) => {
        const bodies: [new () => object, unknown][] = [
          [CreateExamInput, exam({ releaseDate })],
          [UpdateExamInput, { releaseDate }],
        ];
        for (const [metatype, body] of bodies) {
          const error = await validate(metatype, body).catch(
            (err: unknown) => err,
          );

          expect(error).toBeInstanceOf(BadRequestException);
          expect(
            JSON.stringify((error as BadRequestException).getResponse()),
          ).toContain('วันเผยแพร่ต้องเป็นวันที่และเวลาที่ถูกต้อง');
        }
      },
    );
  });

  describe('Mock Exam fields (task 11)', () => {
    const exam = (extra: Record<string, unknown>) => ({
      ...examWith({}),
      ...extra,
    });

    async function rejectionOf(
      metatype: new () => object,
      body: unknown,
    ): Promise<string> {
      const error = await validate(metatype, body).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      return JSON.stringify((error as BadRequestException).getResponse());
    }

    const blocks = [
      { type: 'text', text: 'บรรทัดแรก\nบรรทัดสอง' },
      { type: 'image', url: '/uploads/1700000000001-000000000000000a.png' },
      { type: 'image', url: 'https://cdn.example/banner.png' },
      { type: 'text', text: 'ท้ายสุด' },
    ];

    it('accepts every field on POST and PUT and keeps them', async () => {
      const fields = {
        isMock: true,
        accessType: 'purchase',
        price: 150.5,
        accessDays: 365,
        level: 'hard',
        detailBlocks: blocks,
      };
      const created = await validate(CreateExamInput, exam(fields));
      const updated = await validate(UpdateExamInput, fields);

      for (const result of [created, updated]) {
        expect(result).toMatchObject({
          isMock: true,
          accessType: 'purchase',
          price: 150.5,
          accessDays: 365,
          level: 'hard',
        });
        expect(result.detailBlocks).toEqual(blocks);
      }
    });

    it('all fields are optional; price/accessDays/level/detailBlocks may be null', async () => {
      const created = await validate(CreateExamInput, exam({}));
      expect(created.isMock).toBeUndefined();
      expect(created.detailBlocks).toBeUndefined();

      const cleared = await validate(UpdateExamInput, {
        price: null,
        accessDays: null,
        level: null,
        detailBlocks: null,
      });
      expect(cleared).toMatchObject({
        price: null,
        accessDays: null,
        level: null,
        detailBlocks: null,
      });
    });

    it('accepts 50 blocks and a 20,000-character text', async () => {
      const many = Array.from({ length: 50 }, () => ({
        type: 'text',
        text: 'x'.repeat(20_000),
      }));
      const result = await validate(UpdateExamInput, { detailBlocks: many });
      expect(result.detailBlocks).toHaveLength(50);
    });

    it.each([
      ['another block type', [{ type: 'video', url: '/uploads/a.mp4' }]],
      [
        'a javascript: image URL',
        [{ type: 'image', url: 'javascript:alert(1)' }],
      ],
      [
        'a data: image URL',
        [{ type: 'image', url: 'data:image/png;base64,AA' }],
      ],
      ['a relative image URL', [{ type: 'image', url: 'uploads/a.png' }]],
      ['an image without url', [{ type: 'image' }]],
      [
        'an image URL over 500 chars',
        [{ type: 'image', url: `/uploads/${'x'.repeat(492)}` }],
      ],
      ['a text block without text', [{ type: 'text' }]],
      [
        'a text over 20,000 chars',
        [{ type: 'text', text: 'x'.repeat(20_001) }],
      ],
      [
        'more than 50 blocks',
        Array.from({ length: 51 }, () => ({ type: 'text', text: 'x' })),
      ],
      ['a non-object block', ['text']],
      ['a non-array value', { type: 'text', text: 'x' }],
    ])('rejects detailBlocks with %s (400)', async (_label, detailBlocks) => {
      await rejectionOf(CreateExamInput, exam({ detailBlocks }));
      await rejectionOf(UpdateExamInput, { detailBlocks });
    });

    it.each([
      [
        'price over 100,000',
        { price: 100_000.01 },
        'ราคาต้องไม่เกิน 100,000 บาท',
      ],
      ['negative price', { price: -1 }, 'ราคาต้องไม่ติดลบ'],
      ['price with 3 decimals', { price: 1.234 }, 'ทศนิยมไม่เกิน 2 ตำแหน่ง'],
      ['price as a string', { price: '150' }, 'ราคาต้องเป็นตัวเลข'],
      ['accessDays 0', { accessDays: 0 }, '1–3650 วัน'],
      ['accessDays 3651', { accessDays: 3651 }, '1–3650 วัน'],
      ['accessDays 1.5', { accessDays: 1.5 }, 'จำนวนวันเต็ม'],
      ['unknown accessType', { accessType: 'vip' }, 'free, code หรือ purchase'],
      ['unknown level', { level: 'expert' }, 'easy, medium หรือ hard'],
      [
        'isMock as a string',
        { isMock: 'yes' },
        'Mock Exam ต้องเป็น true หรือ false',
      ],
    ])(
      'rejects %s with 400 and a Thai message',
      async (_label, fields, message) => {
        expect(await rejectionOf(CreateExamInput, exam(fields))).toContain(
          message,
        );
        expect(await rejectionOf(UpdateExamInput, fields)).toContain(message);
      },
    );
  });
});
