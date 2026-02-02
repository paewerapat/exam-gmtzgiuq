// Blog categories
export type BlogCategory = 'notes' | 'essays';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage: string;
  author: { name: string };
  viewCount: number;
  createdAt: string;
  publishedAt: string;
  category: BlogCategory;
}

export const mockBlogs: BlogPost[] = [
  {
    id: '1',
    title: 'Getting Started with Our Exam Platform',
    slug: 'getting-started-exam-platform',
    excerpt: 'Learn how to make the most of our exam preparation platform with this comprehensive guide. Discover all the features and tools available to help you succeed.',
    featuredImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    author: { name: 'Admin' },
    viewCount: 1234,
    createdAt: '2024-01-15T10:00:00Z',
    publishedAt: '2024-02-25T10:00:00Z',
    category: 'notes',
  },
  {
    id: '2',
    title: '10 Tips for Effective Exam Preparation',
    slug: '10-tips-effective-exam-preparation',
    excerpt: 'Discover proven strategies to boost your exam scores with these essential preparation tips.',
    featuredImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
    author: { name: 'Admin' },
    viewCount: 856,
    createdAt: '2024-01-20T14:30:00Z',
    publishedAt: '2024-02-20T14:30:00Z',
    category: 'essays',
  },
  {
    id: '3',
    title: 'Understanding Question Patterns',
    slug: 'understanding-question-patterns',
    excerpt: 'Learn to recognize and master different question patterns to improve your answering strategy.',
    featuredImage: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800',
    author: { name: 'Admin' },
    viewCount: 543,
    createdAt: '2024-02-01T09:00:00Z',
    publishedAt: '2024-02-15T09:00:00Z',
    category: 'notes',
  },
  {
    id: '4',
    title: 'How to Manage Exam Stress Effectively',
    slug: 'how-to-manage-exam-stress',
    excerpt: 'Learn practical techniques to stay calm and focused during your exam preparation and on exam day.',
    featuredImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    author: { name: 'Admin' },
    viewCount: 721,
    createdAt: '2024-02-10T11:00:00Z',
    publishedAt: '2024-02-10T11:00:00Z',
    category: 'essays',
  },
  {
    id: '5',
    title: 'The Science of Memory and Retention',
    slug: 'science-of-memory-retention',
    excerpt: 'Explore evidence-based techniques to improve your memory and recall abilities during exams.',
    featuredImage: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=800',
    author: { name: 'Admin' },
    viewCount: 634,
    createdAt: '2024-02-15T08:00:00Z',
    publishedAt: '2024-02-05T08:00:00Z',
    category: 'essays',
  },
  {
    id: '6',
    title: 'Creating the Perfect Study Schedule',
    slug: 'creating-perfect-study-schedule',
    excerpt: 'A comprehensive guide to organizing your time for maximum learning efficiency and productivity.',
    featuredImage: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800',
    author: { name: 'Admin' },
    viewCount: 489,
    createdAt: '2024-02-20T10:00:00Z',
    publishedAt: '2024-02-01T10:00:00Z',
    category: 'notes',
  },
];

// Helper functions
export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function calculateReadTime(index: number) {
  const times = [5, 7, 6, 4, 8, 5];
  return times[index % times.length];
}

// Get blogs sorted by publishedAt (newest first)
export function getSortedBlogs(blogs: BlogPost[] = mockBlogs) {
  return [...blogs].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

// Get blogs by category
export function getBlogsByCategory(category: BlogCategory, blogs: BlogPost[] = mockBlogs) {
  return getSortedBlogs(blogs.filter(blog => blog.category === category));
}

// Category display names
export const categoryNames: Record<BlogCategory, string> = {
  notes: 'Notes',
  essays: 'Essays',
};

export const categoryDescriptions: Record<BlogCategory, string> = {
  notes: 'บันทึกสั้นๆ เคล็ดลับและเทคนิคที่มีประโยชน์',
  essays: 'บทความเชิงลึกและการวิเคราะห์',
};
