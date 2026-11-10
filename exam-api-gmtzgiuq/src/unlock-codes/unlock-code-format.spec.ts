import {
  CODE_ALPHABET,
  CODE_LENGTH,
  RedeemException,
  csvContentDisposition,
  csvField,
  csvLine,
  normalizeCode,
  normalizeCodeSearch,
  randomCodes,
  toThaiDateTime,
} from './unlock-code-format';

describe('unlock code format (task 15)', () => {
  describe('randomCodes', () => {
    it('10 characters from the alphabet without look-alikes (0/O, 1/I)', () => {
      const codes = randomCodes(500);
      expect(codes).toHaveLength(500);
      for (const code of codes) {
        expect(code).toHaveLength(CODE_LENGTH);
        expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
      }
      expect(CODE_ALPHABET).toHaveLength(32);
      expect(new Set(CODE_ALPHABET).size).toBe(32);
      expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
    });

    it('5,000 codes are (practically) all distinct and use every symbol', () => {
      const codes = randomCodes(5000);
      expect(new Set(codes).size).toBe(5000);
      expect(new Set(codes.join('')).size).toBe(32);
    });

    it('every generated code is accepted by normalizeCode as-is', () => {
      for (const code of randomCodes(200)) {
        expect(normalizeCode(code)).toBe(code);
      }
    });
  });

  describe('normalizeCode (what the student typed)', () => {
    it('ignores case, spaces and dashes (also Unicode dashes)', () => {
      expect(normalizeCode('abcde-fghjk')).toBe('ABCDEFGHJK');
      expect(normalizeCode('  AbCdE FgHjK \n')).toBe('ABCDEFGHJK');
      expect(normalizeCode('abc–de—fg‐hjk')).toBe('ABCDEFGHJK');
      expect(normalizeCode('ab cd-ef gh-jk')).toBe('ABCDEFGHJK');
    });

    it('rejects anything that cannot be a code', () => {
      for (const bad of [
        '',
        '   ',
        'abc',
        'ABCDE#FGHJK',
        'โค้ดภาษาไทย',
        'A'.repeat(33),
        "ABC' OR 1=1",
      ]) {
        expect(normalizeCode(bad)).toBeNull();
      }
      expect(normalizeCode(null)).toBeNull();
      expect(normalizeCode(12345678)).toBeNull();
    });

    it('normalizeCodeSearch keeps only A–Z/0–9 in upper case', () => {
      expect(normalizeCodeSearch(' ab-c%_d ')).toBe('ABCD');
    });
  });

  describe('RedeemException', () => {
    it('body { statusCode, message, errorCode } with the HTTP status', () => {
      const cases: [string, number][] = [
        ['INVALID_FORMAT', 400],
        ['NOT_FOUND', 404],
        ['DISABLED', 403],
        ['EXPIRED', 410],
        ['USED', 409],
        ['ALREADY_REDEEMED', 409],
        ['BATCH_ALREADY_USED', 409],
        ['NOT_FOR_THIS_EXAM', 422],
        ['TOO_MANY_ATTEMPTS', 429],
      ];
      for (const [code, status] of cases) {
        const err = new RedeemException(code as never);
        expect(err.getStatus()).toBe(status);
        const body = err.getResponse() as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([
          'errorCode',
          'message',
          'statusCode',
        ]);
        expect(body).toMatchObject({ statusCode: status, errorCode: code });
        expect(typeof body.message).toBe('string');
      }
      expect(new RedeemException('USED').getResponse()).toMatchObject({
        message: 'โค้ดนี้ถูกใช้ไปแล้ว',
      });
    });
  });

  describe('CSV', () => {
    it('quotes commas, quotes and new lines', () => {
      expect(csvField('a,b')).toBe('"a,b"');
      expect(csvField('say "hi"')).toBe('"say ""hi"""');
      expect(csvField('line\nbreak')).toBe('"line\nbreak"');
      expect(csvField('สมชาย ใจดี')).toBe('สมชาย ใจดี');
      expect(csvField(null)).toBe('');
    });

    it('neutralizes formulas (user names are user input)', () => {
      expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
      expect(csvField('+1')).toBe("'+1");
      expect(csvField('-2')).toBe("'-2");
      expect(csvField('@cmd')).toBe("'@cmd");
      expect(csvLine(['A', '=1+1', 'b'])).toBe("A,'=1+1,b");
    });

    it('Thai time = UTC+7', () => {
      expect(toThaiDateTime(new Date('2026-11-10T17:30:05.000Z'))).toBe(
        '2026-11-11 00:30:05',
      );
      expect(toThaiDateTime(null)).toBe('');
    });

    it('file name from the campaign name: ASCII fallback + UTF-8 name', () => {
      const header = csvContentDisposition('แคมเปญ "ม.6"/2569');
      expect(header).toMatch(/^attachment; filename="unlock-codes-[^"]*\.csv"/);
      // no quote, slash or non-ASCII in the fallback name
      const fallback = /filename="([^"]*)"/.exec(header)![1];
      expect(fallback).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(fallback).toBe('unlock-codes-6_2569.csv');
      const utf8 = /filename\*=UTF-8''(.*)$/.exec(header)![1];
      expect(decodeURIComponent(utf8)).toBe('unlock-codes-แคมเปญ ม.6 2569.csv');
      expect(utf8).not.toMatch(/["\s]/);

      expect(csvContentDisposition('ทดสอบ')).toContain(
        'filename="unlock-codes-campaign.csv"',
      );
    });
  });
});
