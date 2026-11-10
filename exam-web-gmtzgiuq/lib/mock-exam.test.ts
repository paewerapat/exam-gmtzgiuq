import {
  createDetailBlock,
  createMockExamForm,
  detailBlockImageHolders,
  formatMockContext,
  formatMockMeta,
  formatPrice,
  getExamBackLink,
  getMockAccessBadge,
  getMockPriceLabel,
  getMockPrimaryAction,
  isAllowedDetailImageUrl,
  mockCategoryLabel,
  mockFormFromExam,
  mockFormHasSettings,
  normalizeDetailBlocks,
  parsePrice,
  resolveUploadUrl,
  toMockExamInput,
  validateMockForm,
  type MockExamForm,
} from './mock-exam';

const mockForm = (patch: Partial<MockExamForm> = {}): MockExamForm => ({
  ...createMockExamForm(),
  isMock: true,
  ...patch,
});

describe('parsePrice / formatPrice', () => {
  it('รับได้ทั้ง number และ string จาก decimal', () => {
    expect(parsePrice(150)).toBe(150);
    expect(parsePrice('150.00')).toBe(150);
    expect(parsePrice(' 99.5 ')).toBe(99.5);
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice(Number.NaN)).toBeNull();
  });

  it('จำนวนเต็มไม่มีทศนิยม มีเศษแสดง 2 ตำแหน่ง', () => {
    expect(formatPrice(150)).toBe('150');
    expect(formatPrice(1500)).toBe('1,500');
    expect(formatPrice(1234.5)).toBe('1,234.50');
  });
});

