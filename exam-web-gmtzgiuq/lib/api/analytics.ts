import { fetchWithAuth } from './authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  fetchWithAuth(`${API_URL}/analytics/events`, {
    method: 'POST',
    body: JSON.stringify({ event, properties }),
  }).catch(() => {
    // analytics failures must never disrupt the user experience
  });
}
