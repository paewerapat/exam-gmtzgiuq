const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Returns serverNow - clientNow (ms). Add this offset to Date.now() to approximate server time.
export async function fetchClockOffset(): Promise<number> {
  const requestedAt = Date.now();
  const res = await fetch(`${API_URL}/time`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { now: serverNow } = await res.json();
  const receivedAt = Date.now();
  // Assume the request and response legs took roughly the same time; correct for round-trip latency
  const roundTrip = receivedAt - requestedAt;
  return serverNow + roundTrip / 2 - receivedAt;
}
