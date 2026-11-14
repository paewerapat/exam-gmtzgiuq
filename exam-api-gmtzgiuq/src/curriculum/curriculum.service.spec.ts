import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurriculumService } from './curriculum.service';
import { Subject } from './subject.entity';
import { Chapter } from './chapter.entity';
import { Topic } from './topic.entity';
import { ProVenue } from '../pro/pro-venue.entity';

describe('CurriculumService', () => {
  let service: CurriculumService;
  let find: jest.Mock;
  let query: jest.Mock;
  let subjectUpdate: jest.Mock;
  let subjectFindOne: jest.Mock;
  let topicUpdate: jest.Mock;
  let topicFindOne: jest.Mock;
  let venueExists: jest.Mock;

  beforeEach(async () => {
    find = jest.fn();
    query = jest.fn();
    subjectUpdate = jest.fn();
    subjectFindOne = jest.fn();
    topicUpdate = jest.fn();
    topicFindOne = jest.fn();
    venueExists = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        {
          provide: getRepositoryToken(Subject),
          useValue: { find, update: subjectUpdate, findOne: subjectFindOne },
        },
        { provide: getRepositoryToken(Chapter), useValue: {} },
        {
          provide: getRepositoryToken(Topic),
          useValue: {
            manager: { query },
            update: topicUpdate,
            findOne: topicFindOne,
          },
        },
        {
          provide: getRepositoryToken(ProVenue),
          useValue: { exists: venueExists },
        },
      ],
    }).compile();

    service = module.get(CurriculumService);
  });

  describe('getPublicTreeWithCounts (GET /curriculum/public/tree)', () => {
    beforeEach(() => {
      find.mockResolvedValue([
        {
          id: 's1',
          isActive: true,
          orderIndex: 0,
          chapters: [
            {
              id: 'c1',
              isActive: true,
              orderIndex: 0,
              topics: [
                { id: 't1', isActive: true, orderIndex: 0 },
                { id: 't2', isActive: true, orderIndex: 1 },
              ],
            },
          ],
        },
      ]);
      // 1st query = exam counts, 2nd = question counts
      query
        .mockResolvedValueOnce([{ topicId: 't1', cnt: '2' }])
        .mockResolvedValueOnce([{ topicId: 't1', cnt: '7' }]);
    });

    it('counts only published, non-mock exams and their questions (task 11)', async () => {
      await service.getPublicTreeWithCounts();

      expect(query).toHaveBeenCalledTimes(2);
      for (const [sql, params] of query.mock.calls as [string, string[]][]) {
        const normalized = sql.replace(/\s+/g, ' ');
        expect(normalized).toContain(
          "INNER JOIN exams e ON e.id = q.examId AND e.status = 'published' AND e.isMock = 0",
        );
        // topic ids are bound, never concatenated
        expect(normalized).toContain('WHERE q.topicId IN (?,?)');
        expect(params).toEqual(['t1', 't2']);
      }
    });

    it('maps the counts onto topics, chapters and subjects', async () => {
      const [subject] = (await service.getPublicTreeWithCounts()) as Array<{
        examCount: number;
        chapters: Array<{ examCount: number; topics: unknown[] }>;
      }>;

      expect(subject.examCount).toBe(2);
      expect(subject.chapters[0].examCount).toBe(2);
      expect(subject.chapters[0].topics).toEqual([
        expect.objectContaining({ id: 't1', examCount: 2, questionCount: 7 }),
        expect.objectContaining({ id: 't2', examCount: 0, questionCount: 0 }),
      ]);
    });

    it('task 20: exam sets leave out bankOnly exams, question counts leave out Challenge questions', async () => {
      await service.getPublicTreeWithCounts();
      const [examSql, questionSql] = (
        query.mock.calls as [string, string[]][]
      ).map(([sql]) => sql.replace(/\s+/g, ' '));
      expect(examSql).toContain('AND e.isMock = 0 AND e.bankOnly = 0');
      expect(examSql).not.toContain('isChallenge');
      // non-Challenge questions of bankOnly exams are still practised by topic
      expect(questionSql).not.toContain('bankOnly');
      expect(questionSql).toContain('AND q.isChallenge = 0');
    });
  });

  describe('admin subjects/topics: Question Bank fields (task 20)', () => {
    it('AC10 updateSubject stores venueId/bankLabel after checking the venue; undefined fields are not sent', async () => {
      venueExists.mockResolvedValue(true);
      subjectUpdate.mockResolvedValue({});
      subjectFindOne.mockResolvedValue({ id: 's1', venueId: 'v1' });

      await service.updateSubject('s1', {
        venueId: 'v1',
        bankLabel: 'ชีวะ',
        name: undefined,
      });
      expect(venueExists).toHaveBeenCalledWith({ where: { id: 'v1' } });
      expect(subjectUpdate).toHaveBeenCalledWith('s1', {
        venueId: 'v1',
        bankLabel: 'ชีวะ',
      });
    });

    it('an unknown venue → 400, nothing written', async () => {
      venueExists.mockResolvedValue(false);
      await expect(
        service.updateSubject('s1', { venueId: 'nope' }),
      ).rejects.toThrow('ไม่พบสนามสอบที่เลือก');
      expect(subjectUpdate).not.toHaveBeenCalled();
    });

    it('null venueId clears it without a lookup', async () => {
      subjectUpdate.mockResolvedValue({});
      subjectFindOne.mockResolvedValue({ id: 's1', venueId: null });
      await service.updateSubject('s1', { venueId: null, bankLabel: null });
      expect(venueExists).not.toHaveBeenCalled();
      expect(subjectUpdate).toHaveBeenCalledWith('s1', {
        venueId: null,
        bankLabel: null,
      });
    });

    it('updateTopic stores gradeLabel/term', async () => {
      topicUpdate.mockResolvedValue({});
      topicFindOne.mockResolvedValue({ id: 't1' });
      await service.updateTopic('t1', { gradeLabel: 'ม.4', term: 1 });
      expect(topicUpdate).toHaveBeenCalledWith('t1', {
        gradeLabel: 'ม.4',
        term: 1,
      });
    });
  });
});
