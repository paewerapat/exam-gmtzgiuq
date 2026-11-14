'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ChevronLeft, Crown, Loader2, LogIn, PlayCircle, RotateCcw } from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api/apiError';
import {
  getQbSubject,
  type QbDifficulty,
  type QbMode,
  type QbProgressFilter,
  type QbSubjectDetail,
  type QbTopic,
} from '@/lib/api/question-bank';
import {
  QB_DIFFICULTIES,
  QB_MODE_CONFIG,
  QB_PROGRESS_OPTIONS,
  QB_SORT_OPTIONS,
  accuracyTone,
  groupLabel,
  percentOf,
  practiceHref,
  selectedQuestionCount,
  sortGroups,
  topicCountOf,
  topicQuestionCount,
  upgradeHref,
  weightedAccuracy,
  type AccuracyTone,
  type QbSortOrder,
} from '@/lib/question-bank';
import { loginHref } from '@/lib/pro-payments';
import ChallengeProNotice from './ChallengeProNotice';
import FilterMenu from './FilterMenu';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800';

const DOT_CLASS: Record<AccuracyTone, string> = {
  good: 'bg-emerald-500 dark:bg-emerald-400',
  fair: 'bg-amber-400 dark:bg-amber-300',
  low: 'bg-red-500 dark:bg-red-400',
  none: '',
};

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function difficultyCount(detail: QbSubjectDetail, d: QbDifficulty): number {
  if (d === 'easy') return detail.totals.easy;
  if (d === 'medium') return detail.totals.medium;
  return detail.totals.hardChallenge;
}

