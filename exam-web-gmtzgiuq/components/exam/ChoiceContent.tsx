'use client';

import { useState } from 'react';
import LatexText from '@/components/latex/LatexText';

interface ChoiceContentProps {
  text: string;
  image?: string | null;
  /** ตัวอักษรของตัวเลือก (A–F) ใช้เป็น alt ของรูป */
  letter: string;
  /** class ขนาดรูป (ค่าเริ่มต้นสำหรับปุ่มตัวเลือก) */
  imageSizeClassName?: string;
}

/** เนื้อหาของตัวเลือก: ข้อความ (LaTeX) และ/หรือรูป */
export default function ChoiceContent({
  text,
  image,
  letter,
  imageSizeClassName = 'max-h-40 sm:max-h-48',
}: ChoiceContentProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasText = (text ?? '').trim() !== '';
  const hasImage = !!image && failedSrc !== image;

  return (
    <>
      {hasText && <LatexText text={text} />}
      {hasImage && (
        // พื้นรูปสีอ่อนทั้งสองโหมด: รูปวาดเส้นดำพื้นใสยังมองเห็นใน dark mode
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={`รูปตัวเลือก ${letter}`}
          loading="lazy"
          onError={() => setFailedSrc(image)}
          className={`block ${hasText ? 'mt-2' : ''} ${imageSizeClassName} max-w-full w-auto h-auto object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-100`}
        />
      )}
      {!!image && !hasImage && (
        <span className={`block text-xs text-gray-400 ${hasText ? 'mt-1' : ''}`}>
          (โหลดรูปตัวเลือก {letter} ไม่ได้)
        </span>
      )}
    </>
  );
}
