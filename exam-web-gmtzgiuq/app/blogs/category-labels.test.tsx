import { render, screen } from '@testing-library/react';
import BlogsPage from './page';
import NotesBlogsPage from './notes/page';
import EssaysBlogsPage from './essays/page';
import RecentBlogsPage from './recent/page';
import { getBlogs, getBlogCategoryLabel } from '@/lib/api/blogs';

jest.mock('@/lib/api/blogs', () => ({
  ...jest.requireActual('@/lib/api/blogs'),
  getBlogs: jest.fn(),
}));

const FIND = { timeout: 5000 };

const blog = (id: string, category: 'notes' | 'essays') => ({
  id,
  title: `บทความ ${id}`,
  slug: `post-${id}`,
  excerpt: '',
  content: 'เนื้อหา',
  featuredImage: '',
  status: 'published',
  category,
  author: { id: 'u', firstName: 'A', lastName: 'B' },
  viewCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  publishedAt: '2026-11-01T00:00:00.000Z',
});

const page = (items: ReturnType<typeof blog>[]) => ({ items, total: items.length, page: 1, limit: 6, totalPages: 1 });

describe('หมวดบทความเป็นภาษาไทย (task 14 A) — URL/ค่า category เดิม', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getBlogCategoryLabel: notes → โน้ตสรุป, essays → บทความเชิงลึก, ค่าอื่นคืนค่าเดิม', () => {
    expect(getBlogCategoryLabel('notes')).toBe('โน้ตสรุป');
    expect(getBlogCategoryLabel('essays')).toBe('บทความเชิงลึก');
    expect(getBlogCategoryLabel('other')).toBe('other');
  });

  it('/blogs: หัวข้อ section เป็นไทย ลิงก์ "ดูทั้งหมด" ยังไป /blogs/notes และ /blogs/essays', async () => {
    (getBlogs as jest.Mock).mockResolvedValue(page([]));
    render(<BlogsPage />);
    expect(await screen.findByRole('heading', { level: 2, name: 'โน้ตสรุป' }, FIND)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'บทความเชิงลึก' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^(Notes|Essays)$/ })).not.toBeInTheDocument();
    const viewAll = screen.getAllByRole('link', { name: /ดูทั้งหมด/ }).map((a) => a.getAttribute('href'));
    expect(viewAll).toEqual(expect.arrayContaining(['/blogs/notes', '/blogs/essays']));
    expect(getBlogs).toHaveBeenCalledWith(expect.objectContaining({ category: 'notes' }));
    expect(getBlogs).toHaveBeenCalledWith(expect.objectContaining({ category: 'essays' }));
  });

  it('/blogs/notes: หัวข้อ "โน้ตสรุป" และยังดึง category notes', async () => {
    (getBlogs as jest.Mock).mockResolvedValue(page([]));
    render(<NotesBlogsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'โน้ตสรุป' })).toBeInTheDocument();
    expect(await screen.findByText('ยังไม่มีโน้ตสรุป', {}, FIND)).toBeInTheDocument();
    expect(getBlogs).toHaveBeenCalledWith(expect.objectContaining({ category: 'notes' }));
  });

  it('/blogs/essays: หัวข้อ "บทความเชิงลึก" และยังดึง category essays', async () => {
    (getBlogs as jest.Mock).mockResolvedValue(page([]));
    render(<EssaysBlogsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'บทความเชิงลึก' })).toBeInTheDocument();
    expect(await screen.findByText('ยังไม่มีบทความเชิงลึก', {}, FIND)).toBeInTheDocument();
    expect(getBlogs).toHaveBeenCalledWith(expect.objectContaining({ category: 'essays' }));
  });

  it('/blogs/recent: ป้ายหมวดบนการ์ดเป็นไทย', async () => {
    (getBlogs as jest.Mock).mockResolvedValue(page([blog('1', 'notes'), blog('2', 'essays')]));
    render(<RecentBlogsPage />);
    expect(await screen.findByText('โน้ตสรุป', {}, FIND)).toBeInTheDocument();
    expect(screen.getByText('บทความเชิงลึก')).toBeInTheDocument();
    expect(screen.queryByText(/^(Notes|Essays)$/)).not.toBeInTheDocument();
  });
});
