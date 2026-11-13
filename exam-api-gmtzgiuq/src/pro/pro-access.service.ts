import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Category } from '../categories/category.entity';
import { Exam } from '../exams/exam.entity';
import { ProPlan } from './pro-plan.entity';
import {
  ProSubscription,
  ProSubscriptionStatus,
} from './pro-subscription.entity';
import {
  NO_ENTITLEMENTS,
  ProEntitlements,
  normalizeStoredEntitlements,
} from './pro-entitlements';

/** Rights of a user in one venue and where they come from. */
export interface VenueEntitlements {
  venueId: string;
  entitlements: ProEntitlements;
  // The active subscription that gives them (highest plan rank), or null
  // when they come from the venue's free plan (rank 0) or from no plan
  subscriptionId: string | null;
  planId: string | null;
  planCode: string | null;
  rank: number | null;
  // End of that subscription; null = free plan / no plan (no end)
  expiresAt: Date | null;
}

/** An exam whose venue is wanted (category = its category slug). */
export interface VenueExam {
  id: string;
  // undefined = not loaded (looked up here); null/'' = no category
  category?: string | null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Pro rights (task 17), for other modules: ExamAccessService (Mock Exams
 * with accessType = purchase) now, Challenge / Predicted Exam / Analytics
 * (tasks 6/8/9) later.
 *
 * Has rights = a subscription with status `active` whose currentPeriodEnd
 * is after now (an active row past its end counts as expired; no cron).
 * Without one, the venue's free plan (rank 0) applies.
 */
@Injectable()
export class ProAccessService {
  constructor(
    @InjectRepository(ProSubscription)
    private subscriptionsRepository: Repository<ProSubscription>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Exam)
    private examsRepository: Repository<Exam>,
  ) {}

  /**
   * Entitlements of the user in the venue: those of the active plan with
   * the highest rank, else those of the venue's free plan (rank 0), else
   * none (all off). A guest (null) gets the free plan's.
   */
  async getEntitlements(
    userId: string | null | undefined,
    venueId: string,
    now: Date = new Date(),
  ): Promise<ProEntitlements> {
    const map = await this.getEntitlementsMany(userId, [venueId], now);
    return map.get(venueId)?.entitlements ?? { ...NO_ENTITLEMENTS };
  }

