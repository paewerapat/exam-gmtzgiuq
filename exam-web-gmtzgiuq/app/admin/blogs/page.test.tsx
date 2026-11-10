import { render, screen, within } from '@testing-library/react';
import AdminBlogsPage from './page';
import { getAdminBlogs } from '@/lib/api/blogs';

jest.mock('@/lib/api/blogs', () => ({
  ...jest.requireActual('@/lib/api/blogs'),
  getAdminBlogs: jest.fn(),
  deleteBlog: jest.fn(),
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const blog = (patch: object) => ({
  id: 'b1',
  title: 'สรุปสูตรฟิสิกส์',
  slug: 'physics-notes',
  excerpt: '',
  content: '',
  featuredImage: '',
  status: 'published',
  category: 'notes',
  author: { id: 'u', firstName: 'A', lastName: 'B' },
  viewCount: 12,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  publishedAt: '2026-11-01T00:00:00.000Z',
  ...patch,
});

describe('/admin/blogs — ข้อความไทย (task 14 A)', () => {
  beforeEach(() => {
    (getAdminBlogs as jest.Mock).mockResolvedValue({
      items: [
        blog({}),
        blog({ id: 'b2', title: 'วิเคราะห์ข้อสอบ', slug: 'exam-essay', category: 'essays', status: 'draft' }),
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
  });

  it('หัวข้อ ปุ่ม หัวคอลัมน์ และป้ายหมวดเป็นภาษาไทย (ค่า category เดิม notes/essays)', async () => {
    render(<AdminBlogsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'บทความ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /เขียนบทความ/ })).toHaveAttribute('href', '/admin/blogs/new');

    const table = await screen.findByRole('table', {}, { timeout: 5000 });
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual(['ชื่อบทความ', 'หมวดหมู่', 'สถานะ', 'ยอดเข้าชม', 'วันที่สร้าง', 'จัดการ']);

    expect(within(table).getByText('โน้ตสรุป')).toBeInTheDocument();
    expect(within(table).getByText('บทความเชิงลึก')).toBeInTheDocument();
    expect(within(table).queryByText(/^(notes|essays)$/i)).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'แก้ไข สรุปสูตรฟิสิกส์' })).toHaveAttribute('href', '/admin/blogs/b1');
    expect(screen.getByRole('link', { name: 'ดูบทความ วิเคราะห์ข้อสอบ' })).toHaveAttribute('href', '/blogs/exam-essay');
    expect(screen.getByRole('button', { name: 'ลบ สรุปสูตรฟิสิกส์' })).toBeInTheDocument();

    for (const english of ['Blogs', 'New Blog', 'Title', 'Category', 'Status', 'Views', 'Date', 'Actions']) {
      expect(screen.queryByText(english)).not.toBeInTheDocument();
    }
  });
});
