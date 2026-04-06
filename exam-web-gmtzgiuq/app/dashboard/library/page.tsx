'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Library, Loader2, PlayCircle } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getPublicCurriculumTree, type Subject, type Topic } from '@/lib/api/curriculum';

// ── Subject card ─────────────────────────────────────────────
function SubjectCard({ subject }: { subject: Subject }) {
  const color = subject.color || '#6366f1';

  // Flatten all topics from all chapters
  const allTopics: Topic[] = (subject.chapters ?? []).flatMap((c) => c.topics ?? []);
  const totalQuestions = allTopics.reduce((sum, t) => sum + (t.questionCount ?? t.examCount ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Colored header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ backgroundColor: color }}>
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">
            {subject.iconEmoji && <span className="mr-1.5">{subject.iconEmoji}</span>}
            {subject.name}
          </h2>
          <p className="text-white/70 text-xs mt-0.5">{totalQuestions} ข้อ</p>
        </div>
        <Link
          href={`/practice/subject/${subject.id}`}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-xs font-semibold whitespace-nowrap transition hover:bg-white/90"
          style={{ color }}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          เริ่มทำทั้งวิชา
        </Link>
      </div>

      {/* Topics list (no chapter level) */}
      <div className="divide-y divide-gray-50 flex-1">
        {allTopics.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 text-center">ยังไม่มีหัวข้อ</div>
        ) : (
          allTopics.map((topic) => (
            <Link
              key={topic.id}
              href={`/practice/topic/${topic.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-indigo-50 transition group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600 transition">
                {topic.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                {topic.questionCount ?? topic.examCount ?? 0} ข้อ
              </span>
            </Link>
          ))
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
        เลือกวิชาหรือหัวข้อที่ต้องการทบทวน
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      )}
    </FadeIn>
  );
}
