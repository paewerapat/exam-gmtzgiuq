'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, Plus, Trash2 } from 'lucide-react';
import CodeInstructionsView from '@/components/mock-exam/CodeInstructionsView';
import { moveItem } from '@/lib/question-images';
import {
  codeStepError,
  createCodeStep,
  MAX_CODE_NOTE,
  MAX_CODE_STEPS,
  MAX_STEP_DESCRIPTION,
  MAX_STEP_LINK_LABEL,
  MAX_STEP_LINK_URL,
  MAX_STEP_TITLE,
  toCodeInstructions,
  type CodeStepForm,
  type MockExamForm,
} from '@/lib/mock-exam';

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60';
const LABEL_CLASS = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1';
const ICON_BUTTON =
  'p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed';

type CodeForm = Pick<MockExamForm, 'codeSteps' | 'codeNote'>;

interface CodeInstructionsEditorProps {
  value: CodeForm;
  onChange: (update: (prev: MockExamForm) => MockExamForm) => void;
  disabled?: boolean;
}

/** ขั้นตอนที่ยังว่างทั้งหมด (เพิ่งกดเพิ่ม) ยังไม่ต้องเตือน */
function isBlank(st: CodeStepForm) {
  return !st.title.trim() && !st.description.trim() && !st.linkLabel.trim() && !st.linkUrl.trim();
}

/** ตัวแก้ "วิธีรับโค้ด" ในกล่อง Mock Exam (แสดงเมื่อสถานะการเข้าถึง = ต้องใช้โค้ด) */
export default function CodeInstructionsEditor({ value, onChange, disabled = false }: CodeInstructionsEditorProps) {
  const [preview, setPreview] = useState(false);
  const { codeSteps: steps, codeNote: note } = value;
  const isFull = steps.length >= MAX_CODE_STEPS;
  const previewData = toCodeInstructions(value, false);

  const addStep = () =>
    onChange((prev) =>
      prev.codeSteps.length >= MAX_CODE_STEPS ? prev : { ...prev, codeSteps: [...prev.codeSteps, createCodeStep()] },
    );
  const moveStep = (from: number, to: number) =>
    onChange((prev) => {
      const next = moveItem(prev.codeSteps, from, to);
      return next === prev.codeSteps ? prev : { ...prev, codeSteps: next };
    });
  const removeStep = (key: string) =>
    onChange((prev) => ({ ...prev, codeSteps: prev.codeSteps.filter((st) => st.key !== key) }));
  const setStep = (key: string, field: keyof Omit<CodeStepForm, 'key'>, v: string) =>
    onChange((prev) => ({
      ...prev,
      codeSteps: prev.codeSteps.map((st) => (st.key === key ? { ...st, [field]: v } : st)),
    }));

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-4" data-testid="code-instructions-editor">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          วิธีรับโค้ด
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {steps.length}/{MAX_CODE_STEPS} ขั้นตอน
          </span>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            disabled={!previewData}
            aria-expanded={preview}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {preview ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
            {preview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่างการแสดงผล'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        แสดงบนหน้ารายละเอียดชุดเป็นการ์ดเรียงตามลำดับ แต่ละขั้นมีหัวข้อ คำอธิบาย และปุ่มลิงก์ได้ (ลิงก์ http/https เท่านั้น)
      </p>

      {steps.length > 0 && (
        <ol className="space-y-3 mb-3">
          {steps.map((st, i) => {
            const no = i + 1;
            const err = isBlank(st) ? null : codeStepError(st);
            const errId = `code-step-${st.key}-error`;
            return (
              <li
                key={st.key}
                data-testid="code-step-form"
                className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ขั้นที่ {no}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(i, i - 1)}
                      disabled={disabled || i === 0}
                      aria-label={`เลื่อนขั้นที่ ${no} ขึ้น`}
                      title="เลื่อนขึ้น"
                      className={`${ICON_BUTTON} hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(i, i + 1)}
                      disabled={disabled || i === steps.length - 1}
                      aria-label={`เลื่อนขั้นที่ ${no} ลง`}
                      title="เลื่อนลง"
                      className={`${ICON_BUTTON} hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(st.key)}
                      disabled={disabled}
                      aria-label={`ลบขั้นที่ ${no}`}
                      title="ลบ"
                      className={`${ICON_BUTTON} hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor={`code-step-${st.key}-title`} className={LABEL_CLASS}>
                      หัวข้อ<span className="text-red-500 dark:text-red-400"> *</span>
                    </label>
                    <input
                      id={`code-step-${st.key}-title`}
                      type="text"
                      value={st.title}
                      onChange={(e) => setStep(st.key, 'title', e.target.value)}
                      disabled={disabled}
                      maxLength={MAX_STEP_TITLE}
                      placeholder="เช่น ติดตามเพจ Instagram"
                      aria-describedby={err ? errId : undefined}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`code-step-${st.key}-desc`} className={LABEL_CLASS}>
                      คำอธิบาย
                    </label>
                    <textarea
                      id={`code-step-${st.key}-desc`}
                      value={st.description}
                      onChange={(e) => setStep(st.key, 'description', e.target.value)}
                      disabled={disabled}
                      rows={2}
                      maxLength={MAX_STEP_DESCRIPTION}
                      placeholder="ไม่บังคับ"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`code-step-${st.key}-label`} className={LABEL_CLASS}>
                      ข้อความปุ่ม
                    </label>
                    <input
                      id={`code-step-${st.key}-label`}
                      type="text"
                      value={st.linkLabel}
                      onChange={(e) => setStep(st.key, 'linkLabel', e.target.value)}
                      disabled={disabled}
                      maxLength={MAX_STEP_LINK_LABEL}
                      placeholder="เช่น ไปที่ Instagram"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`code-step-${st.key}-url`} className={LABEL_CLASS}>
                      ลิงก์
                    </label>
                    <input
                      id={`code-step-${st.key}-url`}
                      type="url"
                      inputMode="url"
                      value={st.linkUrl}
                      onChange={(e) => setStep(st.key, 'linkUrl', e.target.value)}
                      disabled={disabled}
                      maxLength={MAX_STEP_LINK_URL}
                      placeholder="https://..."
                      aria-describedby={err ? errId : undefined}
                      className={INPUT_CLASS}
                    />
                  </div>
                  {err && (
                    <p id={errId} className="sm:col-span-2 text-xs text-red-600 dark:text-red-400">
                      {err}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {isFull ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">ครบ {MAX_CODE_STEPS} ขั้นตอนแล้ว</p>
      ) : (
        <button
          type="button"
          onClick={addStep}
          disabled={disabled}
          className="mb-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          เพิ่มขั้นตอน
        </button>
      )}

      <div>
        <label htmlFor="code-instructions-note" className={LABEL_CLASS}>
          หมายเหตุ (แสดงใต้ขั้นตอน)
        </label>
        <textarea
          id="code-instructions-note"
          value={note}
          onChange={(e) => onChange((prev) => ({ ...prev, codeNote: e.target.value }))}
          disabled={disabled}
          rows={2}
          maxLength={MAX_CODE_NOTE}
          placeholder="เช่น บัญชีที่แชร์ควรตั้งเป็นสาธารณะ เพื่อให้ตรวจได้"
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
          {note.length}/{MAX_CODE_NOTE}
        </p>
      </div>

      {preview && previewData && (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3 sm:p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">ตัวอย่างการแสดงผล (เหมือนหน้ารายละเอียด)</p>
          <CodeInstructionsView instructions={previewData} headingId="code-instructions-preview-heading" />
        </div>
      )}
    </div>
  );
}