  /** getEntitlements for several venues (2 queries), by venue id. */
  async getEntitlementsMany(
    userId: string | null | undefined,
    venueIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, VenueEntitlements>> {
    const ids = unique(venueIds.filter(Boolean));
    const result = new Map<string, VenueEntitlements>();
    if (ids.length === 0) return result;

    const subscriptions = await this.findActive(userId, ids, now);
    for (const venueId of ids) {
      const best = pickHighest(
        subscriptions.filter((s) => s.venueId === venueId && s.plan),
      );
      if (best?.plan) {
        result.set(venueId, {
          venueId,
          entitlements: normalizeStoredEntitlements(best.plan.entitlements),
          subscriptionId: best.id,
          planId: best.plan.id,
          planCode: best.plan.code,
          rank: best.plan.rank,
          expiresAt: best.currentPeriodEnd,
        });
      }
    }

    const withoutPlan = ids.filter((id) => !result.has(id));
    if (withoutPlan.length > 0) {
      const freePlans = await this.plansRepository.find({
        where: { venueId: In(withoutPlan), rank: 0 },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      for (const venueId of withoutPlan) {
        const free = freePlans.find((p) => p.venueId === venueId);
        result.set(venueId, {
          venueId,
          entitlements: free
            ? normalizeStoredEntitlements(free.entitlements)
            : { ...NO_ENTITLEMENTS },
          subscriptionId: null,
          planId: free?.id ?? null,
          planCode: free?.code ?? null,
          rank: free ? free.rank : null,
          expiresAt: null,
        });
      }
    }
    return result;
  }

  /** The user has an active plan that is not free (rank > 0) in the venue. */
  async hasPaidPlan(
    userId: string | null | undefined,
    venueId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const subscriptions = await this.findActive(userId, [venueId], now);
    return subscriptions.some((s) => (s.plan?.rank ?? 0) > 0);
  }

  /** Venue of a category slug (categories.venueId), or null. */
  async getVenueIdForCategory(
    slug: string | null | undefined,
  ): Promise<string | null> {
    if (!slug) return null;
    const map = await this.getVenueIdsForCategories([slug]);
    return map.get(slug.toLowerCase()) ?? null;
  }

  /** Venue id by lower-case category slug, for the slugs that have one. */
  async getVenueIdsForCategories(
    slugs: string[],
  ): Promise<Map<string, string>> {
    const list = unique(slugs.filter((s) => typeof s === 'string' && s));
    const map = new Map<string, string>();
    if (list.length === 0) return map;
    const rows = await this.categoriesRepository.find({
      select: { slug: true, venueId: true },
      where: { slug: In(list) },
    });
    for (const row of rows) {
      if (row.venueId) map.set(String(row.slug).toLowerCase(), row.venueId);
    }
    return map;
  }

  /**
   * For ExamAccessService: the exams (Mock Exams with accessType purchase)
   * the user may take because the entitlements of their exam's venue have
   * mockPurchase, by exam id → end of that right (the subscription's end;
   * null only for old data where a free plan has mockPurchase, which the
   * admin API no longer allows). Exams whose category has no venue are left
   * out (stay locked). Categories not loaded on the exams are read here.
   */
  async getMockPurchaseAccess(
    userId: string | null | undefined,
    exams: VenueExam[],
    now: Date = new Date(),
  ): Promise<Map<string, Date | null>> {
    const result = new Map<string, Date | null>();
    if (!userId || exams.length === 0) return result;

    const categoryByExam = new Map<string, string | null>();
    const missing: string[] = [];
    for (const exam of exams) {
      if (exam.category === undefined) missing.push(exam.id);
      else categoryByExam.set(exam.id, exam.category || null);
    }
    if (missing.length > 0) {
      const rows = await this.examsRepository.find({
        select: { id: true, category: true },
        where: { id: In(unique(missing)) },
        loadEagerRelations: false,
      });
      for (const row of rows) categoryByExam.set(row.id, row.category || null);
    }

    const venueBySlug = await this.getVenueIdsForCategories(
      [...categoryByExam.values()].filter((c): c is string => !!c),
    );
    const venueOf = (examId: string) => {
      const category = categoryByExam.get(examId);
      return category
        ? (venueBySlug.get(category.toLowerCase()) ?? null)
        : null;
    };
    const venueIds = unique(
      exams.map((e) => venueOf(e.id)).filter((v): v is string => !!v),
    );
    if (venueIds.length === 0) return result;

    const rights = await this.getEntitlementsMany(userId, venueIds, now);
    for (const exam of exams) {
      const venueId = venueOf(exam.id);
      const venue = venueId ? rights.get(venueId) : undefined;
      if (venue?.entitlements.mockPurchase === true) {
        result.set(exam.id, venue.expiresAt);
      }
    }
    return result;
  }

  /** The user's subscriptions that give rights now, with their plan. */
  private async findActive(
    userId: string | null | undefined,
    venueIds: string[],
    now: Date,
  ): Promise<ProSubscription[]> {
    if (!userId || venueIds.length === 0) return [];
    return this.subscriptionsRepository.find({
      where: {
        userId,
        venueId: In(venueIds),
        status: ProSubscriptionStatus.ACTIVE,
        currentPeriodEnd: MoreThan(now),
      },
      relations: { plan: true },
    });
  }
}

/** Highest plan rank; a tie → the one that ends last. */
function pickHighest(
  subscriptions: ProSubscription[],
): ProSubscription | undefined {
  let best: ProSubscription | undefined;
  for (const s of subscriptions) {
    if (
      !best ||
      (s.plan?.rank ?? 0) > (best.plan?.rank ?? 0) ||
      ((s.plan?.rank ?? 0) === (best.plan?.rank ?? 0) &&
        s.currentPeriodEnd > best.currentPeriodEnd)
    ) {
      best = s;
    }
  }
  return best;
}
