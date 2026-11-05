import {
  collectQuestionImageUrls,
  escapeLike,
  isUploadReferenced,
  normalizeChoices,
  resolveQuestionImages,
  UPLOAD_REFERENCE_SQL,
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

  describe('upload reference check (task 08)', () => {
    const file = '1700000000001-000000000000000a.png';

    it('escapes LIKE wildcards and the escape character', () => {
      expect(escapeLike('a%b_c!d')).toBe('a!%b!_c!!d');
      expect(escapeLike(file)).toBe(file);
    });

    it('covers every column that can hold an upload URL', () => {
      for (const part of [
        'FROM questions',
        'questionImage LIKE',
        'CAST(questionImages AS CHAR)',
        'CAST(choices AS CHAR)',
        'FROM exams',
        'bannerImage LIKE',
        'CAST(passages AS CHAR)',
        'CAST(detailBlocks AS CHAR)',
        'FROM blogs',
        'featuredImage LIKE',
        'content LIKE',
        'FROM users',
        'avatar LIKE',
      ]) {
        expect(UPLOAD_REFERENCE_SQL).toContain(part);
      }
      // values are bound, never concatenated
      expect(UPLOAD_REFERENCE_SQL).not.toContain(file);
      expect(UPLOAD_REFERENCE_SQL.match(/\?/g)).toHaveLength(9);
    });

    it('binds the escaped pattern and reads the count', async () => {
      const db = { query: jest.fn().mockResolvedValue([{ refs: '0' }]) };
      await expect(isUploadReferenced(db, '1-a_b.png')).resolves.toBe(false);
      expect(db.query).toHaveBeenCalledWith(
        UPLOAD_REFERENCE_SQL,
        Array(9).fill('%1-a!_b.png%'),
      );

      db.query.mockResolvedValue([{ refs: 2 }]);
      await expect(isUploadReferenced(db, file)).resolves.toBe(true);
      db.query.mockResolvedValue([{ refs: null }]);
      await expect(isUploadReferenced(db, file)).resolves.toBe(true);
    });

    it('throws on a failed or unexpected result so callers keep the file', async () => {
      const db = { query: jest.fn().mockRejectedValue(new Error('down')) };
      await expect(isUploadReferenced(db, file)).rejects.toThrow('down');
      db.query.mockResolvedValue([]);
      await expect(isUploadReferenced(db, file)).rejects.toThrow();
      db.query.mockResolvedValue({});
      await expect(isUploadReferenced(db, file)).rejects.toThrow();
    });
  });
});
