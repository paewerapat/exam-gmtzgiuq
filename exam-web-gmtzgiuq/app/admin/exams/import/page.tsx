'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileUp,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  BookOpen,
  Timer,
  FileQuestion,
  ShieldAlert,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'react-toastify';
import FadeIn from '@/components/animations/FadeIn';
import LatexRenderer from '@/components/latex/LatexRenderer';
import LatexText from '@/components/latex/LatexText';
import { useAuth } from '@/contexts/AuthContext';
import { createExam } from '@/lib/api/exams';
import { getCategories, type Category } from '@/lib/api/categories';
import { getPublicCurriculumTree, type Subject } from '@/lib/api/curriculum';
import { uploadImage, deleteUploadedImage, type UploadResult } from '@/lib/api/upload';
import {
  parseImportFile,
  resolveImport,
  buildCreateExamInput,
  MAX_IMPORT_FILE_BYTES,
  type ParsedImport,
  type ImportImage,
  type ImportIssue,
  type ImportQuestionStatus,
  type ResolvedImportQuestion,
} from '@/lib/exam-import';

interface ImportResult {
  examId: string;
  title: string;
  problems: ResolvedImportQuestion[];
}

type Progress =
  | { phase: 'upload'; done: number; total: number }
  | { phase: 'create' };

const SELECT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60';

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function toDataUrl(image: ImportImage): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < image.data.length; i += chunk) {
    binary += String.fromCharCode(...image.data.subarray(i, i + chunk));
  }
  return `data:${image.mimeType};base64,${btoa(binary)}`;
}

function ImagePreview({
  image,
  className = 'max-w-full sm:max-w-md h-auto',
}: {
  image: ImportImage;
  /** ขนาดรูป (ค่าเริ่มต้นสำหรับรูปโจทย์) */
  className?: string;
}) {
  const src = useMemo(() => toDataUrl(image), [image]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={image.fileName}
      className={`block ${className} rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900`}
    />
  );
}

