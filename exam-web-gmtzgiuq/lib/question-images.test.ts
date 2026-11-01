import {
  choiceHasContent,
  collectFormImageUrls,
  getQuestionImages,
  imagesToDiscard,
  MAX_QUESTION_IMAGES,
  moveItem,
  toChoiceInput,
} from './question-images';

describe('getQuestionImages (task 07)', () => {
  it('questionImages ที่มีรูป → ใช้ตามลำดับนั้น (ไม่สน questionImage)', () => {
    expect(
      getQuestionImages({ questionImage: '/a.png', questionImages: ['/a.png', '/b.png', '/c.png'] }),
    ).toEqual(['/a.png', '/b.png', '/c.png']);
  });

  it('ข้อเก่า questionImages = null → [questionImage]', () => {
    expect(getQuestionImages({ questionImage: '/old.png', questionImages: null })).toEqual(['/old.png']);
    expect(getQuestionImages({ questionImage: '/old.png' })).toEqual(['/old.png']);
  });

  it('array ว่าง → ถอยไปใช้ questionImage', () => {
    expect(getQuestionImages({ questionImage: '/old.png', questionImages: [] })).toEqual(['/old.png']);
  });

  it('ไม่มีรูป / ค่าว่าง / null → []', () => {
    expect(getQuestionImages({})).toEqual([]);
    expect(getQuestionImages({ questionImage: null, questionImages: null })).toEqual([]);
    expect(getQuestionImages({ questionImage: '', questionImages: [] })).toEqual([]);
    expect(getQuestionImages(null)).toEqual([]);
    expect(getQuestionImages(undefined)).toEqual([]);
  });

  it('ตัดค่าที่ไม่ใช่ string หรือว่างออก', () => {
    const q = { questionImages: ['/a.png', '', '  ', null, 3, '/b.png'] as unknown as string[] };
    expect(getQuestionImages(q)).toEqual(['/a.png', '/b.png']);
  });

  it('สูงสุด 6 รูปเท่ากับ API', () => {
    expect(MAX_QUESTION_IMAGES).toBe(6);
  });
});

describe('choiceHasContent / toChoiceInput', () => {
  it('ตัวเลือกต้องมีข้อความหรือรูป', () => {
    expect(choiceHasContent({ text: 'ก' })).toBe(true);
    expect(choiceHasContent({ text: '', image: '/c.png' })).toBe(true);
    expect(choiceHasContent({ text: '  ', image: null })).toBe(false);
    expect(choiceHasContent({ text: '' })).toBe(false);
  });

  it('ส่ง image เฉพาะเมื่อมีรูป และไม่ส่ง key อื่นเกิน', () => {
    expect(toChoiceInput({ id: 'a', text: 'ก', isCorrect: true })).toEqual({ id: 'a', text: 'ก', isCorrect: true });
    expect(toChoiceInput({ id: 'b', text: 'ข', isCorrect: false, image: null })).toEqual({
      id: 'b',
      text: 'ข',
      isCorrect: false,
    });
    expect(toChoiceInput({ id: 'c', text: '', isCorrect: false, image: '/c.png' })).toEqual({
      id: 'c',
      text: '',
      isCorrect: false,
      image: '/c.png',
    });
  });
});

describe('collectFormImageUrls / imagesToDiscard', () => {
  const q = (images: string[], choiceImages: (string | null)[] = []) => ({
    questionImages: images,
    choices: choiceImages.map((image) => ({ image })),
  });

  it('รวมรูปโจทย์และรูปตัวเลือกทุกข้อ', () => {
    expect([...collectFormImageUrls([q(['/1.png', '/2.png'], ['/c1.png', null]), q([], ['/c2.png'])])]).toEqual([
      '/1.png',
      '/2.png',
      '/c1.png',
      '/c2.png',
    ]);
  });

  it('ลบได้เฉพาะรูปที่อัปในรอบนี้ ที่เอาออกแล้วและไม่ได้ใช้ที่อื่น (รูปบันทึกแล้ว/URL ที่วางเองไม่ลบ)', () => {
    const before = [
      q(['/saved.png', '/new.png', '/shared-new.png', '/pasted-other-exam.png'], ['/new-c.png']),
      q([], ['/shared-new.png']),
    ];
    const after = [q([], [null]), q([], ['/shared-new.png'])];
    const uploadedThisSession = new Set(['/new.png', '/new-c.png', '/shared-new.png']);
    expect(imagesToDiscard(before, after, uploadedThisSession).sort()).toEqual(['/new-c.png', '/new.png']);
  });

  it('สลับลำดับอย่างเดียว → ไม่มีอะไรต้องลบ', () => {
    expect(imagesToDiscard([q(['/a.png', '/b.png'])], [q(['/b.png', '/a.png'])], new Set())).toEqual([]);
  });
});

describe('moveItem', () => {
  it('เลื่อนขึ้น/ลง และตำแหน่งเกินขอบคืนตัวเดิม', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 1, 0)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 1, 2)).toEqual(['a', 'c', 'b']);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 2, 3)).toBe(list);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
