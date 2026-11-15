'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import ToggleSwitch from '@/components/admin/ToggleSwitch';
import {
  ADMIN_INPUT,
  ADMIN_INPUT_INVALID,
  ADMIN_PRIMARY_BUTTON,
  ADMIN_SECONDARY_BUTTON,
} from '@/components/admin/unlock-codes/shared';
import {
  createPredictedSeries,
  searchPredictedExamOptions,
  updatePredictedSeries,
  type AdminPredictedSeries,
  type PredictedExamOption,
  type PredictedSeriesInput,
} from '@/lib/api/predicted';
import type { ProAdminVenue } from '@/lib/api/pro';
import type { Subject } from '@/lib/api/curriculum';
import {
  HEX_COLOR,
  moveSet,
  parsePreviewText,
  predictedErrorMessage,
  SERIES_DESCRIPTION_MAX,
  SERIES_TITLE_MAX,
  setDraftError,
  validateSeriesDraft,
  type SeriesDraft,
  type SeriesSetDraft,
} from '@/lib/predicted';

const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
const CARD = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700';
const ICON_BUTTON =
  'inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

/** input type=color รับเฉพาะ #rrggbb — #abc → #aabbcc */
function toPickerColor(hex: string): string {
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase() : hex.toLowerCase();
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function draftFromSeries(series: AdminPredictedSeries | null, defaultVenueId = ''): SeriesDraft {
  if (!series) {
    return {
      title: '',
      description: '',
      venueId: defaultVenueId,
      subjectId: '',
      color: '',
      sortOrder: '0',
      isActive: true,
      sets: [],
    };
  }
  return {
    title: series.title,
    description: series.description ?? '',
    venueId: series.venueId,
    subjectId: series.subjectId ?? '',
    color: series.color ?? '',
    sortOrder: String(series.sortOrder),
    isActive: series.isActive,
    sets: series.sets.map((s) => ({
      examId: s.examId,
      title: s.title,
      questionCount: s.questionCount,
      access: s.access,
      previewText: s.previewCount ? String(s.previewCount) : '',
    })),
  };
}

/** draft → payload (setNo = ลำดับในตาราง เริ่ม 1) */
export function draftToInput(draft: SeriesDraft): PredictedSeriesInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    venueId: draft.venueId,
    subjectId: draft.subjectId || null,
    color: draft.color.trim() || null,
    sortOrder: draft.sortOrder.trim() ? Number(draft.sortOrder.trim()) : 0,
    isActive: draft.isActive,
    sets: draft.sets.map((s, i) => ({
      examId: s.examId,
      setNo: i + 1,
      access: s.access,
      previewCount: parsePreviewText(s.previewText),
    })),
  };
}

interface PredictedSeriesFormProps {
  /** null = สร้างใหม่ */
  series: AdminPredictedSeries | null;
  venues: ProAdminVenue[];
  /** วิชาทั้งหมด (กรองตาม venueId ของสนามที่เลือก) */
  subjects: Subject[];
  defaultVenueId?: string;
  onSaved: (series: AdminPredictedSeries | null) => void;
  onCancel: () => void;
  /** แก้ไข: ปุ่มลบซีรีส์ (เปิด modal ของหน้า) */
  onDelete?: () => void;
}

