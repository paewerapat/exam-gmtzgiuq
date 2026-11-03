'use client';

import { useState, useEffect, useRef } from 'react';
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
  Timer,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import {
  type QuestionChoice,
  type QuestionStatus,
} from '@/lib/api/questions';
import { createExam, type ExamQuestionInput } from '@/lib/api/exams';
import { getCategories, type Category } from '@/lib/api/categories';
import {
  getPublicCurriculumTree,
  type Subject,
  type Topic,
} from '@/lib/api/curriculum';
import { toast } from 'react-toastify';
import ImageUpload from '@/components/upload/ImageUpload';
import QuestionImagesEditor from '@/components/upload/QuestionImagesEditor';
import { useSessionUploads } from '@/components/upload/useSessionUploads';
import {
  choiceHasContent,
  collectFormImageUrls,
  imagesToDiscard,
  MAX_QUESTION_IMAGES,
  toChoiceInput,
} from '@/lib/question-images';
import { formatChoiceLetters, getCorrectChoiceIds, nextChoiceId } from '@/lib/exam-utils';
import Swal from 'sweetalert2';
import PassagesEditor, { PassageSelect } from '@/components/admin/PassagesEditor';
import {
  createEmptyPassage,
  MAX_PASSAGE_IMAGES,
  passageHasContent,
  passageImageHolders,
  passageLabel,
  questionNumbersUsingPassage,
  toPassageInput,
  validatePassageForms,
  type PassageForm,
} from '@/lib/exam-passages';

interface QuestionForm {
  tempId: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  /** รูปของโจทย์ตามลำดับ (≤ 6) */
  questionImages: string[];
  choices: QuestionChoice[];
  correctAnswer: string;
  topicId: string;
  chapterId: string;
  chapter: string;
  explanation: string;
  hint: string;
  /** id บทอ่านร่วม ('' = ไม่ใช้บทอ่าน) */
  passageId: string;
  expanded: boolean;
}

/** รูปทั้งหมดที่ฟอร์มอ้าง (ข้อ + บทอ่าน) สำหรับตัดสินว่ารูปที่อัปรอบนี้ถูกเอาออกแล้วหรือยัง */
function formImageHolders(questions: QuestionForm[], passages: PassageForm[]) {
  return [...questions, ...passageImageHolders(passages)];
}

function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function defaultChoices(): QuestionChoice[] {
  return [
    { id: 'a', text: '', isCorrect: false },
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
    questionImages: [],
    choices: defaultChoices(),
    correctAnswer: '',
    topicId: '',
    chapterId: '',
    chapter: '',
    explanation: '',
    hint: '',
    passageId: '',
    expanded: true,
  };
}

