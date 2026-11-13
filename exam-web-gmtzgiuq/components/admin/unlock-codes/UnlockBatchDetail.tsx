'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronLeft,
  Download,
  FileQuestion,
  KeyRound,
  Loader2,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import ToggleSwitch from '@/components/admin/ToggleSwitch';
import {
  ADMIN_INPUT,
  ADMIN_INPUT_INVALID,
  ADMIN_PRIMARY_BUTTON,
  ADMIN_SECONDARY_BUTTON,
  AdminPagination,
  BatchExamsSummary,
  BatchKindBadge,
  CodeExpiry,
  confirmDisableBatch,
} from './shared';
import {
  downloadUnlockBatchCsv,
  getUnlockBatch,
  getUnlockBatchCodes,
  updateUnlockBatch,
  updateUnlockCode,
  type Paginated,
  type UnlockBatch,
  type UnlockCode,
} from '@/lib/api/unlockCodes';
import { ApiError } from '@/lib/api/apiError';
import { bangkokInputToIso, formatReleaseDate, toBangkokInputValue } from '@/lib/release-date';
import {
  CODE_STATUS_FILTERS,
  formatUserName,
  MAX_BATCH_NAME,
  type UnlockCodeStatusFilter,
} from '@/lib/unlock-codes';

const CODES_LIMIT = 50;

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** หน้ารายละเอียดแคมเปญ: สรุป + แก้ชื่อ/วันหมดอายุ/เปิด-ปิด + ตารางโค้ด + CSV */
export default function UnlockBatchDetail({ id }: { id: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${id}|${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    batch: UnlockBatch | null;
    state: 'ready' | 'notfound' | 'error';
  } | null>(null);
  const loading = result?.key !== requestKey;
  const batch = loading ? null : result.batch;

  const [toggling, setToggling] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getUnlockBatch(id, controller.signal)
      .then((b) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, batch: b, state: 'ready' });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        if (!notFound) console.error('Failed to load unlock batch:', err);
        setResult({ key: requestKey, batch: null, state: notFound ? 'notfound' : 'error' });
      });
    return () => controller.abort();
  }, [id, requestKey]);

  const setBatch = (b: UnlockBatch) => setResult((prev) => (prev ? { ...prev, batch: b } : prev));

  async function handleToggleBatch(next: boolean) {
    if (!batch) return;
    if (!next && !(await confirmDisableBatch(batch.name))) return;
    setToggling(true);
    try {
      const updated = await updateUnlockBatch(batch.id, { isActive: next });
      setBatch({ ...batch, ...updated });
      toast.success(next ? 'เปิดแคมเปญแล้ว' : 'ปิดแคมเปญแล้ว โค้ดของแคมเปญนี้กรอกไม่ได้ทันที');
    } catch (err) {
      console.error('Failed to toggle batch:', err);
      toast.error('เปลี่ยนสถานะแคมเปญไม่สำเร็จ');
    } finally {
      setToggling(false);
    }
  }

  async function handleDownload() {
    if (!batch || downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadUnlockBatchCsv(batch.id, batch.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Failed to download CSV:', err);
      toast.error('ดาวน์โหลด CSV ไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
        <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
      </div>
    );
  }

  if (!batch) {
    const notFound = result?.state === 'notfound';
    return (
      <div className="max-w-xl mx-auto mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-10 text-center">
        {notFound ? (
          <FileQuestion className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-12 h-12 text-red-300 dark:text-red-700 mx-auto mb-3" aria-hidden="true" />
        )}
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {notFound ? 'ไม่พบแคมเปญนี้' : 'โหลดข้อมูลแคมเปญไม่สำเร็จ'}
        </h1>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!notFound && (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={ADMIN_PRIMARY_BUTTON}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ลองใหม่
            </button>
          )}
          <Link href="/admin/unlock-codes" className={ADMIN_SECONDARY_BUTTON}>
            กลับไปรายการแคมเปญ
          </Link>
        </div>
      </div>
    );
  }

  const unused = Math.max(0, batch.codeCount - batch.usedCount);
  const tiles = [
    { label: 'โค้ดทั้งหมด', value: batch.codeCount.toLocaleString('th-TH') },
    { label: 'ใช้แล้ว', value: batch.usedCount.toLocaleString('th-TH') },
    { label: 'ยังไม่ใช้', value: unused.toLocaleString('th-TH') },
    {
      label: batch.kind === 'pro' ? 'จำนวนวันของแพ็กเกจ' : 'อายุสิทธิ์',
      value: `${batch.accessDays.toLocaleString('th-TH')} วัน`,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <FadeIn>
        <Link
          href="/admin/unlock-codes"
          className="inline-flex items-center gap-1 mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          กลับไปรายการแคมเปญ
        </Link>

        {/* สรุป */}
        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 mb-6" aria-labelledby="batch-title">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h1
                id="batch-title"
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words flex items-center gap-2"
              >
                <KeyRound className="w-6 h-6 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                {batch.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <BatchKindBadge kind={batch.kind} />
                สร้างเมื่อ {formatReleaseDate(batch.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                แคมเปญ
                <ToggleSwitch
                  checked={batch.isActive}
                  onChange={handleToggleBatch}
                  loading={toggling}
                  label="เปิดใช้งานแคมเปญนี้"
                />
              </span>
              <button type="button" onClick={handleDownload} disabled={downloading} className={ADMIN_SECONDARY_BUTTON}>
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Download className="w-4 h-4" aria-hidden="true" />
                )}
                ดาวน์โหลด CSV
              </button>
            </div>
          </div>

          {!batch.isActive && (
            <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              แคมเปญนี้ปิดอยู่ — โค้ดทั้งหมดกรอกไม่ได้ สิทธิ์ที่ผู้ใช้ได้ไปแล้วยังใช้ได้จนหมดอายุ
            </p>
          )}

          <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 px-4 py-3"
              >
                <dt className="text-xs text-gray-500 dark:text-gray-400">{t.label}</dt>
                <dd className="mt-0.5 text-xl font-bold text-gray-900 dark:text-gray-100">{t.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {batch.kind === 'pro' ? 'แพ็กเกจที่ได้' : 'ชุดที่ Unlock'}
              </p>
              <BatchExamsSummary batch={batch} max={20} linkExams />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">วันหมดอายุของโค้ด</p>
              <CodeExpiry value={batch.codeExpiresAt} />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {batch.kind === 'pro'
              ? 'แพ็กเกจและจำนวนวันแก้ไม่ได้หลังสร้าง · ผู้ใช้กรอกโค้ดในหน้า Upgrade หรือสมาชิกของฉัน'
              : 'ชุดที่ผูกและอายุสิทธิ์แก้ไม่ได้หลังสร้าง'}
          </p>
        </section>

        <BatchEditForm key={`${batch.id}|${batch.name}|${batch.codeExpiresAt ?? ''}`} batch={batch} onSaved={setBatch} />

        <CodesTable batchId={batch.id} />
      </FadeIn>
    </div>
  );
}

// ── แก้ชื่อ / วันหมดอายุโค้ด ─────────────────────────────────

function BatchEditForm({ batch, onSaved }: { batch: UnlockBatch; onSaved: (b: UnlockBatch) => void }) {
  const [name, setName] = useState(batch.name);
  const [expires, setExpires] = useState(toBangkokInputValue(batch.codeExpiresAt));
  const [errors, setErrors] = useState<{ name?: string; expires?: string }>({});
  const [saving, setSaving] = useState(false);

  const originalExpires = toBangkokInputValue(batch.codeExpiresAt);
  const dirty = name.trim() !== batch.name || expires !== originalExpires;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || !dirty) return;
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'กรุณาตั้งชื่อแคมเปญ';
    else if (trimmed.length > MAX_BATCH_NAME) next.name = `ชื่อแคมเปญยาวได้ไม่เกิน ${MAX_BATCH_NAME} ตัวอักษร`;
    const iso = expires.trim() ? bangkokInputToIso(expires) : null;
    if (expires.trim() && !iso) next.expires = 'วันหมดอายุโค้ดไม่ถูกต้อง';
    setErrors(next);
    if (next.name) {
      document.getElementById('batch-edit-name')?.focus();
      return;
    }
    if (next.expires) {
      document.getElementById('batch-edit-expires')?.focus();
      return;
    }
    setSaving(true);
    try {
      const input: { name?: string; codeExpiresAt?: string | null } = {};
      if (trimmed !== batch.name) input.name = trimmed;
      if (expires !== originalExpires) input.codeExpiresAt = iso;
      const updated = await updateUnlockBatch(batch.id, input);
      onSaved({ ...batch, ...updated });
      toast.success('บันทึกแคมเปญแล้ว');
    } catch (err) {
      console.error('Failed to update batch:', err);
      toast.error(err instanceof ApiError && err.message ? `บันทึกไม่สำเร็จ: ${err.message}` : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="batch-edit-heading"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 mb-6"
    >
      <h2 id="batch-edit-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        แก้ไขแคมเปญ
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="batch-edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            ชื่อแคมเปญ
          </label>
          <input
            id="batch-edit-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
            }}
            maxLength={MAX_BATCH_NAME}
            disabled={saving}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'batch-edit-name-error' : undefined}
            className={errors.name ? ADMIN_INPUT_INVALID : ADMIN_INPUT}
          />
          {errors.name && (
            <p id="batch-edit-name-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {errors.name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="batch-edit-expires" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            วันหมดอายุของโค้ด (เวลาไทย)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="batch-edit-expires"
              type="datetime-local"
              value={expires}
              onChange={(e) => {
                setExpires(e.target.value);
                if (errors.expires) setErrors((p) => ({ ...p, expires: undefined }));
              }}
              disabled={saving}
              aria-invalid={errors.expires ? true : undefined}
              aria-describedby={`batch-edit-expires-hint${errors.expires ? ' batch-edit-expires-error' : ''}`}
              className={`${errors.expires ? ADMIN_INPUT_INVALID : ADMIN_INPUT} flex-1 min-w-[12rem]`}
            />
            {expires && (
              <button type="button" onClick={() => setExpires('')} disabled={saving} className={ADMIN_SECONDARY_BUTTON}>
                ไม่หมดอายุ
              </button>
            )}
          </div>
          <p id="batch-edit-expires-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            ว่าง = ไม่หมดอายุ · ตั้งเป็นเวลาที่ผ่านไปแล้ว = กรอกโค้ดไม่ได้ทันที
          </p>
          {errors.expires && (
            <p id="batch-edit-expires-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {errors.expires}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || !dirty} className={ADMIN_PRIMARY_BUTTON}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          บันทึก
        </button>
      </div>
    </form>
  );
}

// ── ตารางโค้ด ─────────────────────────────────────────────

function CodeStatusBadges({ code }: { code: UnlockCode }) {
  return (
    <span className="flex flex-wrap gap-1">
      {code.usedAt ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
          ใช้แล้ว
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
          ยังไม่ใช้
        </span>
      )}
      {!code.isActive && (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          ปิด
        </span>
      )}
    </span>
  );
}

function CodesTable({ batchId }: { batchId: string }) {
  const [status, setStatus] = useState<UnlockCodeStatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${batchId}|${status}|${search}|${page}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data: Paginated<UnlockCode> | null; error: boolean } | null>(
    null,
  );
  const loading = result?.key !== requestKey;
  const data = loading ? null : result.data;
  const error = !loading && result.error;
  const [toggling, setToggling] = useState<string | null>(null);

  // ค้นหาแบบ debounce → กลับหน้า 1 (ตอน mount ค่าเดิม ไม่ทำให้โหลดซ้ำ)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    getUnlockBatchCodes(batchId, { status, search: search || undefined, page, limit: CODES_LIMIT }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: res, error: false });
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to load unlock codes:', err);
        setResult({ key: requestKey, data: null, error: true });
      });
    return () => controller.abort();
  }, [batchId, status, search, page, requestKey]);

  async function handleToggle(code: UnlockCode, next: boolean) {
    setToggling(code.id);
    try {
      const updated = await updateUnlockCode(code.id, { isActive: next });
      setResult((prev) =>
        prev?.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                items: prev.data.items.map((c) => (c.id === code.id ? { ...c, isActive: updated.isActive } : c)),
              },
            }
          : prev,
      );
      toast.success(next ? `เปิดโค้ด ${code.code} แล้ว` : `ปิดโค้ด ${code.code} แล้ว กรอกไม่ได้ทันที`);
    } catch (err) {
      console.error('Failed to toggle code:', err);
      toast.error('เปลี่ยนสถานะโค้ดไม่สำเร็จ');
    } finally {
      setToggling(null);
    }
  }

  return (
    <section aria-labelledby="codes-heading" className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 pb-4 sm:pb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="codes-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          รายการโค้ด
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div role="group" aria-label="กรองสถานะโค้ด" className="flex flex-wrap gap-1.5">
            {CODE_STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={`min-h-10 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  status === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-56">
            <label htmlFor="code-search" className="sr-only">
              ค้นหาโค้ดหรืออีเมล
            </label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              id="code-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาโค้ดหรืออีเมล..."
              autoComplete="off"
              spellCheck={false}
              className={`${ADMIN_INPUT} pl-9`}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center border-t border-gray-200 dark:border-gray-700" role="status">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center border-t border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">โหลดรายการโค้ดไม่สำเร็จ</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className={`${ADMIN_PRIMARY_BUTTON} mt-3`}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            ลองใหม่
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="p-8 text-center text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
          {search || status !== 'all' ? 'ไม่พบโค้ดตามเงื่อนไข' : 'แคมเปญนี้ยังไม่มีโค้ด'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border-t border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['โค้ด', 'สถานะ', 'ผู้ใช้', 'เวลาที่ใช้', 'เปิด/ปิด'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((code) => {
                  const userName = formatUserName(code.usedBy);
                  return (
                    <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {code.code}
                      </td>
                      <td className="px-4 py-2">
                        <CodeStatusBadges code={code} />
                      </td>
                      <td className="px-4 py-2 text-sm max-w-[18rem]">
                        {code.usedBy ? (
                          <>
                            <span className="block text-gray-900 dark:text-gray-100 break-all">{code.usedBy.email}</span>
                            {userName && <span className="block text-xs text-gray-500 dark:text-gray-400">{userName}</span>}
                          </>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {code.usedAt ? formatReleaseDate(code.usedAt) : '-'}
                      </td>
                      <td className="px-4 py-0.5">
                        <ToggleSwitch
                          checked={code.isActive}
                          onChange={(next) => handleToggle(code, next)}
                          loading={toggling === code.id}
                          label={`เปิดใช้งานโค้ด ${code.code}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="โค้ด"
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
