'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  EyeOff,
  ImagePlus,
  Trash2,
  Type,
} from 'lucide-react';
import ImageUpload from '@/components/upload/ImageUpload';
import DetailBlocksView from '@/components/mock-exam/DetailBlocksView';
import CodeInstructionsEditor from './CodeInstructionsEditor';
import { moveItem } from '@/lib/question-images';
import {
  ACCESS_TYPE_LABELS,
  createDetailBlock,
  EXAM_LEVELS,
  LEVEL_LABELS,
  MAX_ACCESS_DAYS,
  MAX_DETAIL_BLOCKS,
  MAX_DETAIL_TEXT,
  MAX_PRICE,
  MOCK_ACCESS_TYPES,
  mockFormHasSettings,
  type DetailBlock,
  type ExamLevel,
  type MockAccessType,
  type MockExamForm,
} from '@/lib/mock-exam';

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60';

const ACCESS_HINTS: Record<MockAccessType, string> = {
  free: 'ทุกคนเริ่มทำได้ทันที',
  code: 'ต้องกรอกโค้ดเพื่อ Unlock (ป้าย Campaign)',
  purchase: 'ต้องซื้อก่อนทำ (แสดงราคาบนการ์ด)',
};

interface MockExamSettingsProps {
  value: MockExamForm;
  /** แก้ฟอร์มแบบ updater — หน้าแม่ตัดสินใจเรื่องลบไฟล์รูปที่ถูกเอาออก */
  onChange: (update: (prev: MockExamForm) => MockExamForm) => void;
  /** ตั้ง URL รูปของ block (อัปโหลดเสร็จทีหลังได้ หน้าแม่ตรวจว่า block ยังอยู่) */
  onBlockImageChange: (key: string, url: string) => void;
  /** URL ที่ได้จาก POST /upload ในหน้านี้ (หน้าแม่จำไว้ว่าลบไฟล์ได้) */
  onUploaded?: (url: string) => void;
  disabled?: boolean;
}

