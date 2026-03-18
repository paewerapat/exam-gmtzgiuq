'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Library, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getPublicCurriculumTree,
  type Subject,
  type Chapter,
  type Topic,
} from '@/lib/api/curriculum';

// ── Subject card ─────────────────────────────────────────────
function SubjectCard({ subject }: { subject: Subject }) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(),
  );

  const color = subject.color || '#6366f1';
  const chapters = subject.chapters ?? [];

  function toggleChapter(id: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Colored header */}
      <div
        className="px-5 py-4 flex items-start justify-between gap-3"
        style={{ backgroundColor: color }}
      >
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">
            {subject.iconEmoji && (
              <span className="mr-1.5">{subject.iconEmoji}</span>
            )}
            {subject.name}
          </h2>
          <p className="text-white/70 text-xs mt-0.5">
            {subject.examCount ?? 0} ชุดข้อสอบ
          </p>
        </div>
        <Link
          href={`/dashboard/library/subject/${subject.id}`}
          className="flex-shrink-0 px-3 py-1.5 bg-white rounded-full text-xs font-semibold whitespace-nowrap transition hover:bg-white/90"
          style={{ color }}
        >
          All Topics
        </Link>
      </div>

      {/* Chapter / Topic list */}
      <div className="divide-y divide-gray-50 flex-1">
        {chapters.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 text-center">
            ยังไม่มีบทเรียน
          </div>
        ) : (
          chapters.map((chapter: Chapter) => {
            const isOpen = expandedChapters.has(chapter.id);
            const topics = chapter.topics ?? [];
            return (
              <div key={chapter.id}>
                {/* Chapter row */}
                <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleChapter(chapter.id)}
                      className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <Link
                      href={`/dashboard/library/chapter/${chapter.id}`}
                      className="font-semibold text-gray-800 text-sm hover:text-indigo-600 transition truncate"
                    >
                      {chapter.name}
                    </Link>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {chapter.examCount ?? 0} ชุด
                  </span>
                </div>

                {/* Topics */}
                {isOpen && (
                  <div className="bg-gray-50/60">
                    {topics.length === 0 ? (
                      <p className="pl-11 pr-5 py-2 text-xs text-gray-400">
                        ยังไม่มีหัวข้อ
                      </p>
                    ) : (
                      topics.map((topic: Topic) => (
                        <Link
                          key={topic.id}
                          href={`/dashboard/library/topic/${topic.id}`}
                          className="flex items-center justify-between pl-11 pr-5 py-2.5 hover:bg-gray-100 transition"
                        >
                          <span className="text-sm text-gray-600 hover:text-gray-900">
                            {topic.name}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                            {topic.examCount ?? 0} ชุด
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default function LibraryPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicCurriculumTree()
      .then(setSubjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <FadeIn>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-400">
          Dashboard /{' '}
          <span className="text-gray-600 font-medium">คลังข้อสอบ</span>
        </p>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">คลังข้อสอบ</h1>
      <p className="text-sm text-gray-500 mb-6">
        เลือกวิชา บท หรือหัวข้อที่ต้องการทบทวน
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
        </div>
      ) : subjects.length === 0 ? (
        <div className="py-32 text-center">
          <Library className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">ยังไม่มีหลักสูตร</p>
          <p className="text-gray-300 text-sm mt-1">
            ผู้ดูแลระบบยังไม่ได้เพิ่มวิชาและหัวข้อ
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      )}
    </FadeIn>
  );
}
