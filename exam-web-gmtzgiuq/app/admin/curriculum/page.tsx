'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminCurriculumTree,
  createSubject,
  updateSubject,
  deleteSubject,
  createChapter,
  createTopic,
  updateTopic,
  deleteTopic,
  type Subject,
  type Topic,
} from '@/lib/api/curriculum';

function InlineInput({
  defaultValue,
  onSave,
  onCancel,
  placeholder,
}: {
  defaultValue?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder: string;
}) {
  const [value, setValue] = useState(defaultValue || '');
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSave(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="border border-indigo-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-52"
      />
      <button onClick={() => value.trim() && onSave(value.trim())} className="text-green-600 hover:text-green-700">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#64748b',
];

export default function AdminCurriculumPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null); // subjectId
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectColor, setNewSubjectColor] = useState(COLORS[0]);

  useEffect(() => { loadTree(); }, []);

  async function loadTree() {
    setLoading(true);
    try {
      setSubjects(await getAdminCurriculumTree());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSubject(id: string) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Get all topics for a subject (flatten from chapters)
  function getTopics(subject: Subject): Topic[] {
    return (subject.chapters ?? []).flatMap((c) => c.topics ?? []);
  }

  // Get or create a default chapter for a subject, return its id
  async function getOrCreateDefaultChapter(subject: Subject): Promise<string> {
    const chapters = subject.chapters ?? [];
    if (chapters.length > 0) return chapters[0].id;
    const created = await createChapter({ subjectId: subject.id, name: '_default' });
    return created.id;
  }

  // ── Subject CRUD ──
  async function handleCreateSubject(name: string) {
    await createSubject({ name, color: newSubjectColor });
    setAddingSubject(false);
    loadTree();
  }

  async function handleUpdateSubject(id: string, name: string) {
    await updateSubject(id, { name });
    setEditingSubject(null);
    loadTree();
  }

  async function handleDeleteSubject(id: string, name: string) {
    if (!confirm(`ลบวิชา "${name}" และหัวข้อทั้งหมดข้างในด้วย?`)) return;
    await deleteSubject(id);
    loadTree();
  }

  // ── Topic CRUD ──
  async function handleCreateTopic(subject: Subject, name: string) {
    const chapterId = await getOrCreateDefaultChapter(subject);
    await createTopic({ chapterId, name });
    setAddingTopicFor(null);
    loadTree();
  }

  async function handleUpdateTopic(id: string, name: string) {
    await updateTopic(id, { name });
    setEditingTopic(null);
    loadTree();
  }

  async function handleDeleteTopic(id: string, name: string) {
    if (!confirm(`ลบหัวข้อ "${name}"?`)) return;
    await deleteTopic(id);
    loadTree();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <FadeIn>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-indigo-600" />
            จัดการหลักสูตร
          </h1>
          <p className="text-gray-500 mt-1">จัดการวิชาและหัวข้อข้อสอบ</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Add subject bar */}
          <div className="p-4 border-b border-gray-100">
            {addingSubject ? (
              <div className="flex items-center gap-3">
                <InlineInput
                  placeholder="ชื่อวิชา"
                  onSave={handleCreateSubject}
                  onCancel={() => setAddingSubject(false)}
                />
                <div className="flex gap-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewSubjectColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition"
                      style={{ backgroundColor: c, borderColor: newSubjectColor === c ? '#1e293b' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingSubject(true)}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-4 h-4" />
                เพิ่มวิชาใหม่
              </button>
            )}
          </div>

          {subjects.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>ยังไม่มีวิชา — กด "เพิ่มวิชาใหม่" ด้านบน</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {subjects.map((subject) => {
                const topics = getTopics(subject);
                const isOpen = expandedSubjects.has(subject.id);

                return (
                  <li key={subject.id}>
                    {/* Subject row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => toggleSubject(subject.id)}>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />

                      {editingSubject === subject.id ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <InlineInput
                            defaultValue={subject.name}
                            placeholder="ชื่อวิชา"
                            onSave={(v) => handleUpdateSubject(subject.id, v)}
                            onCancel={() => setEditingSubject(null)}
                          />
                        </span>
                      ) : (
                        <span className="font-semibold text-gray-900 flex-1">
                          {subject.iconEmoji && <span className="mr-1">{subject.iconEmoji}</span>}
                          {subject.name}
                          <span className="ml-2 text-xs text-gray-400 font-normal">{topics.length} หัวข้อ</span>
                        </span>
                      )}

                      <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setEditingSubject(subject.id)} className="p-1 text-gray-400 hover:text-indigo-600">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteSubject(subject.id, subject.name)} className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Topics (shown when subject expanded) */}
                    {isOpen && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {topics.length === 0 && addingTopicFor !== subject.id && (
                          <p className="pl-8 pr-4 py-2 text-xs text-gray-400">ยังไม่มีหัวข้อ</p>
                        )}

                        {topics.map((topic) => (
                          <div key={topic.id} className="flex items-center gap-2 pl-8 pr-4 py-2 hover:bg-gray-100 border-b border-gray-50">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                            {editingTopic === topic.id ? (
                              <InlineInput
                                defaultValue={topic.name}
                                placeholder="ชื่อหัวข้อ"
                                onSave={(v) => handleUpdateTopic(topic.id, v)}
                                onCancel={() => setEditingTopic(null)}
                              />
                            ) : (
                              <span className="text-sm text-gray-700 flex-1">{topic.name}</span>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                              <button onClick={() => setEditingTopic(topic.id)} className="p-1 text-gray-400 hover:text-indigo-600">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleDeleteTopic(topic.id, topic.name)} className="p-1 text-gray-400 hover:text-red-600">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Add topic */}
                        <div className="pl-8 pr-4 py-2.5">
                          {addingTopicFor === subject.id ? (
                            <InlineInput
                              placeholder="ชื่อหัวข้อ"
                              onSave={(v) => handleCreateTopic(subject, v)}
                              onCancel={() => setAddingTopicFor(null)}
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setAddingTopicFor(subject.id);
                                setExpandedSubjects((p) => new Set([...p, subject.id]));
                              }}
                              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                            >
                              <Plus className="w-3 h-3" />
                              เพิ่มหัวข้อ
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
