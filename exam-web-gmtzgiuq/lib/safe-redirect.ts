// SEC-13: กัน open redirect / `javascript:` XSS จากค่า redirect ที่มาจาก query string
// รับเฉพาะ path ภายในเว็บ (เช่น `/practice/exam/abc?x=1#h`) ค่าอื่นทั้งหมดคืน fallback (`/`)

const BASE = 'http://lumo.invalid';
// อักขระควบคุม C0 + DEL (เบราว์เซอร์ตัด tab/newline ทิ้งจาก URL ทำให้ `/\t/evil` กลายเป็น `//evil`)
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const MAX_DECODE_ROUNDS = 5;

function isInternalPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !CONTROL_CHARS.test(value)
  );
}

export function getSafeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string' || !isInternalPath(raw)) return fallback;

  // decode ซ้ำจนนิ่ง (กัน `/%2F/evil`, `/%252F/evil`, `/%5Cevil`) ทุกชั้นต้องยังเป็น path ภายใน
  let current = raw;
  let stable = false;
  for (let i = 0; i < MAX_DECODE_ROUNDS; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return fallback; // % ที่ decode ไม่ได้
    }
    if (!isInternalPath(next)) return fallback;
    if (next === current) {
      stable = true;
      break;
    }
    current = next;
  }
  if (!stable) return fallback; // encode ซ้อนเกินจำนวนรอบที่ตรวจ

  // ตรวจซ้ำด้วยตัว parse URL จริง: resolve แล้วต้องอยู่ origin เดิม และ pathname หลัง normalize
  // dot-segment ต้องไม่เป็น `//` (กัน `/.//evil`, `/%2e%2e//evil`, `/a/../..//evil` → protocol-relative)
  // คืนค่าที่ normalize แล้ว ไม่ใช่ raw เพื่อไม่ให้ parser นี้กับ Next ตีความต่างกัน
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE || url.pathname.startsWith('//')) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
