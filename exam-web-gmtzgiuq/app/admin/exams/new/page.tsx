'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  GripVertical,
  BookOpen,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  categoryDisplayNames,
  type QuestionCategory,
  type QuestionChoice,
  type QuestionStatus,
} from '@/lib/api/questions';
import { createExam, type ExamQuestionInput } from '@/lib/api/exams';
import {
  getPublicCurriculumTree,
  type Subject,
  type Topic,
} from '@/lib/api/curriculum';
import { toast } from 'react-toastify';
import ImageUpload from '@/components/upload/ImageUpload';

interface QuestionForm {
  tempId: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  questionImage: string;
  choices: QuestionChoice[];
  correctAnswer: string;
  topicId: string;
  explanation: string;
  hint: string;
  expanded: boolean;
}

function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function defaultChoices(): QuestionChoice[] {
  return [
    { id: 'a', text: '', isCorrect: true },
    { id: 'b', text: '', isCorrect: false },
    { id: 'c', text: '', isCorrect: false },
    { id: 'd', text: '', isCorrect: false },
  ];
}

function createEmptyQuestion(): QuestionForm {
  return {
    tempId: generateTempId(),
    type: 'multiple_choice',
    question: '',
    questionImage: '',
    choices: defaultChoices(),
    correctAnswer: '',
    topicId: '',
    explanation: '',
    hint: '',
    expanded: true,
  };
}

