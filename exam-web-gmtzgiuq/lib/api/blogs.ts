// Blog API Service
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type BlogCategory = 'notes' | 'essays';

export interface BlogAuthor {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

export interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  status: 'draft' | 'published';
  category: BlogCategory;
  author: BlogAuthor;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface PaginatedBlogs {
  items: Blog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetBlogsParams {
  page?: number;
  limit?: number;
  category?: BlogCategory;
  search?: string;
}

// Get published blogs with pagination, search, and category filter
export async function getBlogs(params: GetBlogsParams = {}): Promise<PaginatedBlogs> {
  const { page = 1, limit = 6, category, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  if (category) {
    queryParams.set('category', category);
  }

  if (search) {
    queryParams.set('search', search);
  }

  const response = await fetch(`${API_URL}/blogs?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch blogs');
  }

  return response.json();
}

// Get single blog by slug
export async function getBlogBySlug(slug: string): Promise<Blog> {
  const response = await fetch(`${API_URL}/blogs/slug/${slug}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Blog not found');
  }

  return response.json();
}

// Helper function to format date
export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Helper function to calculate read time
export function calculateReadTime(content: string) {
  const wordsPerMinute = 200;
  const wordCount = content?.split(/\s+/).length || 0;
  const readTime = Math.ceil(wordCount / wordsPerMinute);
  return Math.max(1, readTime);
}

// Category display info
export const categoryInfo = {
  notes: {
    name: 'Notes',
    description: 'บันทึกสั้นๆ เคล็ดลับและเทคนิคที่มีประโยชน์',
    color: 'emerald',
  },
  essays: {
    name: 'Essays',
    description: 'บทความเชิงลึกและการวิเคราะห์',
    color: 'amber',
  },
} as const;
