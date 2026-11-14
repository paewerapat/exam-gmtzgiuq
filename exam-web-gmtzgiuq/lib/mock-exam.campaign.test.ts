import {
  campaignWindowError,
  createMockExamForm,
  mockFormFromExam,
  mockFormHasSettings,
  toMockExamInput,
  validateMockForm,
} from './mock-exam';
import { campaignDateSegments, segmentsToText } from './free-mock';

const codeForm = (patch: Partial<ReturnType<typeof createMockExamForm>> = {}) => ({
  ...createMockExamForm(),
  isMock: true,
  accessType: 'code' as const,
  ...patch,
});

describe('ช่วงแคมเปญในฟอร์มแอดมิน (task 21)', () => {
  it('campaignWindowError: ว่างได้, ค่าผิดรูป, ปิดต้องหลังเปิด', () => {
    expect(campaignWindowError({ campaignStartsAt: '', campaignEndsAt: '' })).toBeNull();
    expect(campaignWindowError({ campaignStartsAt: '2026-12-01T00:00', campaignEndsAt: '' })).toBeNull();
    expect(campaignWindowError({ campaignStartsAt: '2026-02-30T00:00', campaignEndsAt: '' })).toBe(
      'ช่วงแคมเปญ: วัน-เวลาเปิดไม่ถูกต้อง',
    );
    expect(campaignWindowError({ campaignStartsAt: '', campaignEndsAt: 'x' })).toBe('ช่วงแคมเปญ: วัน-เวลาปิดไม่ถูกต้อง');
    expect(campaignWindowError({ campaignStartsAt: '2026-12-01T10:00', campaignEndsAt: '2026-12-01T09:59' })).toBe(
      'ช่วงแคมเปญ: วัน-เวลาปิดต้องหลังวัน-เวลาเปิด',
    );
  });

  it('validateMockForm ตรวจช่วงเฉพาะชุดโค้ด', () => {
    const bad = { campaignStartsAt: '2026-12-02T00:00', campaignEndsAt: '2026-12-01T00:00' };
    expect(validateMockForm(codeForm(bad))).toBe('ช่วงแคมเปญ: วัน-เวลาปิดต้องหลังวัน-เวลาเปิด');
    expect(validateMockForm({ ...codeForm(bad), accessType: 'free' })).toBeNull();
  });

  it('toMockExamInput: เวลาไทย → ISO UTC / ว่าง → null / ชุดที่ไม่ตรวจและปิดไม่หลังเปิด → ไม่ส่งวันปิด', () => {
    expect(
      toMockExamInput(codeForm({ campaignStartsAt: '2026-12-01T00:00', campaignEndsAt: '2026-12-31T23:59' })),
    ).toMatchObject({ campaignStartsAt: '2026-11-30T17:00:00.000Z', campaignEndsAt: '2026-12-31T16:59:59.000Z' });
    expect(toMockExamInput(codeForm())).toMatchObject({ campaignStartsAt: null, campaignEndsAt: null });
    expect(
      toMockExamInput({
        ...createMockExamForm(),
        campaignStartsAt: '2026-12-02T00:00',
        campaignEndsAt: '2026-12-01T00:00',
      }),
    ).toMatchObject({ campaignStartsAt: '2026-12-01T17:00:00.000Z', campaignEndsAt: null });
  });

  it('N3: วันปิด HH:mm ส่งเป็น HH:mm:59 / แก้ไขย้อนกลับยังแสดง 23:59 / บรรทัดวันที่ยังซ่อนเวลา 23:59 (R8)', () => {
    const input = toMockExamInput(codeForm({ campaignEndsAt: '2026-11-30T23:59' }));
    expect(input.campaignEndsAt).toBe('2026-11-30T16:59:59.000Z');
    // วันเปิดไม่เติมวินาที
    expect(toMockExamInput(codeForm({ campaignStartsAt: '2026-11-01T00:00' })).campaignStartsAt).toBe(
      '2026-10-31T17:00:00.000Z',
    );
    // โหลดกลับเข้าฟอร์ม → 23:59 (ส่งซ้ำได้ค่าเดิม)
    const back = mockFormFromExam({ isMock: true, accessType: 'code', campaignEndsAt: input.campaignEndsAt });
    expect(back.campaignEndsAt).toBe('2026-11-30T23:59');
    expect(toMockExamInput(codeForm({ campaignEndsAt: back.campaignEndsAt })).campaignEndsAt).toBe(input.campaignEndsAt);
    // R8: ปิด 23:59(:59) ไม่ต่อเวลา / เวลาอื่นยังแสดง
    const open = (endsAt: string) =>
      segmentsToText(
        campaignDateSegments(
          { status: 'open', startsAt: null, endsAt, daysLeft: 22, daysUntilOpen: null },
          new Date('2026-11-08T05:00:00.000Z'),
        ),
      );
    expect(open(input.campaignEndsAt!)).not.toMatch(/23:59/);
    expect(open(toMockExamInput(codeForm({ campaignEndsAt: '2026-11-30T18:00' })).campaignEndsAt!)).toMatch(/18:00 น\./);
  });

  it('mockFormFromExam: ISO → datetime-local เวลาไทย / mockFormHasSettings นับช่วงด้วย', () => {
    const form = mockFormFromExam({
      isMock: true,
      accessType: 'code',
      campaignStartsAt: '2026-11-30T17:00:00.000Z',
      campaignEndsAt: null,
    });
    expect(form.campaignStartsAt).toBe('2026-12-01T00:00');
    expect(form.campaignEndsAt).toBe('');
    expect(mockFormHasSettings({ ...createMockExamForm(), campaignEndsAt: '2026-12-01T00:00' })).toBe(true);
  });
});
