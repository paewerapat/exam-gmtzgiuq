'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ChevronLeft, KeyRound, Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import {
  ADMIN_INPUT,
  ADMIN_INPUT_INVALID,
  ADMIN_PRIMARY_BUTTON,
  ADMIN_SECONDARY_BUTTON,
} from '@/components/admin/unlock-codes/shared';
import { getLockableMockExams, type LockableMockExamOption } from '@/lib/api/exams';
import { createUnlockBatch } from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';
import { getMockAccessBadge } from '@/lib/mock-exam';
import { bangkokInputToIso } from '@/lib/release-date';
import {
  createUnlockBatchForm,
  firstBatchErrorField,
  MAX_BATCH_ACCESS_DAYS,
  MAX_BATCH_CODES,
  MAX_BATCH_NAME,
  validateUnlockBatchForm,
  type UnlockBatchErrors,
  type UnlockBatchField,
  type UnlockBatchForm,
} from '@/lib/unlock-codes';

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

const FIELD_IDS: Record<UnlockBatchField, string> = {
  name: 'batch-name',
  exams: 'batch-exams',
  count: 'batch-count',
  accessDays: 'batch-access-days',
  codeExpiresAt: 'batch-code-expires',
};

function FieldError({ field, errors }: { field: UnlockBatchField; errors: UnlockBatchErrors }) {
  const msg = errors[field];
  if (!msg) return null;
  return (
    <p id={`${FIELD_IDS[field]}-error`} className="mt-1.5 text-sm text-red-600 dark:text-red-400">
      {msg}
    </p>
  );
}