/** กล่อง "Mock Exam" ในฟอร์มสร้าง/แก้ชุดข้อสอบ: ตั้งค่าการเข้าถึง ราคา ระดับ และคำอธิบายชุดแบบข้อความสลับรูป */
export default function MockExamSettings({
  value,
  onChange,
  onBlockImageChange,
  onUploaded,
  disabled = false,
}: MockExamSettingsProps) {
  const [preview, setPreview] = useState(false);
  const { blocks } = value;
  const isFull = blocks.length >= MAX_DETAIL_BLOCKS;

  const set = <K extends keyof MockExamForm>(field: K, v: MockExamForm[K]) =>
    onChange((prev) => ({ ...prev, [field]: v }));

  const addBlock = (type: 'text' | 'image') =>
    onChange((prev) =>
      prev.blocks.length >= MAX_DETAIL_BLOCKS ? prev : { ...prev, blocks: [...prev.blocks, createDetailBlock(type)] },
    );

  const moveBlock = (from: number, to: number) =>
    onChange((prev) => {
      const next = moveItem(prev.blocks, from, to);
      return next === prev.blocks ? prev : { ...prev, blocks: next };
    });

  const removeBlock = (key: string) =>
    onChange((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.key !== key) }));

  const setBlockText = (key: string, text: string) =>
    onChange((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.key === key ? { ...b, text } : b)) }));

  const previewBlocks: DetailBlock[] = blocks.flatMap((b): DetailBlock[] => {
    if (b.type === 'text') return b.text.trim() ? [{ type: 'text', text: b.text }] : [];
    return b.url.trim() ? [{ type: 'image', url: b.url.trim() }] : [];
  });

  return (
    <section
      aria-labelledby="mock-settings-heading"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-6 mb-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <ClipboardCheck className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h2 id="mock-settings-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Mock Exam
        </h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        ชุด Mock Exam จะแสดงเฉพาะในเมนู Mock Exam (ไม่แสดงในหน้า &quot;ฝึกทำข้อสอบ(จับเวลา)&quot;)
      </p>

      <div className="flex items-start gap-2">
        <input
          id="mock-is-mock"
          type="checkbox"
          checked={value.isMock}
          onChange={(e) => set('isMock', e.target.checked)}
          disabled={disabled}
          className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
        />
        <label htmlFor="mock-is-mock" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          เป็นชุด Mock Exam
        </label>
      </div>

      {!value.isMock && mockFormHasSettings(value) && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          การตั้งค่า Mock Exam และคำอธิบายที่กรอกไว้ยังถูกเก็บไว้ ติ๊กกลับเมื่อไรก็ใช้ต่อได้
        </p>
      )}

      {value.isMock && (
        <div className="mt-5 space-y-5">
          {/* สถานะการเข้าถึง */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะการเข้าถึง</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MOCK_ACCESS_TYPES.map((t) => {
                const checked = value.accessType === t;
                return (
                  <label
                    key={t}
                    className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                    } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="mock-access-type"
                      value={t}
                      checked={checked}
                      onChange={() => set('accessType', t)}
                      disabled={disabled}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                        {ACCESS_TYPE_LABELS[t]}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{ACCESS_HINTS[t]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mock-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ราคา (บาท ก่อน VAT)
                {value.accessType === 'purchase' && <span className="text-red-500 dark:text-red-400"> *</span>}
              </label>
              <input
                id="mock-price"
                type="number"
                inputMode="decimal"
                min={0.01}
                max={MAX_PRICE}
                step="0.01"
                value={value.price}
                onChange={(e) => set('price', e.target.value)}
                disabled={disabled}
                placeholder={value.accessType === 'purchase' ? 'เช่น 150' : 'ไม่บังคับ'}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="mock-access-days" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                อายุการเข้าถึงหลังซื้อ (วัน)
              </label>
              <input
                id="mock-access-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ACCESS_DAYS}
                step={1}
                value={value.accessDays}
                onChange={(e) => set('accessDays', e.target.value)}
                disabled={disabled}
                placeholder="เช่น 30 (ว่าง = ไม่ระบุ)"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="mock-level" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ระดับ
              </label>
              <select
                id="mock-level"
                value={value.level}
                onChange={(e) => set('level', e.target.value as ExamLevel | '')}
                disabled={disabled}
                className={INPUT_CLASS}
              >
                <option value="">ไม่ระบุ</option>
                {EXAM_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* วิธีรับโค้ด (task 15) — เฉพาะชุดที่ต้องใช้โค้ด (ชนิดอื่นค่าที่กรอกไว้ยังถูกเก็บ) */}
          {value.accessType === 'code' && (
            <CodeInstructionsEditor value={value} onChange={onChange} disabled={disabled} />
          )}

          {/* คำอธิบายชุดข้อสอบแบบ block */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">คำอธิบายชุดข้อสอบ</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {blocks.length}/{MAX_DETAIL_BLOCKS} ช่อง
                </span>
                <button
                  type="button"
                  onClick={() => setPreview((p) => !p)}
                  disabled={previewBlocks.length === 0}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {preview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่างการแสดงผล'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              ข้อความและรูปแสดงบนหน้ารายละเอียดตามลำดับนี้ (ข้อความรองรับ LaTeX เช่น $x^2$ และขึ้นบรรทัดตามที่พิมพ์)
              ถ้าไม่มีช่องใดเลย หน้าเว็บจะแสดง &quot;คำอธิบาย&quot; ด้านบนแทน
            </p>

            {blocks.length > 0 && (
              <ol className="space-y-3 mb-3">
                {blocks.map((b, i) => {
                  const no = i + 1;
                  const kindLabel = b.type === 'text' ? 'ข้อความ' : 'รูป';
                  return (
                    <li
                      key={b.key}
                      data-testid="detail-block-form"
                      className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          {b.type === 'text' ? <Type className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
                          ช่องที่ {no} · {kindLabel}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveBlock(i, i - 1)}
                            disabled={disabled || i === 0}
                            aria-label={`เลื่อนช่องที่ ${no} ขึ้น`}
                            title="เลื่อนขึ้น"
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(i, i + 1)}
                            disabled={disabled || i === blocks.length - 1}
                            aria-label={`เลื่อนช่องที่ ${no} ลง`}
                            title="เลื่อนลง"
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(b.key)}
                            disabled={disabled}
                            aria-label={`ลบช่องที่ ${no}`}
                            title="ลบ"
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-3">
                        {b.type === 'text' ? (
                          <textarea
                            aria-label={`ข้อความช่องที่ ${no}`}
                            value={b.text}
                            onChange={(e) => setBlockText(b.key, e.target.value)}
                            disabled={disabled}
                            rows={4}
                            maxLength={MAX_DETAIL_TEXT}
                            placeholder="พิมพ์คำอธิบาย... (ขึ้นบรรทัดตามที่พิมพ์ รองรับ LaTeX)"
                            className={INPUT_CLASS}
                          />
                        ) : (
                          <ImageUpload
                            value={b.url}
                            onChange={(url) => onBlockImageChange(b.key, url)}
                            onUploaded={onUploaded}
                            deleteOnRemove={false}
                            disabled={disabled}
                            label={`รูปช่องที่ ${no}`}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {isFull ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">ครบ {MAX_DETAIL_BLOCKS} ช่องแล้ว</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => addBlock('text')}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Type className="w-4 h-4" />+ ข้อความ
                </button>
                <button
                  type="button"
                  onClick={() => addBlock('image')}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ImagePlus className="w-4 h-4" />+ รูป
                </button>
              </div>
            )}

            {preview && previewBlocks.length > 0 && (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3 sm:p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">ตัวอย่างการแสดงผล (เหมือนหน้ารายละเอียด)</p>
                <DetailBlocksView blocks={previewBlocks} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
