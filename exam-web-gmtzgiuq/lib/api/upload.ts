// Upload API (POST /upload multipart field `file`, DELETE /upload/:filename)
import { fetchWithAuth } from './authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UploadResult {
  url: string;
  filename: string;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithAuth(`${API_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const message = errorData?.message
      ? Array.isArray(errorData.message)
        ? errorData.message.join(', ')
        : errorData.message
      : `HTTP ${res.status}`;
    throw new Error(message);
  }

  return res.json();
}

/**
 * ลบไฟล์จาก URL ที่ได้จาก POST /upload — ทำเฉพาะ URL ของ API เรา (`${API_URL}/uploads/<file>`)
 * URL ภายนอกที่บังเอิญมี /uploads/ จะไม่ถูกส่งไปลบ (คืน false)
 */
export async function deleteUploadedImageByUrl(url: string): Promise<boolean> {
  const prefix = `${API_URL}/uploads/`;
  if (!url.startsWith(prefix)) return false;
  const filename = url.slice(prefix.length);
  if (!filename || filename.includes('/') || filename.includes('?') || filename.includes('#')) return false;
  await deleteUploadedImage(filename);
  return true;
}

export async function deleteUploadedImage(filename: string): Promise<void> {
  const res = await fetchWithAuth(`${API_URL}/upload/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}
