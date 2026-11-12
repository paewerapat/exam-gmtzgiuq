// Shared authenticated fetch wrapper
// On 401 Unauthorized: clears session and redirects to /login

function handleUnauthorized() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return; // prevent redirect loop
  const hadToken = !!localStorage.getItem('token');
  if (!hadToken) return; // guest user — no token, no redirect
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export interface FetchWithAuthOptions {
  /**
   * false = เมื่อได้ 401 ไม่ล้าง token/user และไม่พาไป /login แค่คืน response (status 401) ให้ผู้เรียกจัดการเอง
   * ใช้กับงานเบื้องหลังที่ต้องไม่ขวางผู้ใช้ เช่นบันทึก answer log ตอนจบการฝึก — ค่าเริ่มต้น true (พฤติกรรมเดิม)
   */
  redirectOnUnauthorized?: boolean;
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  { redirectOnUnauthorized = true }: FetchWithAuthOptions = {},
): Promise<Response> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // multipart (FormData) ต้องให้ browser ตั้ง Content-Type + boundary เอง
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && redirectOnUnauthorized) {
    handleUnauthorized();
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}
