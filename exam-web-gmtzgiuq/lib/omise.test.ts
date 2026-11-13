import {
  getOmisePublicKey,
  loadOmiseCard,
  OMISE_LOAD_FAILED,
  OMISE_NOT_CONFIGURED,
  OMISE_SCRIPT_URL,
  omiseErrorMessage,
  requestCardToken,
  resetOmiseLoaderForTest,
  type OmiseCardOpenOptions,
} from './omise';

const KEY = 'pkey_test_dummy';

function mockOmiseCard() {
  const card = { configure: jest.fn(), open: jest.fn() };
  window.OmiseCard = card;
  return card;
}

describe('lib/omise (task 18)', () => {
  const originalKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;

  beforeEach(() => {
    resetOmiseLoaderForTest();
    delete window.OmiseCard;
    document.head.innerHTML = '';
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = KEY;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = originalKey;
  });

  it('getOmisePublicKey: ว่าง/ไม่มี → null', () => {
    expect(getOmisePublicKey()).toBe(KEY);
    process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY = '  ';
    expect(getOmisePublicKey()).toBeNull();
    delete process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    expect(getOmisePublicKey()).toBeNull();
  });

  it('loadOmiseCard: ใส่ script ของ cdn.omise.co ครั้งเดียว แล้ว resolve เมื่อโหลดเสร็จ', async () => {
    const p1 = loadOmiseCard();
    const p2 = loadOmiseCard();
    const scripts = document.head.querySelectorAll(`script[src="${OMISE_SCRIPT_URL}"]`);
    expect(scripts).toHaveLength(1);
    const card = mockOmiseCard();
    scripts[0].dispatchEvent(new Event('load'));
    await expect(p1).resolves.toBe(card);
    await expect(p2).resolves.toBe(card);
    // มี global แล้ว → ไม่ใส่ script ซ้ำ
    await expect(loadOmiseCard()).resolves.toBe(card);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('loadOmiseCard: script error → reject แล้วเรียกใหม่ได้ (ใส่ script ใหม่)', async () => {
    const p = loadOmiseCard();
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow(OMISE_LOAD_FAILED);
    expect(document.head.querySelector('script')).toBeNull();
    const again = loadOmiseCard();
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    const card = mockOmiseCard();
    document.head.querySelector('script')!.dispatchEvent(new Event('load'));
    await expect(again).resolves.toBe(card);
  });

  it('loadOmiseCard: หมดเวลา → reject', async () => {
    jest.useFakeTimers();
    try {
      const p = loadOmiseCard(1000);
      jest.advanceTimersByTime(1000);
      await expect(p).rejects.toThrow(OMISE_LOAD_FAILED);
    } finally {
      jest.useRealTimers();
    }
  });

  it('requestCardToken: configure ด้วย public key, เปิดฟอร์มบัตร THB → คืน token', async () => {
    const card = mockOmiseCard();
    card.open.mockImplementation((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('tokn_test_123'));
    await expect(requestCardToken({ amountSatang: 21293, submitLabel: 'ชำระเงิน' })).resolves.toBe('tokn_test_123');
    expect(card.configure).toHaveBeenCalledWith({ publicKey: KEY });
    expect(card.open).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 21293,
        currency: 'THB',
        frameLabel: 'LUMO',
        submitLabel: 'ชำระเงิน',
        defaultPaymentMethod: 'credit_card',
        otherPaymentMethods: [],
        hideAmount: 'false',
      }),
    );
  });

  it('requestCardToken: hideAmount ส่งเป็น string "true" (หน้าต่าง Opn เทียบกับ "true") — ปุ่มไม่แสดง 0.00 THB', async () => {
    const card = mockOmiseCard();
    card.open.mockImplementation((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('tokn_x'));
    await requestCardToken({ amountSatang: 0, submitLabel: 'บันทึกบัตร', hideAmount: true });
    expect(card.open).toHaveBeenCalledWith(expect.objectContaining({ hideAmount: 'true', submitLabel: 'บันทึกบัตร' }));
  });

  it('requestCardToken: ปิดหน้าต่าง → null / nonce ที่ไม่ใช่ tokn_ → null', async () => {
    const card = mockOmiseCard();
    card.open.mockImplementationOnce((opts: OmiseCardOpenOptions) => opts.onFormClosed?.());
    await expect(requestCardToken({ amountSatang: 100, submitLabel: 'x' })).resolves.toBeNull();
    card.open.mockImplementationOnce((opts: OmiseCardOpenOptions) => opts.onCreateTokenSuccess('src_test_1'));
    await expect(requestCardToken({ amountSatang: 100, submitLabel: 'x' })).resolves.toBeNull();
    // ได้ token แล้วฟอร์มปิดตาม → ยังได้ token
    card.open.mockImplementationOnce((opts: OmiseCardOpenOptions) => {
      opts.onCreateTokenSuccess('tokn_ok');
      opts.onFormClosed?.();
    });
    await expect(requestCardToken({ amountSatang: 100, submitLabel: 'x' })).resolves.toBe('tokn_ok');
  });

  it('requestCardToken: ไม่มี public key → OMISE_NOT_CONFIGURED และไม่โหลด script', async () => {
    delete process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    await expect(requestCardToken({ amountSatang: 100, submitLabel: 'x' })).rejects.toThrow(OMISE_NOT_CONFIGURED);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('omiseErrorMessage: ข้อความไทย', () => {
    expect(omiseErrorMessage(new Error(OMISE_NOT_CONFIGURED))).toBe('ระบบชำระเงินยังไม่พร้อม');
    expect(omiseErrorMessage(new Error(OMISE_LOAD_FAILED))).toMatch(/เปิดหน้าต่างชำระเงินไม่สำเร็จ/);
    expect(omiseErrorMessage(new Error('other'))).toBeNull();
  });
});
