// Opn Payments (Omise.js) — หน้าต่างกรอกบัตรของ Opn (OmiseCard popup ใน iframe ของ Opn) task 18
// ข้อมูลบัตรไม่ผ่านโค้ดเรา: ได้กลับมาแค่ token (tokn_...) แล้วส่งต่อให้ API — ห้าม log token
// โหลด script แบบ lazy เฉพาะเมื่อจะใช้ (หน้า checkout / เปลี่ยนบัตร) ไม่ใส่ใน layout

export const OMISE_SCRIPT_URL = 'https://cdn.omise.co/omise.js';
export const OMISE_LOAD_TIMEOUT_MS = 15000;

/** เหตุที่เปิดหน้าต่างบัตรไม่ได้ */
export const OMISE_NOT_CONFIGURED = 'OMISE_NOT_CONFIGURED';
export const OMISE_LOAD_FAILED = 'OMISE_LOAD_FAILED';

export const OMISE_NOT_READY_MESSAGE = 'ระบบชำระเงินยังไม่พร้อม';
export const OMISE_LOAD_FAILED_MESSAGE = 'เปิดหน้าต่างชำระเงินไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';

export interface OmiseCardOpenOptions {
  amount: number;
  currency: string;
  frameLabel?: string;
  submitLabel?: string;
  defaultPaymentMethod?: string;
  otherPaymentMethods?: string[];
  /** ค่าเป็น string: หน้าต่างของ Opn เช็ก `hideAmount !== "true"` (boolean true ไม่มีผล) */
  hideAmount?: 'true' | 'false';
  locale?: string;
  onCreateTokenSuccess: (nonce: string) => void;
  onFormClosed?: () => void;
}

export interface OmiseCardApi {
  configure: (options: { publicKey: string; [key: string]: unknown }) => void;
  open: (options: OmiseCardOpenOptions) => void;
}

declare global {
  interface Window {
    OmiseCard?: OmiseCardApi;
  }
}

/** public key ของ Opn (ฝังตอน build) — ไม่มี → null (แสดง "ระบบชำระเงินยังไม่พร้อม") */
export function getOmisePublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

let loading: Promise<OmiseCardApi> | null = null;

/** โหลด omise.js ครั้งเดียว (ล้มเหลว/หมดเวลา → reject แล้วเรียกใหม่ได้) */
export function loadOmiseCard(timeoutMs = OMISE_LOAD_TIMEOUT_MS): Promise<OmiseCardApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error(OMISE_LOAD_FAILED));
  if (window.OmiseCard) return Promise.resolve(window.OmiseCard);
  if (loading) return loading;

  loading = new Promise<OmiseCardApi>((resolve, reject) => {
    // script ที่ค้างจากรอบก่อนแต่ไม่มี OmiseCard = โหลดพัง → ทิ้งแล้วโหลดใหม่
    document.querySelectorAll(`script[src="${OMISE_SCRIPT_URL}"]`).forEach((el) => el.remove());
    const script = document.createElement('script');
    script.src = OMISE_SCRIPT_URL;
    script.async = true;

    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      loading = null;
      script.remove();
      reject(new Error(OMISE_LOAD_FAILED));
    };
    const timer = setTimeout(fail, timeoutMs);
    script.addEventListener('load', () => {
      if (settled) return;
      if (!window.OmiseCard) {
        fail();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(window.OmiseCard);
    });
    script.addEventListener('error', fail);
    document.head.appendChild(script);
  });
  return loading;
}

/** ใช้ใน test เท่านั้น */
export function resetOmiseLoaderForTest() {
  loading = null;
}

export interface RequestCardTokenOptions {
  /** ยอดที่แสดงในหน้าต่าง (สตางค์) — แสดงอย่างเดียว ยอดจริงคิดที่ server */
  amountSatang: number;
  /** ข้อความปุ่ม (ไม่ต้องใส่ยอด — Opn ต่อท้ายยอด + THB ให้เองเมื่อไม่ได้ซ่อนยอด) */
  submitLabel: string;
  /** เปลี่ยนบัตร: ไม่แสดงยอดบนปุ่ม */
  hideAmount?: boolean;
}

/**
 * เปิดหน้าต่างกรอกบัตรของ Opn → token (tokn_...) หรือ null เมื่อผู้ใช้ปิดหน้าต่าง
 * ไม่มี public key → throw OMISE_NOT_CONFIGURED / โหลด script ไม่ได้ → throw OMISE_LOAD_FAILED
 */
export async function requestCardToken({ amountSatang, submitLabel, hideAmount = false }: RequestCardTokenOptions): Promise<string | null> {
  const publicKey = getOmisePublicKey();
  if (!publicKey) throw new Error(OMISE_NOT_CONFIGURED);
  const omiseCard = await loadOmiseCard();
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      resolve(token);
    };
    omiseCard.configure({ publicKey });
    omiseCard.open({
      amount: Math.max(0, Math.round(amountSatang)),
      currency: 'THB',
      frameLabel: 'LUMO',
      submitLabel,
      defaultPaymentMethod: 'credit_card',
      otherPaymentMethods: [],
      hideAmount: hideAmount ? 'true' : 'false',
      locale: 'th',
      // รับเฉพาะ token ของบัตร (source อื่นไม่ใช้ในหน้านี้)
      onCreateTokenSuccess: (nonce) => finish(typeof nonce === 'string' && nonce.startsWith('tokn_') ? nonce : null),
      onFormClosed: () => finish(null),
    });
  });
}

/** error จาก requestCardToken → ข้อความไทย (null = ไม่ใช่ error ของ Omise) */
export function omiseErrorMessage(err: unknown): string | null {
  const message = err instanceof Error ? err.message : '';
  if (message === OMISE_NOT_CONFIGURED) return OMISE_NOT_READY_MESSAGE;
  if (message === OMISE_LOAD_FAILED) return OMISE_LOAD_FAILED_MESSAGE;
  return null;
}
