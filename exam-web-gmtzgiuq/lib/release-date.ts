// วันเผยแพร่ (releaseDate) ของชุดข้อสอบ — API เก็บ/คืนเป็น ISO 8601 (UTC)
// ฟอร์มแอดมินแสดงและรับค่าเป็นเวลาไทยเสมอ ไม่ขึ้นกับ timezone ของเครื่องที่เปิดหน้าเว็บ

export const RELEASE_DATE_TIME_ZONE = 'Asia/Bangkok';

/** ไทย UTC+7 ไม่มี daylight saving จึงใช้ offset คงที่ได้ */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO / Date → ค่า `datetime-local` (`YYYY-MM-DDTHH:mm`) ตามเวลาไทย ค่าไม่ถูกต้อง → '' */
export function toBangkokInputValue(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const bkk = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return (
    `${bkk.getUTCFullYear()}-${pad(bkk.getUTCMonth() + 1)}-${pad(bkk.getUTCDate())}` +
    `T${pad(bkk.getUTCHours())}:${pad(bkk.getUTCMinutes())}`
  );
}

/** ค่า `datetime-local` ที่เป็นเวลาไทย → ISO 8601 (UTC) ค่าว่าง/ไม่ใช่วันเวลาที่มีจริง → null */
export function bangkokInputToIso(value: string): string | null {
  const m = INPUT_PATTERN.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  // Date.UTC ปัดค่าที่เกิน (เช่น 31 เม.ย.) ไปวันถัดไป → ถือว่าไม่ถูกต้อง
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return new Date(utcMs - BANGKOK_OFFSET_MS).toISOString();
}

/** วันที่ใช้จัดลำดับ/แสดงของชุดข้อสอบ: releaseDate ถ้ามี ไม่งั้น createdAt (ข้อมูลจาก API เก่า) */
export function examReleaseDate(exam: { releaseDate?: string | null; createdAt?: string | null }): string | null {
  if (exam.releaseDate && toDate(exam.releaseDate)) return exam.releaseDate;
  if (exam.createdAt && toDate(exam.createdAt)) return exam.createdAt;
  return null;
}

/** วันที่บนการ์ดชุดข้อสอบฝั่งผู้ใช้ เช่น "5 พ.ย. 69" (วันเผยแพร่ ไม่มี → createdAt) ไม่มีทั้งคู่ → '-' */
export function formatExamCardDate(exam: { releaseDate?: string | null; createdAt?: string | null }): string {
  const d = toDate(examReleaseDate(exam));
  if (!d) return '-';
  return d.toLocaleDateString('th-TH', {
    timeZone: RELEASE_DATE_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

/** แสดงวันเวลาแบบไทย เช่น "5 พ.ย. 2569 14:30" (เวลาไทย) ค่าไม่ถูกต้อง → '-' */
export function formatReleaseDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleString('th-TH', {
    timeZone: RELEASE_DATE_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
