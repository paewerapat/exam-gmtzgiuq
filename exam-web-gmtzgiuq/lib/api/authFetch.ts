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

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}
