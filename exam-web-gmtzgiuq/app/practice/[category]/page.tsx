'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface PageProps {
  params: Promise<{ category: string }>;
}

export default function CategoryConfigPage({ params }: PageProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/practice');
  }, [router]);

  return null;
}