function StatusBadge({ status }: { status: ImportQuestionStatus }) {
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
        <XCircle className="w-3.5 h-3.5" /> ผิดพลาด
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5" /> เตือน
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
      <CheckCircle className="w-3.5 h-3.5" /> ผ่าน
    </span>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1">
      {issues.map((issue, i) => {
        const style =
          issue.level === 'error'
            ? 'text-red-700 dark:text-red-300'
            : issue.level === 'warning'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-sky-700 dark:text-sky-300';
        const Icon = issue.level === 'error' ? XCircle : issue.level === 'warning' ? AlertTriangle : Info;
        const prefix = issue.level === 'note' ? 'หมายเหตุ: ' : '';
        return (
          <li key={i} className={`flex items-start gap-1.5 text-xs ${style}`}>
            <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="break-words">
              {prefix}
              {issue.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function typeLabel(q: ResolvedImportQuestion): string {
  if (q.rawType === 'mcq') {
    return q.choices.filter((c) => c.isCorrect).length >= 2 ? 'ปรนัย (ตอบได้หลายข้อ)' : 'ปรนัย';
  }
  if (q.rawType === 'numeric') return 'อัตนัย';
  return q.rawType || '-';
}

export default function ImportExamPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  const [categories, setCategories] = useState<Category[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const refLoadStarted = useRef(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // โหลดหมวดหมู่ + หลักสูตรครั้งเดียว (เฉพาะ admin)
  useEffect(() => {
    if (!isAdmin || refLoadStarted.current) return;
    refLoadStarted.current = true;
    Promise.allSettled([getCategories(), getPublicCurriculumTree()]).then(([cats, tree]) => {
      if (cats.status === 'fulfilled') setCategories(cats.value);
      else toast.error('โหลดหมวดหมู่ไม่สำเร็จ');
      if (tree.status === 'fulfilled') setSubjects(tree.value);
      else toast.error('โหลดหลักสูตรไม่สำเร็จ');
      setRefLoading(false);
    });
  }, [isAdmin]);

  const resolved = useMemo(
    () =>
      parsed
        ? resolveImport(parsed, { categories, subjects, subjectId: subjectId || null })
        : null,
    [parsed, categories, subjects, subjectId],
  );

  const category = categoryChoice ?? resolved?.matchedCategorySlug ?? '';
  const imageMap = useMemo(
    () => new Map((resolved?.images ?? []).map((img) => [img.path, img])),
    [resolved],
  );

  const handleFile = useCallback(async (file: File) => {
    if (creatingRef.current) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error('ไฟล์ใหญ่เกิน 100MB');
      return;
    }
    setParsing(true);
    setResult(null);
    setCategoryChoice(null);
    setExpanded(new Set());
    try {
      const bytes = await readFileBytes(file);
      setParsed(parseImportFile(file.name, bytes));
      setFileName(file.name);
    } catch (e) {
      console.error('Failed to read import file:', e);
      toast.error('อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const toggleExpand = (orderIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderIndex)) next.delete(orderIndex);
      else next.add(orderIndex);
      return next;
    });
  };

  const reset = () => {
    setParsed(null);
    setFileName(null);
    setResult(null);
    setCategoryChoice(null);
    setExpanded(new Set());
  };

  const canCreate = !!resolved && !resolved.hasFileError && !!category && !creating && !refLoading;

  const handleCreate = async () => {
    if (!resolved || resolved.hasFileError || !category || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);

    const uploaded: UploadResult[] = [];
    try {
      const imageUrls: Record<string, string> = {};
      const total = resolved.images.length;
      setProgress({ phase: 'upload', done: 0, total });
      for (const img of resolved.images) {
        const file = new File([new Uint8Array(img.data)], img.fileName, { type: img.mimeType });
        let res: UploadResult;
        try {
          res = await uploadImage(file);
        } catch (e) {
          throw new Error(`อัปโหลดรูป "${img.path}" ไม่สำเร็จ (${errorMessage(e)})`);
        }
        uploaded.push(res);
        imageUrls[img.path] = res.url;
        setProgress({ phase: 'upload', done: uploaded.length, total });
      }

      setProgress({ phase: 'create' });
      const exam = await createExam(
        buildCreateExamInput(resolved, { category, subjectId: subjectId || null, imageUrls }),
      );

      setResult({
        examId: exam.id,
        title: exam.title,
        problems: resolved.questions.filter((q) => q.status !== 'ok'),
      });
      toast.success('สร้างแบบร่างแล้ว');
    } catch (e) {
      console.error('Import failed:', e);
      toast.error(`สร้างแบบร่างไม่สำเร็จ: ${errorMessage(e)}`);
      // best effort: ลบรูปที่อัปไปแล้ว
      await Promise.allSettled(uploaded.map((u) => deleteUploadedImage(u.filename)));
    } finally {
      creatingRef.current = false;
      setCreating(false);
      setProgress(null);
    }
  };

  // ── render ──────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <ShieldAlert className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              เฉพาะผู้ดูแลระบบเท่านั้น
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              บัญชีนี้ไม่มีสิทธิ์นำเข้าชุดข้อสอบ
            </p>
          </div>
        </div>
      </div>
    );
  }

  const exam = resolved?.exam ?? null;
  const fileErrors = resolved?.fileIssues ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <FadeIn>
          <Link
            href="/admin/exams"
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับรายการชุดข้อสอบ</span>
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">นำเข้าชุดข้อสอบ</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            อัปโหลดไฟล์ .zip (exam.json + โฟลเดอร์รูป) หรือไฟล์ .json เดี่ยว ระบบจะสร้างเป็นแบบร่าง ให้ตรวจและแก้ต่อในหน้าแก้ไขก่อนเผยแพร่
          </p>

          {/* Result */}
          {result && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 border border-green-200 dark:border-green-800/50">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">สร้างแบบร่างแล้ว</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                    <LatexText text={result.title} />
                  </p>
                </div>
              </div>

              {result.problems.length > 0 ? (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ข้อที่ควรตรวจในหน้าแก้ไข ({result.problems.length} ข้อ)
                  </p>
                  <div className="space-y-2">
                    {result.problems.map((q) => (
                      <div
                        key={q.orderIndex}
                        className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">ข้อ {q.no}</span>
                          <StatusBadge status={q.status} />
                        </div>
                        <IssueList issues={q.issues} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">ไม่มีข้อที่มีปัญหา</p>
              )}

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/admin/exams/${result.examId}/edit`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>เปิดแบบร่าง</span>
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>นำเข้าไฟล์อื่น</span>
                </button>
              </div>
            </div>
          )}

          {/* File picker */}
          {!result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!creating) setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-dashed p-8 mb-6 text-center transition ${
                dragOver
                  ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'border-gray-300 dark:border-gray-600'
              } ${creating ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                className="hidden"
                data-testid="import-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              {parsing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">กำลังอ่านไฟล์...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <FileUp className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-2" />
                  <p className="text-gray-600 dark:text-gray-400 mb-3">
                    {fileName ? (
                      <>
                        ไฟล์ปัจจุบัน: <span className="font-medium text-gray-900 dark:text-gray-100 break-all">{fileName}</span>
                      </>
                    ) : (
                      'ลากไฟล์ .zip หรือ .json มาวางที่นี่'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={creating}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-60"
                  >
                    <FileUp className="w-4 h-4" />
                    <span>{fileName ? 'เลือกไฟล์ใหม่' : 'เลือกไฟล์'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {resolved && !result && (
            <>
              {fileErrors.length > 0 && (
                <div
                  className={`rounded-lg p-4 mb-6 border ${
                    resolved.hasFileError
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/50'
                      : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold mb-2 ${
                      resolved.hasFileError ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {resolved.hasFileError ? 'นำเข้าไฟล์นี้ไม่ได้' : 'ข้อสังเกตของไฟล์'}
                  </p>
                  <IssueList issues={fileErrors} />
                </div>
              )}

              {exam && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 break-words">
                    {exam.title ? <LatexText text={exam.title} /> : <span className="text-gray-400 dark:text-gray-500">(ไม่มีชื่อ)</span>}
                  </h2>
                  {exam.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 whitespace-pre-wrap break-words">{exam.description}</p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Timer className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      <span>{exam.durationMinutes ? `${exam.durationMinutes} นาที` : 'ไม่จับเวลา'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <FileQuestion className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      <span>{resolved.questions.length} ข้อ</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <ImageIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      <span>{resolved.images.length} รูป</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="import-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        หมวดหมู่ <span className="text-red-500 dark:text-red-400">*</span>
                      </label>
                      <select
                        id="import-category"
                        value={category}
                        onChange={(e) => setCategoryChoice(e.target.value)}
                        disabled={creating || refLoading}
                        className={SELECT_CLASS}
                      >
                        <option value="">เลือกหมวดหมู่</option>
                        {categories.map((cat) => (
                          <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                        ))}
                      </select>
                      {!refLoading && !resolved.matchedCategorySlug && (
                        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                          {exam.categoryText
                            ? `ไม่พบหมวดหมู่ "${exam.categoryText}" ในระบบ กรุณาเลือก`
                            : 'ไฟล์ไม่ได้ระบุหมวดหมู่ กรุณาเลือก'}
                        </p>
                      )}
                      {resolved.matchedCategorySlug && categoryChoice === null && (
                        <p className="mt-1.5 text-xs text-green-700 dark:text-green-300">
                          จับคู่จากไฟล์: {exam.categoryText}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="import-subject" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        วิชา
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(ใช้จับคู่หัวข้อของแต่ละข้อ)</span>
                      </label>
                      <select
                        id="import-subject"
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        disabled={creating || refLoading}
                        className={SELECT_CLASS}
                      >
                        <option value="">— ไม่ระบุวิชา —</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {resolved.questions.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">รายการข้อ</h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ผิดพลาด {resolved.errorQuestionCount} ข้อ · เตือน {resolved.warningQuestionCount} ข้อ · กดที่แถวเพื่อดูรายละเอียด
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        <tr>
                          <th className="px-4 py-3 w-14">ข้อ</th>
                          <th className="px-4 py-3 w-20">ประเภท</th>
                          <th className="px-4 py-3">โจทย์</th>
                          <th className="px-4 py-3 w-40">หัวข้อ</th>
                          <th className="px-4 py-3 w-32">รูป</th>
                          <th className="px-4 py-3 w-28">สถานะ</th>
                          <th className="px-2 py-3 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {resolved.questions.map((q) => {
                          const isOpen = expanded.has(q.orderIndex);
                          return (
                            <QuestionRow
                              key={q.orderIndex}
                              q={q}
                              isOpen={isOpen}
                              imageMap={imageMap}
                              onToggle={() => toggleExpand(q.orderIndex)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {exam && !resolved.hasFileError && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!canCreate}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                    <span>
                      {resolved.errorQuestionCount > 0
                        ? `สร้างแบบร่าง (มีปัญหา ${resolved.errorQuestionCount} ข้อ)`
                        : 'สร้างแบบร่าง'}
                    </span>
                  </button>
                  {progress ? (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {progress.phase === 'upload'
                        ? `กำลังอัปโหลดรูป ${progress.done}/${progress.total}`
                        : 'กำลังสร้างชุดข้อสอบ...'}
                    </span>
                  ) : !category ? (
                    <span className="text-sm text-amber-700 dark:text-amber-300">เลือกหมวดหมู่ก่อนสร้าง</span>
                  ) : resolved.errorQuestionCount > 0 ? (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ข้อที่มีปัญหายังถูกสร้าง ให้แก้ต่อในหน้าแก้ไข
                    </span>
                  ) : null}
                </div>
              )}
            </>
          )}
        </FadeIn>
      </div>
    </div>
  );
}

function QuestionRow({
  q,
  isOpen,
  imageMap,
  onToggle,
}: {
  q: ResolvedImportQuestion;
  isOpen: boolean;
  imageMap: Map<string, ImportImage>;
  onToggle: () => void;
}) {
  const questionImages = q.imagePaths
    .map((path) => imageMap.get(path))
    .filter((img): img is ImportImage => !!img);
  const choiceImageRefs = q.choices.filter((c) => c.imageRef).length;
  const choiceImagesOk = q.choices.filter((c) => c.imagePath).length;
  const brokenImages =
    q.imageRefs.length - q.imagePaths.length + (choiceImageRefs - choiceImagesOk);
  const hasAnyImage = q.imageRefs.length > 0 || choiceImageRefs > 0;

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer align-top hover:bg-gray-50 dark:hover:bg-gray-700/40"
        aria-expanded={isOpen}
      >
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{q.no}</td>
        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{typeLabel(q)}</td>
        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
          {q.question.trim() ? (
            <LatexRenderer content={q.question} className="line-clamp-2 break-words" />
          ) : (
            <span className="text-gray-400 dark:text-gray-500">(ไม่มีโจทย์)</span>
          )}
        </td>
        <td className="px-4 py-3">
          {q.topicName ? (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                q.topicMatched ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {q.topicMatched ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="break-words">{q.topicName}</span>
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {hasAnyImage ? (
            <div className="space-y-0.5 text-xs">
              {q.imageRefs.length > 0 && (
                <span className="flex items-center gap-1 text-green-700 dark:text-green-300 whitespace-nowrap">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" /> โจทย์ {q.imagePaths.length} รูป
                </span>
              )}
              {choiceImageRefs > 0 && (
                <span className="flex items-center gap-1 text-green-700 dark:text-green-300 whitespace-nowrap">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" /> ตัวเลือก {choiceImagesOk} รูป
                </span>
              )}
              {brokenImages > 0 && (
                <span className="flex items-center gap-1 text-red-700 dark:text-red-300 whitespace-nowrap">
                  <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> ใช้ไม่ได้ {brokenImages} รูป
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={q.status} />
        </td>
        <td className="px-2 py-3 text-gray-400 dark:text-gray-500">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>
      {(isOpen || q.issues.length > 0) && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/30">
          <td />
          <td colSpan={6} className="px-4 pb-4 pt-1">
            <IssueList issues={q.issues} />
            {isOpen && (
              <div className="mt-3 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                {q.question.trim() && (
                  <LatexRenderer content={q.question} className="break-words leading-relaxed" />
                )}
                {questionImages.length > 0 && (
                  <div className="space-y-2">
                    {questionImages.map((img, i) => (
                      <div key={`${i}-${img.path}`}>
                        {questionImages.length > 1 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">รูปที่ {i + 1}</p>
                        )}
                        <ImagePreview image={img} />
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'multiple_choice' && q.choices.length > 0 && (
                  <ul className="space-y-1">
                    {q.choices.map((c) => {
                      const choiceImage = c.imagePath ? imageMap.get(c.imagePath) : undefined;
                      return (
                        <li
                          key={c.id}
                          className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border ${
                            c.isCorrect
                              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <span className="font-medium uppercase">{c.id}.</span>
                          <div className="min-w-0">
                            {c.text.trim() && <LatexText text={c.text} />}
                            {choiceImage && (
                              <ImagePreview
                                image={choiceImage}
                                className={`${c.text.trim() ? 'mt-1' : ''} max-h-32 max-w-full w-auto`}
                              />
                            )}
                            {c.imageRef && !choiceImage && (
                              <span className="block text-xs text-red-700 dark:text-red-300">
                                รูปใช้ไม่ได้: {c.imageRef}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {q.type === 'multiple_choice' && q.choices.length > 0 && (
                  <p className="text-gray-700 dark:text-gray-300">
                    คำตอบที่ถูก:{' '}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {q.choices.filter((c) => c.isCorrect).map((c) => c.id.toUpperCase()).join(', ') || '-'}
                    </span>
                  </p>
                )}
                {q.type === 'short_answer' && (
                  <p className="text-gray-700 dark:text-gray-300">
                    คำตอบ: <span className="font-semibold text-gray-900 dark:text-gray-100">{q.correctAnswer || '-'}</span>
                  </p>
                )}
                {q.hint && (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-gray-700 dark:text-gray-300">
                    <span className="font-medium">คำใบ้: </span>
                    <LatexText text={q.hint} />
                  </div>
                )}
                {q.explanation && (
                  <div className="px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-gray-700 dark:text-gray-300">
                    <span className="font-medium">เฉลย: </span>
                    <LatexRenderer content={q.explanation} className="break-words" />
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