export default function NewExamPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Exam metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<QuestionStatus>('draft');

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  // Curriculum tree
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Exam-level: subject only
  const [examSubjectId, setExamSubjectId] = useState('');

  // Banner image
  const [bannerImage, setBannerImage] = useState('');

  // Exam duration (minutes) — drives the countdown timer when taking the exam
  const [durationMinutes, setDurationMinutes] = useState('');

  // Questions
  const [questions, setQuestions] = useState<QuestionForm[]>([createEmptyQuestion()]);
  // URL ที่อัปในหน้านี้รอบนี้ — ลบไฟล์ได้เฉพาะชุดนี้ (URL ที่พิมพ์/วางเอง หรือรูปที่บันทึกแล้วไม่ลบเด็ดขาด
  // รูปที่บันทึกแล้วให้ API ลบหลังบันทึกสำเร็จ ไม่งั้นกดยกเลิกแล้วรูปหาย)
  const { uploadedRef, recordUpload, discardUploads, holdUploads, restoreUploads } = useSessionUploads();
  // ค่าล่าสุดของ questions สำหรับ commitQuestions (อัปโหลดรูปเสร็จทีหลังได้)
  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // บทอ่านร่วม (ค่าล่าสุดใน ref เหมือน questions)
  const [passages, setPassages] = useState<PassageForm[]>([]);
  const passagesRef = useRef(passages);
  useEffect(() => {
    passagesRef.current = passages;
  }, [passages]);

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
    getPublicCurriculumTree().then(setSubjects).catch(console.error);
  }, []);

  // Chapters under the selected subject (used to resolve a topic's parent chapter)
  const subjectChapters = subjects.find((s) => s.id === examSubjectId)?.chapters ?? [];

  // Topics available for per-question selection (all topics under selected subject)
  const subjectTopics: Topic[] = subjectChapters.flatMap((c) => c.topics ?? []);

  function handleExamSubjectChange(val: string) {
    setExamSubjectId(val);
    // Reset topic/chapter tagging on all questions when subject changes
    setQuestions((prev) => prev.map((q) => ({ ...q, topicId: '', chapterId: '', chapter: '' })));
  }

  const updateQuestionTopic = (tempId: string, topicId: string) => {
    // Use the topic name itself as the "chapter" tag for score breakdowns —
    // most subjects only have a single catch-all chapter, so grouping by
    // chapter would collapse every question into one row. chapterId still
    // points at the real parent chapter (used elsewhere for browsing).
    const chapter = subjectChapters.find((c) => c.topics?.some((t) => t.id === topicId));
    const topic = subjectTopics.find((t) => t.id === topicId);
    setQuestions((prev) =>
      prev.map((q) =>
        q.tempId === tempId
          ? { ...q, topicId, chapterId: chapter?.id || '', chapter: topic?.name || '' }
          : q,
      ),
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => {
      const updated = prev.map((q) => ({ ...q, expanded: false }));
      return [...updated, createEmptyQuestion()];
    });
  };

  const removeQuestion = (tempId: string) => {
    if (questions.length <= 1) return;
    commitQuestions((prev) => prev.filter((q) => q.tempId !== tempId));
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

  // แก้รายการข้อแบบที่อาจเอารูปออก: รูปที่ไม่ได้ใช้ในฟอร์มแล้ว ถ้าเป็นไฟล์ที่อัปในรอบนี้ลบทิ้งทันที
  const commitQuestions = (update: (prev: QuestionForm[]) => QuestionForm[]) => {
    const prev = questionsRef.current;
    const next = update(prev);
    if (next === prev) return;
    questionsRef.current = next;
    setQuestions(next);
    // เทียบรวมรูปบทอ่านด้วย: รูปที่ยังใช้ในบทอ่านไม่ถูกลบแม้เอาออกจากข้อ
    const ps = passagesRef.current;
    discardUploads(
      imagesToDiscard(formImageHolders(prev, ps), formImageHolders(next, ps), uploadedRef.current),
    );
  };

  // ── บทอ่านร่วม ──
  const commitPassages = (update: (prev: PassageForm[]) => PassageForm[]) => {
    const prev = passagesRef.current;
    const next = update(prev);
    if (next === prev) return;
    passagesRef.current = next;
    setPassages(next);
    const qs = questionsRef.current;
    discardUploads(
      imagesToDiscard(formImageHolders(qs, prev), formImageHolders(qs, next), uploadedRef.current),
    );
  };

  const addPassage = () => {
    commitPassages((prev) => [...prev, createEmptyPassage(prev.map((p) => p.id))]);
  };

  const updatePassageField = (id: string, field: 'title' | 'body', value: string) => {
    commitPassages((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const updatePassageLineNumbers = (id: string, value: boolean) => {
    commitPassages((prev) => prev.map((p) => (p.id === id ? { ...p, lineNumbers: value } : p)));
  };

  const updatePassageImages = (id: string, update: (prev: string[]) => string[]) => {
    commitPassages((prev) => prev.map((p) => (p.id === id ? { ...p, images: update(p.images) } : p)));
  };

  // อัปโหลดเสร็จทีหลังได้: บทอ่านถูกลบ/รูปครบแล้ว → ลบไฟล์ที่เพิ่งอัป
  const addPassageImage = (id: string, url: string) => {
    const target = passagesRef.current.find((p) => p.id === id);
    if (!target) {
      discardUploads([url]);
      return;
    }
    if (target.images.includes(url)) return;
    if (target.images.length >= MAX_PASSAGE_IMAGES) {
      toast.error(`บทอ่านนี้มีรูปครบ ${MAX_PASSAGE_IMAGES} รูปแล้ว รูปที่อัปล่าสุดไม่ได้ถูกเพิ่ม`);
      discardUploads([url]);
      return;
    }
    commitPassages((prev) => prev.map((p) => (p.id === id ? { ...p, images: [...p.images, url] } : p)));
  };

  // ลบบทอ่าน: ข้อที่อ้างอยู่กลายเป็น "ไม่ใช้บทอ่าน" แล้วแจ้งว่าข้อไหนบ้าง
  const removePassage = async (id: string) => {
    const index = passagesRef.current.findIndex((p) => p.id === id);
    if (index < 0) return;
    const label = passageLabel(passagesRef.current[index], index);
    if (passageHasContent(passagesRef.current[index])) {
      const confirm = await Swal.fire({
        title: 'ลบบทอ่านนี้?',
        text: `"${label}" จะถูกลบ ข้อที่ใช้บทอ่านนี้จะเปลี่ยนเป็นไม่ใช้บทอ่าน`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบบทอ่าน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
      });
      if (!confirm.isConfirmed) return;
    }
    const usedBy = questionNumbersUsingPassage(questionsRef.current, id);
    if (usedBy.length > 0) {
      commitQuestions((prev) => prev.map((q) => (q.passageId === id ? { ...q, passageId: '' } : q)));
    }
    commitPassages((prev) => prev.filter((p) => p.id !== id));
    if (usedBy.length > 0) {
      toast.info(`ลบ "${label}" แล้ว ข้อ ${usedBy.join(', ')} เปลี่ยนเป็นไม่ใช้บทอ่าน`);
    }
  };

  const updateQuestionImages = (tempId: string, update: (prev: string[]) => string[]) => {
    commitQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, questionImages: update(q.questionImages) } : q)),
    );
  };

  // เพิ่มรูปโจทย์ — ตรวจกับค่าล่าสุด เพราะอัปโหลดเสร็จทีหลังได้ (ข้อถูกลบ/รูปครบ 6 แล้ว → ลบไฟล์ที่เพิ่งอัป)
  const addQuestionImage = (tempId: string, url: string) => {
    const target = questionsRef.current.find((q) => q.tempId === tempId);
    if (!target) {
      discardUploads([url]);
      return;
    }
    if (target.questionImages.includes(url)) return;
    if (target.questionImages.length >= MAX_QUESTION_IMAGES) {
      toast.error(`ข้อนี้มีรูปครบ ${MAX_QUESTION_IMAGES} รูปแล้ว รูปที่อัปล่าสุดไม่ได้ถูกเพิ่ม`);
      discardUploads([url]);
      return;
    }
    commitQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, questionImages: [...q.questionImages, url] } : q)),
    );
  };

  // รูปตัวเลือก อ้างด้วย choice id (ตัวเลือกถูกลบระหว่างอัปโหลด → ลบไฟล์ที่เพิ่งอัป)
  const updateChoiceImage = (tempId: string, choiceId: string, url: string) => {
    const target = questionsRef.current.find((q) => q.tempId === tempId);
    if (!target?.choices?.some((c) => c.id === choiceId)) {
      if (url) discardUploads([url]);
      return;
    }
    commitQuestions((prev) =>
      prev.map((q) =>
        q.tempId === tempId
          ? {
              ...q,
              choices: (q.choices ?? []).map((c) =>
                c.id === choiceId ? { ...c, image: url.trim() || null } : c,
              ),
            }
          : q,
      ),
    );
  };

  const updateChoice = (tempId: string, choiceIndex: number, field: keyof QuestionChoice, value: any) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        // isCorrect ติ๊กได้หลายตัว (ข้อที่ตอบถูกหลายตัว) — ไม่ล้างตัวอื่น
        const newChoices = (q.choices ?? defaultChoices()).map((c, i) =>
          i === choiceIndex ? { ...c, [field]: value } : c,
        );
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
        // ตัวอักษรแรกที่ยังว่าง (หลังลบตัวเลือก id จะไม่ซ้ำ)
        const nextId = nextChoiceId(choices);
        if (!nextId) return q;
        return { ...q, choices: [...choices, { id: nextId, text: '', isCorrect: false }] };
      }),
    );
  };

  const removeChoice = (tempId: string, choiceIndex: number) => {
    commitQuestions((prev) =>
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
        const emptyChoice = (q.choices ?? []).findIndex((c) => !choiceHasContent(c));
        if (emptyChoice >= 0) {
          toast.error(`ข้อที่ ${i + 1}: ตัวเลือก ${String.fromCharCode(65 + emptyChoice)} ต้องมีข้อความหรือรูป`);
          return;
        }
      }
    }

    const passageError = validatePassageForms(passages);
    if (passageError) { toast.error(passageError); return; }
    const passageIds = new Set(passages.map((p) => p.id));

    setSaving(true);
    // URL ที่อัปรอบนี้และอยู่ใน payload: ห้ามลบระหว่างรอบันทึกและหลังบันทึก (บันทึกล้มค่อยใส่คืน)
    let heldUploads: string[] = [];
    try {
      const examPassages = passages.map(toPassageInput);
      const examQuestions: ExamQuestionInput[] = questions.map((q, index) => ({
        question: q.question,
        // ส่ง questionImages ทุกครั้ง ([] = ไม่มีรูป) ไม่งั้น API ถือว่าเป็นข้อแบบรูปเดียวและลบรูปที่เหลือ
        questionImages: q.questionImages,
        questionImage: q.questionImages[0] || undefined,
        type: q.type,
        choices: q.type === 'short_answer' ? [] : q.choices.map(toChoiceInput),
        correctAnswer: q.type === 'short_answer' ? q.correctAnswer : undefined,
        topicId: q.topicId || null,
        chapterId: q.chapterId || null,
        chapter: q.chapter || null,
        explanation: q.explanation || undefined,
        hint: q.hint || undefined,
        orderIndex: index,
        // ส่งทุกครั้ง (null = ไม่ใช้บทอ่าน)
        passageId: passageIds.has(q.passageId) ? q.passageId : null,
      }));

      heldUploads = holdUploads(
        collectFormImageUrls([...examQuestions, ...passageImageHolders(passages)]),
      );

      await createExam({
        title,
        description: description || undefined,
        category,
        status,
        questions: examQuestions,
        passages: examPassages,
        subjectId: examSubjectId || null,
        bannerImage: bannerImage || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      });

      // ที่เหลือในชุด = อัปรอบนี้แต่ไม่ได้อยู่ในข้อสอบที่บันทึก (เช่นรูปตัวเลือกของข้อที่เปลี่ยนเป็นอัตนัย) → ลบไฟล์
      // หลังจากนี้ชุดว่าง กดลบอะไรระหว่างเปลี่ยนหน้าก็ไม่ลบไฟล์ที่เพิ่งบันทึก
      discardUploads([...uploadedRef.current]);
      heldUploads = [];
      toast.success('สร้างชุดข้อสอบสำเร็จ');
      router.push('/admin/exams');
    } catch (err: any) {
      restoreUploads(heldUploads);
      console.error('Failed to create exam:', err);
      toast.error(`ไม่สามารถสร้างชุดข้อสอบได้: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <FadeIn>
          <Link
            href="/admin/exams"
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับรายการชุดข้อสอบ</span>
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">สร้างชุดข้อสอบใหม่</h1>

          {/* Exam metadata */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ชื่อชุดข้อสอบ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ข้อสอบภาษาอังกฤษ ชุดที่ 1"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำอธิบาย</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียดชุดข้อสอบ (ไม่บังคับ)"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    หมวดหมู่ <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">เลือกหมวดหมู่</option>
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานะ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as QuestionStatus)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="draft">แบบร่าง</option>
                    <option value="published">เผยแพร่</option>
                  </select>
                </div>
              </div>

              {/* Exam-level: subject only */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">วิชา</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">(ใช้กำหนดหัวข้อที่เลือกได้ในแต่ละข้อ)</span>
                </div>
                <select
                  value={examSubjectId}
                  onChange={(e) => handleExamSubjectChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">— ไม่ระบุวิชา —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Exam duration */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Timer className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">เวลาทำข้อสอบ (นาที)</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">(ปล่อยว่างไว้ = ไม่จับเวลาถอยหลัง)</span>
                </div>
                <input
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="เช่น 90"
                  className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              {/* Banner image */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ภาพแบนเนอร์ชุดข้อสอบ
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-normal">แนะนำ 16:9 (เช่น 1280×720px)</span>
                </label>
                <ImageUpload
                  value={bannerImage}
                  onChange={setBannerImage}
                />
              </div>
            </div>
          </div>

          {/* Shared passages */}
          <PassagesEditor
            passages={passages}
            questions={questions}
            onAdd={addPassage}
            onRemove={removePassage}
            onFieldChange={updatePassageField}
            onLineNumbersChange={updatePassageLineNumbers}
            onImagesChange={updatePassageImages}
            onImageAdd={addPassageImage}
            onUploaded={recordUpload}
            disabled={saving}
          />

          {/* Questions */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              คำถาม ({questions.length} ข้อ)
            </h2>

            {questions.map((q, qIndex) => (
                <div key={q.tempId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                  {/* Question header */}
                  <div
                    className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 dark:border-gray-800"
                    onClick={() => toggleExpand(q.tempId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">ข้อที่ {qIndex + 1}</span>
                      {!q.expanded && q.question && (
                        <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          — {q.question.substring(0, 60)}{q.question.length > 60 ? '...' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const pIndex = passages.findIndex((p) => p.id === q.passageId);
                        if (pIndex < 0) return null;
                        return (
                          <span className="hidden sm:inline-flex items-center gap-1 max-w-[10rem] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-medium flex-shrink-0">
                            <BookOpen className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{passageLabel(passages[pIndex], pIndex)}</span>
                          </span>
                        );
                      })()}
                      {q.chapter && (
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium flex-shrink-0">
                          {q.chapter}
                        </span>
                      )}
                      {questions.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeQuestion(q.tempId); }}
                          disabled={saving}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {q.expanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                  </div>

                  {/* Question body */}
                  {q.expanded && (
                    <div className="px-6 py-5 space-y-4">

                      {/* Topic selector per question */}
                      {examSubjectId && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            หัวข้อ
                            <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 font-normal">(ไม่บังคับ)</span>
                          </label>
                          <select
                            value={q.topicId}
                            onChange={(e) => updateQuestionTopic(q.tempId, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            disabled={subjectTopics.length === 0}
                          >
                            <option value="">
                              {subjectTopics.length === 0 ? '— ยังไม่มีหัวข้อในวิชานี้ —' : '— ไม่ระบุหัวข้อ —'}
                            </option>
                            {subjectTopics.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {q.chapter && (
                            <p className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-400">
                              บท: {q.chapter}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Shared passage */}
                      <PassageSelect
                        id={`passage-select-${q.tempId}`}
                        value={q.passageId}
                        passages={passages}
                        onChange={(val) => updateQuestion(q.tempId, 'passageId', val)}
                        disabled={saving}
                      />

                      {/* Question type toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ประเภท:</span>
                        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                          <button
                            type="button"
                            onClick={() => updateQuestion(q.tempId, 'type', 'multiple_choice')}
                            disabled={saving}
                            className={`px-4 py-1.5 font-medium transition disabled:opacity-60 disabled:cursor-not-allowed ${
                              q.type === 'multiple_choice'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            ปรนัย
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQuestion(q.tempId, 'type', 'short_answer')}
                            disabled={saving}
                            className={`px-4 py-1.5 font-medium transition disabled:opacity-60 disabled:cursor-not-allowed border-l border-gray-200 dark:border-gray-700 ${
                              q.type === 'short_answer'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            อัตนัย
                          </button>
                        </div>
                      </div>

                      {/* Question text */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          คำถาม <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={q.question}
                          onChange={(e) => updateQuestion(q.tempId, 'question', e.target.value)}
                          placeholder="พิมพ์คำถาม... (รองรับ LaTeX เช่น $x^2 + y^2$)"
                          rows={3}
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Question image */}
                      <QuestionImagesEditor
                        images={q.questionImages}
                        onChange={(update) => updateQuestionImages(q.tempId, update)}
                        onAdd={(url) => addQuestionImage(q.tempId, url)}
                        onUploaded={recordUpload}
                        disabled={saving}
                      />

                      {/* Choices (ปรนัย only) */}
                      {q.type === 'multiple_choice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ตัวเลือก <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-2">
                            {(q.choices ?? defaultChoices()).map((choice, cIndex) => (
                              <div key={cIndex}>
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={choice.isCorrect}
                                  onChange={() => updateChoice(q.tempId, cIndex, 'isCorrect', !choice.isCorrect)}
                                  className="w-4 h-4 rounded accent-green-600 focus:ring-green-500"
                                  title="เลือกเป็นคำตอบที่ถูก"
                                  aria-label={`ตัวเลือก ${String.fromCharCode(65 + cIndex)} เป็นคำตอบที่ถูก`}
                                />
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-6">
                                  {String.fromCharCode(65 + cIndex)}.
                                </span>
                                <input
                                  type="text"
                                  value={choice.text}
                                  onChange={(e) => updateChoice(q.tempId, cIndex, 'text', e.target.value)}
                                  placeholder={`ตัวเลือก ${String.fromCharCode(65 + cIndex)}`}
                                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                    choice.isCorrect ? 'border-green-300 bg-green-50 dark:bg-green-900/30' : 'border-gray-300 dark:border-gray-600'
                                  }`}
                                />
                                {(q.choices ?? []).length > 2 && (
                                  <button
                                    onClick={() => removeChoice(q.tempId, cIndex)}
                                    disabled={saving}
                                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <div className="mt-1.5 pl-16">
                                <ImageUpload
                                  compact
                                  value={choice.image ?? ''}
                                  onChange={(url) => updateChoiceImage(q.tempId, choice.id, url)}
                                  onUploaded={recordUpload}
                                  deleteOnRemove={false}
                                  disabled={saving}
                                  label={`รูปตัวเลือก ${String.fromCharCode(65 + cIndex)}`}
                                />
                              </div>
                              </div>
                            ))}
                          </div>
                          {(q.choices ?? []).length < 6 && (
                            <button
                              onClick={() => addChoice(q.tempId)}
                              disabled={saving}
                              className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3 h-3" />
                              เพิ่มตัวเลือก
                            </button>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            ติ๊กช่องหน้าตัวเลือกที่ถูกต้อง (สีเขียว = ถูก) ติ๊กได้มากกว่า 1 ข้อ
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ถ้าติ๊กหลายข้อ นักเรียนต้องเลือกครบทุกข้อที่ถูกจึงได้คะแนน
                          </p>
                          {(() => {
                            const correctIds = getCorrectChoiceIds({ choices: q.choices ?? [] });
                            if (correctIds.length < 2) return null;
                            return (
                              <p
                                role="status"
                                className="mt-2 px-3 py-2 rounded-lg border text-sm font-medium border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
                              >
                                ข้อนี้เป็นแบบตอบได้หลายข้อ — นักเรียนต้องเลือกครบ {correctIds.length} ตัว (
                                {formatChoiceLetters({ choices: q.choices ?? [] }, correctIds)}) จึงได้คะแนน
                              </p>
                            );
                          })()}
                        </div>
                      )}

                      {/* Correct answer (อัตนัย only) */}
                      {q.type === 'short_answer' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            คำตอบที่ถูกต้อง <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={q.correctAnswer}
                            onChange={(e) => updateQuestion(q.tempId, 'correctAnswer', e.target.value)}
                            placeholder="พิมพ์คำตอบที่ถูกต้อง"
                            className="w-full px-4 py-2.5 border border-green-300 bg-green-50 dark:bg-green-900/30 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            ระบบจะตรวจสอบคำตอบของผู้เรียนกับค่านี้ (ตรงทุกตัวอักษร)
                          </p>
                        </div>
                      )}

                      {/* Explanation */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          คำอธิบายเฉลย
                        </label>
                        <textarea
                          value={q.explanation}
                          onChange={(e) => updateQuestion(q.tempId, 'explanation', e.target.value)}
                          placeholder="อธิบายเหตุผลของคำตอบที่ถูก (ไม่บังคับ)"
                          rows={2}
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Hint */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำใบ้</label>
                        <textarea
                          value={q.hint}
                          onChange={(e) => updateQuestion(q.tempId, 'hint', e.target.value)}
                          placeholder="คำใบ้สำหรับผู้ทำข้อสอบ (ไม่บังคับ)"
                          rows={2}
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-2 transition mb-6"
          >
            <Plus className="w-5 h-5" />
            เพิ่มข้อใหม่
          </button>

          {/* Save button */}
          <div className="flex justify-end gap-4">
            <Link
              href="/admin/exams"
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
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