function TopicRow({
  topic,
  count,
  showCount,
  checked,
  onToggle,
}: {
  topic: QbTopic;
  count: number;
  showCount: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  // บทที่ไม่มีข้อตามตัวกรองเลือกเพิ่มไม่ได้ แต่ที่เลือกไว้แล้วยังเอาออกได้
  const disabled = count === 0 && !checked;
  const progress = percentOf(topic.answered, topic.total);
  const tone = accuracyTone(topic.accuracy);
  return (
    <li>
      <label
        className={`grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_11rem_6rem] items-center gap-x-3 gap-y-1.5 min-h-11 px-3 py-2.5 rounded-xl border transition ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
          checked
            ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800/60'
            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/40'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="w-5 h-5 rounded accent-indigo-600 dark:accent-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
        <span className={`min-w-0 break-words text-sm ${checked ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>
          {topic.name}
          {showCount && (
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400 whitespace-nowrap">{count} ข้อ</span>
          )}
        </span>
        {/* ความคืบหน้า + ความแม่นยำ: จอแคบอยู่บรรทัดที่สองใต้ชื่อบท */}
        <span className="col-start-2 sm:col-start-auto flex items-center gap-2 min-w-0">
          <span
            role="progressbar"
            aria-label={`ความคืบหน้า ${topic.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
          >
            <span className="block h-full rounded-full bg-sky-500 dark:bg-sky-400" style={{ width: `${progress}%` }} />
          </span>
          <span className="w-14 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
            {topic.answered}/{topic.total}
          </span>
        </span>
        <span className="col-start-2 sm:col-start-auto text-sm">
          {tone === 'none' ? (
            <span className="text-gray-400 dark:text-gray-500">
              <span aria-hidden="true">-</span>
              <span className="sr-only">ยังไม่มีข้อมูลความแม่นยำ</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100">
              <span className={`w-2 h-2 rounded-full ${DOT_CLASS[tone]}`} aria-hidden="true" />
              <span className="sr-only">ความแม่นยำ </span>
              {Math.round(topic.accuracy ?? 0)}%
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

/** หน้า 2 ของ Question Bank / Challenge Questions: ตัวกรอง + เลือกบท (จัดกลุ่มชั้น/เทอม) + แถบเริ่มฝึก */
export default function QuestionBankSubject({ mode, subjectId }: { mode: QbMode; subjectId: string }) {
  const config = QB_MODE_CONFIG[mode];
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isLoggedIn = !!userId;

  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${mode}|${subjectId}|${userId ?? ''}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: QbSubjectDetail | null; notFound: boolean } | null>(null);
  const loading = result?.key !== requestKey;
  const detail = loading ? null : result.data;

  const [difficulties, setDifficulties] = useState<QbDifficulty[]>([]);
  const [progress, setProgress] = useState<QbProgressFilter>('all');
  const [order, setOrder] = useState<QbSortOrder>('normal');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    getQbSubject(subjectId, mode, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res, notFound: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load question bank subject:', err);
        setResult({ key: requestKey, data: null, notFound: err instanceof ApiError && err.status === 404 });
      });
    return () => controller.abort();
  }, [mode, subjectId, requestKey]);

  // ออกจากระบบระหว่างอยู่หน้านี้ → ตัวกรองที่ต้อง login กลับเป็นทั้งหมด
  const effectiveProgress: QbProgressFilter = isLoggedIn ? progress : 'all';
  const activeDifficulties = mode === 'bank' ? difficulties : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32" role="status" aria-label="กำลังโหลด">
        <Loader2 className="w-9 h-9 animate-spin motion-reduce:animate-none text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
      </div>
    );
  }

  if (!detail) {
    return (
      <FadeIn>
        <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-16 px-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            {result?.notFound ? 'ไม่พบวิชานี้' : 'โหลดข้อมูลวิชาไม่สำเร็จ'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {!result?.notFound && (
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className={`inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition ${FOCUS_RING}`}
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ลองใหม่
              </button>
            )}
            <Link
              href={config.basePath}
              className={`inline-flex items-center min-h-11 px-5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${FOCUS_RING}`}
            >
              กลับไป {config.title}
            </Link>
          </div>
        </div>
      </FadeIn>
    );
  }

  const groups = sortGroups(detail.groups, order);
  const allTopics = detail.groups.flatMap((g) => g.topics);
  const topicCount = topicCountOf(detail.groups);
  const allCount = selectedQuestionCount(detail.groups, activeDifficulties, mode);
  const selectedIds = allTopics.filter((t) => selected.has(t.id)).map((t) => t.id);
  const selectedCount = selectedQuestionCount(detail.groups, activeDifficulties, mode, selected);
  const countPrefix = effectiveProgress === 'all' ? 'รวม' : 'รวมไม่เกิน';
  const backHref = detail.venue.key
    ? `${config.basePath}?venue=${encodeURIComponent(detail.venue.key)}`
    : config.basePath;

  function toggleDifficulty(d: QbDifficulty) {
    setDifficulties((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function toggleTopic(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start(topicIds: string[]) {
    router.push(
      practiceHref({
        subjectId: detail!.subject.id || subjectId,
        mode,
        topicIds,
        difficulties: activeDifficulties,
        progress: effectiveProgress,
      }),
    );
  }

  const difficultyLabel =
    activeDifficulties.length === 0 ? 'ระดับความยาก (ทั้งหมด)' : `ระดับความยาก (${activeDifficulties.length})`;
  const progressLabel = QB_PROGRESS_OPTIONS.find((o) => o.value === effectiveProgress)?.label ?? 'ทั้งหมด';
  const orderLabel = QB_SORT_OPTIONS.find((o) => o.value === order)?.label ?? 'ปกติ';
  const subjectAnswered = allTopics.reduce((n, t) => n + t.answered, 0);
  // Challenge ที่ยังไม่มีสิทธิ์: ปุ่มเริ่มฝึกกลายเป็นลิงก์ Upgrade (ไม่พาไปฝึกชุดที่ล็อกทุกข้อ)
  const needsUpgrade = mode === 'challenge' && !detail.challengeUnlocked;
  const upgradeLink = upgradeHref(detail.venue.key);
  const upgradeNote = 'ข้อ Challenge เฉพาะสมาชิก Pro — Upgrade เพื่อเริ่มฝึก';
  // วิชาที่ยังไม่มีข้อในโหมดนี้ (API ตอบ 200 แต่ totals.all = 0)
  const noQuestions = detail.totals.all === 0;
  const emptyMessage = noQuestions
    ? mode === 'challenge'
      ? 'ยังไม่มีข้อ Challenge ในวิชานี้'
      : 'ยังไม่มีข้อในวิชานี้'
    : 'ยังไม่มีบทในวิชานี้';
  const subjectAccuracy = weightedAccuracy(allTopics);

  const selectionBar =
    selectedIds.length > 0 && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="region"
            aria-label="บทที่เลือก"
            className="fixed bottom-0 left-0 right-0 md:left-64 z-30 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
          >
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <p className="flex-1 min-w-0 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
                <span className="text-lg font-extrabold text-gray-900 dark:text-gray-100">เลือกแล้ว {selectedIds.length} บท</span>{' '}
                <span className="whitespace-nowrap">
                  {countPrefix} {selectedCount.toLocaleString('th-TH')} ข้อ
                </span>{' '}
                <span className="hidden sm:inline">· เลือกได้หลายบท</span>
                {needsUpgrade && <span className="block text-xs text-amber-700 dark:text-amber-300">{upgradeNote}</span>}
              </p>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className={`min-h-11 px-4 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition ${FOCUS_RING}`}
                >
                  ล้างที่เลือก
                </button>
                {needsUpgrade ? (
                  <Link
                    href={upgradeLink}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold transition ${FOCUS_RING}`}
                  >
                    <Crown className="w-4 h-4" aria-hidden="true" />
                    Upgrade เพื่อฝึก ({selectedIds.length} บท)
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => start(selectedIds)}
                    disabled={selectedCount === 0}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                  >
                    เริ่มฝึก ({selectedIds.length} บท)
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <FadeIn>
      <div className={`max-w-6xl mx-auto ${selectedIds.length > 0 ? 'pb-32 sm:pb-24' : ''}`}>
        <Link
          href={backHref}
          className={`inline-flex items-center gap-1 min-h-11 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded ${FOCUS_RING}`}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          กลับไป {config.title}
        </Link>

        <div className="mt-1 mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100 break-words">
            {[detail.venue.name, detail.subject.label].filter(Boolean).join(' ')}
          </h1>
          {mode === 'challenge' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
              Challenge Questions
            </span>
          )}
        </div>

        {mode === 'challenge' && !detail.challengeUnlocked && detail.venue.key && (
          <div className="mb-5">
            <ChallengeProNotice venueKey={detail.venue.key} venueName={detail.venue.name} />
          </div>
        )}

        {mode === 'challenge' && (
          <dl className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'ข้อ Challenge ทั้งหมดของวิชานี้', value: `${detail.totals.all.toLocaleString('th-TH')} ข้อ` },
              { label: 'ทำแล้ว', value: isLoggedIn ? `${subjectAnswered.toLocaleString('th-TH')} ข้อ` : '-' },
              { label: 'ความแม่นยำ', value: subjectAccuracy === null || !isLoggedIn ? '-' : `${subjectAccuracy}%` },
            ].map((t) => (
              <div key={t.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
                <dt className="text-xs text-gray-500 dark:text-gray-400">{t.label}</dt>
                <dd className="mt-1 text-2xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* ตัวกรอง (แถวนี้เป็น relative ให้กล่องตัวกรองบนจอแคบไม่ล้นจอ) */}
        <div className="relative mb-4 flex flex-wrap gap-2">
          {mode === 'bank' && (
            <FilterMenu label={difficultyLabel} active={activeDifficulties.length > 0} title="ระดับความยาก">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">ติ๊กได้หลายอัน · ตัวเลขข้างชื่อ = จำนวนข้อของวิชานี้</p>
              <div className="space-y-1">
                {QB_DIFFICULTIES.map((d) => (
                  <label
                    key={d.value}
                    className="flex items-center gap-3 min-h-11 px-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={difficulties.includes(d.value)}
                      onChange={() => toggleDifficulty(d.value)}
                      className="w-5 h-5 rounded accent-indigo-600 dark:accent-indigo-400"
                    />
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{d.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {difficultyCount(detail, d.value).toLocaleString('th-TH')} ข้อ
                    </span>
                  </label>
                ))}
              </div>
            </FilterMenu>
          )}

          <FilterMenu label={`ทำแล้ว: ${progressLabel}`} active={effectiveProgress !== 'all'} title="ทำแล้ว">
            <div className="space-y-1">
              {QB_PROGRESS_OPTIONS.map((o) => {
                const needsLogin = o.value !== 'all' && !isLoggedIn;
                return (
                  <label
                    key={o.value}
                    className={`flex items-center gap-3 min-h-11 px-2 rounded-lg ${
                      needsLogin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`qb-progress-${subjectId}`}
                      value={o.value}
                      checked={effectiveProgress === o.value}
                      disabled={needsLogin}
                      onChange={() => setProgress(o.value)}
                      className="w-5 h-5 accent-indigo-600 dark:accent-indigo-400"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                  </label>
                );
              })}
            </div>
            {!isLoggedIn && (
              <Link
                href={loginHref(`${config.basePath}/${subjectId}`)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                เข้าสู่ระบบเพื่อกรองตามประวัติการทำ
              </Link>
            )}
          </FilterMenu>

          <FilterMenu label={`ลำดับ: ${orderLabel}`} active={order !== 'normal'} title="ลำดับบท">
            <div className="space-y-1">
              {QB_SORT_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-3 min-h-11 px-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <input
                    type="radio"
                    name={`qb-order-${subjectId}`}
                    value={o.value}
                    checked={order === o.value}
                    onChange={() => setOrder(o.value)}
                    className="w-5 h-5 accent-indigo-600 dark:accent-indigo-400"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                </label>
              ))}
            </div>
          </FilterMenu>
        </div>

        {/* ฝึกทุกบท (วิชาที่ยังไม่มีข้อในโหมดนี้ไม่แสดง) */}
        {!noQuestions && (
        <section
          aria-labelledby="qb-all-title"
          className="mb-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <h2 id="qb-all-title" className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
              ฝึกทุกบท
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 break-words">
              เริ่มฝึก{mode === 'challenge' ? 'ข้อ Challenge ' : ''}ทั้ง {topicCount} บทของ{detail.subject.label} · {countPrefix}{' '}
              {allCount.toLocaleString('th-TH')} ข้อ
            </p>
            {needsUpgrade && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{upgradeNote}</p>}
          </div>
          {needsUpgrade ? (
            <Link
              href={upgradeLink}
              className={`inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold transition ${FOCUS_RING}`}
            >
              <Crown className="w-4 h-4" aria-hidden="true" />
              Upgrade เพื่อเริ่มฝึก
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => start([])}
              disabled={allCount === 0}
              className={`inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              เริ่มฝึก
            </button>
          )}
        </section>
        )}

        {/* รายการบท */}
        {topicCount === 0 || noQuestions ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm py-14 px-6 text-center text-gray-500 dark:text-gray-400">
            {emptyMessage}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-3 sm:p-5">
            <div
              aria-hidden="true"
              className="hidden sm:grid grid-cols-[auto_minmax(0,1fr)_11rem_6rem] gap-x-3 px-3 pb-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400"
            >
              <span className="w-5" />
              <span>บท</span>
              <span>ความคืบหน้า</span>
              <span>ความแม่นยำ</span>
            </div>
            {groups.map((g, gi) => {
              const label = groupLabel(g);
              const headingId = `qb-group-${gi}`;
              return (
                <section key={`${label}-${gi}`} aria-labelledby={headingId} className="mt-4 first:mt-3">
                  <h3 id={headingId} className="px-3 mb-1.5 text-base font-extrabold text-gray-900 dark:text-gray-100">
                    {label}
                  </h3>
                  <ul className="space-y-1">
                    {g.topics.map((t) => (
                      <TopicRow
                        key={t.id}
                        topic={t}
                        count={topicQuestionCount(t, activeDifficulties, mode)}
                        showCount={activeDifficulties.length > 0}
                        checked={selected.has(t.id)}
                        onToggle={() => toggleTopic(t.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {selectionBar}
    </FadeIn>
  );
}
