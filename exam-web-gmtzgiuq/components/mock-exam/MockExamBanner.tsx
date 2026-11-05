// แบนเนอร์ชุด Mock Exam: รูปที่แอดมินอัป หรือ gradient ตามหมวด (แบบการ์ดหน้า /dashboard/exam)

const categoryGradients: Record<string, [string, string]> = {
  mathematics: ['#FF6B35', '#F7931E'],
  science: ['#11998e', '#43e97b'],
  english: ['#4776E6', '#8E54E9'],
  toeic: ['#f093fb', '#f5576c'],
  gat_pat: ['#4facfe', '#00f2fe'],
  o_net: ['#43e97b', '#38f9d7'],
  kor_por: ['#fa709a', '#fee140'],
  general_knowledge: ['#a18cd1', '#fbc2eb'],
  driving_license: ['#fccb90', '#d57eeb'],
};
const defaultGradient: [string, string] = ['#667eea', '#764ba2'];

export function getBannerGradient(category: string): [string, string] {
  return categoryGradients[category] ?? defaultGradient;
}

function BannerShapes() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 280 140"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <circle cx="230" cy="20" r="55" fill="white" fillOpacity="0.08" />
      <circle cx="260" cy="90" r="38" fill="white" fillOpacity="0.06" />
      <circle cx="20" cy="110" r="30" fill="white" fillOpacity="0.06" />
      <circle cx="-10" cy="20" r="40" fill="white" fillOpacity="0.07" />
    </svg>
  );
}

interface MockExamBannerProps {
  title: string;
  category: string;
  categoryLabel: string;
  bannerImage?: string | null;
  className?: string;
}

/** อัตราส่วน 16:9 ตามคำแนะนำในฟอร์มแอดมิน */
export default function MockExamBanner({
  title,
  category,
  categoryLabel,
  bannerImage,
  className = '',
}: MockExamBannerProps) {
  if (bannerImage) {
    return (
      <div className={`relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-700 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bannerImage} alt={`แบนเนอร์ ${title}`} className="w-full h-full object-cover" />
      </div>
    );
  }
  const [from, to] = getBannerGradient(category);
  return (
    <div
      className={`relative aspect-video p-4 flex flex-col justify-between overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <BannerShapes />
      <span className="relative z-10 text-[11px] font-bold text-white/80 uppercase tracking-widest truncate">
        {categoryLabel}
      </span>
      <span className="relative z-10 text-white font-bold text-base leading-snug line-clamp-2">{title}</span>
    </div>
  );
}
