'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import RichTextEditor from '@/components/editor/RichTextEditor';
import ImageUpload from '@/components/upload/ImageUpload';
import FadeIn from '@/components/animations/FadeIn';
import LatexText from '@/components/latex/LatexText';
import {
  getAdminQuestion,
  updateQuestion,
  categoryDisplayNames,
  type QuestionCategory,
  type QuestionDifficulty,
  type QuestionType as QType,
  type QuestionStatus,
} from '@/lib/api/questions';

interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
}

const categoryOptions = Object.entries(categoryDisplayNames) as [QuestionCategory, string][];

export default function EditQuestionPage() {
  const router = useRouter();
  const params = useParams();
  const questionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    question: '',
    questionImage: '',
    explanation: '',
    category: '' as QuestionCategory | '',
    difficulty: 'medium' as QuestionDifficulty,
    type: 'multiple_choice' as QType,
    status: 'draft' as QuestionStatus,
    tags: '',
  });

  const [choices, setChoices] = useState<Choice[]>([]);

  // Load question data
  useEffect(() => {
    async function loadQuestion() {
      try {
        const question = await getAdminQuestion(questionId);
        setFormData({
          question: question.question,
          questionImage: question.questionImage || '',
          explanation: question.explanation || '',
          category: question.category,
          difficulty: question.difficulty,
          type: question.type,
          status: question.status,
          tags: question.tags?.join(', ') || '',
        });
        setChoices(
          question.choices.map((c) => ({
            id: c.id,
            text: c.text,
            isCorrect: c.isCorrect,
          })),
        );
      } catch (err) {
        console.error('Failed to load question:', err);
        toast.error('ไม่สามารถโหลดข้อมูลโจทย์ได้');
        router.push('/admin/questions');
      } finally {
        setLoading(false);
      }
    }
    loadQuestion();
  }, [questionId, router]);

  const handleAddChoice = () => {
    if (choices.length >= 6) {
      toast.warning('สามารถเพิ่มตัวเลือกได้สูงสุด 6 ข้อ');
      return;
    }
    setChoices([
      ...choices,
      { id: Date.now().toString(), text: '', isCorrect: false },
    ]);
  };

  const handleRemoveChoice = (id: string) => {
    if (choices.length <= 2) {
      toast.warning('ต้องมีตัวเลือกอย่างน้อย 2 ข้อ');
      return;
    }
    setChoices(choices.filter((c) => c.id !== id));
  };

  const handleChoiceChange = (id: string, text: string) => {
    setChoices(choices.map((c) => (c.id === id ? { ...c, text } : c)));
  };

  const handleCorrectChange = (id: string) => {
    setChoices(choices.map((c) => ({ ...c, isCorrect: c.id === id })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.question.trim()) {
      toast.error('กรุณาใส่โจทย์คำถาม');
      return;
    }

    if (!formData.category) {
      toast.error('กรุณาเลือกหมวดหมู่');
      return;
    }

    const emptyChoices = choices.filter((c) => !c.text.trim());
    if (emptyChoices.length > 0) {
      toast.error('กรุณากรอกตัวเลือกให้ครบทุกข้อ');
      return;
    }

    const correctChoice = choices.find((c) => c.isCorrect);
    if (!correctChoice) {
      toast.error('กรุณาเลือกคำตอบที่ถูกต้อง');
      return;
    }

    setSaving(true);

    try {
      await updateQuestion(questionId, {
        question: formData.question,
        questionImage: formData.questionImage || undefined,
        explanation: formData.explanation || undefined,
        category: formData.category as QuestionCategory,
        difficulty: formData.difficulty,
        type: formData.type,
        status: formData.status,
        tags: formData.tags
          ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined,
        choices,
      });
      toast.success('บันทึกโจทย์สำเร็จ!');
      router.push('/admin/questions');
    } catch (err) {
      console.error('Failed to update question:', err);
      toast.error('ไม่สามารถบันทึกโจทย์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <FadeIn>
        <div className="mb-8">
          <Link
            href="/admin/questions"
            className="flex items-center text-gray-600 hover:text-indigo-600 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับไปหน้ารายการ
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">แก้ไขโจทย์</h1>
          <p className="text-gray-600 mt-1">
            แก้ไขโจทย์ข้อสอบ (รองรับ LaTeX เช่น $x^2 + y^2 = r^2$)
          </p>
        </div>
      </FadeIn>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Question */}
            <FadeIn delay={0.1}>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">โจทย์คำถาม</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      คำถาม * <span className="text-gray-400 font-normal">(รองรับ LaTeX: $...$ สำหรับ inline, $$...$$ สำหรับ block)</span>
                    </label>
                    <RichTextEditor
                      value={formData.question}
                      onChange={(question) => setFormData({ ...formData, question })}
                      placeholder="พิมพ์คำถามที่นี่..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      รูปภาพประกอบ (ถ้ามี)
                    </label>
                    <ImageUpload
                      value={formData.questionImage}
                      onChange={(url) => setFormData({ ...formData, questionImage: url })}
                    />
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Choices */}
            <FadeIn delay={0.2}>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">ตัวเลือกคำตอบ</h2>
                    <p className="text-xs text-gray-400 mt-0.5">รองรับ LaTeX ในตัวเลือก</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddChoice}
                    className="flex items-center text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    เพิ่มตัวเลือก
                  </button>
                </div>

                <div className="space-y-3">
                  <AnimatePresence>
                    {choices.map((choice, index) => (
                      <motion.div
                        key={choice.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-3"
                      >
                        <div className="flex items-center pt-2">
                          <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCorrectChange(choice.id)}
                          className={`flex-shrink-0 mt-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                            choice.isCorrect
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {choice.isCorrect && <CheckCircle className="w-4 h-4" />}
                        </button>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-700">
                              ตัวเลือก {String.fromCharCode(65 + index)}
                            </span>
                            {choice.isCorrect && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                คำตอบที่ถูกต้อง
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={choice.text}
                            onChange={(e) => handleChoiceChange(choice.id, e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder={`ใส่ตัวเลือก ${String.fromCharCode(65 + index)}`}
                          />
                          {/* LaTeX Preview */}
                          {choice.text && choice.text.includes('$') && (
                            <div className="mt-1 px-3 py-1.5 bg-gray-50 rounded text-sm text-gray-700 border border-gray-200">
                              <span className="text-xs text-gray-400 mr-2">Preview:</span>
                              <LatexText text={choice.text} />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(choice.id)}
                          className="flex-shrink-0 mt-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <p className="text-sm text-gray-500 mt-4">
                  คลิกที่วงกลมด้านหน้าตัวเลือกเพื่อกำหนดคำตอบที่ถูกต้อง
                </p>
              </div>
            </FadeIn>

            {/* Explanation */}
            <FadeIn delay={0.3}>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">เฉลยและคำอธิบาย</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    คำอธิบายเฉลย <span className="text-gray-400 font-normal">(รองรับ LaTeX)</span>
                  </label>
                  <RichTextEditor
                    value={formData.explanation}
                    onChange={(explanation) => setFormData({ ...formData, explanation })}
                    placeholder="อธิบายว่าทำไมคำตอบนี้ถึงถูกต้อง..."
                  />
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <FadeIn delay={0.2}>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">เผยแพร่</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      สถานะ
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as QuestionStatus })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="draft">แบบร่าง</option>
                      <option value="published">เผยแพร่</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        บันทึกการแก้ไข
                      </>
                    )}
                  </button>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={0.3}>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">การจัดหมวดหมู่</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      หมวดหมู่ *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as QuestionCategory })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">เลือกหมวดหมู่</option>
                      {categoryOptions.map(([key, name]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ระดับความยาก
                    </label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as QuestionDifficulty })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="easy">ง่าย</option>
                      <option value="medium">ปานกลาง</option>
                      <option value="hard">ยาก</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ประเภทคำถาม
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as QType })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="multiple_choice">ปรนัย (เลือกตอบ)</option>
                      <option value="true_false">ถูก/ผิด</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      แท็ก (คั่นด้วยเครื่องหมายจุลภาค)
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="เช่น คณิตศาสตร์, สมการ, พื้นฐาน"
                    />
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </form>
    </div>
  );
}
