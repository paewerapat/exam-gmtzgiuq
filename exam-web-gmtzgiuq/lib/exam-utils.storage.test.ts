import {
  EXAM_STORAGE_KEYS,
  loadExamSession,
  loadRealExamSession,
  pickSessionForExam,
  REAL_EXAM_SESSION_KEY,
  saveExamSession,
  saveRealExamSession,
} from './exam-utils';
import type { ExamPassage, Question } from '@/lib/api/questions';
import type { ExamSession } from '@/types/exam';

// task 08 รอบ 2: บทอ่านยาวต้องไม่ถูกคัดลอกซ้ำทุกข้อใน localStorage และเก็บไม่สำเร็จต้องไม่ทำให้หน้าพัง
const BODY = 'ข'.repeat(20_000);
const passage: ExamPassage = { id: 'big', title: 'บทอ่านยาว', body: BODY, images: [] };

function q(id: string, withPassage: boolean): Question {
  return {
    id,
    question: `โจทย์ ${id}`,
    choices: [{ id: 'a', text: 'ก', isCorrect: true }],
    category: 'general_knowledge',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    author: { id: 'u', firstName: '', lastName: '' },
    createdAt: '',
    updatedAt: '',
    passageId: withPassage ? 'big' : null,
    passage: withPassage ? passage : null,
  };
}

const questions = [q('q1', false), ...Array.from({ length: 25 }, (_, i) => q(`p${i}`, true))];
const session = {
  id: 's1',
  examId: 'e1',
  examTitle: 'ชุดยาว',
  category: 'general_knowledge',
  questionIds: questions.map((x) => x.id),
  currentIndex: 0,
  answers: {},
  markedForReview: [],
  timePerQuestion: {},
  startedAt: '2026-11-02T00:00:00.000Z',
  status: 'in_progress',
} as ExamSession;

const count = (raw: string | null) => (raw ?? '').split(BODY).length - 1;

describe('localStorage ของ session + บทอ่าน', () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('saveRealExamSession เก็บบทอ่านครั้งเดียว (25 ข้อ) และ loadRealExamSession คืนบทอ่านให้ทุกข้อ', () => {
    expect(saveRealExamSession('e1', session, questions)).toBe(true);
    const raw = localStorage.getItem(`${REAL_EXAM_SESSION_KEY}_e1`);
    expect(count(raw)).toBe(1);
    const back = loadRealExamSession('e1');
    expect(back.session?.id).toBe('s1');
    expect(back.questions).toHaveLength(26);
    expect(back.questions[0].passage).toBeNull();
    expect(back.questions.slice(1).every((x) => x.passage?.body === BODY)).toBe(true);
  });

  it('saveExamSession / loadExamSession (practice + หน้าผลลัพธ์) เก็บครั้งเดียวและอ่านกลับครบ', () => {
    saveExamSession(session, questions);
    expect(count(localStorage.getItem(EXAM_STORAGE_KEYS.QUESTIONS))).toBe(1);
    const back = loadExamSession(true);
    expect(back.questions?.[25].passage?.id).toBe('big');
  });

  it('localStorage เต็ม (QuotaExceededError) → saveRealExamSession คืน false ไม่ throw', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveRealExamSession('e1', session, questions)).not.toThrow();
    expect(saveRealExamSession('e1', session, questions)).toBe(false);
    expect(() => saveExamSession(session, questions)).not.toThrow();
  });

  it('loadRealExamSession: ไม่มีข้อมูล / JSON เสีย → ค่าว่าง', () => {
    expect(loadRealExamSession('none')).toEqual({ session: null, questions: [] });
    localStorage.setItem(`${REAL_EXAM_SESSION_KEY}_bad`, '{');
    expect(loadRealExamSession('bad')).toEqual({ session: null, questions: [] });
  });
});

describe('pickSessionForExam (ส่งข้อสอบโหมดจริง)', () => {
  const other = { ...session, id: 's-other', examId: 'e-other' } as ExamSession;

  it('เลือกตัวแรกที่ examId ตรง ข้ามแหล่งที่เป็นข้อสอบอื่น/ว่าง', () => {
    const picked = pickSessionForExam('e1', [
      { session: { ...session, id: '' } as ExamSession, questions: [] }, // state ยังไม่ init
      { session: null, questions: [] }, // real storage ไม่มี (เก็บไม่สำเร็จ)
      { session: other, questions: [q('x', false)] }, // key ทั่วไปเป็นของข้อสอบอื่น
      { session, questions },
    ]);
    expect(picked?.session.id).toBe('s1');
    expect(picked?.questions).toBe(questions);
  });

  it('ทุกแหล่งเป็นข้อสอบอื่น → null (ไม่ส่ง session ผิดชุด)', () => {
    expect(pickSessionForExam('e1', [{ session: other, questions: null }])).toBeNull();
  });
});
