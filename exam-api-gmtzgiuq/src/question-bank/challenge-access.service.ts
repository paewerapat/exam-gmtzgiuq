import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../questions/question.entity';
import { ProAccessService } from '../pro/pro-access.service';
import { isAdminViewer, type AccessViewer } from '../exam-access/exam-access';

/**
 * Who may see/answer Challenge questions (task 20): the `challenge` right of
 * the Pro entitlements of the user in the venue of the question's subject
 * (subjects.venueId). Admins always may; guests never (even when a free plan
 * would have challenge). A question whose subject has no venue is never
 * unlocked for non-admins.
 */
@Injectable()
export class ChallengeAccessService {
  constructor(
    @InjectRepository(Question)
    private questionsRepository: Repository<Question>,
    private proAccessService: ProAccessService,
  ) {}

  /** Challenge unlocked in the venue for the viewer. */
  async isUnlocked(
    viewer: AccessViewer | null | undefined,
    venueId: string | null | undefined,
  ): Promise<boolean> {
    if (isAdminViewer(viewer)) return true;
    if (!viewer?.id || !venueId) return false;
    const entitlements = await this.proAccessService.getEntitlements(
      viewer.id,
      venueId,
    );
    return entitlements.challenge === true;
  }

  /**
   * Of the given Challenge question ids, the ones the viewer may answer
   * (lower-case ids). One query for the venues + one entitlement lookup.
   */
  async unlockedQuestionIds(
    viewer: AccessViewer | null | undefined,
    questionIds: string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(questionIds)];
    if (ids.length === 0) return new Set();
    if (isAdminViewer(viewer)) {
      return new Set(ids.map((id) => id.toLowerCase()));
    }
    if (!viewer?.id) return new Set();

    const rows = await this.questionsRepository
      .createQueryBuilder('q')
      .innerJoin('topics', 't', 't.id = q.topicId')
      .innerJoin('chapters', 'c', 'c.id = t.chapterId')
      .innerJoin('subjects', 's', 's.id = c.subjectId')
      .select('q.id', 'id')
      .addSelect('s.venueId', 'venueId')
      .where('q.id IN (:...ids)', { ids })
      .getRawMany<{ id: string; venueId: string | null }>();

    const venueIds = [
      ...new Set(rows.map((r) => r.venueId).filter((v): v is string => !!v)),
    ];
    if (venueIds.length === 0) return new Set();
    const rights = await this.proAccessService.getEntitlementsMany(
      viewer.id,
      venueIds,
    );

    const unlocked = new Set<string>();
    for (const row of rows) {
      if (row.venueId && rights.get(row.venueId)?.entitlements.challenge) {
        unlocked.add(String(row.id).toLowerCase());
      }
    }
    return unlocked;
  }
}
