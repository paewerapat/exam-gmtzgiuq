import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from './subject.entity';
import { Chapter } from './chapter.entity';
import { Topic } from './topic.entity';

@Injectable()
export class CurriculumService {
  constructor(
    @InjectRepository(Subject)
    private subjectsRepo: Repository<Subject>,
    @InjectRepository(Chapter)
    private chaptersRepo: Repository<Chapter>,
    @InjectRepository(Topic)
    private topicsRepo: Repository<Topic>,
  ) {}

  // ── SUBJECTS ──────────────────────────────────────────────

  async findAllSubjects(activeOnly = true): Promise<Subject[]> {
    const qb = this.subjectsRepo
      .createQueryBuilder('subject')
      .loadRelationCountAndMap('subject.chapterCount', 'subject.chapters')
      .orderBy('subject.orderIndex', 'ASC')
      .addOrderBy('subject.name', 'ASC');

    if (activeOnly) {
      qb.where('subject.isActive = true');
    }

    return qb.getMany();
  }

  async findSubjectWithChapters(id: string): Promise<Subject> {
    const subject = await this.subjectsRepo.findOne({
      where: { id },
      relations: ['chapters', 'chapters.topics'],
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  async createSubject(data: {
    name: string;
    description?: string;
    color?: string;
    iconEmoji?: string;
    orderIndex?: number;
  }): Promise<Subject> {
    const subject = this.subjectsRepo.create(data);
    return this.subjectsRepo.save(subject);
  }

  async updateSubject(id: string, data: Partial<Subject>): Promise<Subject> {
    await this.subjectsRepo.update(id, data);
    const updated = await this.subjectsRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Subject not found');
    return updated;
  }

  async removeSubject(id: string): Promise<void> {
    const subject = await this.subjectsRepo.findOne({ where: { id } });
    if (!subject) throw new NotFoundException('Subject not found');
    await this.subjectsRepo.remove(subject);
  }

  // ── CHAPTERS ──────────────────────────────────────────────

  async findChaptersBySubject(subjectId: string): Promise<Chapter[]> {
    return this.chaptersRepo.find({
      where: { subjectId, isActive: true },
      order: { orderIndex: 'ASC', name: 'ASC' },
    });
  }

  async findChapterWithTopics(id: string): Promise<Chapter> {
    const chapter = await this.chaptersRepo.findOne({
      where: { id },
      relations: ['topics'],
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return chapter;
  }

  async createChapter(data: {
    subjectId: string;
    name: string;
    description?: string;
    orderIndex?: number;
  }): Promise<Chapter> {
    // Verify subject exists
    const subject = await this.subjectsRepo.findOne({
      where: { id: data.subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    const chapter = this.chaptersRepo.create(data);
    return this.chaptersRepo.save(chapter);
  }

  async updateChapter(id: string, data: Partial<Chapter>): Promise<Chapter> {
    await this.chaptersRepo.update(id, data);
    const updated = await this.chaptersRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Chapter not found');
    return updated;
  }

  async removeChapter(id: string): Promise<void> {
    const chapter = await this.chaptersRepo.findOne({ where: { id } });
    if (!chapter) throw new NotFoundException('Chapter not found');
    await this.chaptersRepo.remove(chapter);
  }

  // ── TOPICS ────────────────────────────────────────────────

  async findTopicsByChapter(chapterId: string): Promise<Topic[]> {
    return this.topicsRepo.find({
      where: { chapterId, isActive: true },
      order: { orderIndex: 'ASC', name: 'ASC' },
    });
  }

  async findTopic(id: string): Promise<Topic> {
    const topic = await this.topicsRepo.findOne({
      where: { id },
      relations: ['chapter', 'chapter.subject'],
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  async createTopic(data: {
    chapterId: string;
    name: string;
    description?: string;
    orderIndex?: number;
  }): Promise<Topic> {
    const chapter = await this.chaptersRepo.findOne({
      where: { id: data.chapterId },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');

    const topic = this.topicsRepo.create(data);
    return this.topicsRepo.save(topic);
  }

  async updateTopic(id: string, data: Partial<Topic>): Promise<Topic> {
    await this.topicsRepo.update(id, data);
    const updated = await this.topicsRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Topic not found');
    return updated;
  }

  async removeTopic(id: string): Promise<void> {
    const topic = await this.topicsRepo.findOne({ where: { id } });
    if (!topic) throw new NotFoundException('Topic not found');
    await this.topicsRepo.remove(topic);
  }

  // ── FULL TREE (Admin) ─────────────────────────────────────

  async getFullTree(): Promise<Subject[]> {
    return this.subjectsRepo.find({
      relations: ['chapters', 'chapters.topics'],
      order: { orderIndex: 'ASC' },
    });
  }

  // ── PUBLIC TREE WITH EXAM COUNTS ─────────────────────────

  async getPublicTreeWithCounts(): Promise<any[]> {
    const subjects = await this.subjectsRepo.find({
      where: { isActive: true },
      relations: ['chapters', 'chapters.topics'],
      order: { orderIndex: 'ASC' },
    });

    subjects.forEach((s) => {
      s.chapters = (s.chapters || [])
        .filter((c) => c.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      s.chapters.forEach((c) => {
        c.topics = (c.topics || [])
          .filter((t) => t.isActive)
          .sort((a, b) => a.orderIndex - b.orderIndex);
      });
    });

    const allTopicIds = subjects.flatMap((s) =>
      s.chapters.flatMap((c) => c.topics.map((t) => t.id)),
    );

    if (allTopicIds.length === 0) return subjects;

    const rows: { topicId: string; cnt: string }[] = await this.topicsRepo
      .createQueryBuilder('topic')
      .leftJoin(
        'exams',
        'exam',
        'exam.topicId = topic.id AND exam.status = :status',
        { status: 'published' },
      )
      .select('topic.id', 'topicId')
      .addSelect('COUNT(exam.id)', 'cnt')
      .where('topic.id IN (:...ids)', { ids: allTopicIds })
      .groupBy('topic.id')
      .getRawMany();

    const countMap = new Map(rows.map((r) => [r.topicId, parseInt(r.cnt, 10)]));

    return subjects.map((s) => {
      let subjectTotal = 0;
      const chapters = s.chapters.map((c) => {
        let chapterTotal = 0;
        const topics = c.topics.map((t) => {
          const examCount = countMap.get(t.id) ?? 0;
          chapterTotal += examCount;
          return { ...t, examCount };
        });
        subjectTotal += chapterTotal;
        return { ...c, topics, examCount: chapterTotal };
      });
      return { ...s, chapters, examCount: subjectTotal };
    });
  }
}
