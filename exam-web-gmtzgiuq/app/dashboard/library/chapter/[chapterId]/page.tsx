'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlayCircle, BookOpen, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getExamsByTopic, type Exam } from '@/lib/api/exams';
import { getChapter, type Chapter, type Topic } from '@/lib/api/curriculum';
import { categoryDisplayNames, type QuestionCategory } from '@/lib/api/questions';

const categoryGradients: Record<string, [string, string]> = {
  mathematics:       ['#FF6B35', '#F7931E'],
  science:           ['#11998e', '#43e97b'],
  english:           ['#4776E6', '#8E54E9'],
  toeic:             ['#f093fb', '#f5576c'],
  gat_pat:           ['#4facfe', '#00f2fe'],
  o_net:             ['#43e97b', '#38f9d7'],
  kor_por:           ['#fa709a', '#fee140'],
  general_knowledge: ['#a18cd1', '#fbc2eb'],
  driving_license:   ['#fccb90', '#d57eeb'],
};
const defaultGradient: [string, string] = ['#667eea', '#764ba2'];

function getBannerGradient(category: string): [string, string] {
  return categoryGradients[category] ?? defaultGradient;
}

function ExamCard({ exam }: { exam: Exam }) {
  const [from, to] = getBannerGradient(exam.category);
  const catName = categoryDisplayNames[exam.category as QuestionCategory] ?? exam.category;
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div
        className="relative h-24 p-3 flex flex-col justify-end overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-0.5">{catName}</span>
        <h3 className="text-white font-bold text-sm leading-snug line-clamp-2">{exam.title}</h3>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs text-gray-400 mb-3">{exam.questionCount} ข้อ</p>
        <div className="mt-auto">
          <Link
            href={`/exam/${exam.id}`}
            className="flex items-center justify-center gap-1.5 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full transition"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            เริ่มทำ
          </Link>
        </div>
      </div>
    </div>
  );
}

function TopicSection({ topic }: { topic: Topic }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function handleToggle() {
    setOpen((v) => !v);
    if (!loaded) {
      setLoading(true);
      try {
        const result = await getExamsByTopic(topic.id, 1, 50);
        setExams(result.items);
        setLoaded(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition text-left"
      >
        <span className="font-medium text-gray-800 flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          {topic.name}
        </span>
        <span className="text-xs text-gray-400">{topic.examCount ?? 0} ชุด</span>
      </button>
      {open && (
        <div className="px-5 pb-5 bg-gray-50/60">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : exams.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">ยังไม่มีข้อสอบ</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-3">
              {exams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChapterPage() {
  const params = useParams();
  const chapterId = params.chapterId as string;

  const [chapter, setChapter] = useState<(Chapter & { subject?: { id: string; name: string; color: string } }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChapter(chapterId)
      .then((data) => setChapter(data as any))
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

          {/* Topics */}
          {topics.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">ยังไม่มีหัวข้อในบทนี้</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topics.map((topic) => (
                <TopicSection key={topic.id} topic={topic} />
              ))}
            </div>
          )}
        </>
      )}
    </FadeIn>
  );
}
