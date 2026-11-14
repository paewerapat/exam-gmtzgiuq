import { strToU8 } from 'fflate';
import { buildCreateExamInput, parseImportDateTime, parseImportFile, resolveImport } from './exam-import';

function jsonFile(exam: Record<string, unknown>): Uint8Array {
  const body = JSON.stringify({
    exam: { title: 'Campaign 1', category: 'TGAT', ...exam },
    questions: [
      {
        no: 1,
        type: 'mcq',
        stem: '1+1',
        choices: [
          { label: 'A', text: '2' },
          { label: 'B', text: '3' },
        ],
        correct: 'A',
        explanation: 'ง่าย',
      },
    ],
  });
  return strToU8(body);
}

const parse = (exam: Record<string, unknown>) => parseImportFile('exam.json', jsonFile(exam));

const ctx = { categories: [], subjects: [], subjectId: null };

describe('นำเข้า — ช่วงแคมเปญ (task 21)', () => {
  it('parseImportDateTime: ไม่มี timezone = เวลาไทย / มี timezone ใช้ตามนั้น / ผิด → null', () => {
    expect(parseImportDateTime('2026-12-01 09:00')).toBe('2026-12-01T02:00:00.000Z');
    expect(parseImportDateTime('2026-12-01T09:00')).toBe('2026-12-01T02:00:00.000Z');
    expect(parseImportDateTime('2026-12-01')).toBe('2026-11-30T17:00:00.000Z');
    expect(parseImportDateTime('2026-12-01T09:00:00Z')).toBe('2026-12-01T09:00:00.000Z');
    expect(parseImportDateTime('2026-12-01T09:00:00+07:00')).toBe('2026-12-01T02:00:00.000Z');
    expect(parseImportDateTime('2026-02-30 09:00')).toBeNull();
    expect(parseImportDateTime('พรุ่งนี้')).toBeNull();
    expect(parseImportDateTime(20261201)).toBeNull();
  });

  it('N3: วันอย่างเดียว → เปิด 00:00 / ปิด 23:59:59 เวลาไทยของวันนั้น ; ปิดแบบ HH:mm นับถึงวินาทีที่ 59', () => {
    expect(parseImportDateTime('2026-12-31', 'end')).toBe('2026-12-31T16:59:59.000Z');
    expect(parseImportDateTime('2026-12-31', 'start')).toBe('2026-12-30T17:00:00.000Z');
    expect(parseImportDateTime('2026-12-31 18:00', 'end')).toBe('2026-12-31T11:00:59.000Z');
    // มีวินาที / มี timezone อยู่แล้ว → ใช้ตามที่เขียน
    expect(parseImportDateTime('2026-12-31T18:00:00', 'end')).toBe('2026-12-31T11:00:00.000Z');
    expect(parseImportDateTime('2026-12-31T23:59:00+07:00', 'end')).toBe('2026-12-31T16:59:00.000Z');
    expect(parseImportDateTime('2026-02-30', 'end')).toBeNull();

    const parsed = parse({ campaign_starts_at: '2026-12-01', campaign_ends_at: '2026-12-31' });
    expect(parsed.exam).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
    // วันเดียวกันทั้งเปิดและปิด = เปิดทั้งวัน (ไม่ถือว่าปิดก่อนเปิด)
    const sameDay = parse({ campaign_starts_at: '2026-12-01', campaign_ends_at: '2026-12-01' });
    expect(sameDay.exam).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-01T16:59:59.000Z',
    });
    expect(sameDay.fileIssues.some((i) => i.message.includes('วันปิดต้องหลังวันเปิด'))).toBe(false);
  });

  it('campaign_starts_at / campaign_ends_at → อยู่ใน exam และ payload + หมายเหตุว่ามีผลกับชุด Mock โค้ด', () => {
    const parsed = parse({ campaign_starts_at: '2026-12-01 00:00', campaign_ends_at: '2026-12-31 23:59' });
    expect(parsed.exam).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
    expect(parsed.fileIssues.some((i) => i.level === 'note' && i.message.includes('ช่วงแคมเปญมีผลเฉพาะชุด Mock'))).toBe(
      true,
    );
    const input = buildCreateExamInput(resolveImport(parsed, ctx), { category: 'tgat', subjectId: null, imageUrls: {} });
    expect(input).toMatchObject({
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: '2026-12-31T16:59:59.000Z',
    });
  });

  it('camelCase ก็ได้ / วันปิดไม่หลังวันเปิด → เตือนและไม่ตั้งทั้งคู่ / ค่าผิด → เตือนเฉพาะช่องนั้น', () => {
    const camel = parse({ campaignStartsAt: '2026-12-01T00:00:00+07:00' });
    expect(camel.exam?.campaignStartsAt).toBe('2026-11-30T17:00:00.000Z');
    expect(camel.exam?.campaignEndsAt).toBeUndefined();

    const reversed = parse({ campaign_starts_at: '2026-12-10 09:00', campaign_ends_at: '2026-12-01 09:00' });
    expect(reversed.exam?.campaignStartsAt).toBeUndefined();
    expect(reversed.exam?.campaignEndsAt).toBeUndefined();
    expect(reversed.fileIssues.some((i) => i.level === 'warning' && i.message.includes('วันปิดต้องหลังวันเปิด'))).toBe(true);
    expect(reversed.fileIssues.some((i) => i.level === 'error')).toBe(false);

    const bad = parse({ campaign_ends_at: 'xx' });
    expect(bad.exam?.campaignEndsAt).toBeUndefined();
    expect(bad.fileIssues.some((i) => i.level === 'warning' && i.message.includes('campaign_ends_at'))).toBe(true);
    const input = buildCreateExamInput(resolveImport(bad, ctx), { category: 'tgat', subjectId: null, imageUrls: {} });
    expect(input).not.toHaveProperty('campaignEndsAt');
  });

  it('M4: เปิด/ปิดนาทีเดียวกัน → เตือนและไม่ตั้ง (เทียบก่อนเติม :59 เหมือนฟอร์ม) ; ปิดหลังเปิด 1 นาทีได้', () => {
    const sameMinute = parse({ campaign_starts_at: '2026-12-01 09:00', campaign_ends_at: '2026-12-01 09:00' });
    expect(sameMinute.exam?.campaignStartsAt).toBeUndefined();
    expect(sameMinute.exam?.campaignEndsAt).toBeUndefined();
    expect(sameMinute.fileIssues.some((i) => i.level === 'warning' && i.message.includes('วันปิดต้องหลังวันเปิด'))).toBe(
      true,
    );
    // มี timezone ทั้งคู่ นาทีเดียวกัน → ผิดเหมือนกัน
    const zonedSame = parse({
      campaign_starts_at: '2026-12-01T09:00+07:00',
      campaign_ends_at: '2026-12-01T02:00Z',
    });
    expect(zonedSame.exam?.campaignEndsAt).toBeUndefined();
    expect(zonedSame.fileIssues.some((i) => i.message.includes('วันปิดต้องหลังวันเปิด'))).toBe(true);

    const nextMinute = parse({ campaign_starts_at: '2026-12-01 09:00', campaign_ends_at: '2026-12-01 09:01' });
    expect(nextMinute.exam).toMatchObject({
      campaignStartsAt: '2026-12-01T02:00:00.000Z',
      campaignEndsAt: '2026-12-01T02:01:59.000Z',
    });
    expect(nextMinute.fileIssues.some((i) => i.message.includes('วันปิดต้องหลังวันเปิด'))).toBe(false);
  });

  it('M4: วันปิดที่มี timezone แต่ไม่มีวินาที → เติม :59 เหมือนค่าที่ไม่มี timezone ; มีวินาทีแล้วใช้ตามนั้น', () => {
    expect(parseImportDateTime('2026-12-31T23:59+07:00', 'end')).toBe('2026-12-31T16:59:59.000Z');
    expect(parseImportDateTime('2026-12-31T16:59Z', 'end')).toBe('2026-12-31T16:59:59.000Z');
    expect(parseImportDateTime('2026-12-31T23:59+0700', 'end')).toBe('2026-12-31T16:59:59.000Z');
    // วันเปิดไม่เติม
    expect(parseImportDateTime('2026-12-31T23:59+07:00', 'start')).toBe('2026-12-31T16:59:00.000Z');
    expect(parseImportDateTime('2026-12-31T23:59:00+07:00', 'end')).toBe('2026-12-31T16:59:00.000Z');
    const parsed = parse({ campaign_ends_at: '2026-12-31T23:59+07:00' });
    expect(parsed.exam?.campaignEndsAt).toBe('2026-12-31T16:59:59.000Z');
  });

  it('ไม่มีช่วงในไฟล์ → exam เหมือนเดิม (ไม่มี key campaign)', () => {
    const parsed = parse({});
    expect(parsed.exam).not.toHaveProperty('campaignStartsAt');
    expect(parsed.fileIssues.some((i) => i.message.includes('ช่วงแคมเปญ'))).toBe(false);
  });
});
