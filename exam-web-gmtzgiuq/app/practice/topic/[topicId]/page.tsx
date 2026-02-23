'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  PlayCircle,
  Loader2,
  FileQuestion,
  Clock,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getTopic, type Topic } from '@/lib/api/curriculum';
import { getExamsByTopic, type Exam } from '@/lib/api/exams';

export default function TopicExamsPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = use(params);
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [t, data] = await Promise.all([
          getTopic(topicId).catch(() => null),
          getExamsByTopic(topicId).catch(() => ({ items: [] })),
        ]);
        setTopic(t);
        setExams(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [topicId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <FadeIn>
          {/* Back */}
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-indigo-600" />
              {topic?.name || 'หัวข้อ'}
            </h1>
            {topic?.description && (
              <p className="text-gray-500 mt-1">{topic.description}</p>
            )}
          </div>

          {/* Exam list */}
          {exams.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <FileQuestion className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-500 mb-2">
                ยังไม่มีชุดข้อสอบ
              </h2>
              <p className="text-gray-400 text-sm">
                หัวข้อนี้ยังไม่มีชุดข้อสอบที่เปิดให้ทำ
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/practice/exam/${exam.id}`}
                  className="group flex items-center justify-between bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition">
                      {exam.title}
                    </h3>
                    {exam.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                        {exam.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <FileQuestion className="w-3.5 h-3.5" />
                        {exam.questionCount} ข้อ
                      </span>
                    </div>
                  </div>
                  <PlayCircle className="w-8 h-8 text-indigo-400 group-hover:text-indigo-600 flex-shrink-0 ml-4 transition" />
                </Link>
              ))}
            </div>
          )}
        </FadeIn>
      </div>
    </div>
  );
}
