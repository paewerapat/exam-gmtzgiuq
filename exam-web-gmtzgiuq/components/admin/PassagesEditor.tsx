'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { PassageContent } from '@/components/exam/PassagePanel';
import QuestionImagesEditor from '@/components/upload/QuestionImagesEditor';
import {
  MAX_PASSAGE_BODY,
  MAX_PASSAGE_TITLE,
  MAX_PASSAGES,
  passageLabel,
  questionNumbersUsingPassage,
  type PassageForm,
} from '@/lib/exam-passages';

const INPUT_CLASS =
  'w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60';

interface PassagesEditorProps {
  passages: PassageForm[];
  /** ข้อทั้งหมดในฟอร์ม (ใช้บอกว่าบทอ่านไหนผูกกับข้อใด) */
  questions: { passageId?: string | null }[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onFieldChange: (id: string, field: 'title' | 'body', value: string) => void;
  /** ติ๊ก/เอาติ๊กออก "แสดงเลขบรรทัด" */
  onLineNumbersChange: (id: string, value: boolean) => void;
  /** ลบ/เลื่อนรูป แบบ updater (หน้าแม่ตัดสินใจเรื่องลบไฟล์) */
  onImagesChange: (id: string, update: (prev: string[]) => string[]) => void;
  /** เพิ่มรูป — หน้าแม่ตรวจกับค่าล่าสุดอีกรอบ (อัปโหลดเสร็จทีหลังได้) */
  onImageAdd: (id: string, url: string) => void;
  onUploaded?: (url: string) => void;
  disabled?: boolean;
}

/** ส่วน "บทอ่านร่วม" ของฟอร์มสร้าง/แก้ข้อสอบ: เพิ่ม/ลบบทอ่าน แก้ชื่อ เนื้อหา (มีตัวอย่าง LaTeX) และรูป ≤ 6 */
export default function PassagesEditor({
  passages,
  questions,
  onAdd,
  onRemove,
  onFieldChange,
  onLineNumbersChange,
  onImagesChange,
  onImageAdd,
  onUploaded,
  disabled = false,
}: PassagesEditorProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [previewing, setPreviewing] = useState<Set<string>>(() => new Set());

  const toggleIn = (setter: typeof setCollapsed, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="passages-heading" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h2 id="passages-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          บทอ่านร่วม ({passages.length})
        </h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        บทอ่าน บทสนทนา ตาราง หรือสถานการณ์ที่ใช้ตอบหลายข้อ สร้างครั้งเดียวแล้วเลือกในแต่ละข้อที่ช่อง &quot;ใช้บทอ่านไหน&quot;
        (ผู้ทำข้อสอบจะเห็นบทอ่านด้านซ้ายของโจทย์)
      </p>

      {passages.length > 0 && (
        <div className="space-y-4 mb-4">
          {passages.map((p, index) => {
            const label = `บทอ่านที่ ${index + 1}`;
            const usedBy = questionNumbersUsingPassage(questions, p.id);
            const isCollapsed = collapsed.has(p.id);
            const isPreview = previewing.has(p.id);
            const titleId = `passage-title-${p.id}`;
            const bodyId = `passage-body-${p.id}`;
            const lineNumbersId = `passage-line-numbers-${p.id}`;
            const lineNumbersHintId = `${lineNumbersId}-hint`;
            return (
              <div
                key={p.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                data-testid="passage-form"
              >
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => toggleIn(setCollapsed, p.id)}
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">{label}</span>
                    {p.title.trim() && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate">— {p.title.trim()}</span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        usedBy.length > 0
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {usedBy.length > 0 ? `ใช้กับข้อ ${usedBy.join(', ')}` : 'ยังไม่มีข้อที่ใช้'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      disabled={disabled}
                      aria-label={`ลบ${label}`}
                      title="ลบบทอ่าน"
                      className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="px-4 py-4 space-y-4">
                    <p className="sm:hidden text-xs text-gray-500 dark:text-gray-400">
                      {usedBy.length > 0 ? `ใช้กับข้อ ${usedBy.join(', ')}` : 'ยังไม่มีข้อที่ใช้'}
                    </p>
                    <div>
                      <label htmlFor={titleId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ชื่อบทอ่าน
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 font-normal">
                          (ไม่บังคับ เช่น &quot;ใช้สถานการณ์ต่อไปนี้ตอบคำถามข้อ 28–30&quot;)
                        </span>
                      </label>
                      <input
                        id={titleId}
                        type="text"
                        value={p.title}
                        maxLength={MAX_PASSAGE_TITLE}
                        onChange={(e) => onFieldChange(p.id, 'title', e.target.value)}
                        disabled={disabled}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label htmlFor={bodyId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          เนื้อหาบทอ่าน
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleIn(setPreviewing, p.id)}
                          disabled={!p.body.trim()}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {isPreview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่างการแสดงผล'}
                        </button>
                      </div>
                      <textarea
                        id={bodyId}
                        value={p.body}
                        onChange={(e) => onFieldChange(p.id, 'body', e.target.value)}
                        disabled={disabled}
                        rows={8}
                        maxLength={MAX_PASSAGE_BODY}
                        placeholder="พิมพ์หรือวางบทอ่าน... (ขึ้นบรรทัดตามที่พิมพ์ รองรับ LaTeX เช่น $x^2$ และตาราง Markdown)"
                        className={INPUT_CLASS}
                      />
                      {isPreview && p.body.trim() && (
                        <div className="mt-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3 max-h-80 overflow-y-auto">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">ตัวอย่างการแสดงผล</p>
                          <PassageContent
                            passage={{ id: p.id, title: null, body: p.body, images: [], lineNumbers: p.lineNumbers }}
                          />
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ต้องมีเนื้อหาหรือรูปอย่างน้อยหนึ่งอย่าง
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <input
                        id={lineNumbersId}
                        type="checkbox"
                        checked={p.lineNumbers}
                        onChange={(e) => onLineNumbersChange(p.id, e.target.checked)}
                        disabled={disabled}
                        aria-describedby={lineNumbersHintId}
                        className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                      />
                      <div>
                        <label htmlFor={lineNumbersId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          แสดงเลขบรรทัด
                        </label>
                        <p id={lineNumbersHintId} className="text-xs text-gray-500 dark:text-gray-400">
                          สำหรับโจทย์ที่อ้าง &quot;บรรทัดที่ …&quot; — นับเฉพาะบรรทัดที่มีข้อความ ขึ้นบรรทัดให้ตรงกับต้นฉบับ
                        </p>
                      </div>
                    </div>

                    <QuestionImagesEditor
                      images={p.images}
                      onChange={(update) => onImagesChange(p.id, update)}
                      onAdd={(url) => onImageAdd(p.id, url)}
                      onUploaded={onUploaded}
                      disabled={disabled}
                      perLabel="บทอ่าน"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {passages.length < MAX_PASSAGES ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          เพิ่มบทอ่านร่วม
        </button>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">ครบ {MAX_PASSAGES} บทอ่านแล้ว</p>
      )}
    </section>
  );
}

interface PassageSelectProps {
  id: string;
  value: string;
  passages: PassageForm[];
  onChange: (passageId: string) => void;
  disabled?: boolean;
}

/** ช่อง "ใช้บทอ่านไหน" ของแต่ละข้อ (แสดงเมื่อมีบทอ่านอย่างน้อย 1 ชุด) */
export function PassageSelect({ id, value, passages, onChange, disabled = false }: PassageSelectProps) {
  if (passages.length === 0) return null;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        ใช้บทอ่านไหน
      </label>
      <select
        id={id}
        value={passages.some((p) => p.id === value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <option value="">ไม่ใช้บทอ่าน</option>
        {passages.map((p, i) => (
          <option key={p.id} value={p.id}>
            {passageLabel(p, i)}
          </option>
        ))}
      </select>
    </div>
  );
}
