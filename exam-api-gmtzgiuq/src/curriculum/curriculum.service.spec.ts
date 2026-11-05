import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurriculumService } from './curriculum.service';
import { Subject } from './subject.entity';
import { Chapter } from './chapter.entity';
import { Topic } from './topic.entity';

describe('CurriculumService', () => {
  let service: CurriculumService;
  let find: jest.Mock;
  let query: jest.Mock;

  beforeEach(async () => {
    find = jest.fn();
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        { provide: getRepositoryToken(Subject), useValue: { find } },
        { provide: getRepositoryToken(Chapter), useValue: {} },
        {
          provide: getRepositoryToken(Topic),
          useValue: { manager: { query } },
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
  });
});
