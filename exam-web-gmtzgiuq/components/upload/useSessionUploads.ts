'use client';

import { useCallback, useRef } from 'react';
import { deleteUploadedImageByUrl } from '@/lib/api/upload';

/**
 * จำ URL ที่ POST /upload คืนมาในหน้านี้รอบนี้ — ลบไฟล์ทิ้งได้เฉพาะชุดนี้เท่านั้น
 * URL ที่พิมพ์/วางเองอาจเป็นไฟล์ของข้อสอบอื่น หรือรูปที่บันทึกแล้วต้องรอ API ลบหลังบันทึก จึงไม่ลบเด็ดขาด
 */
export function useSessionUploads() {
  const uploadedRef = useRef<Set<string>>(new Set());

  const recordUpload = useCallback((url: string) => {
    if (url) uploadedRef.current.add(url);
  }, []);

  /** ลบไฟล์ของ URL ที่อัปในรอบนี้ (URL อื่นข้ามไป) แล้วเลิกจำ */
  const discardUploads = useCallback((urls: Iterable<string>) => {
    for (const url of urls) {
      if (!uploadedRef.current.has(url)) continue;
      uploadedRef.current.delete(url);
      deleteUploadedImageByUrl(url).catch((err) => console.error('Failed to delete image:', err));
    }
  }, []);

  /**
   * เอา URL ออกจากชุดที่ลบได้ (เช่นอยู่ใน payload ที่กำลังบันทึก — ห้ามลบระหว่างรอ/หลังบันทึก)
   * คืนรายการที่เอาออกจริง ไว้ใส่คืนด้วย restoreUploads ถ้าบันทึกล้ม
   */
  const holdUploads = useCallback((urls: Iterable<string>): string[] => {
    const held: string[] = [];
    for (const url of urls) {
      if (uploadedRef.current.delete(url)) held.push(url);
    }
    return held;
  }, []);

  const restoreUploads = useCallback((urls: Iterable<string>) => {
    for (const url of urls) uploadedRef.current.add(url);
  }, []);

  return { uploadedRef, recordUpload, discardUploads, holdUploads, restoreUploads };
}
