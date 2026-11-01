import {
  collectQuestionImageUrls,
  normalizeChoices,
  resolveQuestionImages,
} from './question-images';

describe('question-images helpers', () => {
  describe('resolveQuestionImages', () => {
    it('keeps questionImages in order and mirrors the first into questionImage', () => {
      expect(
        resolveQuestionImages({
          questionImage: '/uploads/old.png',
          questionImages: ['/uploads/1.png', '/uploads/2.png'],
        }),
      ).toEqual({
        questionImage: '/uploads/1.png',
        questionImages: ['/uploads/1.png', '/uploads/2.png'],
      });
    });

    it('treats a legacy questionImage alone as [questionImage]', () => {
      expect(
        resolveQuestionImages({ questionImage: 'https://cdn.example/a.png' }),
      ).toEqual({
        questionImage: 'https://cdn.example/a.png',
        questionImages: ['https://cdn.example/a.png'],
      });
    });

    it('stores null for both fields when there is no image', () => {
      const none = { questionImage: null, questionImages: null };
      expect(resolveQuestionImages({})).toEqual(none);
      expect(resolveQuestionImages({ questionImage: '' })).toEqual(none);
      expect(
        resolveQuestionImages({ questionImage: 'x.png', questionImages: [] }),
      ).toEqual(none);
    });
  });

  describe('normalizeChoices', () => {
    it('keeps a non-empty image and drops empty or null ones', () => {
      expect(
        normalizeChoices([
          { id: 'a', text: '', isCorrect: true, image: '/uploads/a.png' },
          { id: 'b', text: 'B', isCorrect: false, image: '' },
          { id: 'c', text: 'C', isCorrect: false, image: null },
          { id: 'd', text: 'D', isCorrect: false },
        ]),
      ).toEqual([
        { id: 'a', text: '', isCorrect: true, image: '/uploads/a.png' },
        { id: 'b', text: 'B', isCorrect: false },
        { id: 'c', text: 'C', isCorrect: false },
        { id: 'd', text: 'D', isCorrect: false },
      ]);
    });

    it('returns [] when choices are missing', () => {
      expect(normalizeChoices(undefined)).toEqual([]);
      expect(normalizeChoices(null)).toEqual([]);
    });
  });

  describe('collectQuestionImageUrls', () => {
    it('collects questionImage, questionImages and choice images', () => {
      expect(
        collectQuestionImageUrls({
          questionImage: '/uploads/1.png',
          questionImages: ['/uploads/1.png', '/uploads/2.png'],
          choices: [
            { id: 'a', text: '', isCorrect: true, image: '/uploads/a.png' },
            { id: 'b', text: 'B', isCorrect: false },
          ],
        }),
      ).toEqual([
        '/uploads/1.png',
        '/uploads/1.png',
        '/uploads/2.png',
        '/uploads/a.png',
      ]);
    });

    it('reads old rows and malformed JSON without throwing', () => {
      expect(
        collectQuestionImageUrls({
          questionImage: '/uploads/old.png',
          questionImages: null,
          choices: null,
        }),
      ).toEqual(['/uploads/old.png']);
      expect(
        collectQuestionImageUrls({
          questionImages: 'not-an-array',
          choices: [null, 'x', { image: 5 }],
        }),
      ).toEqual([]);
      expect(collectQuestionImageUrls(null)).toEqual([]);
    });
  });
});