describe('getMockAccessBadge', () => {
  it('free → ฟรี / code → Campaign / purchase → "<ราคา> บาท"', () => {
    expect(getMockAccessBadge({ accessType: 'free' })).toEqual({ label: 'ฟรี', tone: 'free' });
    expect(getMockAccessBadge({ accessType: 'code' })).toEqual({ label: 'Campaign', tone: 'campaign' });
    expect(getMockAccessBadge({ accessType: 'purchase', price: '150.00' })).toEqual({ label: '150 บาท', tone: 'price' });
    expect(getMockAccessBadge({ accessType: 'purchase', price: 1234.5 }).label).toBe('1,234.50 บาท');
  });

  it('accessType ไม่มี/ไม่รู้จัก → ฟรี (ค่าเริ่มต้นของ API)', () => {
    expect(getMockAccessBadge({}).label).toBe('ฟรี');
    expect(getMockAccessBadge({ accessType: 'weird' }).label).toBe('ฟรี');
  });

  it('สิทธิ์ของบัญชี (task 15): unlocked → Unlocked, locked/expired → ป้ายเดิม, ชุดฟรี → ฟรีเสมอ', () => {
    expect(getMockAccessBadge({ accessType: 'code' }, { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' })).toEqual({ label: 'Unlocked', tone: 'unlocked' });
    expect(getMockAccessBadge({ accessType: 'purchase', price: 150 }, { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' }).label).toBe('Unlocked');
    expect(getMockAccessBadge({ accessType: 'code' }, { status: 'locked', expiresAt: null }).label).toBe('Campaign');
    expect(getMockAccessBadge({ accessType: 'code' }, { status: 'expired', expiresAt: '2026-01-01T00:00:00.000Z' }).label).toBe(
      'Campaign',
    );
    expect(getMockAccessBadge({ accessType: 'purchase', price: 150 }, { status: 'expired', expiresAt: null }).label).toBe(
      '150 บาท',
    );
    expect(getMockAccessBadge({ accessType: 'free' }, { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' }).label).toBe('ฟรี');
  });

  it('ไม่มีคำว่า ปลดล็อก', () => {
    const labels = [
      getMockAccessBadge({ accessType: 'code' }, { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' }).label,
      getMockPrimaryAction({ id: 'x', accessType: 'code' }).label,
      (getMockPrimaryAction({ id: 'x', accessType: 'code' }) as { note: string }).note,
    ];
    for (const l of labels) expect(l).not.toMatch(/ปลดล็อก/);
  });
});

describe('getMockPriceLabel', () => {
  it('ฟรี / ราคา / ชุดโค้ดไม่มีราคา', () => {
    expect(getMockPriceLabel({ accessType: 'free', price: 100 })).toBe('ฟรี');
    expect(getMockPriceLabel({ accessType: 'purchase', price: '150' })).toBe('150 บาท');
    expect(getMockPriceLabel({ accessType: 'code' })).toBeNull();
  });
});

describe('getMockPrimaryAction', () => {
  it('ชุดฟรี → เริ่มทำ / ทำต่อ ไปหน้าทำข้อสอบจับเวลา', () => {
    expect(getMockPrimaryAction({ id: 'e1', accessType: 'free' })).toEqual({
      kind: 'start',
      label: 'เริ่มทำข้อสอบ',
      href: '/exam/e1',
    });
    expect(getMockPrimaryAction({ id: 'e1', accessType: 'free' }, { hasInProgress: true })).toEqual({
      kind: 'resume',
      label: 'ทำต่อ',
      href: '/exam/e1',
    });
  });

  it('ชุดโค้ด → Unlock, ชุดซื้อ → ซื้อ (ไม่มี href)', () => {
    const unlock = getMockPrimaryAction({ id: 'e1', accessType: 'code' }, { hasInProgress: true });
    expect(unlock).toMatchObject({ kind: 'unlock', label: 'Unlock' });
    expect(unlock).not.toHaveProperty('href');
    const buy = getMockPrimaryAction({ id: 'e1', accessType: 'purchase' });
    expect(buy).toMatchObject({ kind: 'buy', label: 'ซื้อ', note: 'เปิดให้ซื้อเร็ว ๆ นี้' });
  });

  it('มีสิทธิ์ที่ยังไม่หมด (task 15) → เริ่มทำได้ / สิทธิ์หมด → กรอกโค้ดใหม่', () => {
    expect(getMockPrimaryAction({ id: 'e1', accessType: 'code' }, { access: { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' } }).kind).toBe('start');
    expect(getMockPrimaryAction({ id: 'e1', accessType: 'purchase' }, { access: { status: 'unlocked', expiresAt: '2026-12-01T00:00:00.000Z' }, hasInProgress: true }).kind).toBe(
      'resume',
    );
    expect(
      getMockPrimaryAction({ id: 'e1', accessType: 'code' }, { access: { status: 'expired', expiresAt: null } }).kind,
    ).toBe('unlock');
  });
});

describe('normalizeDetailBlocks / isAllowedDetailImageUrl', () => {
  it('null → [] และทิ้ง block ผิดรูป/URL อันตราย', () => {
    expect(normalizeDetailBlocks(null)).toEqual([]);
    expect(
      normalizeDetailBlocks([
        { type: 'text', text: 'a' },
        { type: 'image', url: '/uploads/x.png' },
        { type: 'image', url: 'javascript:alert(1)' },
        { type: 'video', url: 'https://x' },
        { type: 'text' },
        null,
      ]),
    ).toEqual([
      { type: 'text', text: 'a' },
      { type: 'image', url: '/uploads/x.png' },
    ]);
  });

  it('URL ที่ยอมรับ: /uploads/ หรือ http(s)', () => {
    expect(isAllowedDetailImageUrl('/uploads/a.png')).toBe(true);
    expect(isAllowedDetailImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isAllowedDetailImageUrl('http://localhost:3001/uploads/a.png')).toBe(true);
    expect(isAllowedDetailImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedDetailImageUrl('data:image/png;base64,xx')).toBe(false);
    expect(isAllowedDetailImageUrl('//evil.com/a.png')).toBe(false);
  });
});

describe('ข้อความแสดงผล', () => {
  it('mockCategoryLabel / formatMockContext: categoryName · subjectName (ไม่มีชื่อหมวด → slug)', () => {
    expect(mockCategoryLabel({ category: 'tgat', categoryName: 'TGAT' })).toBe('TGAT');
    expect(mockCategoryLabel({ category: 'tgat', categoryName: null })).toBe('tgat');
    expect(formatMockContext({ category: 'tgat', categoryName: 'TGAT', subjectName: 'ภาษาอังกฤษ' })).toBe(
      'TGAT · ภาษาอังกฤษ',
    );
    expect(formatMockContext({ category: 'tgat', categoryName: 'TGAT', subjectName: null })).toBe('TGAT');
  });

  it('resolveUploadUrl: /uploads/ → URL เต็มบนโดเมน API, URL อื่นคงเดิม', () => {
    expect(resolveUploadUrl('/uploads/a.png', 'https://api.lumo-test.com')).toBe('https://api.lumo-test.com/uploads/a.png');
    expect(resolveUploadUrl('/uploads/a.png', 'https://api.lumo-test.com/')).toBe('https://api.lumo-test.com/uploads/a.png');
    expect(resolveUploadUrl('https://cdn.example.com/a.png', 'https://api.lumo-test.com')).toBe(
      'https://cdn.example.com/a.png',
    );
    // ค่าเริ่มต้นใช้ base เดียวกับ lib/api (NEXT_PUBLIC_API_URL หรือ localhost:3001)
    expect(resolveUploadUrl('/uploads/a.png')).toMatch(/^https?:\/\/[^/]+.*\/uploads\/a\.png$/);
  });

  it('getExamBackLink: ชุด Mock → หน้า Mock Exam, ชุดปกติ → หน้าข้อสอบจริง', () => {
    expect(getExamBackLink('e1', true)).toEqual({ href: '/dashboard/mock-exams/e1', label: 'กลับหน้า Mock Exam' });
    expect(getExamBackLink(null, true).href).toBe('/dashboard/mock-exams');
    expect(getExamBackLink('e1', false)).toEqual({ href: '/dashboard/exam', label: 'กลับหน้าข้อสอบจริง' });
  });

  it('formatMockMeta', () => {
    expect(formatMockMeta(40, 60)).toBe('40 ข้อ · 60 นาที');
    expect(formatMockMeta(10, null)).toBe('10 ข้อ · ไม่จับเวลา');
  });
});

describe('ฟอร์มแอดมิน', () => {
  it('mockFormFromExam: API เก่าไม่มี field → ค่าเริ่มต้น', () => {
    const form = mockFormFromExam({});
    expect(form).toEqual(createMockExamForm());
  });

  it('mockFormFromExam: โหลดค่าครบตามลำดับ block (price string → ช่องกรอก)', () => {
    const form = mockFormFromExam({
      isMock: true,
      accessType: 'purchase',
      price: '150.00',
      accessDays: 30,
      level: 'hard',
      detailBlocks: [
        { type: 'text', text: 'บน' },
        { type: 'image', url: '/uploads/a.png' },
        { type: 'text', text: 'ล่าง' },
      ],
    });
    expect(form).toMatchObject({ isMock: true, accessType: 'purchase', price: '150', accessDays: '30', level: 'hard' });
    expect(form.blocks.map((b) => [b.type, b.text || b.url])).toEqual([
      ['text', 'บน'],
      ['image', '/uploads/a.png'],
      ['text', 'ล่าง'],
    ]);
    expect(new Set(form.blocks.map((b) => b.key)).size).toBe(3);
  });

  it('toMockExamInput: ฟอร์มเริ่มต้น (ไม่ใช่ Mock) → ค่าเริ่มต้นครบทุก field', () => {
    expect(toMockExamInput(createMockExamForm())).toEqual({
      isMock: false,
      accessType: 'free',
      price: null,
      accessDays: null,
      level: null,
      detailBlocks: [],
      codeInstructions: null,
    });
  });

  it('toMockExamInput: เอาติ๊ก Mock ออก → isMock:false แต่ส่งค่าที่กรอกไว้ครบ (ไม่ล้าง)', () => {
    const input = toMockExamInput({
      isMock: false,
      accessType: 'purchase',
      price: '150',
      accessDays: '30',
      level: 'hard',
      blocks: [createDetailBlock('text', 'x'), createDetailBlock('image', '/uploads/a.png')],
      codeSteps: [],
      codeNote: '',
    });
    expect(input).toEqual({
      isMock: false,
      accessType: 'purchase',
      price: 150,
      accessDays: 30,
      level: 'hard',
      detailBlocks: [
        { type: 'text', text: 'x' },
        { type: 'image', url: '/uploads/a.png' },
      ],
      codeInstructions: null,
    });
  });

  it('toMockExamInput: ไม่ใช่ Mock + ต้องซื้อแต่ไม่มีราคา → ส่ง free (API บังคับราคาของ purchase เสมอ) ค่าอื่นคงเดิม', () => {
    const input = toMockExamInput({
      ...createMockExamForm(),
      accessType: 'purchase',
      price: '',
      accessDays: '7',
      level: 'easy',
    });
    expect(input).toMatchObject({ isMock: false, accessType: 'free', price: null, accessDays: 7, level: 'easy' });
    expect(toMockExamInput({ ...createMockExamForm(), accessType: 'code' }).accessType).toBe('code');
  });

  it('toMockExamInput: ไม่ใช่ Mock → ไม่ตรวจฟอร์ม แต่ตัดค่าที่ API จะปฏิเสธ (ไม่ให้ 400)', () => {
    expect(validateMockForm({ ...createMockExamForm(), accessType: 'purchase', price: '0' })).toBeNull();
    const input = toMockExamInput({
      isMock: false,
      accessType: 'purchase',
      price: '0',
      accessDays: '99999',
      level: '',
      blocks: [
        createDetailBlock('text', '   '),
        createDetailBlock('image', ''),
        createDetailBlock('image', 'javascript:alert(1)'),
        createDetailBlock('text', 'เก็บ'),
      ],
      codeSteps: [],
      codeNote: '',
    });
    expect(input).toEqual({
      isMock: false,
      accessType: 'free',
      price: null,
      accessDays: null,
      level: null,
      detailBlocks: [{ type: 'text', text: 'เก็บ' }],
      codeInstructions: null,
    });
  });

  it('mockFormHasSettings', () => {
    expect(mockFormHasSettings(createMockExamForm())).toBe(false);
    expect(mockFormHasSettings({ ...createMockExamForm(), level: 'easy' })).toBe(true);
    expect(mockFormHasSettings({ ...createMockExamForm(), blocks: [createDetailBlock('text')] })).toBe(true);
  });

  it('toMockExamInput: Mock → แปลงตัวเลข ส่ง block ตามลำดับ', () => {
    const input = toMockExamInput(
      mockForm({
        accessType: 'purchase',
        price: '150',
        accessDays: '30',
        level: 'easy',
        blocks: [createDetailBlock('image', ' /uploads/a.png '), createDetailBlock('text', 'บรรทัด 1\nบรรทัด 2')],
      }),
    );
    expect(input).toEqual({
      isMock: true,
      accessType: 'purchase',
      price: 150,
      accessDays: 30,
      level: 'easy',
      detailBlocks: [
        { type: 'image', url: '/uploads/a.png' },
        { type: 'text', text: 'บรรทัด 1\nบรรทัด 2' },
      ],
      codeInstructions: null,
    });
    expect(toMockExamInput(mockForm()).price).toBeNull();
    expect(toMockExamInput(mockForm()).level).toBeNull();
  });

  it('validateMockForm: ไม่ใช่ Mock ไม่ตรวจ', () => {
    expect(validateMockForm({ ...createMockExamForm(), accessType: 'purchase' })).toBeNull();
  });

  it('validateMockForm: ชุดซื้อต้องมีราคา > 0 และไม่เกิน 100,000', () => {
    expect(validateMockForm(mockForm({ accessType: 'purchase' }))).toMatch(/ต้องระบุราคา/);
    expect(validateMockForm(mockForm({ accessType: 'purchase', price: '0' }))).toMatch(/มากกว่า 0/);
    expect(validateMockForm(mockForm({ accessType: 'purchase', price: '1.234' }))).toMatch(/ทศนิยม/);
    expect(validateMockForm(mockForm({ accessType: 'purchase', price: '100000.01' }))).toMatch(/ไม่เกิน 100,000/);
    expect(validateMockForm(mockForm({ accessType: 'purchase', price: '150' }))).toBeNull();
    expect(validateMockForm(mockForm({ accessType: 'free' }))).toBeNull();
  });

  it('validateMockForm: อายุการเข้าถึง 1–3650 วัน (จำนวนเต็ม)', () => {
    expect(validateMockForm(mockForm({ accessDays: '0' }))).toMatch(/1–3,650/);
    expect(validateMockForm(mockForm({ accessDays: '3651' }))).toMatch(/1–3,650/);
    expect(validateMockForm(mockForm({ accessDays: '1.5' }))).toMatch(/1–3,650/);
    expect(validateMockForm(mockForm({ accessDays: '3650' }))).toBeNull();
  });

  it('validateMockForm: block ว่าง / URL ไม่ปลอดภัย / เกินจำนวน', () => {
    expect(validateMockForm(mockForm({ blocks: [createDetailBlock('text', '  ')] }))).toMatch(/ช่องที่ 1: กรุณาพิมพ์ข้อความ/);
    expect(
      validateMockForm(mockForm({ blocks: [createDetailBlock('text', 'a'), createDetailBlock('image')] })),
    ).toMatch(/ช่องที่ 2: กรุณาใส่รูป/);
    expect(validateMockForm(mockForm({ blocks: [createDetailBlock('image', 'javascript:alert(1)')] }))).toMatch(
      /http\(s\)/,
    );
    expect(validateMockForm(mockForm({ blocks: [createDetailBlock('text', 'x'.repeat(20001))] }))).toMatch(/20,000/);
    const many = Array.from({ length: 51 }, () => createDetailBlock('text', 'x'));
    expect(validateMockForm(mockForm({ blocks: many }))).toMatch(/ไม่เกิน 50 ช่อง/);
  });

  it('detailBlockImageHolders: รับ block ใน payload ได้ด้วย', () => {
    expect(
      detailBlockImageHolders([
        { type: 'text', text: 'x' },
        { type: 'image', url: '/uploads/a.png' },
      ]),
    ).toEqual([{ questionImages: ['/uploads/a.png'] }]);
  });

  it('detailBlockImageHolders: เฉพาะ block รูปที่มี URL', () => {
    expect(
      detailBlockImageHolders([
        createDetailBlock('image', '/uploads/a.png'),
        createDetailBlock('text', '/uploads/b.png'),
        createDetailBlock('image', ''),
      ]),
    ).toEqual([{ questionImages: ['/uploads/a.png'] }]);
  });
});
