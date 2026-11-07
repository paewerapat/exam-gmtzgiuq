'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import ImageUpload from '@/components/upload/ImageUpload';
import { MAX_QUESTION_IMAGES, moveItem } from '@/lib/question-images';

const MAX_URL_LENGTH = 255; // questionImage ใน DB เป็น varchar(255)

interface QuestionImagesEditorProps {
  /** URL รูปตามลำดับที่แสดง */
  images: string[];
  /** ลบ/เลื่อนรูป แบบ updater (หน้าแม่เป็นคนตัดสินใจเรื่องลบไฟล์ที่ถูกเอาออก) */
  onChange: (update: (prev: string[]) => string[]) => void;
  /**
   * เพิ่มรูปท้ายรายการ — หน้าแม่ตรวจกับค่าล่าสุดอีกรอบ (อัปโหลดเสร็จทีหลังได้ รายการอาจเต็มแล้ว)
   * URL ที่พิมพ์เองถูกตรวจในคอมโพเนนต์นี้ก่อน
   */
  onAdd: (url: string) => void;
  /** URL ที่ได้จาก POST /upload ในหน้านี้ (หน้าแม่จำไว้ว่าลบไฟล์ได้) */
  onUploaded?: (url: string) => void;
  /** ปิดการเพิ่ม/ลบ/เลื่อน (ระหว่างบันทึก) */
  disabled?: boolean;
  /** หน่วยในข้อความเตือน "ใส่รูปได้ไม่เกิน 6 รูปต่อ<ข้อ>" (บทอ่านใช้ "บทอ่าน") */
  perLabel?: string;
}

/** รายการรูปของโจทย์: เพิ่ม (สูงสุด 6) / ลบ / เลื่อนขึ้นลง */
export default function QuestionImagesEditor({
  images,
  onChange,
  onAdd,
  onUploaded,
  disabled = false,
  perLabel = 'ข้อ',
}: QuestionImagesEditorProps) {
  const [urlInput, setUrlInput] = useState('');
  const isFull = images.length >= MAX_QUESTION_IMAGES;

  // URL ที่พิมพ์/วางเอง (ไม่ใช่ไฟล์ที่อัปในหน้านี้ — หน้าแม่จะไม่ลบไฟล์ของมัน)
  const addTypedUrl = (raw: string) => {
    const url = raw.trim();
    if (!url) return false;
    if (images.length >= MAX_QUESTION_IMAGES) {
      toast.error(`ใส่รูปได้ไม่เกิน ${MAX_QUESTION_IMAGES} รูปต่อ${perLabel}`);
      return false;
    }
    if (url.length > MAX_URL_LENGTH) {
      toast.error(`URL รูปยาวได้ไม่เกิน ${MAX_URL_LENGTH} ตัวอักษร`);
      return false;
    }
    if (images.includes(url)) {
      toast.error('รูปนี้อยู่ในรายการแล้ว');
      return false;
    }
    onAdd(url);
    return true;
  };

  const addUrl = () => {
    if (addTypedUrl(urlInput)) setUrlInput('');
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">รูปภาพ (ถ้ามี)</span>
        <span className="text-xs text-gray-400">
          {images.length}/{MAX_QUESTION_IMAGES} รูป · แสดงตามลำดับนี้
        </span>
      </div>

      {images.length > 0 && (
        <ol className="space-y-2 mb-3">
          {images.map((url, i) => (
            <li
              key={`${i}-${url}`}
              className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`รูปที่ ${i + 1}`}
                className="h-20 sm:h-24 w-28 sm:w-36 flex-shrink-0 object-contain rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-100"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">รูปที่ {i + 1}</p>
                <p className="text-xs text-gray-400 truncate" title={url}>{url}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onChange((prev) => moveItem(prev, i, i - 1))}
                  disabled={disabled || i === 0}
                  aria-label={`เลื่อนรูปที่ ${i + 1} ขึ้น`}
                  title="เลื่อนขึ้น"
                  className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange((prev) => moveItem(prev, i, i + 1))}
                  disabled={disabled || i === images.length - 1}
                  aria-label={`เลื่อนรูปที่ ${i + 1} ลง`}
                  title="เลื่อนลง"
                  className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                  disabled={disabled}
                  aria-label={`ลบรูปที่ ${i + 1}`}
                  title="ลบรูป"
                  className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {isFull ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">ครบ {MAX_QUESTION_IMAGES} รูปแล้ว ลบรูปเดิมก่อนถ้าต้องการเพิ่ม</p>
      ) : (
        <>
          <ImageUpload
            value=""
            onChange={(url) => {
              if (url) onAdd(url);
            }}
            onUploaded={onUploaded}
            deleteOnRemove={false}
            showUrlInput={false}
            disabled={disabled}
          />
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              หรือใส่ URL รูปภาพ
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="https://example.com/image.jpg"
              />
              <button
                type="button"
                onClick={addUrl}
                disabled={disabled || !urlInput.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> เพิ่ม
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
