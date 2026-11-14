'use client';

// ผู้ใช้มีแพ็กเกจ Pro ที่ยังใช้ได้อย่างน้อย 1 สนามไหม (ปุ่ม Upgrade / "สมาชิก Pro" ในแถบซ้าย — task 21)
// แถบซ้ายถูก render 2 ที่ (desktop + drawer มือถือ) จึงแชร์คำขอเดียวกันต่อผู้ใช้ และจำผลไว้สั้น ๆ
import { useEffect, useState } from 'react';
import { getMyPro, type ProMeItem } from '@/lib/api/pro';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<boolean> }>();

/** GET /pro/me คืนเฉพาะสิทธิ์ที่ยังไม่หมด — นับเฉพาะที่สถานะไม่ใช่ expired / revoked */
export function hasActivePro(items: Pick<ProMeItem, 'status'>[]): boolean {
  return items.some((i) => i.status !== 'expired' && i.status !== 'revoked');
}

/** ถาม API ครั้งเดียวต่อผู้ใช้ภายใน 60 วินาที (เรียกพร้อมกันได้คำขอเดียว) — error → false และไม่จำผล */
export function fetchHasPro(userId: string, now: number = Date.now()): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = getMyPro()
    .then(hasActivePro)
    .catch(() => {
      cache.delete(userId);
      return false;
    });
  cache.set(userId, { at: now, promise });
  return promise;
}

/** สำหรับ test */
export function resetHasProCache() {
  cache.clear();
}

/** guest → false เสมอ (ไม่เรียก API) */
export function useHasPro(userId: string | null | undefined): boolean {
  const [state, setState] = useState<{ userId: string; has: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchHasPro(userId).then((has) => {
      if (!cancelled) setState({ userId, has });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return !!userId && state?.userId === userId && state.has;
}
