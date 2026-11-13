'use client';

import { useState, useEffect } from 'react';
import { Tag, Plus, Pencil, Trash2, Loader2, Check, X, GripVertical } from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import { getProAdminConfig } from '@/lib/api/pro';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from '@/lib/api/categories';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function InlineInput({
  defaultValue,
  defaultSlug,
  onSave,
  onCancel,
  showSlug = false,
}: {
  defaultValue?: string;
  defaultSlug?: string;
  onSave: (name: string, slug: string) => void;
  onCancel: () => void;
  showSlug?: boolean;
}) {
  const [name, setName] = useState(defaultValue || '');
  const [slug, setSlug] = useState(defaultSlug || '');
  const [slugManual, setSlugManual] = useState(!!defaultSlug);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugManual) setSlug(slugify(v));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        autoFocus
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && slug.trim()) onSave(name.trim(), slug.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="ชื่อหมวดหมู่ เช่น คณิตศาสตร์"
        className="border border-indigo-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-44 dark:border-indigo-700"
      />
      <input
        value={slug}
        onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && slug.trim()) onSave(name.trim(), slug.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="slug เช่น mathematics"
        className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-36 font-mono text-xs"
      />
      <button onClick={() => name.trim() && slug.trim() && onSave(name.trim(), slug.trim())} className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // สนาม Pro สำหรับ dropdown "สนาม" (task 17) undefined = กำลังโหลด, null = โหลดไม่สำเร็จ
  const [venues, setVenues] = useState<{ id: string; name: string; isActive: boolean }[] | null | undefined>(undefined);
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    getProAdminConfig(controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) setVenues(config.venues.map((v) => ({ id: v.id, name: v.name, isActive: v.isActive })));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load pro venues:', err);
        setVenues(null);
      });
    return () => controller.abort();
  }, []);

  async function handleVenueChange(cat: Category, venueId: string | null) {
    setSavingVenueId(cat.id);
    try {
      await updateCategory(cat.id, { venueId });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, venueId } : c)));
      toast.success(`ตั้งสนามของ "${cat.name}" แล้ว`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'ตั้งสนามไม่สำเร็จ');
    } finally {
      setSavingVenueId(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      setCategories(await getCategories());
    } catch {
      setError('ไม่สามารถโหลดหมวดหมู่ได้');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(name: string, slug: string) {
    setError(null);
    try {
      await createCategory({ name, slug, orderIndex: categories.length });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'ไม่สามารถสร้างหมวดหมู่ได้');
    }
  }

  async function handleUpdate(id: string, name: string, slug: string) {
    setError(null);
    try {
      await updateCategory(id, { name, slug });
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'ไม่สามารถแก้ไขหมวดหมู่ได้');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบหมวดหมู่ "${name}"?\nข้อสอบและคำถามที่ใช้หมวดหมู่นี้จะยังคงอยู่แต่ค่า slug จะไม่ match กับหมวดหมู่ใด`)) return;
    setError(null);
    try {
      await deleteCategory(id);
      await load();
    } catch (e: any) {
      setError(e.message || 'ไม่สามารถลบหมวดหมู่ได้');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <FadeIn>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Tag className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            จัดการหมวดหมู่
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">หมวดหมู่ที่ใช้จัดกลุ่มชุดข้อสอบ</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">{categories.length} หมวดหมู่</span>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium dark:hover:text-indigo-200"
              >
                <Plus className="w-4 h-4" />
                เพิ่มหมวดหมู่
              </button>
            )}
          </div>

          {/* Column headers */}
          <div className="hidden sm:grid px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 grid-cols-[1fr_160px_160px_80px] gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span>ชื่อหมวดหมู่</span>
            <span>Slug (ใช้ในระบบ)</span>
            <span>สนาม (สมาชิก Pro)</span>
            <span></span>
          </div>
          {venues === null && (
            <p className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-100 dark:border-amber-800/50">
              โหลดรายการสนามไม่สำเร็จ ตั้งสนามของหมวดหมู่ไม่ได้ในตอนนี้
            </p>
          )}

          {/* Add row */}
          {adding && (
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/30">
              <InlineInput
                onSave={handleCreate}
                onCancel={() => setAdding(false)}
                showSlug
              />
            </div>
          )}

          {/* List */}
          {categories.length === 0 && !adding ? (
            <div className="p-12 text-center text-gray-400">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>ยังไม่มีหมวดหมู่ — กด "เพิ่มหมวดหมู่" ด้านบน</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {categories.map((cat) => (
                <li key={cat.id} className="px-4 py-3 hover:bg-gray-50 flex flex-wrap sm:flex-nowrap items-center gap-3 dark:hover:bg-gray-700/50">
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                  {editingId === cat.id ? (
                    <div className="flex-1">
                      <InlineInput
                        defaultValue={cat.name}
                        defaultSlug={cat.slug}
                        onSave={(name, slug) => handleUpdate(cat.id, name, slug)}
                        onCancel={() => setEditingId(null)}
                        showSlug
                      />
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-gray-900 dark:text-gray-100 text-sm">{cat.name}</span>
                      <span className="w-40 text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{cat.slug}</span>
                      <div className="w-40 flex items-center gap-1">
                        <label htmlFor={`venue-${cat.id}`} className="sr-only">
                          สนามของหมวดหมู่ {cat.name}
                        </label>
                        <select
                          id={`venue-${cat.id}`}
                          value={cat.venueId ?? ''}
                          disabled={!venues || savingVenueId === cat.id}
                          onChange={(e) => handleVenueChange(cat, e.target.value || null)}
                          className="w-full min-h-9 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-60 dark:[color-scheme:dark]"
                        >
                          <option value="">ไม่ระบุ</option>
                          {(venues ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{v.isActive ? '' : ' (ปิดอยู่)'}
                            </option>
                          ))}
                          {/* สนามที่ตั้งไว้แต่ไม่อยู่ในรายการ (ถูกลบ/โหลดไม่ได้) */}
                          {cat.venueId && !(venues ?? []).some((v) => v.id === cat.venueId) && (
                            <option value={cat.venueId}>{venues === undefined ? 'กำลังโหลด...' : 'สนามที่ไม่พบ'}</option>
                          )}
                        </select>
                        {savingVenueId === cat.id && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400 flex-shrink-0" aria-hidden="true" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => setEditingId(cat.id)} className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(cat.id, cat.name)} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-300">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400">
          หมายเหตุ: Slug คือค่าที่เก็บในฐานข้อมูล (เช่น <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">mathematics</code>) ควรใช้ตัวพิมพ์เล็กและ underscore เท่านั้น
        </p>
      </FadeIn>
    </div>
  );
}
