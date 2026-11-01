'use client';

import { useState } from 'react';

interface QuestionImagesProps {
  /** URL รูปตามลำดับ (ได้จาก getQuestionImages) */
  images: string[];
  className?: string;
  /** class ของแต่ละรูป (ค่าเริ่มต้น: กว้างเต็มคอลัมน์ ไม่เกินจอ) */
  imageClassName?: string;
}

function QuestionImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  // โหลดรูปไม่ได้ → ซ่อนเฉพาะรูปนั้น (พฤติกรรมเดิมของรูปเดี่ยว)
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}

/** รูปประกอบโจทย์ทุกรูป เรียงลงมาตามลำดับ (ไม่มีรูป → ไม่ render อะไร) */
export default function QuestionImages({
  images,
  className = '',
  imageClassName = 'block max-w-full h-auto rounded-xl border border-gray-200 dark:border-gray-700',
}: QuestionImagesProps) {
  if (images.length === 0) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {images.map((src, i) => (
        <QuestionImage
          key={`${i}-${src}`}
          src={src}
          alt={images.length > 1 ? `รูปประกอบโจทย์ ${i + 1}` : 'รูปประกอบโจทย์'}
          className={imageClassName}
        />
      ))}
    </div>
  );
}
