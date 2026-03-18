'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, Eye, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAdminBlog, updateBlog, deleteBlog, type BlogCategory } from '@/lib/api/blogs';
import ImageUpload from '@/components/upload/ImageUpload';

interface EditBlogClientProps {
  blogId: string;
}

export default function EditBlogClient({ blogId }: EditBlogClientProps) {
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featuredImage: '',
    status: 'draft' as 'draft' | 'published',
    category: 'notes' as BlogCategory,
    metaTitle: '',
    metaDescription: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getAdminBlog(blogId)
      .then((blog) => {
        setFormData({
          title: blog.title,
          slug: blog.slug,
          excerpt: blog.excerpt || '',
          content: blog.content,
          featuredImage: blog.featuredImage || '',
          status: blog.status,
          category: blog.category,
          metaTitle: '',
          metaDescription: '',
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [blogId]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData({ ...formData, title, slug: generateSlug(title) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBlog(blogId, {
        title: formData.title,
        slug: formData.slug || undefined,
        excerpt: formData.excerpt || undefined,
        content: formData.content,
        featuredImage: formData.featuredImage || undefined,
        status: formData.status,
        category: formData.category,
      });
      toast.success('อัปเดตบทความสำเร็จ!');
    } catch (err: any) {
      toast.error(err.message || 'อัปเดตบทความไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('ลบบทความนี้ใช่หรือไม่? ไม่สามารถยกเลิกได้')) return;
    try {
      await deleteBlog(blogId);
      toast.success('ลบบทความสำเร็จ!');
      router.push('/admin/blogs');
    } catch {
      toast.error('ลบบทความไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">ไม่พบบทความ</h2>
        <p className="text-gray-600 mb-6">บทความที่คุณค้นหาไม่มีอยู่</p>
        <Link
          href="/admin/blogs"
          className="inline-flex items-center text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับไปหน้ารายการ
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin/blogs"
            className="flex items-center text-gray-600 hover:text-indigo-600 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับไปหน้ารายการ
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">แก้ไขบทความ</h1>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href={`/blogs/${formData.slug}`}
            target="_blank"
            className="flex items-center text-gray-600 hover:text-indigo-600 px-4 py-2 border border-gray-300 rounded-lg"
          >
            <Eye className="w-4 h-4 mr-2" />
            ดูตัวอย่าง
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center text-red-600 hover:text-red-700 px-4 py-2 border border-red-300 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            ลบ
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">เนื้อหา</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    หัวข้อ *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={handleTitleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="ใส่หัวข้อบทความ"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slug (URL)
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="blog-url-slug"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    คำอธิบายย่อ
                  </label>
                  <textarea
                    rows={3}
                    value={formData.excerpt}
                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="สรุปเนื้อหาบทความสั้นๆ"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    เนื้อหา *
                  </label>
                  <textarea
                    rows={20}
                    required
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="เขียนเนื้อหาบทความที่นี่... (รองรับ Markdown)"
                  />
                </div>
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">ตั้งค่า SEO</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Title
                  </label>
                  <input
                    type="text"
                    value={formData.metaTitle}
                    onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="ชื่อสำหรับ SEO (เว้นว่างใช้หัวข้อบทความ)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.metaDescription}
                    onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="คำอธิบายสำหรับ SEO (เว้นว่างใช้คำอธิบายย่อ)"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">เผยแพร่</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    หมวดหมู่ *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as BlogCategory })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="notes">Notes — บันทึกสั้นๆ เคล็ดลับ</option>
                    <option value="essays">Essays — บทความเชิงลึก</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    สถานะ
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="draft">แบบร่าง</option>
                    <option value="published">เผยแพร่</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      บันทึกการแก้ไข
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">รูปภาพปก</h2>
              <ImageUpload
                value={formData.featuredImage}
                onChange={(url) => setFormData({ ...formData, featuredImage: url })}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