/** ฟอร์มสร้าง/แก้ซีรีส์ Predicted + ตารางชุด (task 22) */
export default function PredictedSeriesForm({
  series,
  venues,
  subjects,
  defaultVenueId = '',
  onSaved,
  onCancel,
  onDelete,
}: PredictedSeriesFormProps) {
  const [draft, setDraft] = useState<SeriesDraft>(() => draftFromSeries(series, defaultVenueId));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ตัวค้นหาชุด (GET /admin/predicted/exams?search=) debounce 300ms
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<{ key: string; items: PredictedExamOption[] | null; error: boolean } | null>(
    null,
  );
  const searching = options?.key !== search;

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    searchPredictedExamOptions(search, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setOptions({ key: search, items, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to search exams:', err);
        setOptions({ key: search, items: null, error: true });
      });
    return () => controller.abort();
  }, [search]);

  const venueSubjects = useMemo(
    () => subjects.filter((s) => draft.venueId && s.venueId === draft.venueId),
    [subjects, draft.venueId],
  );
  // วิชาเดิมของซีรีส์ที่ไม่ได้ผูกกับสนามนี้แล้ว → ยังแสดงเป็นตัวเลือก (ไม่ล้างค่าเงียบ ๆ)
  const currentSubjectMissing = !!draft.subjectId && !venueSubjects.some((s) => s.id === draft.subjectId);
  const currentSubjectName =
    subjects.find((s) => s.id === draft.subjectId)?.name ?? series?.subjectName ?? 'วิชาเดิม';

  const inTable = new Set(draft.sets.map((s) => s.examId));
  const available = (options?.key === search ? options.items ?? [] : []).filter((o) => !inTable.has(o.id));

  const patch = (next: Partial<SeriesDraft>) => setDraft((d) => ({ ...d, ...next }));
  const patchSet = (index: number, next: Partial<SeriesSetDraft>) =>
    setDraft((d) => ({ ...d, sets: d.sets.map((s, i) => (i === index ? { ...s, ...next } : s)) }));

  function addSet(option: PredictedExamOption) {
    setDraft((d) =>
      d.sets.some((s) => s.examId === option.id)
        ? d
        : {
            ...d,
            sets: [
              ...d.sets,
              { examId: option.id, title: option.title, questionCount: option.questionCount, access: 'pro', previewText: '' },
            ],
          },
    );
  }

  const colorValid = !draft.color.trim() || HEX_COLOR.test(draft.color.trim());
  const titleInvalid = submitted && !draft.title.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const err = validateSeriesDraft(draft);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const input = draftToInput(draft);
      const saved = series ? await updatePredictedSeries(series.id, input) : await createPredictedSeries(input);
      toast.success(series ? 'บันทึกซีรีส์แล้ว' : 'สร้างซีรีส์แล้ว');
      onSaved(saved);
    } catch (error) {
      const message = predictedErrorMessage(error, series ? 'บันทึกซีรีส์ไม่สำเร็จ' : 'สร้างซีรีส์ไม่สำเร็จ');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label={series ? 'แก้ไขซีรีส์' : 'สร้างซีรีส์'}>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{formError}</span>
        </div>
      )}

      {/* ข้อมูลซีรีส์ */}
      <section className={`${CARD} p-4 sm:p-6`} aria-labelledby="series-info-heading">
        <h2 id="series-info-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          ข้อมูลซีรีส์
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="series-title" className={LABEL}>
              ชื่อซีรีส์
            </label>
            <input
              id="series-title"
              type="text"
              value={draft.title}
              maxLength={SERIES_TITLE_MAX}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="เช่น NETSAT MATH JAN PREDICTED"
              aria-invalid={titleInvalid || undefined}
              className={titleInvalid ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="series-description" className={LABEL}>
              คำอธิบาย (ไม่บังคับ)
            </label>
            <textarea
              id="series-description"
              rows={2}
              value={draft.description}
              maxLength={SERIES_DESCRIPTION_MAX}
              onChange={(e) => patch({ description: e.target.value })}
              className={ADMIN_INPUT}
            />
          </div>
          <div>
            <label htmlFor="series-venue" className={LABEL}>
              สนามสอบ
            </label>
            <select
              id="series-venue"
              value={draft.venueId}
              onChange={(e) => patch({ venueId: e.target.value, subjectId: '' })}
              aria-invalid={(submitted && !draft.venueId) || undefined}
              className={submitted && !draft.venueId ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            >
              <option value="">— เลือกสนาม —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.isActive ? '' : ' (ปิดอยู่)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="series-subject" className={LABEL}>
              วิชา
            </label>
            <select
              id="series-subject"
              value={draft.subjectId}
              onChange={(e) => patch({ subjectId: e.target.value })}
              disabled={!draft.venueId}
              className={ADMIN_INPUT}
            >
              <option value="">ไม่ระบุวิชา</option>
              {currentSubjectMissing && <option value={draft.subjectId}>{currentSubjectName}</option>}
              {venueSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className={HINT}>
              {draft.venueId && venueSubjects.length === 0
                ? 'สนามนี้ยังไม่มีวิชาที่ผูกไว้ (ตั้งสนามของวิชาได้ที่หน้าหลักสูตร)'
                : 'แสดงเฉพาะวิชาที่ผูกกับสนามที่เลือก'}
            </p>
          </div>
          <div>
            <label htmlFor="series-color" className={LABEL}>
              สีจุดหน้าชื่อ (ไม่บังคับ)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="เลือกสี"
                value={colorValid && draft.color.trim() ? toPickerColor(draft.color.trim()) : '#4f46e5'}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-11 w-12 flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 cursor-pointer"
              />
              <input
                id="series-color"
                type="text"
                value={draft.color}
                onChange={(e) => patch({ color: e.target.value })}
                placeholder="#4f46e5"
                aria-invalid={!colorValid || undefined}
                className={colorValid ? ADMIN_INPUT : ADMIN_INPUT_INVALID}
              />
            </div>
          </div>
          <div>
            <label htmlFor="series-sort" className={LABEL}>
              ลำดับ
            </label>
            <input
              id="series-sort"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={draft.sortOrder}
              onChange={(e) => patch({ sortOrder: e.target.value })}
              className={ADMIN_INPUT}
            />
            <p className={HINT}>น้อยแสดงก่อน (เท่ากันเรียงตามชื่อ)</p>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <ToggleSwitch
              checked={draft.isActive}
              onChange={(next) => patch({ isActive: next })}
              label="เปิดแสดงซีรีส์ในหน้า Predicted Exam"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">แสดงในหน้า Predicted Exam</span>
          </div>
        </div>
      </section>

      {/* ตารางชุด */}
      <section className={`${CARD} p-4 sm:p-6`} aria-labelledby="series-sets-heading">
        <h2 id="series-sets-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          ชุดในซีรีส์ ({draft.sets.length.toLocaleString('th-TH')})
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          เลขชุดเรียงตามลำดับในตาราง ชุด Pro นับลำดับตามสิทธิ์ &quot;ชุด Predicted ต่อซีรีส์&quot; ของแพ็กเกจ / Preview =
          จำนวนข้อแรกที่ผู้ไม่มีสิทธิ์เต็มทำได้ (เว้นว่าง = ไม่มี Preview) — ชุดที่อยู่ในซีรีส์จะไม่แสดงในรายการชุดข้อสอบอื่น
        </p>

        {draft.sets.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            ยังไม่มีชุด — เพิ่มจากตัวค้นหาด้านล่าง
          </p>
        ) : (
          <ol className="space-y-3" aria-label="ชุดในซีรีส์">
            {draft.sets.map((set, i) => {
              const rowError = setDraftError(set);
              const previewId = `set-preview-${set.examId}`;
              const label = `ชุดที่ ${i + 1}`;
              return (
                <li
                  key={set.examId}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30"
                  data-testid="series-set-row"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="inline-flex items-center justify-center min-w-[4.5rem] h-8 px-2 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
                      {label}
                    </span>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{set.title || set.examId}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        ทั้งหมด {set.questionCount ? set.questionCount.toLocaleString('th-TH') : '?'} ข้อ
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, sets: moveSet(d.sets, i, -1) }))}
                        disabled={i === 0}
                        aria-label={`เลื่อน${label}ขึ้น`}
                        className={ICON_BUTTON}
                      >
                        <ArrowUp className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, sets: moveSet(d.sets, i, 1) }))}
                        disabled={i === draft.sets.length - 1}
                        aria-label={`เลื่อน${label}ลง`}
                        className={ICON_BUTTON}
                      >
                        <ArrowDown className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, sets: d.sets.filter((_, j) => j !== i) }))}
                        aria-label={`เอา${label}ออกจากซีรีส์`}
                        className={`${ICON_BUTTON} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <fieldset>
                      <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">สิทธิ์</legend>
                      <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                        {(['free', 'pro'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={set.access === value}
                            aria-label={`${label} ${value === 'free' ? 'ฟรี' : 'Pro'}`}
                            onClick={() => patchSet(i, { access: value })}
                            className={`min-h-10 px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                              set.access === value
                                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                            }`}
                          >
                            {value === 'free' ? 'ฟรี' : 'Pro'}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor={previewId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Preview (ข้อ)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={previewId}
                          type="text"
                          inputMode="numeric"
                          value={set.previewText}
                          onChange={(e) => patchSet(i, { previewText: e.target.value })}
                          placeholder="ไม่มี"
                          aria-invalid={!!rowError || undefined}
                          aria-describedby={rowError ? `${previewId}-error` : undefined}
                          className={(rowError ? ADMIN_INPUT_INVALID : ADMIN_INPUT).replace('w-full', 'w-24')}
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          จาก {set.questionCount ? set.questionCount.toLocaleString('th-TH') : '?'} ข้อ
                        </span>
                      </div>
                    </div>
                  </div>
                  {rowError && (
                    <p id={`${previewId}-error`} className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {rowError}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {/* ตัวค้นหาชุด */}
        <div className="mt-6">
          <label htmlFor="series-exam-search" className={LABEL}>
            เพิ่มชุดจากชุดข้อสอบ
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
            <input
              id="series-exam-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อชุดข้อสอบ"
              className={`${ADMIN_INPUT} pl-10`}
            />
          </div>
          <p className={HINT}>แสดงเฉพาะชุดที่ยังไม่อยู่ในซีรีส์ใด และไม่ใช่ชุด Mock / ชุด Question Bank</p>
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 max-h-72 overflow-y-auto" aria-live="polite">
            {searching ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2" role="status">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                กำลังค้นหา...
              </p>
            ) : options?.error ? (
              <p className="p-4 text-sm text-red-600 dark:text-red-400">ค้นหาชุดข้อสอบไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง</p>
            ) : available.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">ไม่พบชุดที่เพิ่มได้</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700" aria-label="ผลการค้นหาชุดข้อสอบ">
                {available.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{o.title || o.id}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[o.subjectName ?? o.categoryName, `${o.questionCount.toLocaleString('th-TH')} ข้อ`, o.status === 'draft' ? 'ฉบับร่าง' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addSet(o)}
                      aria-label={`เพิ่ม ${o.title || o.id}`}
                      className="flex-shrink-0 inline-flex items-center gap-1 min-h-10 px-3 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      เพิ่ม
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="sm:mr-auto inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            ลบซีรีส์
          </button>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:ml-auto">
          <button type="button" onClick={onCancel} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
            ยกเลิก
          </button>
          <button type="submit" disabled={saving} className={ADMIN_PRIMARY_BUTTON}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {series ? 'บันทึกซีรีส์' : 'สร้างซีรีส์'}
          </button>
        </div>
      </div>
    </form>
  );
}
