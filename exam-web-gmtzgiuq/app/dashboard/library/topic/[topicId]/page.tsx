'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlayCircle, BookOpen, Loader2 } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { getExamsByTopic, type Exam } from '@/lib/api/exams';
import { getTopic, type Topic } from '@/lib/api/curriculum';
import {
  categoryDisplayNames,
  type QuestionCategory,
} from '@/lib/api/questions';

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
  const catName =
    categoryDisplayNames[exam.category as QuestionCategory] ?? exam.category;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div
        className="relative h-28 p-4 flex flex-col justify-end overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">
          {catName}
        </span>
        <h3 className="text-white font-bold text-sm leading-snug line-clamp-2">
          {exam.title}
        </h3>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-gray-400 mb-4">
          {exam.questionCount} ข้อ
        </p>
        <div className="mt-auto">
          <Link
            href={`/exam/${exam.id}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full transition"
          >
            <PlayCircle className="w-4 h-4" />
            เริ่มทำข้อสอบจริง
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TopicExamsPage() {
  const params = useParams();
  const topicId = params.topicId as string;

  const [topic, setTopic] = useState<Topic | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTopic(topicId), getExamsByTopic(topicId, 1, 50)])
      .then(([t, result]) => {
        setTopic(t);
        setExams(result.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [topicId]);

  return (
    <FadeIn>
      {/* Back */}
      <Link
        href="/dashboard/library"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับไปคลังข้อสอบ
      </Link>

      {topic && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {topic.name}
          </h1>
          {topic.description && (
            <p className="text-sm text-gray-500 mb-6">{topic.description}</p>
          )}
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
        </div>
      ) : exams.length === 0 ? (
        <div className="py-32 text-center">
          <BookOpen className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            ยังไม่มีข้อสอบในหัวข้อนี้
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {exams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </FadeIn>
  );
}
