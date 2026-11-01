// รูปของโจทย์ (หลายรูปต่อข้อ) และรูปในตัวเลือก — ใช้ร่วมกันทั้งหน้าทำข้อสอบ หน้าผลลัพธ์ และฟอร์มแอดมิน

/** สูงสุดกี่รูปต่อข้อ (ตรงกับ MAX_QUESTION_IMAGES ของ API) */
export const MAX_QUESTION_IMAGES = 6;

interface QuestionImagesLike {
  questionImage?: string | null;
  questionImages?: string[] | null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * รูปของโจทย์ตามลำดับที่แสดง
 * - `questionImages` เป็น array ที่มีรูป → ใช้ตามนั้น
 * - ไม่งั้น (ข้อเก่า questionImages = null) → `[questionImage]` ถ้ามี
 * - ไม่มีรูป → `[]`
 */
export function getQuestionImages(q: QuestionImagesLike | null | undefined): string[] {
  if (!q) return [];
  if (Array.isArray(q.questionImages)) {
    const images = q.questionImages.filter(isNonEmptyString);
    if (images.length > 0) return images;
  }
  return isNonEmptyString(q.questionImage) ? [q.questionImage] : [];
}

interface ChoiceLike {
  id: string;
  text: string;
  isCorrect: boolean;
  image?: string | null;
}

/** ตัวเลือกต้องมีข้อความหรือรูปอย่างใดอย่างหนึ่ง */
export function choiceHasContent(c: { text?: string | null; image?: string | null }): boolean {
  return isNonEmptyString(c.text) || isNonEmptyString(c.image);
}

/** ตัวเลือกสำหรับส่ง API: ใส่ image เฉพาะเมื่อมีรูป (ไม่ส่ง key ว่าง) */
export function toChoiceInput(c: ChoiceLike): ChoiceLike {
  const base = { id: c.id, text: c.text ?? '', isCorrect: !!c.isCorrect };
  return isNonEmptyString(c.image) ? { ...base, image: c.image.trim() } : base;
}

interface FormQuestionLike {
  questionImages?: string[] | null;
  choices?: { image?: string | null }[] | null;
}

/** URL รูปทั้งหมดที่ฟอร์มยังอ้างอยู่ (รูปโจทย์ทุกรูป + รูปตัวเลือก) */
export function collectFormImageUrls(questions: FormQuestionLike[]): Set<string> {
  const urls = new Set<string>();
  for (const q of questions) {
    for (const url of q.questionImages ?? []) if (isNonEmptyString(url)) urls.add(url);
    for (const c of q.choices ?? []) if (isNonEmptyString(c.image)) urls.add(c.image);
  }
  return urls;
}

/**
 * รูปที่ถูกเอาออกจากฟอร์มแล้วลบไฟล์ทิ้งได้ทันที: ไม่ได้ใช้ในฟอร์มแล้ว และอยู่ใน `deletable`
 * (= URL ที่ POST /upload ในหน้านี้รอบนี้คืนมา) — URL ที่พิมพ์/วางเองอาจเป็นไฟล์ของข้อสอบอื่น
 * และรูปที่บันทึกแล้วต้องรอ API ลบหลังกดบันทึก จึงไม่อยู่ใน deletable
 */
export function imagesToDiscard(
  before: FormQuestionLike[],
  after: FormQuestionLike[],
  deletable: ReadonlySet<string>,
): string[] {
  const still = collectFormImageUrls(after);
  return [...collectFormImageUrls(before)].filter((url) => !still.has(url) && deletable.has(url));
}

/** ย้ายสมาชิกตำแหน่ง from ไป to (คืน array ใหม่ ตำแหน่งเกินขอบ → คืนตัวเดิม) */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
