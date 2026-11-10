// error จาก API แบบมี errorCode (task 15): `{ statusCode, message: <ไทย>, errorCode }`
// ใช้แยกกรณีบนหน้าเว็บ (เช่น EXAM_LOCKED, รหัส error ของการกรอกโค้ด) โดยไม่ต้องเทียบข้อความ

export const EXAM_LOCKED = 'EXAM_LOCKED';

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;

  constructor(message: string, status: number, errorCode: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** response ที่ไม่ ok → ApiError (message จาก API ถ้ามี — array ของ class-validator รวมด้วย ", ") */
export async function toApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const data: unknown = await response.json().catch(() => null);
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const raw = body.message;
  const message = Array.isArray(raw)
    ? raw.filter((m) => typeof m === 'string').join(', ')
    : typeof raw === 'string'
      ? raw
      : '';
  const errorCode = typeof body.errorCode === 'string' && body.errorCode ? body.errorCode : null;
  return new ApiError(message || fallbackMessage, response.status, errorCode);
}

/** ชุดข้อสอบนี้ต้อง Unlock ก่อน (ไม่มีสิทธิ์ / สิทธิ์หมดอายุ / guest) */
export function isExamLockedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.errorCode === EXAM_LOCKED;
}
