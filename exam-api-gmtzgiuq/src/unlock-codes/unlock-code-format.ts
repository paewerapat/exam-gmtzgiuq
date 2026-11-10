import { HttpException } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Code alphabet: upper-case letters and digits without the look-alikes
 * 0/O and 1/I. 32 symbols, so `byte & 31` picks one without bias.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

/** A normalized code as accepted by redeem (generated ones are 10 long). */
export const CODE_PATTERN = /^[A-Z0-9]{6,32}$/;

export const MAX_CODES_PER_BATCH = 5000;

/** Longest input redeem looks at (spaces/dashes included). */
export const MAX_TYPED_CODE_LENGTH = 100;

/** `count` random codes (may repeat; the caller dedupes). */
export function randomCodes(count: number, length = CODE_LENGTH): string[] {
  const bytes = randomBytes(count * length);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < length; j++) {
      code += CODE_ALPHABET[bytes[i * length + j] & 31];
    }
    codes.push(code);
  }
  return codes;
}

/**
 * What the user typed → the stored form: spaces and dashes (any Unicode
 * dash or space) removed, upper case. Not a plausible code → null.
 */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_TYPED_CODE_LENGTH) {
    return null;
  }
  // Unicode spaces (\s), soft hyphen, hyphen to horizontal bar, minus sign,
  // small/full-width hyphen-minus and ASCII '-'
  const code = value
    .replace(/[\s\u00AD\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]/g, '')
    .toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** For admin search: same cleanup, any length, only A–Z/0–9 kept. */
export function normalizeCodeSearch(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Escape % _ and \ for a LIKE pattern (default escape character). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── redeem errors ───────────────────────────────────────────────────────

export const REDEEM_ERRORS = {
  INVALID_FORMAT: { status: 400, message: 'รูปแบบโค้ดไม่ถูกต้อง' },
  NOT_FOUND: { status: 404, message: 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง' },
  DISABLED: { status: 403, message: 'โค้ดนี้ถูกปิดใช้งานแล้ว' },
  EXPIRED: { status: 410, message: 'โค้ดนี้หมดอายุแล้ว' },
  USED: { status: 409, message: 'โค้ดนี้ถูกใช้ไปแล้ว' },
  ALREADY_REDEEMED: {
    status: 409,
    message: 'คุณใช้โค้ดนี้ไปแล้ว ใช้ซ้ำไม่ได้',
  },
  BATCH_ALREADY_USED: {
    status: 409,
    message: 'บัญชีนี้ใช้โค้ดของแคมเปญนี้ไปแล้ว',
  },
  NOT_FOR_THIS_EXAM: {
    status: 422,
    message: 'โค้ดนี้ใช้กับชุดข้อสอบนี้ไม่ได้',
  },
  TOO_MANY_ATTEMPTS: {
    status: 429,
    message: 'กรอกโค้ดผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่',
  },
} as const;

export type RedeemErrorCode = keyof typeof REDEEM_ERRORS;

/** Error of POST /unlock-codes/redeem: `{ statusCode, message, errorCode }`. */
export class RedeemException extends HttpException {
  constructor(readonly errorCode: RedeemErrorCode) {
    const { status, message } = REDEEM_ERRORS[errorCode];
    super({ statusCode: status, message, errorCode }, status);
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** UTF-8 BOM so Excel opens Thai text correctly. */
export const CSV_BOM = '﻿';

/**
 * One CSV field: quoted when needed; a value that Excel would run as a
 * formula (= + - @ tab CR at the start; user names are user input) gets a
 * leading apostrophe.
 */
export function csvField(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: (string | null | undefined)[]): string {
  return values.map(csvField).join(',');
}

/** "YYYY-MM-DD HH:mm:ss" in Thai time (UTC+7, no daylight saving). */
export function toThaiDateTime(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

/**
 * Content-Disposition for the CSV of a campaign: an ASCII fallback name
 * plus the UTF-8 name (RFC 5987) so Thai campaign names survive.
 */
export function csvContentDisposition(batchName: string): string {
  const base = batchName
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const utf8Name = `unlock-codes-${base || 'campaign'}.csv`;
  const asciiBase = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '');
  const asciiName = `unlock-codes-${asciiBase || 'campaign'}.csv`;
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRFC5987(utf8Name)}`;
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
