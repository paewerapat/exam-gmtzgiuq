'use client';

import LatexRenderer from '@/components/latex/LatexRenderer';
import { resolveUploadUrl, type DetailBlock } from '@/lib/mock-exam';

interface DetailBlocksViewProps {
  blocks: DetailBlock[];
  /** ใช้ใน alt ของรูป เช่น "รูปประกอบ 2 — <ชื่อชุด>" */
  title?: string;
}

/** คำอธิบายชุดข้อสอบ: ข้อความ (LaTeX, รักษาการขึ้นบรรทัด) สลับรูป ตามลำดับที่แอดมินจัด — ใช้ทั้งหน้าจริงและ preview แอดมิน */
export default function DetailBlocksView({ blocks, title }: DetailBlocksViewProps) {
  // ลำดับรูป (นับเฉพาะ block รูป) ใช้ใน alt
  const imageNumbers = blocks.reduce<number[]>((acc, b, i) => {
    acc.push((i > 0 ? acc[i - 1] : 0) + (b.type === 'image' ? 1 : 0));
    return acc;
  }, []);
  return (
    <div className="space-y-4" data-testid="detail-blocks">
      {blocks.map((block, i) => {
        if (block.type === 'image') {
          const imageNo = imageNumbers[i];
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${i}-image`}
              src={resolveUploadUrl(block.url)}
              alt={title ? `รูปประกอบ ${imageNo} — ${title}` : `รูปประกอบ ${imageNo}`}
              loading="lazy"
              className="block max-w-full h-auto mx-auto rounded-xl border border-gray-100 dark:border-gray-700"
            />
          );
        }
        return (
          <LatexRenderer
            key={`${i}-text`}
            content={block.text}
            className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 break-words"
          />
        );
      })}
    </div>
  );
}