/** /admin/unlock-codes/new — สร้างแคมเปญโค้ด แล้วไปหน้ารายละเอียด */
export default function NewUnlockBatchPage() {
  const router = useRouter();
  const [form, setForm] = useState<UnlockBatchForm>(createUnlockBatchForm);
  const [errors, setErrors] = useState<UnlockBatchErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [examReload, setExamReload] = useState(0);
  const [exams, setExams] = useState<{ key: number; items: LockableMockExamOption[] | null; error: boolean } | null>(
    null,
  );
  const examsLoading = exams?.key !== examReload;
  const examOptions = examsLoading ? null : exams.items;
  const examsError = !examsLoading && exams.error;
  const [examFilter, setExamFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getLockableMockExams(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setExams({ key: examReload, items, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load mock exams:', err);
        setExams({ key: examReload, items: null, error: true });
      });
    return () => controller.abort();
  }, [examReload]);

  const set = <K extends keyof UnlockBatchForm>(field: K, value: UnlockBatchForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    const errorField: UnlockBatchField | null =
      field === 'examIds' || field === 'allMock' ? 'exams' : (field as UnlockBatchField);
    if (errorField && errors[errorField]) setErrors((prev) => ({ ...prev, [errorField]: undefined }));
  };

  const toggleExam = (id: string, checked: boolean) =>
    set('examIds', checked ? [...form.examIds, id] : form.examIds.filter((x) => x !== id));

  const filterText = examFilter.trim().toLowerCase();
  const visibleExams = (examOptions ?? []).filter((e) => !filterText || e.title.toLowerCase().includes(filterText));

  const describedBy = (field: UnlockBatchField, hintId?: string) =>
    [hintId, errors[field] ? `${FIELD_IDS[field]}-error` : null].filter(Boolean).join(' ') || undefined;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    const found = validateUnlockBatchForm(form, bangkokInputToIso);
    setErrors(found);
    const first = firstBatchErrorField(found);
    if (first) {
      // ย้าย focus ไปช่องแรกที่ผิด (กลุ่มเลือกชุด → ตัวเลือกแรก)
      const el =
        first === 'exams'
          ? document.querySelector<HTMLElement>(`#${FIELD_IDS.exams} input`)
          : document.getElementById(FIELD_IDS[first]);
      el?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const expires = form.codeExpiresAt.trim();
      const batch = await createUnlockBatch({
        name: form.name.trim(),
        allMock: form.allMock,
        examIds: form.allMock ? undefined : form.examIds,
        count: Number(form.count),
        accessDays: Number(form.accessDays),
        codeExpiresAt: expires ? (bangkokInputToIso(expires) ?? undefined) : undefined,
      });
      toast.success(`สร้างแคมเปญ "${batch.name}" พร้อมโค้ด ${batch.codeCount.toLocaleString('th-TH')} โค้ดแล้ว`);
      router.push(`/admin/unlock-codes/${batch.id}`);
    } catch (err) {
      console.error('Failed to create unlock batch:', err);
      toast.error(err instanceof ApiError && err.message ? `สร้างแคมเปญไม่สำเร็จ: ${err.message}` : 'สร้างแคมเปญไม่สำเร็จ');
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const count = Number(form.count);

  return (
    <div className="max-w-3xl mx-auto">
      <FadeIn>
        <Link
          href="/admin/unlock-codes"
          className="inline-flex items-center gap-1 mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          กลับไปรายการแคมเปญ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
          <KeyRound className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          สร้างโค้ด Unlock
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          สร้างโค้ดสุ่มเป็นแคมเปญ (สูงสุด {MAX_BATCH_CODES.toLocaleString('th-TH')} โค้ดต่อครั้ง) 1 โค้ดใช้ได้ 1 บัญชี
          และ 1 บัญชีใช้โค้ดของแคมเปญเดียวกันได้ครั้งเดียว
        </p>

        <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 space-y-6">
          {/* ชื่อแคมเปญ */}
          <div>
            <label htmlFor={FIELD_IDS.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ชื่อแคมเปญ<span className="text-red-500 dark:text-red-400"> *</span>
            </label>
            <input
              id={FIELD_IDS.name}
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={MAX_BATCH_NAME}
              disabled={submitting}
              placeholder="เช่น NETSAT Math Campaign พ.ย. 69"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy('name')}
              className={errors.name ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
            />
            <FieldError field="name" errors={errors} />
          </div>

          {/* ชุดที่ Unlock */}
          <fieldset id={FIELD_IDS.exams} aria-describedby={describedBy('exams')}>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ชุดที่ Unlock<span className="text-red-500 dark:text-red-400"> *</span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { value: true, title: 'ทุกชุด Mock Exam', hint: 'ชุด Mock ที่ไม่ฟรีทุกชุด รวมชุดที่สร้างภายหลัง' },
                { value: false, title: 'เลือกชุด', hint: 'เลือกได้ 1 ชุดหรือหลายชุด (Mock ที่ไม่ฟรี)' },
              ].map((opt) => {
                const checked = form.allMock === opt.value;
                return (
                  <label
                    key={String(opt.value)}
                    className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="batch-scope"
                      checked={checked}
                      onChange={() => set('allMock', opt.value)}
                      disabled={submitting}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{opt.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {!form.allMock && (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700">
                {examsLoading ? (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2" role="status">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    กำลังโหลดชุด Mock Exam...
                  </p>
                ) : examsError ? (
                  <div className="p-4 text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                    โหลดรายการชุดไม่สำเร็จ
                    <button
                      type="button"
                      onClick={() => setExamReload((k) => k + 1)}
                      className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      ลองใหม่
                    </button>
                  </div>
                ) : !examOptions || examOptions.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    ยังไม่มีชุด Mock Exam ที่ต้องใช้โค้ดหรือต้องซื้อ — ตั้งค่าที่{' '}
                    <Link href="/admin/exams" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      จัดการชุดข้อสอบ
                    </Link>
                  </p>
                ) : (
                  <>
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[12rem]">
                        <label htmlFor="batch-exam-filter" className="sr-only">
                          ค้นหาชุดข้อสอบ
                        </label>
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                          aria-hidden="true"
                        />
                        <input
                          id="batch-exam-filter"
                          type="search"
                          value={examFilter}
                          onChange={(e) => setExamFilter(e.target.value)}
                          placeholder="ค้นหาชื่อชุด..."
                          className={`${ADMIN_INPUT} pl-9`}
                        />
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
                        เลือกแล้ว {form.examIds.length.toLocaleString('th-TH')} ชุด
                      </span>
                    </div>
                    <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                      {visibleExams.length === 0 ? (
                        <li className="p-4 text-sm text-gray-500 dark:text-gray-400">ไม่พบชุดที่ค้นหา</li>
                      ) : (
                        visibleExams.map((exam) => {
                          const badge = getMockAccessBadge(exam);
                          return (
                            <li key={exam.id}>
                              <label className="flex items-center gap-3 px-3 py-2.5 min-h-11 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <input
                                  type="checkbox"
                                  checked={form.examIds.includes(exam.id)}
                                  onChange={(e) => toggleExam(exam.id, e.target.checked)}
                                  disabled={submitting}
                                  className="w-4 h-4 flex-shrink-0 rounded accent-indigo-600"
                                />
                                <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 break-words">
                                  {exam.title}
                                </span>
                                {exam.status === 'draft' && (
                                  <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">แบบร่าง</span>
                                )}
                                <span
                                  className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    badge.tone === 'campaign'
                                      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                      : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  }`}
                                >
                                  {badge.label}
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </>
                )}
              </div>
            )}
            <FieldError field="exams" errors={errors} />
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* จำนวนโค้ด */}
            <div>
              <label htmlFor={FIELD_IDS.count} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                จำนวนโค้ด<span className="text-red-500 dark:text-red-400"> *</span>
              </label>
              <input
                id={FIELD_IDS.count}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_BATCH_CODES}
                step={1}
                value={form.count}
                onChange={(e) => set('count', e.target.value)}
                disabled={submitting}
                aria-invalid={errors.count ? true : undefined}
                aria-describedby={describedBy('count', 'batch-count-hint')}
                className={errors.count ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
              />
              <p id="batch-count-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                1–{MAX_BATCH_CODES.toLocaleString('th-TH')} โค้ด (1 โค้ด = 1 บัญชี)
              </p>
              <FieldError field="count" errors={errors} />
            </div>

            {/* อายุการเข้าถึง */}
            <div>
              <label
                htmlFor={FIELD_IDS.accessDays}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                อายุการเข้าถึง (วัน)<span className="text-red-500 dark:text-red-400"> *</span>
              </label>
              <input
                id={FIELD_IDS.accessDays}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_BATCH_ACCESS_DAYS}
                step={1}
                value={form.accessDays}
                onChange={(e) => set('accessDays', e.target.value)}
                disabled={submitting}
                aria-invalid={errors.accessDays ? true : undefined}
                aria-describedby={describedBy('accessDays', 'batch-access-days-hint')}
                className={errors.accessDays ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
              />
              <p id="batch-access-days-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                นับจากวันที่ผู้ใช้กรอกโค้ด ครบแล้วเริ่มทำ/ทำต่อไม่ได้ (แก้ไม่ได้หลังสร้าง)
              </p>
              <FieldError field="accessDays" errors={errors} />
            </div>
          </div>

          {/* วันหมดอายุโค้ด */}
          <div>
            <label
              htmlFor={FIELD_IDS.codeExpiresAt}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              วันหมดอายุของโค้ด <span className="font-normal text-gray-500 dark:text-gray-400">(ไม่บังคับ)</span>
            </label>
            <input
              id={FIELD_IDS.codeExpiresAt}
              type="datetime-local"
              value={form.codeExpiresAt}
              onChange={(e) => set('codeExpiresAt', e.target.value)}
              disabled={submitting}
              aria-invalid={errors.codeExpiresAt ? true : undefined}
              aria-describedby={describedBy('codeExpiresAt', 'batch-code-expires-hint')}
              className={`${errors.codeExpiresAt ? ADMIN_INPUT_INVALID : ADMIN_INPUT} sm:w-72`}
            />
            <p id="batch-code-expires-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              เวลาสุดท้ายที่กรอกโค้ดได้ (เวลาไทย) · ว่าง = ไม่หมดอายุ · แก้ได้ภายหลัง
            </p>
            <FieldError field="codeExpiresAt" errors={errors} />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <Link href="/admin/unlock-codes" className={ADMIN_SECONDARY_BUTTON}>
              ยกเลิก
            </Link>
            <button type="submit" disabled={submitting} className={ADMIN_PRIMARY_BUTTON}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  กำลังสร้างโค้ด...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  {Number.isInteger(count) && count > 0 ? `สร้าง ${count.toLocaleString('th-TH')} โค้ด` : 'สร้างโค้ด'}
                </>
              )}
            </button>
          </div>
          {submitting && (
            <p role="status" className="text-sm text-gray-500 dark:text-gray-400 text-right">
              กำลังสร้างโค้ด อาจใช้เวลาหลายวินาทีสำหรับโค้ดจำนวนมาก
            </p>
          )}
        </form>
      </FadeIn>
    </div>
  );
}
