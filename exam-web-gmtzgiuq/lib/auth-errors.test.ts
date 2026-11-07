import { AUTH_ERROR_MESSAGES, getAuthErrorMessage } from './auth-errors';

/** รูปแบบเดียวกับ CombinedGraphQLErrors ของ Apollo 4 (message รวม + errors[] จาก server) */
function gqlError(message: string, extensions: Record<string, unknown> = {}) {
  const err = new Error(message) as Error & { errors: unknown[] };
  err.errors = [{ message, extensions }];
  return err;
}

const ENGLISH = /[A-Za-z]{3,}/;

describe('getAuthErrorMessage', () => {
  it('BUG-16: "Bad Request Exception" (validation) ไม่โชว์ข้อความดิบ', () => {
    const msg = getAuthErrorMessage(
      gqlError('Bad Request Exception', {
        code: 'BAD_REQUEST',
        originalError: { message: ['firstName must be a string'], error: 'Bad Request', statusCode: 400 },
      }),
      'register',
    );
    expect(msg).not.toMatch(/Bad Request/);
    expect(msg).not.toMatch(ENGLISH);
    expect(msg).toMatch(/สมัครสมาชิกไม่สำเร็จ/);
  });

  it('validation อีเมลผิดรูปแบบ / รหัสผ่านสั้น → บอกสาเหตุเป็นไทย', () => {
    const detail = (m: string[]) =>
      gqlError('Bad Request Exception', { code: 'BAD_REQUEST', originalError: { message: m } });
    expect(getAuthErrorMessage(detail(['email must be an email']), 'register')).toBe(AUTH_ERROR_MESSAGES.invalidEmail);
    expect(
      getAuthErrorMessage(detail(['password must be longer than or equal to 6 characters']), 'register'),
    ).toBe(AUTH_ERROR_MESSAGES.passwordTooShort);
    expect(
      getAuthErrorMessage(detail(['newPassword must be longer than or equal to 6 characters']), 'resetPassword'),
    ).toBe(AUTH_ERROR_MESSAGES.passwordTooShort);
    expect(
      getAuthErrorMessage(detail(['firstName must be shorter than or equal to 100 characters']), 'register'),
    ).toBe(AUTH_ERROR_MESSAGES.nameTooLong);
  });

  it('อีเมลซ้ำ: ข้อความจาก API (ไทย/อังกฤษ) → สาเหตุ + วิธีแก้; ข้อความไทยอื่นของ API ใช้ตามนั้น', () => {
    expect(getAuthErrorMessage(gqlError('อีเมลนี้ถูกใช้งานแล้ว'), 'register')).toBe(AUTH_ERROR_MESSAGES.emailTaken);
    const google = 'อีเมลนี้ลงทะเบียนด้วย Google กรุณาเข้าสู่ระบบด้วย Google';
    expect(getAuthErrorMessage(gqlError(google), 'register')).toBe(google);
    expect(getAuthErrorMessage(gqlError('Email already exists'), 'register')).toBe(AUTH_ERROR_MESSAGES.emailTaken);
    expect(getAuthErrorMessage(new Error("ER_DUP_ENTRY: Duplicate entry 'a@b.c'"), 'register')).toBe(
      AUTH_ERROR_MESSAGES.emailTaken,
    );
  });

  it('"duplicate"/"already exists" นอกหน้าสมัคร ไม่แปลเป็นอีเมลซ้ำ (ใช้ข้อความ fallback ของหน้านั้น)', () => {
    const resetMsg = getAuthErrorMessage(new Error('Duplicate request'), 'resetPassword');
    expect(resetMsg).not.toBe(AUTH_ERROR_MESSAGES.emailTaken);
    expect(resetMsg).toBe(getAuthErrorMessage(undefined, 'resetPassword'));
    const verifyMsg = getAuthErrorMessage(gqlError('Token already exists'), 'verifyEmail');
    expect(verifyMsg).not.toBe(AUTH_ERROR_MESSAGES.emailTaken);
    expect(verifyMsg).toBe(getAuthErrorMessage(undefined, 'verifyEmail'));
  });

  it('token รีเซ็ตรหัสผ่าน / ยืนยันอีเมล ผิดหรือหมดอายุ → ไทย', () => {
    expect(getAuthErrorMessage(gqlError('Invalid reset token'), 'resetPassword')).toBe(
      AUTH_ERROR_MESSAGES.invalidResetToken,
    );
    expect(getAuthErrorMessage(gqlError('Reset token has expired'), 'resetPassword')).toBe(
      AUTH_ERROR_MESSAGES.expiredResetToken,
    );
    expect(getAuthErrorMessage(gqlError('Invalid verification token'), 'verifyEmail')).toBe(
      AUTH_ERROR_MESSAGES.invalidVerifyToken,
    );
    expect(getAuthErrorMessage(gqlError('Verification token has expired'), 'verifyEmail')).toBe(
      AUTH_ERROR_MESSAGES.expiredVerifyToken,
    );
  });

  it('เชื่อมต่อไม่ได้ → ข้อความ network ภาษาไทย', () => {
    expect(getAuthErrorMessage(new TypeError('Failed to fetch'), 'register')).toBe(AUTH_ERROR_MESSAGES.network);
  });

  it('error อังกฤษที่ไม่รู้จัก / ไม่ใช่ Error → ข้อความไทยตามบริบท', () => {
    for (const ctx of ['register', 'resetPassword', 'verifyEmail'] as const) {
      const msg = getAuthErrorMessage(new Error('Internal server error'), ctx);
      expect(msg).not.toMatch(ENGLISH);
      expect(getAuthErrorMessage(undefined, ctx)).toBe(msg);
    }
  });
});
