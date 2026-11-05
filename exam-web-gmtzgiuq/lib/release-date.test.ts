import {
  bangkokInputToIso,
  examReleaseDate,
  formatExamCardDate,
  formatReleaseDate,
  toBangkokInputValue,
} from './release-date';

describe('release-date — แปลงเวลาไทย ↔ ISO (task 10)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('ISO (UTC) → ค่า datetime-local เวลาไทย (+7 ชม.) รวมกรณีข้ามวัน/ข้ามปี', () => {
    expect(toBangkokInputValue('2026-11-05T07:30:00.000Z')).toBe('2026-11-05T14:30');
    expect(toBangkokInputValue('2026-11-05T20:15:59.999Z')).toBe('2026-11-06T03:15');
    expect(toBangkokInputValue('2025-12-31T17:00:00Z')).toBe('2026-01-01T00:00');
    expect(toBangkokInputValue(new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe('2026-01-01T07:00');
  });

  it('ค่าว่าง/ไม่ใช่วันที่ → ""', () => {
    expect(toBangkokInputValue('')).toBe('');
    expect(toBangkokInputValue(null)).toBe('');
    expect(toBangkokInputValue(undefined)).toBe('');
    expect(toBangkokInputValue('ไม่ใช่วันที่')).toBe('');
  });

  it('เวลาไทยจากช่อง → ISO UTC (-7 ชม.) รวมกรณีก่อน 07:00 ที่ต้องถอยวัน', () => {
    expect(bangkokInputToIso('2026-11-05T14:30')).toBe('2026-11-05T07:30:00.000Z');
    expect(bangkokInputToIso('2026-11-06T03:15')).toBe('2026-11-05T20:15:00.000Z');
    expect(bangkokInputToIso('2026-01-01T00:00')).toBe('2025-12-31T17:00:00.000Z');
    expect(bangkokInputToIso('2026-11-05T14:30:45')).toBe('2026-11-05T07:30:45.000Z');
  });

  it('ค่าที่ไม่ใช่วันเวลาที่มีจริงหรือรูปแบบผิด → null', () => {
    expect(bangkokInputToIso('')).toBeNull();
    expect(bangkokInputToIso('2026-11-05')).toBeNull();
    expect(bangkokInputToIso('2026-02-30T10:00')).toBeNull();
    expect(bangkokInputToIso('2026-11-05T24:00')).toBeNull();
    expect(bangkokInputToIso('05/11/2026 14:30')).toBeNull();
  });

  it('เปิดแก้แล้วบันทึกกลับได้ค่าเดิม (ไม่เลื่อน 7 ชม.) ไม่ว่าเครื่องจะตั้ง timezone อะไร', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Asia/Bangkok']) {
      process.env.TZ = tz;
      const iso = '2026-03-08T06:45:00.000Z';
      const input = toBangkokInputValue(iso);
      expect(input).toBe('2026-03-08T13:45');
      expect(bangkokInputToIso(input)).toBe(iso);
    }
  });

  it('examReleaseDate ใช้ releaseDate ก่อน ไม่มี/ไม่ถูกต้อง → createdAt', () => {
    expect(examReleaseDate({ releaseDate: '2026-11-05T07:30:00.000Z', createdAt: '2025-01-01T00:00:00.000Z' }))
      .toBe('2026-11-05T07:30:00.000Z');
    expect(examReleaseDate({ createdAt: '2025-01-01T00:00:00.000Z' })).toBe('2025-01-01T00:00:00.000Z');
    expect(examReleaseDate({ releaseDate: null, createdAt: '2025-01-01T00:00:00.000Z' })).toBe('2025-01-01T00:00:00.000Z');
    expect(examReleaseDate({ releaseDate: 'x', createdAt: '' })).toBeNull();
  });

  it('formatExamCardDate (การ์ดฝั่งผู้ใช้) ใช้วันเผยแพร่ตามเวลาไทย ไม่มี → createdAt', () => {
    process.env.TZ = 'UTC';
    expect(formatExamCardDate({ releaseDate: '2026-11-05T20:15:00.000Z', createdAt: '2025-01-01T00:00:00.000Z' }))
      .toBe('6 พ.ย. 69');
    expect(formatExamCardDate({ createdAt: '2025-01-01T00:00:00.000Z' })).toBe('1 ม.ค. 68');
    expect(formatExamCardDate({})).toBe('-');
  });

  it('formatReleaseDate แสดงวันเวลาไทย (พ.ศ.) ตามเวลา Asia/Bangkok', () => {
    process.env.TZ = 'UTC';
    expect(formatReleaseDate('2026-11-05T20:15:00.000Z')).toBe('6 พ.ย. 2569 03:15');
    expect(formatReleaseDate(undefined)).toBe('-');
    expect(formatReleaseDate('x')).toBe('-');
  });
});
