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

// ── ช่วงแคมเปญ (task 21) ────────────────────────────────────
// POST /attempts/start และ POST /attempts ตอบ 403, POST /unlock-codes/redeem ตอบ 400 เมื่อชุดโค้ดอยู่นอกช่วงแคมเปญ
export const CAMPAIGN_NOT_OPEN = 'CAMPAIGN_NOT_OPEN';
export const CAMPAIGN_ENDED = 'CAMPAIGN_ENDED';
export type CampaignClosedCode = typeof CAMPAIGN_NOT_OPEN | typeof CAMPAIGN_ENDED;

export const CAMPAIGN_CLOSED_MESSAGES: Record<CampaignClosedCode, string> = {
  CAMPAIGN_NOT_OPEN: 'แคมเปญนี้ยังไม่เปิด เริ่มทำได้เมื่อแคมเปญเปิด',
  CAMPAIGN_ENDED: 'แคมเปญนี้จบแล้ว เริ่มทำใหม่ไม่ได้',
};

/** กด "เริ่มทำใหม่" บนแคมเปญที่จบแล้วแต่มี attempt ค้าง → ทำ attempt เดิมต่อแทน (task 21 M3) */
export const CAMPAIGN_ENDED_RESUME_TEXT = 'แคมเปญจบแล้ว เริ่มใหม่ไม่ได้ ทำต่อจากที่ค้างไว้ได้';

/** รหัสแคมเปญปิด (ยังไม่เปิด / จบแล้ว) จาก ApiError — อย่างอื่น → null */
export function campaignClosedCode(err: unknown): CampaignClosedCode | null {
  if (!(err instanceof ApiError)) return null;
  return err.errorCode === CAMPAIGN_NOT_OPEN || err.errorCode === CAMPAIGN_ENDED ? err.errorCode : null;
}
