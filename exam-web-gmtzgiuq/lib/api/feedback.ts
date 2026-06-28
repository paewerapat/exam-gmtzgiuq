import { fetchWithAuth } from './authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface FeedbackInput {
  examId?: string | null;
  age?: number | null;
  message: string;
  details?: string | null;
}

export async function sendFeedback(input: FeedbackInput): Promise<any> {
  const response = await fetchWithAuth(`${API_URL}/feedback`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    const msg = err?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return response.json();
}
