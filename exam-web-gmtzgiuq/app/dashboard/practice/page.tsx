'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
  PlayCircle,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  getSubjects,
  getChaptersBySubject,
  getTopicsByChapter,
  type Subject,
  type Chapter,
  type Topic,
} from '@/lib/api/curriculum';

export default function PracticePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSubjectId = searchParams.get('subject');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  // When a subject is selected
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [topicsByChapter, setTopicsByChapter] = useState<Record<string, Topic[]>>({});
  const [loadingTopics, setLoadingTopics] = useState<Set<string>>(new Set());

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  // Load subjects on mount
  useEffect(() => {
    getSubjects()
      .then(setSubjects)
      .catch(console.error)
      .finally(() => setLoadingSubjects(false));
  }, []);

  // Load chapters when subject changes
  useEffect(() => {
    if (!selectedSubjectId) return;
    setLoadingChapters(true);
    setChapters([]);
    setExpandedChapters(new Set());
    setTopicsByChapter({});
    getChaptersBySubject(selectedSubjectId)
      .then(setChapters)
      .catch(console.error)
      .finally(() => setLoadingChapters(false));
  }, [selectedSubjectId]);

  async function toggleChapter(chapterId: string) {
    const isExpanding = !expandedChapters.has(chapterId);
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
      return next;
    });

    if (isExpanding && !topicsByChapter[chapterId]) {
      setLoadingTopics((prev) => new Set([...prev, chapterId]));
      try {
        const topics = await getTopicsByChapter(chapterId);
        setTopicsByChapter((prev) => ({ ...prev, [chapterId]: topics }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTopics((prev) => {
          const next = new Set(prev);
          next.delete(chapterId);
          return next;
        });
      }
    }
  }

  if (loadingSubjects) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // ── Subject List ──────────────────────────────────────────
  if (!selectedSubjectId) {
    return (
      <FadeIn>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-indigo-600" />
            เลือกวิชาที่ต้องการฝึก
          </h1>
          <p className="text-gray-500 mt-1">เลือกวิชาเพื่อดูบทและหัวข้อข้อสอบ</p>
        </div>

        {subjects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-500 mb-2">
              ยังไม่มีหลักสูตร
            </h2>
            <p className="text-gray-400 text-sm">
              ผู้ดูแลระบบยังไม่ได้เพิ่มวิชาไว้
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((subject) => (
              <button
                key={subject.id}
                onClick={() => router.push(`/dashboard/practice?subject=${subject.id}`)}
                className="group relative bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow text-left"
              >
                {/* Color bar */}
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: subject.color }}
                />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: subject.color + '20' }}
                    >
                      {subject.iconEmoji || '📚'}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 mt-1 transition-colors" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">{subject.name}</h3>
                  {subject.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {subject.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </FadeIn>
    );
  }

  // ── Chapter & Topic List ───────────────────────────────────
  return (
    <FadeIn>
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/practice')}
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          เลือกวิชาอื่น
        </button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: (selectedSubject?.color || '#6366f1') + '20' }}
          >
            {selectedSubject?.iconEmoji || '📚'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedSubject?.name || 'วิชา'}
            </h1>
            <p className="text-gray-500 text-sm">เลือกบทที่ต้องการฝึก</p>
          </div>
        </div>
      </div>

      {loadingChapters ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : chapters.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">ยังไม่มีบทในวิชานี้</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {chapters.map((chapter, idx) => {
            const isExpanded = expandedChapters.has(chapter.id);
            const topics = topicsByChapter[chapter.id] || [];
            const isLoadingTopics = loadingTopics.has(chapter.id);

            return (
              <div
                key={chapter.id}
                className={idx > 0 ? 'border-t border-gray-100' : ''}
              >
                {/* Chapter header */}
                <button
                  onClick={() => toggleChapter(chapter.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: selectedSubject?.color || '#6366f1' }}
                    >
                      {idx + 1}
                    </div>
                    <span className="font-semibold text-gray-900 text-left">
                      {chapter.name}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {/* Topics */}
                {isExpanded && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    {isLoadingTopics ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      </div>
                    ) : topics.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-6">
                        ยังไม่มีหัวข้อในบทนี้
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {topics.map((topic) => (
                          <Link
                            key={topic.id}
                            href={`/practice/topic/${topic.id}`}
                            className="flex items-center justify-between px-5 py-3 pl-16 hover:bg-indigo-50 transition group"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                              <span className="text-sm text-gray-700 group-hover:text-indigo-700">
                                {topic.name}
                              </span>
                            </div>
                            <PlayCircle className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FadeIn>
  );
}
