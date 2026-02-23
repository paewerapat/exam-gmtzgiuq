'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getAdminCurriculumTree,
  createSubject,
  updateSubject,
  deleteSubject,
  createChapter,
  updateChapter,
  deleteChapter,
  createTopic,
  updateTopic,
  deleteTopic,
  type Subject,
  type Chapter,
  type Topic,
} from '@/lib/api/curriculum';

// ── Inline Edit Input ─────────────────────────────────────
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
        className="border border-indigo-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-48"
      />
      <button
        onClick={() => value.trim() && onSave(value.trim())}
        className="text-green-600 hover:text-green-700"
      >
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Color Picker ──────────────────────────────────────────
const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#64748b',
];

export default function AdminCurriculumPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  // Edit states
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [addingChapterFor, setAddingChapterFor] = useState<string | null>(null);
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectColor, setNewSubjectColor] = useState(COLORS[0]);

  useEffect(() => {
    loadTree();
  }, []);

  async function loadTree() {
    setLoading(true);
    try {
      const data = await getAdminCurriculumTree();
      setSubjects(data);
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

  function toggleChapter(id: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    if (!confirm(`ลบวิชา "${name}" และบท/หัวข้อทั้งหมดข้างในด้วย?`)) return;
    await deleteSubject(id);
    loadTree();
  }

  // ── Chapter CRUD ──
  async function handleCreateChapter(subjectId: string, name: string) {
    await createChapter({ subjectId, name });
    setAddingChapterFor(null);
    loadTree();
  }

  async function handleUpdateChapter(id: string, name: string) {
    await updateChapter(id, { name });
    setEditingChapter(null);
    loadTree();
  }

  async function handleDeleteChapter(id: string, name: string) {
    if (!confirm(`ลบบท "${name}" และหัวข้อทั้งหมดข้างในด้วย?`)) return;
    await deleteChapter(id);
    loadTree();
  }

  // ── Topic CRUD ──
  async function handleCreateTopic(chapterId: string, name: string) {
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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-indigo-600" />
              จัดการหลักสูตร
            </h1>
            <p className="text-gray-500 mt-1">
              จัดการวิชา บท และหัวข้อข้อสอบ
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
                      style={{
                        backgroundColor: c,
                        borderColor: newSubjectColor === c ? '#1e293b' : 'transparent',
                      }}
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
              {subjects.map((subject) => (
                <li key={subject.id}>
                  {/* Subject row */}
                  <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                    <button
                      onClick={() => toggleSubject(subject.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedSubjects.has(subject.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: subject.color }}
                    />
                    {editingSubject === subject.id ? (
                      <InlineInput
                        defaultValue={subject.name}
                        placeholder="ชื่อวิชา"
                        onSave={(v) => handleUpdateSubject(subject.id, v)}
                        onCancel={() => setEditingSubject(null)}
                      />
                    ) : (
                      <span
                        className="font-semibold text-gray-900 flex-1 cursor-pointer"
                        onClick={() => toggleSubject(subject.id)}
                      >
                        {subject.iconEmoji && <span className="mr-1">{subject.iconEmoji}</span>}
                        {subject.name}
                        <span className="ml-2 text-xs text-gray-400 font-normal">
                          {subject.chapters?.length || 0} บท
                        </span>
                      </span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => setEditingSubject(subject.id)}
                        className="p-1 text-gray-400 hover:text-indigo-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subject.id, subject.name)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Chapters */}
                  {expandedSubjects.has(subject.id) && (
                    <div className="bg-gray-50">
                      {(subject.chapters || []).map((chapter) => (
                        <div key={chapter.id}>
                          {/* Chapter row */}
                          <div className="flex items-center gap-2 pl-10 pr-4 py-2.5 hover:bg-gray-100">
                            <button
                              onClick={() => toggleChapter(chapter.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {expandedChapters.has(chapter.id) ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {editingChapter === chapter.id ? (
                              <InlineInput
                                defaultValue={chapter.name}
                                placeholder="ชื่อบท"
                                onSave={(v) => handleUpdateChapter(chapter.id, v)}
                                onCancel={() => setEditingChapter(null)}
                              />
                            ) : (
                              <span
                                className="text-sm font-medium text-gray-700 flex-1 cursor-pointer"
                                onClick={() => toggleChapter(chapter.id)}
                              >
                                {chapter.name}
                                <span className="ml-2 text-xs text-gray-400 font-normal">
                                  {chapter.topics?.length || 0} หัวข้อ
                                </span>
                              </span>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => setEditingChapter(chapter.id)}
                                className="p-1 text-gray-400 hover:text-indigo-600"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteChapter(chapter.id, chapter.name)}
                                className="p-1 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Topics */}
                          {expandedChapters.has(chapter.id) && (
                            <div className="bg-white">
                              {(chapter.topics || []).map((topic) => (
                                <div
                                  key={topic.id}
                                  className="flex items-center gap-2 pl-20 pr-4 py-2 hover:bg-gray-50 border-b border-gray-50"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                                  {editingTopic === topic.id ? (
                                    <InlineInput
                                      defaultValue={topic.name}
                                      placeholder="ชื่อหัวข้อ"
                                      onSave={(v) => handleUpdateTopic(topic.id, v)}
                                      onCancel={() => setEditingTopic(null)}
                                    />
                                  ) : (
                                    <span className="text-sm text-gray-600 flex-1">
                                      {topic.name}
                                    </span>
                                  )}
                                  <div className="flex items-center gap-1 ml-auto">
                                    <button
                                      onClick={() => setEditingTopic(topic.id)}
                                      className="p-1 text-gray-400 hover:text-indigo-600"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTopic(topic.id, topic.name)}
                                      className="p-1 text-gray-400 hover:text-red-600"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}

                              {/* Add topic */}
                              <div className="pl-20 pr-4 py-2">
                                {addingTopicFor === chapter.id ? (
                                  <InlineInput
                                    placeholder="ชื่อหัวข้อ"
                                    onSave={(v) => handleCreateTopic(chapter.id, v)}
                                    onCancel={() => setAddingTopicFor(null)}
                                  />
                                ) : (
                                  <button
                                    onClick={() => setAddingTopicFor(chapter.id)}
                                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                                  >
                                    <Plus className="w-3 h-3" />
                                    เพิ่มหัวข้อ
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add chapter */}
                      <div className="pl-10 pr-4 py-2.5">
                        {addingChapterFor === subject.id ? (
                          <InlineInput
                            placeholder="ชื่อบท"
                            onSave={(v) => handleCreateChapter(subject.id, v)}
                            onCancel={() => setAddingChapterFor(null)}
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setAddingChapterFor(subject.id);
                              setExpandedSubjects((p) => new Set([...p, subject.id]));
                            }}
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                          >
                            <Plus className="w-3 h-3" />
                            เพิ่มบท
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
