import BlogDetailClient from './BlogDetailClient';

// Generate static params for static export
export function generateStaticParams() {
  return [
    { slug: 'getting-started-exam-platform' },
    { slug: '10-tips-effective-exam-preparation' },
    { slug: 'understanding-question-patterns' },
    { slug: 'how-to-manage-exam-stress' },
    { slug: 'science-of-memory-retention' },
    { slug: 'creating-perfect-study-schedule' },
  ];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <BlogDetailClient slug={slug} />;
}
