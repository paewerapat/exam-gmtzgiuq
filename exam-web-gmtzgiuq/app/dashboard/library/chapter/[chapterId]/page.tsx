'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlayCircle, BookOpen, Loader2, ChevronRight } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getPublicCurriculumTree, type Chapter, type Subject, type Topic } from '@/lib/api/curriculum';

export default function ChapterPage() {
  const params = useParams();
  const chapterId = params.chapterId as string;

  const [chapter, setChapter] = useState<(Chapter & { subject?: Subject }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicCurriculumTree()
      .then((subjects) => {
        for (const s of subjects) {
          const found = s.chapters?.find((c) => c.id === chapterId);
          if (found) {
            setChapter({ ...found, subject: s } as any);
            break;
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [chapterId]);

  const subjectColor = (chapter as any)?.subject?.color || '#6366f1';
  const topics: Topic[] = (chapter as any)?.topics ?? [];

  return (
    <FadeIn>
      <Link
        href="/dashboard/library"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับไปคลังข้อสอบ
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
        </div>
      ) : !chapter ? (
        <div className="py-32 text-center">
          <BookOpen className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">ไม่พบบทนี้</p>
        </div>
      ) : (
        <>
          {/* Chapter header */}
          <div
            className="rounded-2xl px-6 py-5 mb-6"
            style={{ backgroundColor: subjectColor }}
          >
            {(chapter as any).subject && (
              <p className="text-white/70 text-xs mb-1">
                {(chapter as any).subject.name}
              </p>
            )}
            <h1 className="text-white font-bold text-2xl">{chapter.name}</h1>
            <p className="text-white/70 text-sm mt-1">
              {topics.length} หัวข้อ
            </p>
          </div>

          {/* Topics — click to start exam directly */}
          {topics.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">ยังไม่มีหัวข้อในบทนี้</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topics.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/practice/topic/${topic.id}`}
                  className="group flex items-center justify-between bg-white rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: subjectColor }}
                    />
                    <div>
                      <p className="font-semibold text-gray-800 group-hover:text-indigo-600 transition">
                        {topic.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {topic.questionCount ?? topic.examCount ?? 0} ข้อ
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-500 group-hover:text-indigo-700 transition">
                    <PlayCircle className="w-5 h-5" />
                    <span className="text-sm font-medium hidden sm:block">เริ่มทำ</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </FadeIn>
  );
}
