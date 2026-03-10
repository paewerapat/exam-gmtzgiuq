'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Loader2, Clock, BookOpen, Trophy, Search, ChevronDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import FadeIn from '@/components/animations/FadeIn';
import {
  getMyAttempts, getMyStats,
  type ExamAttempt, type UserAttemptStats,
} from '@/lib/api/attempts';
import { categoryDisplayNames, type QuestionCategory } from '@/lib/api/questions';
import { formatTimeReadable } from '@/lib/exam-utils';

// ── Helpers ───────────────────────────────────────────────────────────

function formatHours(seconds: number) {
  if (!seconds) return '0 นาที';
  const h = seconds / 3600;
  return h < 1 ? `${Math.round(seconds / 60)} นาที` : `${h.toFixed(1)} ชม.`;
}

function getBarColor(score: number) {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getRecommendation(score: number) {
  if (score >= 80) return { title: 'ยกระดับคะแนนให้สูง!', sub: 'ฝึกทำข้อสอบชุดอื่นเพื่อรักษาฟอร์ม', bg: 'bg-violet-50', btn: 'text-violet-600' };
  if (score >= 60) return { title: 'พร้อมพัฒนาต่อไหม?', sub: 'ฝึกเพิ่มอีกนิด เป้าหมาย 80% อยู่ไม่ไกล', bg: 'bg-blue-50', btn: 'text-blue-600' };
  return { title: 'ฝึกอีกนิดเพื่อทะลุเป้า', sub: 'ทบทวนและฝึกเพิ่มอีกนิด', bg: 'bg-rose-50', btn: 'text-rose-600' };
}

// ── Attempt Card ──────────────────────────────────────────────────────

function AttemptCard({ attempt, scoreChange }: { attempt: ExamAttempt; scoreChange: number | null }) {
  const score = Math.round(Number(attempt.score));
  const rec = getRecommendation(score);
  const catName = categoryDisplayNames[attempt.category as QuestionCategory] || attempt.category;
  const examLink = attempt.examId
    ? attempt.mode === 'exam' ? `/exam/${attempt.examId}` : `/practice/exam/${attempt.examId}`
    : '#';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex">
      {/* Left */}
      <div className="flex-1 p-5">
        <span className="inline-block text-[11px] font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full mb-2 uppercase tracking-wide">
          {catName}
        </span>
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-0.5">{attempt.examTitle}</h3>
        <p className="text-xs text-gray-400 mb-3">
          {new Date(attempt.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          {' · '}ใช้เวลา {formatTimeReadable(attempt.totalTime)}
        </p>

        {/* Score */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">{attempt.correctAnswers}/{attempt.totalQuestions}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{score}%</span>
            {scoreChange !== null && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${scoreChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {scoreChange >= 0 ? '+' : ''}{scoreChange}%
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: getBarColor(score) }} />
        </div>

        <Link
          href={`/dashboard/history/${attempt.id}`}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 font-medium border border-gray-300 rounded-full px-4 py-1.5 transition hover:border-gray-400"
        >
          ดูรายละเอียดข้อสอบ <span className="text-sm leading-none">›</span>
        </Link>
      </div>

      <div className="w-px bg-gray-100" />

      {/* Right: recommendation */}
      <div className={`w-56 flex-shrink-0 p-5 ${rec.bg} flex flex-col justify-between`}>
        <div>
          <p className="text-sm font-bold text-gray-800">{rec.title}</p>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{rec.sub}</p>
        </div>
        {attempt.examId && (
          <Link
            href={examLink}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full transition"
          >
            ทำข้อสอบซ้ำ <span className="text-sm leading-none">›</span>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const change = payload[0]?.payload?.change;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[140px]">
      <p className="text-gray-500 text-xs mb-1.5">{payload[0]?.payload?.fullDate || label}</p>
      <div className="flex items-center gap-2">
        <p className="font-bold text-indigo-600 text-base">{score}%</p>
        {change !== null && change !== undefined && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${change >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

const LIMIT = 10;

export default function HistoryPage() {
  const [stats, setStats] = useState<UserAttemptStats | null>(null);
  const [allAttempts, setAllAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const [selectedExamTitle, setSelectedExamTitle] = useState('');
  const [chartDropdownOpen, setChartDropdownOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, attemptsData] = await Promise.all([
          getMyStats().catch(() => null),
          getMyAttempts({ limit: 100 }),
        ]);
        setStats(statsData);
        const completed = attemptsData.items.filter((a) => a.status === 'completed');
        setAllAttempts(completed);
        // Default to an exam that has multiple attempts, or '' to show all
        if (completed.length > 0) {
          const countByExam = new Map<string, number>();
          completed.forEach((a) => countByExam.set(a.examTitle, (countByExam.get(a.examTitle) ?? 0) + 1));
          const multiAttempt = [...countByExam.entries()].find(([, c]) => c >= 2);
          setSelectedExamTitle(multiAttempt ? multiAttempt[0] : '');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Chart data
  const examTitles = useMemo(() => [...new Set(allAttempts.map((a) => a.examTitle))], [allAttempts]);

  const chartData = useMemo(() => {
    const sorted = allAttempts
      .filter((a) => !selectedExamTitle || a.examTitle === selectedExamTitle)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted.map((a, i) => ({
      date: new Date(a.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: '2-digit' }).replace('/', '/'),
      fullDate: new Date(a.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
      score: Math.round(Number(a.score)),
      change: i === 0 ? null : Math.round(Number(a.score) - Number(sorted[i - 1].score)),
    }));
  }, [allAttempts, selectedExamTitle]);

  // Score change per attempt
  const scoreChanges = useMemo(() => {
    const byExam: Record<string, ExamAttempt[]> = {};
    allAttempts.forEach((a) => {
      if (!byExam[a.examTitle]) byExam[a.examTitle] = [];
      byExam[a.examTitle].push(a);
    });
    Object.values(byExam).forEach((arr) =>
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );
    const changes: Record<string, number | null> = {};
    Object.values(byExam).forEach((arr) => {
      arr.forEach((a, i) => {
        changes[a.id] = i === 0 ? null : Math.round(Number(a.score) - Number(arr[i - 1].score));
      });
    });
    return changes;
  }, [allAttempts]);

  // Month improvement
  const improvement = useMemo(() => {
    const now = new Date();
    const thisMonth = allAttempts.filter((a) => {
      const d = new Date(a.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const lastMonth = allAttempts.filter((a) => {
      const d = new Date(a.createdAt);
      const last = new Date(now.getFullYear(), now.getMonth() - 1);
      return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
    });
    if (!thisMonth.length || !lastMonth.length) return null;
    const avgThis = thisMonth.reduce((s, a) => s + Number(a.score), 0) / thisMonth.length;
    const avgLast = lastMonth.reduce((s, a) => s + Number(a.score), 0) / lastMonth.length;
    return Math.round(avgThis - avgLast);
  }, [allAttempts]);

  // Filtered list
  const filteredAttempts = useMemo(() => {
    return allAttempts
      .filter((a) => {
        const matchSearch = !search || a.examTitle.toLowerCase().includes(search.toLowerCase());
        const matchCat = !category || a.category === category;
        return matchSearch && matchCat;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allAttempts, search, category]);

  const totalPages = Math.ceil(filteredAttempts.length / LIMIT);
  const pagedAttempts = filteredAttempts.slice((page - 1) * LIMIT, page * LIMIT);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <FadeIn>
      {/* Breadcrumb */}
      <p className="text-sm text-gray-400 mb-2">
        Dashboard / <span className="text-gray-600 font-medium">ประวัติการสอบ</span>
      </p>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ประวัติการสอบ</h1>
        <p className="text-sm text-gray-500 mt-1">
          {improvement !== null && improvement > 0
            ? `คุณพัฒนาคะแนนดีขึ้น ${improvement}% ในเดือนนี้ 🎉`
            : improvement !== null && improvement < 0
            ? `คะแนนเดือนนี้ลดลง ${Math.abs(improvement)}% ลองฝึกเพิ่มนะ 💪`
            : 'ติดตามผลการสอบและพัฒนาการของคุณ'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">จำนวนข้อสอบที่ทำทั้งหมด</p>
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{stats?.totalAttempts ?? allAttempts.length}</p>
          {stats?.byCategory?.length ? (
            <p className="text-xs text-gray-400 mt-1">{stats.byCategory.length} วิชาที่สอบ</p>
          ) : null}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">คะแนนเฉลี่ย</p>
            <div className="w-12 h-12 bg-yellow-50 rounded-2xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-yellow-500" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold text-gray-900">
              {stats?.averageScore != null ? `${Math.round(stats.averageScore)}%` : '-'}
            </p>
            {improvement !== null && improvement !== 0 && (
              <span className={`text-sm font-bold mb-1 ${improvement > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {improvement > 0 ? '+' : ''}{improvement}% ↑
              </span>
            )}
          </div>
          {stats?.bestScore != null && (
            <p className="text-xs text-gray-400 mt-1">จาก {Math.round(stats.bestScore)}% เดือนที่แล้ว</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">เวลาที่ใช้ทำข้อสอบทั้งหมด</p>
            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-500" />
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{formatHours(stats?.totalTime ?? 0)}</p>
        </div>
      </div>

      {/* Chart */}
      {allAttempts.length >= 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              พัฒนาการคะแนน{selectedExamTitle ? <> <span className="text-indigo-600">{selectedExamTitle}</span></> : ' ทั้งหมด'}
            </h2>

            {/* Exam selector */}
            <div className="relative">
              <button
                onClick={() => setChartDropdownOpen(!chartDropdownOpen)}
                className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-indigo-300 transition"
              >
                วิชา: {selectedExamTitle || 'เลือกวิชา'}
                <ChevronDown className={`w-4 h-4 transition-transform ${chartDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {chartDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-52 max-h-52 overflow-y-auto">
                  {examTitles.map((title) => (
                    <button
                      key={title}
                      onClick={() => { setSelectedExamTitle(title); setChartDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${selectedExamTitle === title ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-gray-700'}`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="url(#scoreGrad)"
                dot={{ fill: '#6366f1', r: 4, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาข้อสอบ..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">เลือกสนามสอบ</option>
          {Object.entries(categoryDisplayNames).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">เรียงจากล่าสุด</p>
        <p className="text-xs text-gray-400">ข้อสอบทั้งหมด {filteredAttempts.length} ชุด</p>
      </div>

      {/* Cards */}
      {pagedAttempts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">ยังไม่มีประวัติการสอบ</p>
          <p className="text-gray-400 text-sm mt-1">เริ่มทำข้อสอบเพื่อดูผลที่นี่</p>
          <Link href="/dashboard/practice" className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm">
            ไปฝึกทำข้อสอบ
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedAttempts.map((attempt) => (
            <AttemptCard key={attempt.id} attempt={attempt} scoreChange={scoreChanges[attempt.id] ?? null} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-full text-sm font-medium transition ${page === p ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </FadeIn>
  );
}