export default function NewExamPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Exam metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<QuestionCategory | ''>('');
  const [status, setStatus] = useState<QuestionStatus>('draft');

  // Curriculum tree
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Exam-level: subject only
  const [examSubjectId, setExamSubjectId] = useState('');

  // Questions
  const [questions, setQuestions] = useState<QuestionForm[]>([createEmptyQuestion()]);

  useEffect(() => {
    getPublicCurriculumTree().then(setSubjects).catch(console.error);
  }, []);

  // Topics available for per-question selection (all topics under selected subject)
  const subjectTopics: Topic[] = (subjects.find((s) => s.id === examSubjectId)?.chapters ?? [])
    .flatMap((c) => c.topics ?? []);

  function handleExamSubjectChange(val: string) {
    setExamSubjectId(val);
    // Reset topicId on all questions when subject changes
    setQuestions((prev) => prev.map((q) => ({ ...q, topicId: '' })));
  }

  const addQuestion = () => {
    setQuestions((prev) => {
      const updated = prev.map((q) => ({ ...q, expanded: false }));
      return [...updated, createEmptyQuestion()];
    });
  };

  const removeQuestion = (tempId: string) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((q) => q.tempId !== tempId));
  };

  const toggleExpand = (tempId: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, expanded: !q.expanded } : q)),
    );
  };

  const updateQuestion = (tempId: string, field: keyof QuestionForm, value: any) => {
    setQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, [field]: value } : q)),
    );
  };

  const updateChoice = (tempId: string, choiceIndex: number, field: keyof QuestionChoice, value: any) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const newChoices = (q.choices ?? defaultChoices()).map((c, i) => {
          if (i !== choiceIndex) {
            if (field === 'isCorrect' && value === true) return { ...c, isCorrect: false };
            return c;
          }
          return { ...c, [field]: value };
        });
        return { ...q, choices: newChoices };
      }),
    );
  };

  const addChoice = (tempId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const choices = q.choices ?? defaultChoices();
        if (choices.length >= 6) return q;
        const nextId = String.fromCharCode(97 + choices.length);
        return { ...q, choices: [...choices, { id: nextId, text: '', isCorrect: false }] };
      }),
    );
  };

  const removeChoice = (tempId: string, choiceIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const choices = q.choices ?? defaultChoices();
        if (choices.length <= 2) return q;
        return { ...q, choices: choices.filter((_, i) => i !== choiceIndex) };
      }),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('กรุณากรอกชื่อชุดข้อสอบ'); return; }
    if (!category) { toast.error('กรุณาเลือกหมวดหมู่'); return; }
    if (questions.length === 0) { toast.error('กรุณาเพิ่มอย่างน้อย 1 ข้อ'); return; }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) { toast.error(`ข้อที่ ${i + 1}: กรุณากรอกคำถาม`); return; }
      if (q.type === 'short_answer') {
        if (!q.correctAnswer.trim()) { toast.error(`ข้อที่ ${i + 1}: กรุณากรอกคำตอบที่ถูกต้อง`); return; }
      } else {
        if (!(q.choices ?? []).some((c) => c.isCorrect)) { toast.error(`ข้อที่ ${i + 1}: กรุณาเลือกคำตอบที่ถูกต้อง`); return; }
        if ((q.choices ?? []).find((c) => !c.text?.trim())) { toast.error(`ข้อที่ ${i + 1}: กรุณากรอกตัวเลือกให้ครบ`); return; }
      }
    }

    setSaving(true);
    try {
      const examQuestions: ExamQuestionInput[] = questions.map((q, index) => ({
        question: q.question,
        questionImage: q.questionImage || undefined,
        type: q.type,
        choices: q.type === 'short_answer' ? [] : q.choices,
        correctAnswer: q.type === 'short_answer' ? q.correctAnswer : undefined,
        topicId: q.topicId || null,
        explanation: q.explanation || undefined,
        hint: q.hint || undefined,
        orderIndex: index,
      }));

      await createExam({
        title,
        description: description || undefined,
        category: category as QuestionCategory,
        status,
        questions: examQuestions,
        subjectId: examSubjectId || null,
      });

      toast.success('สร้างชุดข้อสอบสำเร็จ');
      router.push('/admin/exams');
    } catch (err: any) {
      console.error('Failed to create exam:', err);
      toast.error(`ไม่สามารถสร้างชุดข้อสอบได้: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <FadeIn>
          <Link
            href="/admin/exams"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับรายการชุดข้อสอบ</span>
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 mb-6">สร้างชุดข้อสอบใหม่</h1>

          {/* Exam metadata */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อชุดข้อสอบ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบาย</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียดชุดข้อสอบ (ไม่บังคับ)"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมวดหมู่ <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as QuestionCategory)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">เลือกหมวดหมู่</option>
                    {Object.entries(categoryDisplayNames).map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as QuestionStatus)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="draft">แบบร่าง</option>
                    <option value="published">เผยแพร่</option>
                  </select>
                </div>
              </div>

              {/* Exam-level: subject only */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-700">วิชา</span>
                  <span className="text-xs text-gray-400">(ใช้กำหนดหัวข้อที่เลือกได้ในแต่ละข้อ)</span>
                </div>
                <select
                  value={examSubjectId}
                  onChange={(e) => handleExamSubjectChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">— ไม่ระบุวิชา —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              คำถาม ({questions.length} ข้อ)
            </h2>

            {questions.map((q, qIndex) => (
                <div key={q.tempId} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Question header */}
                  <div
                    className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                    onClick={() => toggleExpand(q.tempId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 flex-shrink-0">ข้อที่ {qIndex + 1}</span>
                      {!q.expanded && q.question && (
                        <span className="text-sm text-gray-500 truncate">
                          — {q.question.substring(0, 60)}{q.question.length > 60 ? '...' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {questions.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeQuestion(q.tempId); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {q.expanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Question body */}
                  {q.expanded && (
                    <div className="px-6 py-5 space-y-4">

                      {/* Question type toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">ประเภท:</span>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                          <button
                            type="button"
                            onClick={() => updateQuestion(q.tempId, 'type', 'multiple_choice')}
                            className={`px-4 py-1.5 font-medium transition ${
                              q.type === 'multiple_choice'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            ปรนัย
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQuestion(q.tempId, 'type', 'short_answer')}
                            className={`px-4 py-1.5 font-medium transition border-l border-gray-200 ${
                              q.type === 'short_answer'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            อัตนัย
                          </button>
                        </div>
                      </div>

                      {/* Question text */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          คำถาม <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={q.question}
                          onChange={(e) => updateQuestion(q.tempId, 'question', e.target.value)}
                          placeholder="พิมพ์คำถาม... (รองรับ LaTeX เช่น $x^2 + y^2$)"
                          rows={3}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Question image */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          รูปภาพ (ถ้ามี)
                        </label>
                        <ImageUpload
                          value={q.questionImage}
                          onChange={(url) => updateQuestion(q.tempId, 'questionImage', url)}
                        />
                      </div>

                      {/* Choices (ปรนัย only) */}
                      {q.type === 'multiple_choice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ตัวเลือก <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-2">
                            {(q.choices ?? defaultChoices()).map((choice, cIndex) => (
                              <div key={cIndex} className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name={`correct-${q.tempId}`}
                                  checked={choice.isCorrect}
                                  onChange={() => updateChoice(q.tempId, cIndex, 'isCorrect', true)}
                                  className="w-4 h-4 text-green-600 focus:ring-green-500"
                                  title="เลือกเป็นคำตอบที่ถูก"
                                />
                                <span className="text-sm font-medium text-gray-500 w-6">
                                  {String.fromCharCode(65 + cIndex)}.
                                </span>
                                <input
                                  type="text"
                                  value={choice.text}
                                  onChange={(e) => updateChoice(q.tempId, cIndex, 'text', e.target.value)}
                                  placeholder={`ตัวเลือก ${String.fromCharCode(65 + cIndex)}`}
                                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                    choice.isCorrect ? 'border-green-300 bg-green-50' : 'border-gray-300'
                                  }`}
                                />
                                {(q.choices ?? []).length > 2 && (
                                  <button
                                    onClick={() => removeChoice(q.tempId, cIndex)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {(q.choices ?? []).length < 6 && (
                            <button
                              onClick={() => addChoice(q.tempId)}
                              className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              เพิ่มตัวเลือก
                            </button>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            คลิกวงกลมเพื่อเลือกคำตอบที่ถูกต้อง (สีเขียว = ถูก)
                          </p>
                        </div>
                      )}

                      {/* Correct answer (อัตนัย only) */}
                      {q.type === 'short_answer' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            คำตอบที่ถูกต้อง <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={q.correctAnswer}
                            onChange={(e) => updateQuestion(q.tempId, 'correctAnswer', e.target.value)}
                            placeholder="พิมพ์คำตอบที่ถูกต้อง"
                            className="w-full px-4 py-2.5 border border-green-300 bg-green-50 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            ระบบจะตรวจสอบคำตอบของผู้เรียนกับค่านี้ (ตรงทุกตัวอักษร)
                          </p>
                        </div>
                      )}

                      {/* Explanation */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          คำอธิบายเฉลย
                        </label>
                        <textarea
                          value={q.explanation}
                          onChange={(e) => updateQuestion(q.tempId, 'explanation', e.target.value)}
                          placeholder="อธิบายเหตุผลของคำตอบที่ถูก (ไม่บังคับ)"
                          rows={2}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Topic selector per question */}
                      {examSubjectId && subjectTopics.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            หัวข้อ
                            <span className="ml-1 text-xs text-gray-400 font-normal">(ไม่บังคับ)</span>
                          </label>
                          <select
                            value={q.topicId}
                            onChange={(e) => updateQuestion(q.tempId, 'topicId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="">— ไม่ระบุหัวข้อ —</option>
                            {subjectTopics.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Hint */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">คำใบ้</label>
                        <input
                          type="text"
                          value={q.hint}
                          onChange={(e) => updateQuestion(q.tempId, 'hint', e.target.value)}
                          placeholder="คำใบ้สำหรับผู้ทำข้อสอบ (ไม่บังคับ)"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                    </div>
                  )}
                </div>
            ))}
          </div>

          {/* Add question button */}
          <button
            onClick={addQuestion}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-2 transition mb-6"
          >
            <Plus className="w-5 h-5" />
            เพิ่มข้อใหม่
          </button>

          {/* Save button */}
          <div className="flex justify-end gap-4">
            <Link
              href="/admin/exams"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              ยกเลิก
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึกชุดข้อสอบ
                </>
              )}
            </button>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
